'use strict';

const Controller = require('egg').Controller;

class DictController extends Controller {
  // GET /api/dict?q=<word>
  async show() {
    const { ctx } = this;
    const word = (ctx.query.q || '').trim();
    if (!word) {
      ctx.status = 400;
      ctx.body = { error: '缺少参数 q' };
      return;
    }
    ctx.body = await ctx.service.dict.lookup(word);
  }
}

module.exports = DictController;
