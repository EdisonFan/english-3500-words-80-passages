const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'spa', 'data', 'p02.json');
const dst = path.join(__dirname, 'data', 'p02.json');

const raw = JSON.parse(fs.readFileSync(src, 'utf-8'));

function determineKind(word) {
  if (/^[A-Z]/.test(word) && word.length > 1 && !word.includes(' ')) return 'proper_noun';
  if (/^[A-Z]{2,}$/.test(word)) return 'abbrev';
  if (word.includes(' ')) return 'phrase';
  return 'word';
}

const bracedWords = [];
for (const p of raw.paragraphs) {
  const matches = p.en.matchAll(/\{([^}]+)\}/g);
  for (const m of matches) {
    bracedWords.push(m[1]);
  }
}

const vocabWordSet = new Set(raw.vocab.map(v => v.word));

const formsMap = {};
for (const entry of raw.vocab) {
  formsMap[entry.word] = [];
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
  paragraphs: raw.paragraphs,
  vocab: newVocab
};

fs.writeFileSync(dst, JSON.stringify(result, null, 2), 'utf-8');
console.log('Done: spapro/data/p02.json');

console.log('\n--- Verification ---');
try { JSON.parse(JSON.stringify(result)); console.log('1. JSON parseable: true'); } catch(e) { console.log('1. JSON parseable: false'); }

let hasTopLevelExtras = false;
let hasWords = false;
for (const v of newVocab) {
  if (v.extras !== undefined) hasTopLevelExtras = true;
  if (v.words !== undefined) hasWords = true;
}
console.log('2. No top-level extras:', !hasTopLevelExtras);
console.log('3. No words field:', !hasWords);

const allWords = new Set();
const allForms = new Set();
for (const v of newVocab) {
  allWords.add(v.word);
  for (const f of v.forms) {
    allForms.add(f.surface);
  }
}

const unmatched = [];
for (const bw of bracedWords) {
  if (!allWords.has(bw) && !allForms.has(bw)) {
    unmatched.push(bw);
  }
}
console.log('5. All braced words matched:', unmatched.length === 0);
if (unmatched.length > 0) {
  console.log('   Unmatched:', unmatched);
}

console.log('\nForms summary:');
for (const v of newVocab) {
  if (v.forms.length > 0) {
    console.log(`  ${v.word}: ${JSON.stringify(v.forms)}`);
  }
}

console.log('\nMemory summary:');
for (const v of newVocab) {
  if (v.memory.length > 0) {
    console.log(`  ${v.word}: ${JSON.stringify(v.memory)}`);
  }
}

console.log('\nDefs extras summary:');
for (const v of newVocab) {
  for (const d of v.defs) {
    if (d.extras && d.extras.length > 0) {
      console.log(`  ${v.word} (${d.pos}): ${JSON.stringify(d.extras)}`);
    }
  }
}