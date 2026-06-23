"""Verify match between 原始html.html and *.md files in every Passage_XX folder.

Strategy:
- Parse 原始html.html, split into three logical sections:
  * English body — <p class="eng-bodytext">
  * Vocabulary  — paragraphs between the "核心词表" anchor and the "短文译文" anchor
  * Chinese translation — <p class="preface-text">
- Read the matching .md files (正文.md, 单词.md, 中文翻译.md).
- Normalize whitespace + punctuation, then compute:
  * char-level similarity (difflib.SequenceMatcher)
  * coverage: how much of the HTML text is present in the MD (substring proxy)
- For 单词, also do an "entry hit rate" by checking that each headword from
  the HTML appears in the MD.
- Write a markdown report to the project root.
"""

from __future__ import annotations

import os
import re
import sys
from dataclasses import dataclass
from difflib import SequenceMatcher
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parent


# ---------------------------------------------------------------------------
# HTML parsing
# ---------------------------------------------------------------------------

class SectionExtractor(HTMLParser):
    """Walks the HTML and accumulates text per logical section.

    Sections recognized:
      - 'body'   : text inside <p class="eng-bodytext">
      - 'vocab'  : text inside <p class="bodytext-no"> AFTER the "核心词表" anchor
                   and BEFORE the "短文译文" anchor
      - 'trans'  : text inside <p class="preface-text">

    We also collect 'vocab_entries': the list of headwords found inside
    <span class="background-word"> within the vocab section.
    """

    BODY_CLASS = "eng-bodytext"
    VOCAB_CLASS = "bodytext-no"
    TRANS_CLASS = "preface-text"
    HEADWORD_CLASS = "background-word"

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.body_parts: list[str] = []
        self.vocab_parts: list[str] = []
        self.trans_parts: list[str] = []
        self.vocab_entries: list[str] = []

        # State
        self._p_stack: list[str | None] = []          # current <p> kind or None
        self._in_headword_span = 0                    # nesting depth
        self._headword_buf: list[str] = []
        self._seen_core_anchor = False                 # passed "核心词表"?
        self._seen_translation_anchor = False          # passed "短文译文"?
        self._suppress = 0                              # inside display:none span?

    # -- helpers -----------------------------------------------------------

    def _classes(self, attrs: list[tuple[str, str | None]]) -> set[str]:
        for k, v in attrs:
            if k == "class" and v:
                return set(v.split())
        return set()

    def _style(self, attrs: list[tuple[str, str | None]]) -> str:
        for k, v in attrs:
            if k == "style" and v:
                return v
        return ""

    # -- HTMLParser hooks --------------------------------------------------

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        classes = self._classes(attrs)

        if tag == "span" and "display:none" in self._style(attrs).replace(" ", ""):
            self._suppress += 1
            return

        if tag == "p":
            if self.BODY_CLASS in classes:
                self._p_stack.append("body")
            elif self.TRANS_CLASS in classes:
                self._p_stack.append("trans")
            elif self.VOCAB_CLASS in classes:
                # only treat as vocab between the two anchors
                if self._seen_core_anchor and not self._seen_translation_anchor:
                    self._p_stack.append("vocab")
                else:
                    self._p_stack.append(None)
            else:
                self._p_stack.append(None)
            return

        if tag == "span" and self.HEADWORD_CLASS in classes:
            self._in_headword_span += 1
            self._headword_buf = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "span":
            if self._suppress > 0:
                self._suppress -= 1
                return
            if self._in_headword_span > 0:
                self._in_headword_span -= 1
                if self._in_headword_span == 0:
                    word = "".join(self._headword_buf).strip().rstrip("*").strip()
                    if word and self._seen_core_anchor and not self._seen_translation_anchor:
                        self.vocab_entries.append(word)
                    self._headword_buf = []
        elif tag == "p":
            if self._p_stack:
                self._p_stack.pop()

    def handle_data(self, data: str) -> None:
        if self._suppress:
            return

        # Track section anchors
        if "核心词表" in data:
            self._seen_core_anchor = True
        if "短文译文" in data:
            self._seen_translation_anchor = True

        current = self._p_stack[-1] if self._p_stack else None
        if current == "body":
            self.body_parts.append(data)
        elif current == "trans":
            self.trans_parts.append(data)
        elif current == "vocab":
            self.vocab_parts.append(data)

        if self._in_headword_span > 0:
            self._headword_buf.append(data)


# ---------------------------------------------------------------------------
# Normalization + similarity
# ---------------------------------------------------------------------------

WS_RE = re.compile(r"\s+")
# Map "fancy" punctuation to ASCII / common forms so that small typographic
# differences between HTML and MD don't drag the score down.
PUNCT_MAP = str.maketrans({
    "‘": "'", "’": "'",
    "“": '"', "”": '"',
    "–": "-", "—": "-",
    " ": " ",
    "﻿": "",
})

MD_HEADER_RE = re.compile(r"^#{1,6}\s.*$", re.MULTILINE)
MD_HR_RE = re.compile(r"^-{3,}\s*$", re.MULTILINE)
MD_BOLD_RE = re.compile(r"\*\*([^*]+)\*\*")
MD_ITALIC_RE = re.compile(r"(?<!\*)\*([^*\n]+)\*(?!\*)")
MD_TABLE_PIPE_RE = re.compile(r"\|")


def strip_md_decorations(text: str) -> str:
    text = MD_HEADER_RE.sub("", text)
    text = MD_HR_RE.sub("", text)
    text = MD_BOLD_RE.sub(r"\1", text)
    # Italic is risky because *soil* and word-with-asterisk look the same;
    # only strip *...* pairs already simplified above.
    text = MD_ITALIC_RE.sub(r"\1", text)
    return text


def normalize(text: str) -> str:
    text = text.translate(PUNCT_MAP)
    text = WS_RE.sub("", text)
    return text


def similarity(a: str, b: str) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


# ---------------------------------------------------------------------------
# Per-passage verification
# ---------------------------------------------------------------------------

@dataclass
class PassageReport:
    name: str
    body_sim: float
    body_html_len: int
    body_md_len: int
    trans_sim: float
    trans_html_len: int
    trans_md_len: int
    vocab_sim: float
    vocab_html_len: int
    vocab_md_len: int
    vocab_entries_total: int
    vocab_entries_hit: int
    missing_words: list[str]
    notes: list[str]

    @property
    def vocab_hit_rate(self) -> float:
        if self.vocab_entries_total == 0:
            return 1.0
        return self.vocab_entries_hit / self.vocab_entries_total

    @property
    def overall(self) -> float:
        # Equal weight across three dimensions.
        return (self.body_sim + self.trans_sim + self.vocab_sim) / 3


def verify_passage(folder: Path) -> PassageReport:
    name = folder.name
    notes: list[str] = []

    html_path = folder / "原始html.html"
    body_md_path = folder / "正文.md"
    trans_md_path = folder / "中文翻译.md"
    vocab_md_path = folder / "单词.md"

    for p in (html_path, body_md_path, trans_md_path, vocab_md_path):
        if not p.exists():
            notes.append(f"缺失文件: {p.name}")

    html_text = html_path.read_text(encoding="utf-8") if html_path.exists() else ""
    body_md = body_md_path.read_text(encoding="utf-8") if body_md_path.exists() else ""
    trans_md = trans_md_path.read_text(encoding="utf-8") if trans_md_path.exists() else ""
    vocab_md = vocab_md_path.read_text(encoding="utf-8") if vocab_md_path.exists() else ""

    extractor = SectionExtractor()
    extractor.feed(html_text)

    body_html = "".join(extractor.body_parts)
    trans_html = "".join(extractor.trans_parts)
    vocab_html = "".join(extractor.vocab_parts)

    body_md_clean = strip_md_decorations(body_md)
    trans_md_clean = strip_md_decorations(trans_md)
    vocab_md_clean = strip_md_decorations(vocab_md)

    body_html_n = normalize(body_html)
    trans_html_n = normalize(trans_html)
    vocab_html_n = normalize(vocab_html)
    body_md_n = normalize(body_md_clean)
    trans_md_n = normalize(trans_md_clean)
    vocab_md_n = normalize(vocab_md_clean)

    body_sim = similarity(body_html_n, body_md_n)
    trans_sim = similarity(trans_html_n, trans_md_n)
    vocab_sim = similarity(vocab_html_n, vocab_md_n)

    # Entry hit-rate for vocabulary
    vocab_md_lower = vocab_md.lower()
    total = len(extractor.vocab_entries)
    hit = 0
    missing: list[str] = []
    for word in extractor.vocab_entries:
        if word.lower() in vocab_md_lower:
            hit += 1
        else:
            missing.append(word)

    if not body_html_n:
        notes.append("HTML 中未提取到正文段落")
    if not trans_html_n:
        notes.append("HTML 中未提取到中文翻译段落")
    if not vocab_html_n:
        notes.append("HTML 中未提取到单词区块")

    return PassageReport(
        name=name,
        body_sim=body_sim,
        body_html_len=len(body_html_n),
        body_md_len=len(body_md_n),
        trans_sim=trans_sim,
        trans_html_len=len(trans_html_n),
        trans_md_len=len(trans_md_n),
        vocab_sim=vocab_sim,
        vocab_html_len=len(vocab_html_n),
        vocab_md_len=len(vocab_md_n),
        vocab_entries_total=total,
        vocab_entries_hit=hit,
        missing_words=missing,
        notes=notes,
    )


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

def pct(x: float) -> str:
    return f"{x * 100:5.1f}%"


def main() -> int:
    folders = sorted(
        [p for p in ROOT.iterdir() if p.is_dir() and p.name.startswith("Passage_")],
        key=lambda p: int(p.name.split("_")[1]),
    )

    reports: list[PassageReport] = [verify_passage(f) for f in folders]

    lines: list[str] = []
    lines.append("# 原始HTML.html 与 *.md 匹配度验证报告")
    lines.append("")
    lines.append(f"共 {len(reports)} 个段落。")
    lines.append("")
    lines.append("## 指标说明")
    lines.append("")
    lines.append("- **正文相似度** / **翻译相似度** / **单词相似度**：剥离 Markdown 标记和空白/标点差异后，使用 `difflib.SequenceMatcher` 计算的字符级相似度。")
    lines.append("- **核心词命中率**：HTML 单词区块中所有 headword (`<span class=\"background-word\">`) 在 `单词.md` 中能找到的比例。")
    lines.append("- **综合分**：三项相似度的算术平均。")
    lines.append("")
    lines.append("## 汇总表")
    lines.append("")
    lines.append("| 段落 | 正文相似度 | 翻译相似度 | 单词相似度 | 核心词命中 | 综合分 | 备注 |")
    lines.append("|------|-----------|-----------|-----------|-----------|--------|------|")

    for r in reports:
        note = "; ".join(r.notes) if r.notes else ""
        lines.append(
            f"| {r.name} | {pct(r.body_sim)} | {pct(r.trans_sim)} | "
            f"{pct(r.vocab_sim)} | {r.vocab_entries_hit}/{r.vocab_entries_total} "
            f"({pct(r.vocab_hit_rate)}) | {pct(r.overall)} | {note} |"
        )

    # ----- aggregate stats -----
    n = len(reports) or 1
    avg_body = sum(r.body_sim for r in reports) / n
    avg_trans = sum(r.trans_sim for r in reports) / n
    avg_vocab = sum(r.vocab_sim for r in reports) / n
    avg_hit = sum(r.vocab_hit_rate for r in reports) / n
    avg_overall = sum(r.overall for r in reports) / n

    lines.append("")
    lines.append("## 平均")
    lines.append("")
    lines.append(f"- 平均正文相似度: **{pct(avg_body)}**")
    lines.append(f"- 平均翻译相似度: **{pct(avg_trans)}**")
    lines.append(f"- 平均单词相似度: **{pct(avg_vocab)}**")
    lines.append(f"- 平均核心词命中率: **{pct(avg_hit)}**")
    lines.append(f"- 平均综合分: **{pct(avg_overall)}**")

    # ----- low-scoring passages -----
    THRESHOLD = 0.90
    low = [r for r in reports if r.overall < THRESHOLD]
    lines.append("")
    lines.append(f"## 综合分低于 {pct(THRESHOLD)} 的段落 ({len(low)} 个)")
    lines.append("")
    if not low:
        lines.append("无。")
    else:
        for r in sorted(low, key=lambda x: x.overall):
            lines.append(f"### {r.name} — 综合分 {pct(r.overall)}")
            lines.append("")
            lines.append(
                f"- 正文 {pct(r.body_sim)} | 翻译 {pct(r.trans_sim)} | 单词 {pct(r.vocab_sim)}"
            )
            lines.append(
                f"- 长度: 正文 HTML={r.body_html_len}/MD={r.body_md_len}, "
                f"翻译 HTML={r.trans_html_len}/MD={r.trans_md_len}, "
                f"单词 HTML={r.vocab_html_len}/MD={r.vocab_md_len}"
            )
            if r.missing_words:
                preview = ", ".join(r.missing_words[:15])
                more = "" if len(r.missing_words) <= 15 else f" …(+{len(r.missing_words) - 15})"
                lines.append(f"- 缺失核心词: {preview}{more}")
            if r.notes:
                lines.append(f"- 备注: {'; '.join(r.notes)}")
            lines.append("")

    # ----- passages with missing core words (even if overall ok) -----
    missing_only = [
        r for r in reports
        if r.missing_words and r not in low
    ]
    lines.append("## 单词命中不完整但综合分尚可的段落")
    lines.append("")
    if not missing_only:
        lines.append("无。")
    else:
        for r in missing_only:
            preview = ", ".join(r.missing_words[:10])
            more = "" if len(r.missing_words) <= 10 else f" …(+{len(r.missing_words) - 10})"
            lines.append(
                f"- {r.name} (综合分 {pct(r.overall)}, 命中 {r.vocab_entries_hit}/{r.vocab_entries_total}): {preview}{more}"
            )

    out_path = ROOT / "匹配度验证报告.md"
    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"报告已生成: {out_path}")
    print(f"平均综合分: {pct(avg_overall)}")
    print(f"低分段落数 (<{pct(THRESHOLD)}): {len(low)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
