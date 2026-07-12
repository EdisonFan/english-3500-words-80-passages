/**
 * 全局搜词：GET /api/search?q=<word>
 *
 * 遍历所有书所有文章，匹配三类内容：
 *   ① marked：正文里 {word} 标记的教学词
 *   ② text  ：正文普通文本（词边界匹配）
 *   ③ vocab ：词汇表条目
 *
 * 注意：目录路径用 books[i].path（如 "renjiao/pep2"），不是 books[i].id。
 */
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./config');
const { sendJson } = require('./http');

function readJsonSilent(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return null;
  }
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeRegex(q) {
  return new RegExp('\\b' + escapeRegex(q) + '\\b', 'i');
}

function makeSnippet(text, re, radius) {
  radius = radius || 60;
  var m = re.exec(text);
  if (!m) return '';
  var start = Math.max(0, m.index - radius);
  var end = Math.min(text.length, m.index + m[0].length + radius);
  var prefix = start > 0 ? '…' : '';
  var suffix = end < text.length ? '…' : '';
  return prefix + text.slice(start, end) + suffix;
}

/* 去掉正文里的 {word} 标记，得到纯文本 */
function stripMarks(en) {
  return String(en || '').replace(/\{([^}]+)\}/g, '$1');
}

async function handleSearch(req, res, query) {
  var q = String(query || '').trim();
  if (!q) {
    sendJson(res, 200, { ok: true, query: q, results: [] });
    return;
  }

  var re = makeRegex(q);
  var results = [];

  var booksIndex = readJsonSilent(path.join(DATA_DIR, 'books.json'));
  if (!booksIndex || !Array.isArray(booksIndex.books)) {
    sendJson(res, 200, { ok: true, query: q, results: [] });
    return;
  }

  for (var bi = 0; bi < booksIndex.books.length; bi++) {
    var book = booksIndex.books[bi];
    var bookId = book.id;
    // ★关键：用 path 拼目录，人教版的 path 是 "renjiao/pep2" 而非 id
    var bookPath = book.path || bookId;
    var bookDir = path.join(DATA_DIR, bookPath);
    var passagesDir = path.join(bookDir, 'passages');

    var files = [];
    try {
      files = fs.readdirSync(passagesDir).filter(function (n) {
        return /^p.*\.json$/i.test(n);
      });
    } catch (e) {
      continue;
    }

    for (var fi = 0; fi < files.length; fi++) {
      var data = readJsonSilent(path.join(passagesDir, files[fi]));
      if (!data) continue;

      var pid = files[fi].replace(/\.json$/i, '');
      var passageTitle = data.title || ('Passage ' + (data.id || pid));

      var matches = [];

      // ① marked：{word} 标记的教学词
      if (Array.isArray(data.paragraphs)) {
        data.paragraphs.forEach(function (p) {
          var en = p.en || '';
          var markRe = new RegExp('\\{([^}]*' + escapeRegex(q) + '[^}]*)\\}', 'i');
          var mm = markRe.exec(en);
          if (mm) {
            matches.push({
              type: 'marked',
              paraNum: p.num,
              snippet: makeSnippet(stripMarks(en), re, 80)
            });
          }
        });
      }

      // ② text：正文普通文本（词边界）
      if (Array.isArray(data.paragraphs)) {
        data.paragraphs.forEach(function (p) {
          var en = p.en || '';
          if (re.test(stripMarks(en))) {
            // 已作为 marked 命中过的段落不再重复
            var already = matches.some(function (x) {
              return x.type === 'marked' && x.paraNum === p.num;
            });
            if (!already) {
              matches.push({
                type: 'text',
                paraNum: p.num,
                snippet: makeSnippet(stripMarks(en), re, 80)
              });
            }
          }
        });
      }

      // ③ vocab：词汇表条目
      if (Array.isArray(data.vocab)) {
        data.vocab.forEach(function (v) {
          if (v && v.word && re.test(v.word)) {
            matches.push({
              type: 'vocab',
              word: v.word,
              meaning: v.ctx || '',
              pos: (v.defs && v.defs[0] && v.defs[0].pos) || '',
              vocabType: v.type || ''
            });
          }
        });
      }

      if (matches.length) {
        results.push({
          bookId: bookId,
          bookTitle: book.title || bookId,
          pid: pid,
          passageTitle: passageTitle,
          matches: matches
        });
      }
    }
  }

  sendJson(res, 200, { ok: true, query: q, results: results });
}

module.exports = { handleSearch };
