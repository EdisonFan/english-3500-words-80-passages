'use strict';

const fs = require('fs');
const path = require('path');

const Service = require('egg').Service;

class SearchService extends Service {
  static escapeRegex(s) {
    return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  static makeRegex(q) {
    return new RegExp('\\b' + SearchService.escapeRegex(q) + '\\b', 'i');
  }

  static stripMarks(en) {
    return String(en || '').replace(/\{([^}]+)\}/g, '$1');
  }

  static makeSnippet(text, re, radius = 60) {
    const m = re.exec(text);
    if (!m) return '';
    const start = Math.max(0, m.index - radius);
    const end = Math.min(text.length, m.index + m[0].length + radius);
    const prefix = start > 0 ? '…' : '';
    const suffix = end < text.length ? '…' : '';
    return prefix + text.slice(start, end) + suffix;
  }

  // 遍历所有书所有文章，匹配 marked/text/vocab
  async globalSearch(q) {
    q = String(q || '').trim();
    if (!q) return { ok: true, query: q, results: [] };

    const re = SearchService.makeRegex(q);
    const results = [];
    const { dataDir } = this.app.config.spapro;
    const utils = this.ctx.service.utils;
    const booksIndex = utils.readJsonSilent(path.join(dataDir, 'books.json'));
    if (!booksIndex || !Array.isArray(booksIndex.books)) {
      return { ok: true, query: q, results: [] };
    }

    for (const book of booksIndex.books) {
      const bookId = book.id;
      const bookPath = book.path || bookId;
      const passagesDir = path.join(dataDir, bookPath, 'passages');
      let files = [];
      try {
        files = fs.readdirSync(passagesDir).filter(n => /^p.*\.json$/i.test(n));
      } catch (e) {
        continue;
      }

      for (const file of files) {
        const data = utils.readJsonSilent(path.join(passagesDir, file));
        if (!data) continue;

        const pid = file.replace(/\.json$/i, '');
        const passageTitle = data.title || ('Passage ' + (data.id || pid));
        const matches = [];

        // ① marked
        if (Array.isArray(data.paragraphs)) {
          for (const p of data.paragraphs) {
            const en = p.en || '';
            const markRe = new RegExp('\\{([^}]*' + SearchService.escapeRegex(q) + '[^}]*)\\}', 'i');
            if (markRe.exec(en)) {
              matches.push({ type: 'marked', paraNum: p.num, snippet: SearchService.makeSnippet(SearchService.stripMarks(en), re, 80) });
            }
          }
        }
        // ② text
        if (Array.isArray(data.paragraphs)) {
          for (const p of data.paragraphs) {
            const en = p.en || '';
            if (re.test(SearchService.stripMarks(en))) {
              const already = matches.some(x => x.type === 'marked' && x.paraNum === p.num);
              if (!already) {
                matches.push({ type: 'text', paraNum: p.num, snippet: SearchService.makeSnippet(SearchService.stripMarks(en), re, 80) });
              }
            }
          }
        }
        // ③ vocab
        if (Array.isArray(data.vocab)) {
          for (const v of data.vocab) {
            if (v && v.word && re.test(v.word)) {
              matches.push({
                type: 'vocab',
                word: v.word,
                meaning: v.ctx || '',
                pos: (v.defs && v.defs[0] && v.defs[0].pos) || '',
                vocabType: v.type || '',
              });
            }
          }
        }

        if (matches.length) {
          results.push({
            bookId,
            bookTitle: book.title || bookId,
            pid,
            passageTitle,
            matches,
          });
        }
      }
    }
    return { ok: true, query: q, results };
  }
}

module.exports = SearchService;
