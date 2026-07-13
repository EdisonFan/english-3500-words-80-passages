'use strict';

const fs = require('fs');
const path = require('path');

const Service = require('egg').Service;

// 书 id 白名单（与旧版一致）
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

class BooksService extends Service {
  badId(id) {
    return !id || !ID_RE.test(id);
  }

  // 解析 bookId → 实际目录（支持子目录如 renjiao/pep1）
  resolveBookDir(bookId) {
    const { dataDir } = this.app.config.spapro;
    const booksData = this.ctx.service.utils.readJsonSilent(path.join(dataDir, 'books.json'));
    const entry = (booksData && booksData.books || []).find(b => b.id === bookId);
    return entry && entry.path
      ? path.join(dataDir, entry.path)
      : path.join(dataDir, bookId);
  }

  // GET /api/books
  async list() {
    const { dataDir } = this.app.config.spapro;
    const data = this.ctx.service.utils.readJsonSilent(path.join(dataDir, 'books.json'));
    return { ok: true, books: (data && data.books) || [] };
  }

  // GET /api/book/:bookId
  async getBook(bookId) {
    if (this.badId(bookId)) return { ok: false, error: 'bookId 不合法', status: 400 };
    const bookDir = this.resolveBookDir(bookId);
    const book = this.ctx.service.utils.readJsonSilent(path.join(bookDir, 'book.json'));
    if (!book) return { ok: false, error: '书不存在', status: 404 };
    const index = this.ctx.service.utils.readJsonSilent(path.join(bookDir, 'passages-index.json')) || { passages: [] };
    return {
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
    };
  }

  // GET /api/book/:bookId/passage/:pid
  async getPassage(bookId, pid) {
    if (this.badId(bookId) || this.badId(pid)) {
      return { ok: false, error: '参数不合法', status: 400 };
    }
    const bookDir = this.resolveBookDir(bookId);
    const file = path.join(bookDir, 'passages', pid + '.json');
    if (!fs.existsSync(file)) return { ok: false, error: '文章不存在', status: 404 };
    const data = this.ctx.service.utils.readJsonSilent(file);
    if (!data) return { ok: false, error: '文章数据解析失败', status: 500 };
    data._bookId = bookId;
    const index = this.ctx.service.utils.readJsonSilent(path.join(bookDir, 'passages-index.json'));
    if (index && Array.isArray(index.passages)) {
      data._bookPassageCount = index.passages.length;
    }
    return { ok: true, passage: data };
  }
}

module.exports = BooksService;
