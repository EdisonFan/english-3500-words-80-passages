'use strict';

const Controller = require('egg').Controller;

class SearchController extends Controller {
  // GET /api/search?q=<word>
  async search() {
    const { ctx } = this;
    const q = (ctx.query.q || '').trim();
    ctx.body = await ctx.service.search.globalSearch(q);
  }
}

module.exports = SearchController;
