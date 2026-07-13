'use strict';

const Controller = require('egg').Controller;

class ChatController extends Controller {
  // POST /api/chat
  async send() {
    const { ctx } = this;
    if (ctx.method !== 'POST') {
      ctx.status = 405;
      ctx.body = 'Method Not Allowed';
      return;
    }
    const body = ctx.request.body || {};
    const messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      ctx.status = 400;
      ctx.body = { error: '缺少 messages 字段' };
      return;
    }

    // 走 SSE：手动写响应头，分块写入
    ctx.status = 200;
    ctx.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // egg 默认会处理 body；流式需手动 write + end
    const res = ctx.res;
    let upstreamClosed = false;
    const cleanupReqHandler = () => {
      if (!upstreamClosed) { upstreamClosed = true; }
    };
    ctx.req.on('close', cleanupReqHandler);

    await ctx.service.chat.pipeStream(
      {
        messages,
        temperature: body.temperature,
        max_tokens: body.max_tokens,
      },
      {
        onHeaders: () => {},
        onChunk: chunk => {
          if (!upstreamClosed) res.write(chunk);
        },
        onEnd: () => {
          try { res.end(); } catch (e) {}
        },
        onError: err => {
          try { res.end(); } catch (e) {}
        },
        onNon200: (status, errBody) => {
          try {
            res.write(JSON.stringify({ error: '上游错误', status, body: errBody }));
            res.end();
          } catch (e) {}
        },
        onConnectError: err => {
          if (!res.headersSent) {
            ctx.status = 502;
            try { res.end(JSON.stringify({ error: '上游连接失败: ' + err.message })); } catch (e) {}
          } else {
            try { res.end(); } catch (e) {}
          }
        },
      }
    );
  }
}

module.exports = ChatController;
