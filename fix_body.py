"""Rewrite 正文.md for one or more Passage folders so its body paragraphs match
the English text extracted from 原始html.html exactly.

- Extracts each <p class="eng-bodytext"> as one cleaned paragraph (preserves
  paragraph splits as-is).
- Cleans text: collapses whitespace, fixes spacing after sentence-ending
  punctuation that the source HTML elided (e.g. "way.If" -> "way. If").
- Preserves the existing MD's header (lines before the first body paragraph)
  and footer (from the first "---" after the body onward), so we don't
  accidentally drop "# Passage N" / "## Unit X" / 总词数 stats lines.
"""

from __future__ import annotations

import argparse
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent


class BodyParaExtractor(HTMLParser):
    """Collect text of each <p class="eng-bodytext"> as a separate string."""

    TARGET = "eng-bodytext"

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.paragraphs: list[str] = []
        self._buf: list[str] = []
        self._depth = 0  # nesting depth of target <p>

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "p":
            classes: set[str] = set()
            for k, v in attrs:
                if k == "class" and v:
                    classes = set(v.split())
                    break
            if self.TARGET in classes:
                self._depth += 1
                self._buf = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "p" and self._depth > 0:
            self._depth -= 1
            if self._depth == 0:
                text = "".join(self._buf)
                text = clean_paragraph(text)
                if text:
                    self.paragraphs.append(text)
                self._buf = []

    def handle_data(self, data: str) -> None:
        if self._depth > 0:
            self._buf.append(data)


# ---- text cleaning ----------------------------------------------------------

WS_RE = re.compile(r"\s+")

# Multi-line HTML often introduces whitespace around inline <span>s, which
# becomes " ," / " ." in the extracted text. Strip leading whitespace before
# common punctuation.
SPACE_BEFORE_PUNCT_RE = re.compile(r" +([\.,!?;:\)\]”’])")

# Add a space when these patterns appear with no whitespace separating them:
#   Rule 1: sentence-ending punctuation (. ! ? ; :) directly followed by an
#           uppercase Latin / CJK character (e.g. ".It" -> ". It").
#   Rule 2: sentence-ending punctuation OR comma followed by a CLOSING quote
#           (" " ') and then an uppercase character (e.g. ',"I' -> '," I',
#           '."They' -> '." They'). We require the punctuation prefix so a
#           sentence-opening '"I' is not mistakenly split.
PUNCT_BEFORE_UPPER_RE = re.compile(r"([\.!?;:])([A-Z一-鿿])")
PUNCT_QUOTE_UPPER_RE = re.compile(r"([\.,!?;:][\"”’])([A-Z一-鿿])")


def clean_paragraph(text: str) -> str:
    text = WS_RE.sub(" ", text).strip()
    text = SPACE_BEFORE_PUNCT_RE.sub(r"\1", text)
    prev = None
    while prev != text:
        prev = text
        text = PUNCT_QUOTE_UPPER_RE.sub(r"\1 \2", text)
        text = PUNCT_BEFORE_UPPER_RE.sub(r"\1 \2", text)
    return text


# ---- MD header / footer detection ------------------------------------------

def split_md(md: str) -> tuple[str, str]:
    """Return (header, footer) text from an existing 正文.md.

    Header = everything up to (but not including) the first body paragraph
    line — i.e. the leading "# Passage N" / "## Unit ..." and blank lines.

    Footer = the trailing block starting from the first "---" line that
    follows the body (typically "---\\n**总词数...**"). If no such line
    exists, footer is "".
    """
    lines = md.splitlines()
    # Find first body line: non-empty, doesn't start with "#"
    body_start = None
    for i, ln in enumerate(lines):
        s = ln.strip()
        if not s:
            continue
        if s.startswith("#"):
            continue
        body_start = i
        break

    if body_start is None:
        # No body — keep whole file as header, no footer.
        return md.rstrip() + "\n", ""

    header_lines = lines[:body_start]
    # Trim trailing blank lines from header (we re-add separator below).
    while header_lines and not header_lines[-1].strip():
        header_lines.pop()
    header = "\n".join(header_lines) + "\n"

    # Find first "---" at start of line at/after body_start.
    footer_start = None
    for i in range(body_start, len(lines)):
        if lines[i].strip() == "---":
            footer_start = i
            break

    if footer_start is None:
        return header, ""

    footer_lines = lines[footer_start:]
    # Trim trailing blank lines from footer.
    while footer_lines and not footer_lines[-1].strip():
        footer_lines.pop()
    footer = "\n".join(footer_lines) + "\n"
    return header, footer


# ---- fixer ------------------------------------------------------------------

def fix_passage(folder: Path) -> tuple[str, int]:
    """Rewrite folder/正文.md. Returns (status, paragraph_count)."""
    html_path = folder / "原始html.html"
    md_path = folder / "正文.md"
    if not html_path.exists() or not md_path.exists():
        return "missing-file", 0

    html_text = html_path.read_text(encoding="utf-8")
    md_text = md_path.read_text(encoding="utf-8")

    extractor = BodyParaExtractor()
    extractor.feed(html_text)
    paragraphs = extractor.paragraphs
    if not paragraphs:
        return "no-paragraphs", 0

    header, footer = split_md(md_text)

    parts: list[str] = [header.rstrip(), ""]
    for p in paragraphs:
        parts.append(p)
        parts.append("")
    if footer:
        parts.append(footer.rstrip())
    else:
        while parts and parts[-1] == "":
            parts.pop()

    out = "\n".join(parts)
    if not out.endswith("\n"):
        out += "\n"

    md_path.write_text(out, encoding="utf-8")
    return "ok", len(paragraphs)


# ---- CLI --------------------------------------------------------------------

def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("passages", nargs="*", help="Passage_XX folder names")
    ap.add_argument("--threshold", type=float, default=0.95,
                    help="If no passages given, fix all whose body_sim < threshold")
    args = ap.parse_args(argv)

    if args.passages:
        targets = [ROOT / n for n in args.passages]
    else:
        # Auto-discover via verify_match
        from verify_match import verify_passage
        folders = sorted(
            [p for p in ROOT.iterdir() if p.is_dir() and p.name.startswith("Passage_")],
            key=lambda p: int(p.name.split("_")[1]),
        )
        targets = []
        for f in folders:
            r = verify_passage(f)
            if r.body_sim < args.threshold:
                targets.append(f)

    print(f"修复 {len(targets)} 个段落:")
    for t in targets:
        status, n = fix_passage(t)
        print(f"  {t.name}: {status} ({n} 段)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
