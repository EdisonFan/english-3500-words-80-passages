'use strict';

const fs = require('fs');
const path = require('path');

const Service = require('egg').Service;

class UtilsService extends Service {
  // 与旧 lib/utils.js 保持一致
  safeFilename(word) {
    const safe = String(word || '').trim().toLowerCase().replace(/[^\w-]/g, '_');
    return safe || 'unknown';
  }

  splitPos(text) {
    const m = String(text || '').match(/^((?:n|v|vi|vt|aux|adj|adv|prep|conj|pron|num|art|int|abbr|det)\.)\s*(.*)/);
    if (m) return [m[1], m[2].trim()];
    return ['', String(text || '').trim()];
  }

  parseDuration(s) {
    const parts = String(s || '').split(':');
    let secs = 0;
    for (const p of parts) {
      const n = parseInt(p, 10);
      if (isNaN(n)) return 0;
      secs = secs * 60 + n;
    }
    return secs;
  }

  stripContraction(word) {
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
      const base = String(word || '').replace(re, '');
      if (base && base !== word) return base;
    }
    return null;
  }

  readJsonSilent(file) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      return null;
    }
  }

  escapeRegex(s) {
    return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

module.exports = UtilsService;
