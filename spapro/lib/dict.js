/**
 * 词典代理：
 * - fetchYoudao：调用有道 jsonapi 解析成统一结构
 * - handleDict：先查内存缓存，再查本地磁盘缓存，最后走上游 API
 *   命中后写盘 + 写内存缓存，逐步积累本地词典库
 */
const fs = require('fs');
const path = require('path');
const { CACHE_DIR } = require('./config');
const { httpsGet, sendJson } = require('./http');
const { safeFilename, splitPos, stripContraction } = require('./utils');

fs.mkdirSync(CACHE_DIR, { recursive: true });

const memCache = new Map();

function fetchYoudao(word) {
  const encoded = encodeURIComponent(word);
  const apiUrl = `https://dict.youdao.com/jsonapi?q=${encoded}`;

  return httpsGet(apiUrl, {
    'User-Agent': 'Mozilla/5.0 (compatible; SpaDictProxy/1.0)',
    'Accept': 'application/json',
  }).then(({ body }) => {
    const data = JSON.parse(body);

    const result = {
      word,
      found: false,
      phonetic_uk: '',
      phonetic_us: '',
      audio_uk: '',
      audio_us: '',
      defs: [],
      forms: [],
      examples: [],
      synonyms: [],
      prototype: '',
      exam_type: [],
      phrs: [],
      individual: {},
    };

    const ec = data.ec || {};
    const ecWordList = ec.word || [];
    if (ecWordList.length > 0) {
      const ecWord = ecWordList[0];
      result.found = true;
      result.phonetic_uk = ecWord.ukphone || '';
      result.phonetic_us = ecWord.usphone || '';
      const audioWord = encodeURIComponent(word);
      result.audio_uk = `https://dict.youdao.com/dictvoice?audio=${audioWord}&type=1`;
      result.audio_us = `https://dict.youdao.com/dictvoice?audio=${audioWord}&type=2`;

      const trs = ecWord.trs || [];
      for (const tr of trs) {
        const trList = tr.tr || [];
        for (const trItem of trList) {
          const l = trItem.l || {};
          const iList = l.i || [];
          const parts = [];
          for (const iItem of iList) {
            if (typeof iItem === 'object' && iItem !== null) {
              parts.push(iItem['#text'] || '');
            } else {
              parts.push(String(iItem));
            }
          }
          const full = parts.join('').trim();
          if (full) {
            const [pos, meaning] = splitPos(full);
            result.defs.push({ pos, meaning });
          }
        }
      }

      const wfs = ecWord.wfs || [];
      for (const wfItem of wfs) {
        const wf = wfItem.wf || {};
        const name = wf.name || '';
        const value = wf.value || '';
        if (name && value) {
          result.forms.push({ name, value });
        }
      }

      result.prototype = ecWord.prototype || '';
    }

    result.exam_type = ec.exam_type || [];

    if (result.defs.length === 0) {
      const simple = data.simple || {};
      const simpleWordList = simple.word || [];
      if (simpleWordList.length > 0) {
        const sw = simpleWordList[0];
        result.found = true;
        const means = sw.explain || '';
        if (means) {
          for (const m of means.split(';')) {
            const trimmed = m.trim();
            if (trimmed) {
              const [pos, meaning] = splitPos(trimmed);
              result.defs.push({ pos, meaning });
            }
          }
        }
      }
    }

    const blng = data.blng_sents_part || {};
    const pairs = blng['sentence-pair'] || [];
    for (const p of pairs.slice(0, 5)) {
      const en = (p['sentence-eng'] || '').trim().replace(/<\/?b>/g, '');
      const zh = (p['sentence-translation'] || '').trim();
      if (en && zh) {
        result.examples.push({ en, zh });
      }
    }

    const synoRoot = data.syno || {};
    const synos = synoRoot.synos || [];
    for (const s of synos.slice(0, 3)) {
      const syno = s.syno || {};
      const pos = syno.pos || '';
      const tran = syno.tran || '';
      const ws = syno.ws || [];
      const words = ws.map(w => w.w).filter(Boolean);
      if (words.length > 0) {
        result.synonyms.push({ pos, meaning: tran, words });
      }
    }

    const phrsRoot = data.phrs || {};
    const phrsList = phrsRoot.phrs || [];
    for (const p of phrsList.slice(0, 10)) {
      const phr = p.phr || {};
      const hw = phr.headword || {};
      const hwL = hw.l || {};
      const phrase = hwL.i || '';
      const trs = phr.trs || [];
      const translations = [];
      for (const t of trs) {
        const tr = t.tr || {};
        const trL = tr.l || {};
        const trI = trL.i || '';
        if (trI) translations.push(trI);
      }
      if (phrase) {
        result.phrs.push({ phrase, translations });
      }
    }

    const ind = data.individual || {};
    const individualInfo = {};
    if (ind && Object.keys(ind).length > 0) {
      individualInfo.level = ind.level || '';
      individualInfo.mnemonic = '';
      const mnemonic = ind.mnemonic || {};
      if (mnemonic) {
        individualInfo.mnemonic = mnemonic.method || '';
      }
      individualInfo.examInfo = ind.examInfo || {};
      const pastSents = ind.pastExamSents || [];
      individualInfo.pastExamSents = pastSents.slice(0, 5).map(s => ({
        en: s.en || '',
        zh: s.zh || '',
        source: s.source || '',
      }));
      const idiomatic = ind.idiomatic || [];
      individualInfo.idiomatic = idiomatic
        .filter(c => c.colloc)
        .map(c => ({
          en: c.colloc.en || '',
          zh: c.colloc.zh || '',
        }));
    }
    result.individual = individualInfo;

    return result;
  }).catch((e) => ({
    word,
    found: false,
    phonetic_uk: '',
    phonetic_us: '',
    audio_uk: '',
    audio_us: '',
    defs: [],
    forms: [],
    examples: [],
    synonyms: [],
    prototype: '',
    exam_type: [],
    phrs: [],
    individual: {},
    error: `词典服务不可达: ${e.message}`,
  }));
}

async function handleDict(word, res) {
  if (memCache.has(word)) {
    sendJson(res, 200, memCache.get(word));
    return;
  }

  const cachePath = path.join(CACHE_DIR, safeFilename(word) + '.json');
  if (fs.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      memCache.set(word, cached);
      sendJson(res, 200, cached);
      return;
    } catch (_) {}
  }

  let result = await fetchYoudao(word);

  if (!result.found && (word.includes("'") || word.includes('\u2019'))) {
    const base = stripContraction(word);
    if (base && base !== word) {
      const baseResult = await fetchYoudao(base);
      if (baseResult.found) {
        baseResult.word = word;
        baseResult.base_form = base;
        result = baseResult;
      }
    }
  }

  if (result.found) {
    try {
      fs.writeFileSync(cachePath, JSON.stringify(result, null, 2), 'utf-8');
    } catch (_) {}
  }

  if (result.found || !result.error) memCache.set(word, result);

  sendJson(res, 200, result);
}

module.exports = { handleDict, fetchYoudao };
