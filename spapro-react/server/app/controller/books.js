'use strict';

const Controller = require('egg').Controller;

class BooksController extends Controller {
  // GET /api/books
  async list() {
    const { ctx } = this;
    const result = await ctx.service.books.list();
    ctx.body = result;
  }

  // GET /api/book/:bookId
  async show() {
    const { ctx } = this;
    const bookId = decodeURIComponent(ctx.params.bookId);
    const result = await ctx.service.books.getBook(bookId);
    if (result.status) ctx.status = result.status;
    ctx.body = result;
  }

  // GET /api/book/:bookId/passage/:pid
  async passage() {
    const { ctx } = this;
    const bookId = decodeURIComponent(ctx.params.bookId);
    const pid = decodeURIComponent(ctx.params.pid);
    const result = await ctx.service.books.getPassage(bookId, pid);
    if (result.status) ctx.status = result.status;
    ctx.body = result;
  }
}

module.exports = BooksController;
