// 单词查找逻辑（迁移自 app.js findVocab）
// key 形如 "child's"，需要尝试去标点、去所有格等回退匹配

function uniq(list) {
  const seen = {};
  const out = [];
  for (const v of list) {
    if (!v || seen[v]) continue;
    seen[v] = true;
    out.push(v);
  }
  return out;
}

function stripEdgePunct(s) {
  return String(s)
    .replace(/^[\s“”"‘’'()\[\]{}]+/g, '')
    .replace(/[\s“”"‘’'()\[\]{}.,!?;:]+$/g, '');
}

function buildCandidates(s) {
  const base = String(s || '');
  const lower = base.toLowerCase();
  const c1 = stripEdgePunct(base);
  const c2 = stripEdgePunct(lower);
  const c3 = c1.replace(/(’s|'s|s’|’)$|('$)/g, '');
  const c4 = c2.replace(/(’s|'s|s’|’)$|('$)/g, '');
  return uniq([base, lower, c1, c2, c3, c4]);
}

export function findVocab(key, vocab) {
  if (!vocab || !vocab.length) return null;
  const candidates = buildCandidates(key);

  for (const cand of candidates) {
    for (let i = 0; i < vocab.length; i++) {
      if (vocab[i].word === cand) return vocab[i];
    }
  }
  for (const cand of candidates) {
    for (let j = 0; j < vocab.length; j++) {
      const forms = vocab[j].forms || [];
      for (let k = 0; k < forms.length; k++) {
        if (forms[k].surface === cand) return vocab[j];
      }
    }
  }
  return null;
}
