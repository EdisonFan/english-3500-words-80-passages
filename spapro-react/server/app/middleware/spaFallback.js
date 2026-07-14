'use strict';

const fs = require('fs');
const path = require('path');

// SPA fallback：访问根路径 / 或前端路由（如 /book/xxx）时返回 index.html
// 仅处理 GET 且 Accept 含 text/html 的请求；/api/ 和 /data/ 开头的不处理
module.exports = (options, app) => {
  // __dirname = server/app/middleware，需要往上 3 层到 spapro-react/
  const distDir = path.join(__dirname, '..', '..', '..', 'web', 'dist');
  const indexPath = path.join(distDir, 'index.html');
  let indexHtml = null;
  try {
    indexHtml = fs.readFileSync(indexPath, 'utf-8');
    app.logger.info('[spaFallback] loaded index.html, size=%d', indexHtml.length);
  } catch (e) {
    app.logger.warn('[spaFallback] index.html not found at %s', indexPath);
  }

  return async function spaFallback(ctx, next) {
    await next();
    // 调试日志
    if (ctx.path === '/' || ctx.path.indexOf('/book/') === 0) {
      app.logger.info('[spaFallback] path=%s method=%s status=%s type=%s', ctx.path, ctx.method, ctx.status, ctx.type);
    }
    if (!indexHtml) return;
    if (ctx.method !== 'GET') return;
    if (ctx.path.startsWith('/api/')) return;
    if (ctx.path.startsWith('/data/')) return;
    // 静态文件命中（image/js/css 等）不处理
    if (ctx.status === 200 && ctx.type && !/html/i.test(ctx.type)) return;
    // 404 或 HTML 类型但需要 fallback
    if (ctx.status === 404) {
      ctx.status = 200;
      ctx.type = 'text/html; charset=utf-8';
      ctx.body = indexHtml;
    }
  };
};
