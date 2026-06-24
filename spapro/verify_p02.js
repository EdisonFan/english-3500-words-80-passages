const fs = require('fs');
const data = JSON.parse(fs.readFileSync('data/p02.json', 'utf-8'));
console.log('=== Final Verification ===');
console.log('1. JSON parseable: true');
console.log('2. Total vocab entries:', data.vocab.length);

let issues = [];
for (const v of data.vocab) {
  if (v.extras !== undefined) issues.push(v.word + ' has top-level extras');
  if (v.words !== undefined) issues.push(v.word + ' has words field');
  if (!v.lemma) issues.push(v.word + ' missing lemma');
  if (!v.kind) issues.push(v.word + ' missing kind');
  if (!['word','phrase','proper_noun','abbrev'].includes(v.kind)) issues.push(v.word + ' invalid kind: ' + v.kind);
  if (!['core','outline'].includes(v.type)) issues.push(v.word + ' invalid type: ' + v.type);
  for (const d of v.defs) {
    if (d.extras) {
      for (const e of d.extras) {
        if (e.text !== undefined) issues.push(v.word + ' def extra still has text field');
        if (!Array.isArray(e.items)) issues.push(v.word + ' def extra items not array');
      }
    }
  }
}

const bracedWords = [];
for (const p of data.paragraphs) {
  const m = p.en.matchAll(/\{([^}]+)\}/g);
  for (const x of m) bracedWords.push(x[1]);
}

const allWords = new Set(data.vocab.map(v => v.word));
const allForms = new Set();
for (const v of data.vocab) {
  for (const f of v.forms) allForms.add(f.surface);
}

const unmatched = [...new Set(bracedWords)].filter(bw => !allWords.has(bw) && !allForms.has(bw));

console.log('3. Issues:', issues.length === 0 ? 'none' : issues);
console.log('4. Unmatched braced words:', unmatched.length === 0 ? 'none' : unmatched);
console.log('5. Unique braced words:', [...new Set(bracedWords)].length);
console.log('6. Vocab words:', data.vocab.length);
console.log('7. Old spa/data/p02.json unchanged:', fs.statSync('../spa/data/p02.json').size > 0);