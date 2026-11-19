const fs = require('fs');
const path = require('path');

// 处理单个文件
function processFile(num) {
  const numStr = num.toString().padStart(2, '0');
  const src = path.join(__dirname, '..', 'spa', 'data', `p${numStr}.json`);
  const dst = path.join(__dirname, 'data', `p${numStr}.json`);

  if (!fs.existsSync(src)) {
    console.log(`跳过 p${numStr}: 源文件不存在`);
    return false;
  }

  const raw = JSON.parse(fs.readFileSync(src, 'utf-8'));

  function determineKind(word) {
    if (/^[A-Z]/.test(word) && word.length > 1 && !word.includes(' ')) return 'proper_noun';
    if (/^[A-Z]{2,}$/.test(word)) return 'abbrev';
    if (word.includes(' ')) return 'phrase';
    return 'word';
  }

  const vocabWordSet = new Set(raw.vocab.map(v => v.word));
  const vocabWordSetLower = new Set(raw.vocab.map(v => String(v.word).toLowerCase()));

  function tokenMatchesVocab(token) {
    const t = String(token || '').trim();
    if (!t) return false;
    const tl = t.toLowerCase();
    if (vocabWordSetLower.has(tl)) return true;
    if (tl.endsWith('ies')) {
      const base = tl.replace(/ies$/, 'y');
      if (vocabWordSetLower.has(base)) return true;
    }
    if (tl.endsWith('es')) {
      const base = tl.slice(0, -2);
      if (vocabWordSetLower.has(base)) return true;
    }
    if (tl.endsWith('s')) {
      const base = tl.slice(0, -1);
      if (vocabWordSetLower.has(base)) return true;
    }
    if (tl.endsWith('ed')) {
      const base1 = tl.slice(0, -2);
      const base2 = base1 + 'e';
      if (vocabWordSetLower.has(base1) || vocabWordSetLower.has(base2)) return true;
    }
    if (tl.endsWith('ing')) {
      const base1 = tl.slice(0, -3);
      const base2 = base1 + 'e';
      if (vocabWordSetLower.has(base1) || vocabWordSetLower.has(base2)) return true;
      if (base1.endsWith('y')) {
        const base3 = base1.replace(/y$/, 'ie');
        if (vocabWordSetLower.has(base3)) return true;
      }
    }
    return false;
  }

  function expandBracedPhrases(enText) {
    if (!enText) return enText;
    return String(enText).replace(/\{([^}]+)\}/g, function(full, inside) {
      const s = String(inside);
      if (!/\s/.test(s)) return full;
      const parts = s.trim().split(/\s+/g).filter(Boolean);
      if (parts.length <= 1) return full;
      for (const part of parts) {
        if (!tokenMatchesVocab(part)) return full;
      }
      return parts.map(p => `{${p}}`).join(' ');
    });
  }

  const normalizedParagraphs = (raw.paragraphs || []).map(p => {
    return { ...p, en: expandBracedPhrases(p.en) };
  });

  const bracedWords = [];
  for (const p of normalizedParagraphs) {
    const matches = String(p.en || '').matchAll(/\{([^}]+)\}/g);
    for (const m of matches) bracedWords.push(m[1]);
  }

  const formsMap = {};
  for (const entry of raw.vocab) {
    formsMap[entry.word] = [];
  }

  function extractExtraFormsFromEntry(entry) {
    const out = [];
    const defs = entry.defs || [];
    for (const d of defs) {
      const meaning = d && d.meaning ? String(d.meaning) : '';
      if (!meaning) continue;
      const matches = meaning.matchAll(/[（(]([^）)]+)[）)]/g);
      for (const m of matches) {
        const inside = m[1];
        const parts = inside.split(/[,，]/g);
        for (let p of parts) {
          p = String(p).trim();
          if (!p) continue;
          p = p.replace(/^[“”"‘’']+|[“”"‘’']+$/g, '');
          if (!/^[A-Za-z][A-Za-z'’\-]*$/.test(p)) continue;
          if (p.toLowerCase() === String(entry.word).toLowerCase()) continue;
          out.push(p);
        }
      }
    }
    return [...new Set(out)];
  }

  for (const entry of raw.vocab) {
    const extraForms = extractExtraFormsFromEntry(entry);
    if (extraForms.length === 0) continue;
    const existing = formsMap[entry.word];
    for (const surface of extraForms) {
      if (!existing.some(f => f.surface === surface)) {
        existing.push({ surface, tag: 'variant' });
      }
    }
  }

  for (const bw of bracedWords) {
    if (vocabWordSet.has(bw)) continue;
    for (const entry of raw.vocab) {
      const w = entry.word;
      const bwL = bw.toLowerCase();
      const wL = w.toLowerCase();
      if (bwL === wL) continue;
      let matched = false;
      let tag = null;
      if (bwL === wL + 's') { tag = 'plural'; matched = true; }
      else if (bwL === wL + 'es') { tag = 'plural'; matched = true; }
      else if (bwL === wL.replace(/y$/, 'i') + 'es') { tag = 'plural'; matched = true; }
      else if (bwL === wL + 'ed') { tag = 'past'; matched = true; }
      else if (bwL === wL + 'd' && wL.endsWith('e')) { tag = 'past'; matched = true; }
      else if (bwL === wL + 'ing') { tag = 'ing'; matched = true; }
      else if (bwL === wL.replace(/e$/, '') + 'ing') { tag = 'ing'; matched = true; }
      else if (bwL === wL.replace(/ie$/, 'y') + 'ing') { tag = 'ing'; matched = true; }
      else if (bwL === wL + 's' && wL.endsWith('s')) { tag = 'third_person'; matched = true; }
      if (matched && tag) {
        const existing = formsMap[w];
        if (!existing.some(f => f.surface === bw)) {
          existing.push({ surface: bw, tag });
        }
        break;
      }
    }
  }

  const newVocab = raw.vocab.map(entry => {
    const memory = [];
    const extrasForDefs = [];

    if (entry.extras && Array.isArray(entry.extras)) {
      for (const ex of entry.extras) {
        if (ex.type === 'mem') {
          memory.push(ex.text);
        } else {
          extrasForDefs.push({
            type: ex.type,
            label: ex.label,
            items: [ex.text]
          });
        }
      }
    }

    const newDefs = entry.defs.map((def, i) => {
      const d = { pos: def.pos, meaning: def.meaning };
      if (i === 0 && extrasForDefs.length > 0) {
        d.extras = extrasForDefs;
      }
      return d;
    });

    const kind = determineKind(entry.word);
    const forms = formsMap[entry.word] || [];

    return {
      word: entry.word,
      lemma: entry.word,
      kind,
      type: entry.type,
      ctx: entry.ctx,
      forms,
      phonetic: entry.phonetic,
      memory,
      defs: newDefs
    };
  });

  const result = {
    id: raw.id,
    stats: raw.stats,
    paragraphs: normalizedParagraphs,
    vocab: newVocab
  };

  fs.writeFileSync(dst, JSON.stringify(result, null, 2), 'utf-8');

  const issues = [];
  for (const v of newVocab) {
    if (v.extras !== undefined) issues.push(v.word + ' has top-level extras');
    if (v.words !== undefined) issues.push(v.word + ' has words field');
    if (!v.lemma) issues.push(v.word + ' missing lemma');
    if (!v.kind) issues.push(v.word + ' missing kind');
    if (!['word', 'phrase', 'proper_noun', 'abbrev'].includes(v.kind)) issues.push(v.word + ' invalid kind: ' + v.kind);
    if (!['core', 'outline'].includes(v.type)) issues.push(v.word + ' invalid type: ' + v.type);
    for (const d of v.defs || []) {
      if (d.extras) {
        for (const e of d.extras) {
          if (e.text !== undefined) issues.push(v.word + ' def extra still has text field');
          if (!Array.isArray(e.items)) issues.push(v.word + ' def extra items not array');
        }
      }
    }
  }

  const allWords = new Set(newVocab.map(v => v.word));
  const allForms = new Set();
  for (const v of newVocab) {
    for (const f of v.forms) allForms.add(f.surface);
  }
  const unmatched = [...new Set(bracedWords)].filter(bw => !allWords.has(bw) && !allForms.has(bw));

  if (issues.length > 0) {
    console.log(`! p${numStr}.json  issues=${issues.length}`);
    console.log('  issues:', issues.slice(0, 20).join('; ') + (issues.length > 20 ? ' ...' : ''));
    return { ok: false, skipped: false, issues, unmatched };
  }

  console.log(`✓ p${numStr}.json`);
  return { ok: true, skipped: false, issues: [], unmatched };
}

// 主程序
console.log('开始批量转换...\n');
let success = 0;
let skipped = 0;
let warn = 0;
let totalUnmatched = 0;
let filesWithUnmatched = 0;

for (let i = 1; i <= 80; i++) {
  const r = processFile(i);
  if (r && r.ok) {
    success++;
    if (r.unmatched && r.unmatched.length > 0) {
      filesWithUnmatched++;
      totalUnmatched += r.unmatched.length;
    }
  } else if (r === false) {
    skipped++;
  } else {
    warn++;
  }
}

console.log(`\n完成: 正常 ${success} 个, 警告 ${warn} 个, 跳过 ${skipped} 个`);
if (filesWithUnmatched > 0) console.log(`包含未匹配花括号词的篇目: ${filesWithUnmatched} 个, 总计未匹配: ${totalUnmatched} 个`);
process.exit(warn > 0 ? 1 : 0);
