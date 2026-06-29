#!/usr/bin/env node
/**
 * spapro 应用主入口：
 * - 静态文件：直接从当前目录提供
 * - 词典代理：GET /api/dict?q=<word> （本地缓存 + 有道 jsonapi）
 * - 视频搜索：GET /api/search-video?word=<word> （B 站搜索代理）
 * - 视频流：  GET /api/stream?bvid=<bvid>   （B 站直链流式代理，支持 Range）
 *
 * 业务实现分散到 lib/ 下，本文件仅负责路由分发与服务启动。
 */
const http = require('http');
const fs = require('fs');

const { PORT, CACHE_DIR } = require('./lib/config');
const { sendJson } = require('./lib/http');
const { handleDict } = require('./lib/dict');
const { handleSearchVideo, handleStream, handleVideoInfo } = require('./lib/video');
const { serveStatic } = require('./lib/static');

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsed.pathname;
  const params = Object.fromEntries(parsed.searchParams);

  if (pathname === '/api/dict') {
    const word = (params.q || '').trim();
    if (!word) {
      sendJson(res, 400, { error: '缺少参数 q' });
      return;
    }
    try {
      await handleDict(word, res);
    } catch (e) {
      sendJson(res, 500, { error: e.message });
    }
    return;
  }

  if (pathname === '/api/search-video') {
    const word = (params.word || '').trim();
    if (!word) {
      sendJson(res, 400, { error: '缺少参数 word' });
      return;
    }
    try {
      await handleSearchVideo(word, res);
    } catch (e) {
      sendJson(res, 500, { error: e.message });
    }
    return;
  }

  if (pathname === '/api/stream') {
    const bvid = (params.bvid || '').trim();
    if (!bvid) {
      sendJson(res, 400, { error: '缺少参数 bvid' });
      return;
    }
    handleStream(bvid, req, res);
    return;
  }

  if (pathname === '/api/video-info') {
    const bvid = (params.bvid || '').trim();
    if (!bvid) {
      sendJson(res, 400, { error: '缺少参数 bvid' });
      return;
    }
    try {
      await handleVideoInfo(bvid, res);
    } catch (e) {
      sendJson(res, 500, { error: e.message });
    }
    return;
  }

  serveStatic(req, res);
});

const cacheCount = fs.readdirSync(CACHE_DIR).filter(n => n.endsWith('.json')).length;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`spapro 服务启动: http://localhost:${PORT}`);
  console.log(`  词典代理: /api/dict?q=<word>`);
  console.log(`  数据源: 有道词典 jsonapi`);
  console.log(`  本地缓存: ${CACHE_DIR}/  (${cacheCount} 个单词已缓存)`);
});
