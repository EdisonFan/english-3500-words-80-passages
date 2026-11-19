#!/usr/bin/env python3
"""Generate slow-speed Microsoft Edge TTS audio for the 80 reading passages.

Reads ``spapro/data/pNN.json`` from the repo (falls back to the cleaned
``scripts/text/pNN.txt`` snapshots shipped alongside this script), strips the
vocabulary markup, and synthesises one MP3 per passage with edge-tts.

Designed to run both locally and on a GitHub Actions ubuntu-latest runner.

    pip install edge-tts
    python scripts/gen_tts.py --rate=-20% --workers=3 --out audio
    python scripts/gen_tts.py --dry-run --limit 3      # inspect cleaned text only
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "spapro" / "data"
TEXT_DIR = ROOT / "scripts" / "text"

DEFAULT_VOICE = "en-US-AriaNeural"
DEFAULT_RATE = "-20%"          # slow enough for intensive reading practice
DEFAULT_VOLUME = "+0%"


# --------------------------------------------------------------------------
# Text cleaning
# --------------------------------------------------------------------------
# The corpus lemmatises highlighted words (``{pull} {weed}`` stands for the
# surface forms "pulling weeds") and embeds Chinese glosses in parentheses.
# We keep the lemma as-is (there is no forms/lemma field in vocab to restore
# from), but remove everything that an English voice would stumble over.

_CJK_BRACKET_GLOSS = re.compile(r"[（(]\s*[^)）]*[\u4e00-\u9fff][^)）]*\s*[)）]")
_BRACES = re.compile(r"[{}]")
_QUOTE_MAP = str.maketrans({
    "\u201c": '"', "\u201d": '"',   # “ ”
    "\u2018": "'", "\u2019": "'",   # ‘ ’
    "\uff0c": ",",                   # ，
    "\uff1b": ";",                   # ；
    "\uff1a": ":",                   # ：
    "\uff08": "(", "\uff09": ")",   # （ ）
})


def clean_text(raw: str) -> str:
    """Turn one paragraph's ``en`` field into TTS-friendly plain English."""
    s = raw
    s = _CJK_BRACKET_GLOSS.sub("", s)      # （卷毛狗）/ (原稿) → 整段删掉
    s = _BRACES.sub("", s)                  # {soil} → soil
    s = s.translate(_QUOTE_MAP)
    s = s.replace("\u2014", ", ")          # em dash → short comma pause
    s = s.replace("\u25cf", "")            # ● bullet
    # Any remaining non-ASCII (stray Chinese notes, exotic symbols) → space
    s = "".join(ch if ord(ch) < 128 else " " for ch in s)
    # Whitespace around punctuation. Only DOUBLE quotes are touched —
    # single quotes must stay put or contractions break ("Jaramillo's").
    # Isolating each double quote with spaces is the safest option for TTS:
    # the voice ignores the quote itself and just gets a clean word boundary.
    s = re.sub(r"\s+(?=[,.;:!?])", "", s)
    s = s.replace('"', ' " ')
    s = re.sub(r"([,.;:!?])(?=[A-Za-z])", r"\1 ", s)   # ".And" → ". And"
    s = re.sub(r"[ \t]{2,}", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def load_passage(number: int) -> str:
    """Prefer live JSON data; fall back to the shipped cleaned text snapshot."""
    source = DATA_DIR / f"p{number:02d}.json"
    if source.is_file():
        payload = json.loads(source.read_text(encoding="utf-8"))
        paragraphs = [clean_text(p.get("en", "")) for p in payload.get("paragraphs", [])]
        return "\n\n".join(p for p in paragraphs if p)
    snapshot = TEXT_DIR / f"p{number:02d}.txt"
    if snapshot.is_file():
        return snapshot.read_text(encoding="utf-8").strip()
    raise FileNotFoundError(f"no data for passage {number:02d}: {source} / {snapshot} both missing")


def word_count(text: str) -> int:
    return len(re.findall(r"[A-Za-z][A-Za-z'-]*", text))


# --------------------------------------------------------------------------
# Synthesis
# --------------------------------------------------------------------------
async def synth_one(
    number: int,
    text: str,
    out_dir: Path,
    *,
    voice: str,
    rate: str,
    volume: str,
    retries: int,
    semaphore: asyncio.Semaphore,
) -> dict:
    import edge_tts  # imported lazily so --dry-run works without the package

    dest = out_dir / f"p{number:02d}.mp3"
    if dest.is_file() and dest.stat().st_size > 1024:
        return {"id": number, "status": "skipped", "bytes": dest.stat().st_size}

    last_error: Exception | None = None
    async with semaphore:
        for attempt in range(1, retries + 1):
            try:
                communicate = edge_tts.Communicate(
                    text, voice, rate=rate, volume=volume
                )
                await communicate.save(str(dest))
                if dest.is_file() and dest.stat().st_size > 1024:
                    return {
                        "id": number,
                        "status": "ok",
                        "bytes": dest.stat().st_size,
                        "words": word_count(text),
                    }
                raise RuntimeError("empty or truncated mp3")
            except Exception as exc:  # Microsoft occasionally closes the socket
                last_error = exc
                dest.unlink(missing_ok=True)
                if attempt < retries:
                    await asyncio.sleep(2.0 * attempt)
    return {
        "id": number,
        "status": "failed",
        "error": f"{type(last_error).__name__}: {last_error}" if last_error else "unknown",
    }


async def run(args: argparse.Namespace) -> int:
    passages = list(range(args.start, args.end + 1))
    texts = {n: load_passage(n) for n in passages}

    if args.dry_run:
        for n in passages[: args.limit or len(passages)]:
            print(f"\n===== p{n:02d}.txt ({word_count(texts[n])} words) =====")
            print(texts[n][: args.preview])
        return 0

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    # Persist cleaned text next to the audio for proofreading / offline re-runs
    for n, text in texts.items():
        (out_dir / f"p{n:02d}.txt").write_text(text + "\n", encoding="utf-8")

    semaphore = asyncio.Semaphore(max(1, args.workers))
    started = time.time()
    results = await asyncio.gather(
        *(
            synth_one(
                n, texts[n], out_dir,
                voice=args.voice, rate=args.rate, volume=args.volume,
                retries=args.retries, semaphore=semaphore,
            )
            for n in passages
        )
    )

    ok = [r for r in results if r["status"] == "ok"]
    skipped = [r for r in results if r["status"] == "skipped"]
    failed = [r for r in results if r["status"] == "failed"]
    total_bytes = sum(r.get("bytes", 0) for r in ok + skipped)

    manifest = {
        "voice": args.voice,
        "rate": args.rate,
        "volume": args.volume,
        "engine": "edge-tts (Microsoft Edge online neural voices)",
        "passages": f"{args.start:02d}-{args.end:02d}",
        "total_words": sum(word_count(t) for t in texts.values()),
        "ok": len(ok),
        "skipped": len(skipped),
        "failed": len(failed),
        "total_bytes": total_bytes,
        "elapsed_sec": round(time.time() - started, 1),
        "results": results,
    }
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(json.dumps({k: v for k, v in manifest.items() if k != "results"},
                     ensure_ascii=False, indent=2))
    for item in failed:
        print(f"FAILED p{item['id']:02d}: {item['error']}", file=sys.stderr)
    if failed:
        print(f"{len(failed)} passage(s) failed — re-run the same command to retry them only.",
              file=sys.stderr)
    return 1 if failed else 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--start", type=int, default=int(os.getenv("TTS_START", "1")))
    parser.add_argument("--end", type=int, default=int(os.getenv("TTS_END", "80")))
    parser.add_argument("--rate", default=os.getenv("TTS_RATE", DEFAULT_RATE),
                        help="edge-tts rate, e.g. -10%%, -20%%, -30%% (default -20%%)")
    parser.add_argument("--voice", default=os.getenv("TTS_VOICE", DEFAULT_VOICE),
                        help="e.g. en-US-AriaNeural / en-US-GuyNeural / en-GB-SoniaNeural")
    parser.add_argument("--volume", default=os.getenv("TTS_VOLUME", DEFAULT_VOLUME))
    parser.add_argument("--workers", type=int, default=int(os.getenv("TTS_WORKERS", "3")),
                        help="concurrent synth requests (keep <=3 to avoid throttling)")
    parser.add_argument("--retries", type=int, default=4)
    parser.add_argument("--out", default=os.getenv("TTS_OUT", "audio"))
    parser.add_argument("--dry-run", action="store_true", help="print cleaned text, no network")
    parser.add_argument("--limit", type=int, default=0, help="with --dry-run: max passages to print")
    parser.add_argument("--preview", type=int, default=700, help="with --dry-run: chars per passage")
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run(parse_args())))
