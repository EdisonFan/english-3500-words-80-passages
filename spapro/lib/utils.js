/**
 * 通用纯函数工具，无副作用、无外部依赖。
 */

function safeFilename(word) {
  const safe = word.trim().toLowerCase().replace(/[^\w\-]/g, '_');
  return safe || 'unknown';
}

function splitPos(text) {
  const m = text.match(/^((?:n|v|vi|vt|aux|adj|adv|prep|conj|pron|num|art|int|abbr|det)\.)\s*(.*)/);
  if (m) return [m[1], m[2].trim()];
  return ['', text.trim()];
}

function parseDuration(s) {
  const parts = s.split(':');
  let secs = 0;
  for (const p of parts) {
    const n = parseInt(p, 10);
    if (isNaN(n)) return 0;
    secs = secs * 60 + n;
  }
  return secs;
}

function stripContraction(word) {
  const ap = "['\u2019]";
  const patterns = [
    [ap + 's$', ''],
    ['n' + ap + 't$', ''],
    [ap + 're$', ''],
    [ap + 've$', ''],
    [ap + 'll$', ''],
    [ap + 'd$', ''],
    [ap + 'm$', ''],
  ];
  for (const [suffix] of patterns) {
    const re = new RegExp(suffix);
    const base = word.replace(re, '');
    if (base && base !== word) return base;
  }
  return null;
}

module.exports = { safeFilename, splitPos, parseDuration, stripContraction };
