import React from 'react';
import { findVocab } from '../utils/vocab.js';

// 把英文文本里的 {word} 标记 → .wn 高亮 span；其余普通英文单词 → .w-raw 可点击 span
// 与旧 app.js highlightWords + tokenizeAndWrap 完全一致
export default function HighlightedText({ text, vocab, onWordClick }) {
  if (!text) return null;

  // 1. 按 {word} 分割
  const parts = text.split(/(\{[^}]+\})/g);
  const nodes = [];

  parts.forEach((part, idx) => {
    const m = part.match(/^\{([^}]+)\}$/);
    if (m) {
      const key = m[1];
      const entry = findVocab(key, vocab);
      if (entry) {
        const outlineClass = entry.type === 'outline' ? ' outline' : '';
        nodes.push(
          <span className="wn" key={idx}>
            <span
              className={`w${outlineClass}`}
              data-key={key}
              onClick={e => onWordClick && onWordClick(e, key)}
            >
              {entry.display || key}
            </span>
            {entry.ctx ? <span className="w-g">{entry.ctx}</span> : null}
          </span>
        );
      } else {
        // 标记但 vocab 未命中：当作普通可点击词
        nodes.push(<RawWord key={idx} word={key} onClick={onWordClick} />);
      }
    } else {
      // 纯文本：每个英文单词做成可点击
      nodes.push(<TokenizedText key={idx} text={part} onWordClick={onWordClick} />);
    }
  });

  return <>{nodes}</>;
}

// 把纯文本按英文单词切分，单词包成可点击 span
function TokenizedText({ text, onWordClick }) {
  if (!text) return null;
  const re = /([A-Za-z][A-Za-z''']*)/g;
  const nodes = [];
  let lastIdx = 0;
  let match;
  let k = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIdx) {
      nodes.push(text.slice(lastIdx, match.index));
    }
    nodes.push(<RawWord key={k++} word={match[1]} onClick={onWordClick} />);
    lastIdx = re.lastIndex;
  }
  if (lastIdx < text.length) {
    nodes.push(text.slice(lastIdx));
  }
  return <>{nodes}</>;
}

// 普通英文单词 → .w-raw 可点击
function RawWord({ word, onClick }) {
  const display = String(word).replace(/^[''']+|[''']+$/g, '');
  if (!display) return word;
  const query = display.replace(/['']/g, "'").toLowerCase();
  return (
    <span
      className="w-raw"
      data-word={query}
      onClick={e => onClick && onClick(e, query)}
    >
      {display}
    </span>
  );
}
