/**
 * 多本书数据接口模块
 *
 * 数据布局：
 *   data/
 *     books.json                         总书索引
 *     <bookId>/
 *       book.json                        单本书元数据 + 单元列表
 *       passages-index.json              文章摘要（扁平）
 *       passages/<pid>.json              单篇文章
 *
 * 路由：
 *   GET /api/books                                       → books.json
 *   GET /api/book/:bookId                                → book.json + passages-index.json 合并
 *   GET /api/book/:bookId/passage/:pid                   → passages/<pid>.json
 *
 * 安全：bookId / pid 用白名单字符校验，防止路径穿越。
 */
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./config');
const { sendJson } = require('./http');

/* 白名单：书名/文章 id 只能是小写字母数字连字符下划线（书 id 走 slug 命名） */
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

function badId(id) {
  return !id || !ID_RE.test(id);
}

function readJsonSilent(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return null;
  }
}

/* GET /api/books */
async function handleBooks(req, res) {
  const data = readJsonSilent(path.join(DATA_DIR, 'books.json'));
  if (!data) {
    sendJson(res, 200, { ok: true, books: [] });
    return;
  }
  sendJson(res, 200, { ok: true, books: data.books || [] });
}

/* GET /api/book/:bookId
   一次返回 book.json + passages-index.json 合并体，前端单元页一次拿够 */
async function handleBook(req, res, bookId) {
  if (badId(bookId)) {
    sendJson(res, 400, { ok: false, error: 'bookId 不合法' });
    return;
  }
  const bookDir = path.join(DATA_DIR, bookId);
  const book = readJsonSilent(path.join(bookDir, 'book.json'));
  if (!book) {
    sendJson(res, 404, { ok: false, error: '书不存在' });
    return;
  }
  const index = readJsonSilent(path.join(bookDir, 'passages-index.json')) || { passages: [] };

  sendJson(res, 200, {
    ok: true,
    book: {
      id: book.id,
      title: book.title,
      subtitle: book.subtitle,
      cover: book.cover || null,
      color: book.color || null,
      desc: book.desc || '',
      passageCount: book.passageCount || 0,
      units: book.units || [],
    },
    passages: index.passages || [],
  });
}

/* GET /api/book/:bookId/passage/:pid */
async function handleBookPassage(req, res, bookId, pid) {
  if (badId(bookId) || badId(pid)) {
    sendJson(res, 400, { ok: false, error: '参数不合法' });
    return;
  }
  const file = path.join(DATA_DIR, bookId, 'passages', pid + '.json');
  if (!fs.existsSync(file)) {
    sendJson(res, 404, { ok: false, error: '文章不存在' });
    return;
  }
  const data = readJsonSilent(file);
  if (!data) {
    sendJson(res, 500, { ok: false, error: '文章数据解析失败' });
    return;
  }
  // 把 bookId 和 passageCount 注入响应里，前端不用额外查
  data._bookId = bookId;
  const index = readJsonSilent(path.join(DATA_DIR, bookId, 'passages-index.json'));
  if (index && Array.isArray(index.passages)) {
    data._bookPassageCount = index.passages.length;
  }
  sendJson(res, 200, { ok: true, passage: data });
}

module.exports = { handleBooks, handleBook, handleBookPassage };
