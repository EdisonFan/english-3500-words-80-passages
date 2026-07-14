'use strict';

const fs = require('fs');
const path = require('path');

const Service = require('egg').Service;

// 内存缓存：词 → 结果
const memCache = new Map();

class DictService extends Service {
  // 调用有道 jsonapi，结构与旧 lib/dict.js 完全一致
  async fetchYoudao(word) {
    const encoded = encodeURIComponent(word);
    const apiUrl = `https://dict.youdao.com/jsonapi?q=${encoded}`;
    try {
      const resp = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SpaDictProxy/1.0)',
          Accept: 'application/json',
        },
      });
      const body = await resp.text();
      const data = JSON.parse(body);
      const utils = this.ctx.service.utils;

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
              const [pos, meaning] = utils.splitPos(full);
              result.defs.push({ pos, meaning });
            }
          }
        }

        const wfs = ecWord.wfs || [];
        for (const wfItem of wfs) {
          const wf = wfItem.wf || {};
          const name = wf.name || '';
          const value = wf.value || '';
          if (name && value) result.forms.push({ name, value });
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
                const [pos, meaning] = utils.splitPos(trimmed);
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
        if (en && zh) result.examples.push({ en, zh });
      }

      const synoRoot = data.syno || {};
      const synos = synoRoot.synos || [];
      for (const s of synos.slice(0, 3)) {
        const syno = s.syno || {};
        const pos = syno.pos || '';
        const tran = syno.tran || '';
        const ws = syno.ws || [];
        const words = ws.map(w => w.w).filter(Boolean);
        if (words.length > 0) result.synonyms.push({ pos, meaning: tran, words });
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
        if (phrase) result.phrs.push({ phrase, translations });
      }

      const ind = data.individual || {};
      const individualInfo = {};
      if (ind && Object.keys(ind).length > 0) {
        individualInfo.level = ind.level || '';
        individualInfo.mnemonic = '';
        const mnemonic = ind.mnemonic || {};
        if (mnemonic) individualInfo.mnemonic = mnemonic.method || '';
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
          .map(c => ({ en: c.colloc.en || '', zh: c.colloc.zh || '' }));
      }
      result.individual = individualInfo;

      return result;
    } catch (e) {
      // 打印完整错误堆栈，便于定位 "failed to build request" 等疑难问题
      this.ctx.logger.error('[dict.fetchYoudao] word=%j error=%s stack=%s cause=%s',
        word, e.message, e.stack, e.cause ? (e.cause.message + '/' + e.cause.code) : 'none');
      return {
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
      };
    }
  }

  async lookup(word) {
    if (memCache.has(word)) return memCache.get(word);

    const { dataDir } = this.app.config.spapro;
    const cacheDir = path.join(dataDir, 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const cachePath = path.join(cacheDir, this.ctx.service.utils.safeFilename(word) + '.json');
    if (fs.existsSync(cachePath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
        memCache.set(word, cached);
        return cached;
      } catch (_) { /* fallthrough */ }
    }

    let result = await this.fetchYoudao(word);

    // 缩写形式回退
    if (!result.found && (word.includes("'") || word.includes('\u2019'))) {
      const base = this.ctx.service.utils.stripContraction(word);
      if (base && base !== word) {
        const baseResult = await this.fetchYoudao(base);
        if (baseResult.found) {
          baseResult.word = word;
          baseResult.base_form = base;
          result = baseResult;
        }
      }
    }

    if (result.found) {
      try { fs.writeFileSync(cachePath, JSON.stringify(result, null, 2), 'utf-8'); } catch (_) {}
    }
    if (result.found || !result.error) memCache.set(word, result);
    return result;
  }
}

module.exports = DictService;
