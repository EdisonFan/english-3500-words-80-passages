'use strict';

const Controller = require('egg').Controller;

class VideoController extends Controller {
  // GET /api/search-video?word=<word>
  async search() {
    const { ctx } = this;
    const word = (ctx.query.word || '').trim();
    if (!word) {
      ctx.status = 400;
      ctx.body = { error: '缺少参数 word' };
      return;
    }
    const result = await ctx.service.video.searchVideos(word);
    if (result.status) ctx.status = result.status;
    ctx.body = result;
  }

  // GET /api/video-info?bvid=<bvid>
  async info() {
    const { ctx } = this;
    const bvid = (ctx.query.bvid || '').trim();
    if (!bvid) {
      ctx.status = 400;
      ctx.body = { error: '缺少参数 bvid' };
      return;
    }
    ctx.body = await ctx.service.video.getVideoInfo(bvid);
  }

  // GET /api/stream?bvid=<bvid>&download=1
  async stream() {
    const { ctx } = this;
    const bvid = (ctx.query.bvid || '').trim();
    if (!bvid) {
      ctx.status = 400;
      ctx.body = { error: '缺少参数 bvid' };
      return;
    }
    const download = ctx.query.download === '1' || ctx.query.download === 'true';

    try {
      const { upstream } = await ctx.service.video.streamTo(bvid, ctx.request.headers.range);
      const status = upstream.status;
      const outHeaders = {};
      const passThrough = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'];
      upstream.headers.forEach((v, k) => {
        if (passThrough.includes(k)) outHeaders[k] = v;
      });
      if (!outHeaders['content-type']) outHeaders['content-type'] = 'video/mp4';
      if (!outHeaders['accept-ranges']) outHeaders['accept-ranges'] = 'bytes';

      if (download) {
        outHeaders['content-disposition'] = "attachment; filename=\"" + bvid.replace(/[^\w.-]/g, '_') + ".mp4\"";
      } else if (status === 200 || status === 206) {
        outHeaders['cache-control'] = 'public, max-age=86400, immutable';
      }

      ctx.status = status;
      ctx.set(outHeaders);
      ctx.body = upstream.body;
    } catch (e) {
      ctx.status = 502;
      ctx.body = { ok: false, error: '视频流错误: ' + e.message };
    }
  }
}

module.exports = VideoController;
