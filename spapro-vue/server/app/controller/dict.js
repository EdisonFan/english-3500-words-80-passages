'use strict';

const Controller = require('egg').Controller;

class DictController extends Controller {
  // GET /api/dict?q=<word>
  async show() {
    const { ctx } = this;
    const word = (ctx.query.q || '').trim();
    ctx.logger.info('[dict] query word=%j len=%d', word, word.length);
    if (!word) {
      ctx.status = 400;
      ctx.body = { error: '缺少参数 q' };
      return;
    }
    try {
      const result = await ctx.service.dict.lookup(word);
      ctx.logger.info('[dict] result word=%j found=%s error=%s', word, result.found, result.error || 'none');
      ctx.body = result;
    } catch (e) {
      ctx.logger.error('[dict.show] UNCAUGHT word=%j err=%s stack=%s cause=%s',
        word, e.message, e.stack, e.cause ? (e.cause.message + '/' + e.cause.code) : 'none');
      ctx.status = 500;
      ctx.body = { error: e.message };
    }
  }
}

module.exports = DictController;
