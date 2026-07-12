/**
 * AI 聊天代理:POST /api/chat
 *
 * 接收前端发来的 {messages, ...},转发到 ant-ling 大模型 API,
 * 把流式响应(SSE)原样转发回前端。
 *
 * ⚠️ 你的 API key:
 *   const API_KEY = 'sk-studio-e74f74497f054887872e0ee05e7e0c74';
 * 建议改成读环境变量:process.env.ANTHING_API_KEY
 */
const https = require('https');
const { URL } = require('url');
const logger = require('./logger');

const ANT_LING_URL = 'https://api.ant-ling.com/v1/chat/completions';
const API_KEY = 'sk-studio-e74f74497f054887872e0ee05e7e0c74';
const MODEL = 'Ling-2.6-flash';

const PROXY = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';
let _agent = null;
async function getAgent() {
  if (_agent !== null) return _agent;
  if (!PROXY) { _agent = undefined; return _agent; }
  const { HttpsProxyAgent } = await import('https-proxy-agent');
  _agent = new HttpsProxyAgent(PROXY);
  return _agent;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(new Error('请求体不是合法 JSON: ' + e.message)); }
    });
    req.on('error', reject);
  });
}

async function handleChat(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method Not Allowed');
    return;
  }

  let body;
  try { body = await readBody(req); }
  catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
    return;
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '缺少 messages 字段' }));
    return;
  }

  const payload = JSON.stringify({
    model: MODEL,
    stream: true,
    messages: messages,
    ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
    ...(body.max_tokens !== undefined ? { max_tokens: body.max_tokens } : {}),
  });

  logger.info('chat req msgs=' + messages.length + ' last="' +
    (messages[messages.length - 1].content || '').slice(0, 80) + '"');

  const urlObj = new URL(ANT_LING_URL);
  const agent = await getAgent();
  const options = {
    method: 'POST',
    hostname: urlObj.hostname,
    port: 443,
    path: urlObj.pathname,
    agent: agent,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + API_KEY,
      'Accept': 'text/event-stream',
      'Content-Length': Buffer.byteLength(payload),
    },
  };

  const upstream = https.request(options, (upRes) => {
    const status = upRes.statusCode || 502;
    if (status !== 200) {
      const chunks = [];
      upRes.on('data', c => chunks.push(c));
      upRes.on('end', () => {
        const errBody = Buffer.concat(chunks).toString('utf8');
        logger.warning('chat upstream non-200: ' + status + ' ' + errBody.slice(0, 200));
        res.writeHead(status, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify({ error: '上游错误', status, body: errBody.slice(0, 500) }));
      });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no',
    });

    upRes.on('data', chunk => { res.write(chunk); });
    upRes.on('end', () => {
      logger.info('chat stream end');
      res.end();
    });
    upRes.on('error', err => {
      logger.error('chat stream error: ' + err.message);
      try { res.end(); } catch (e) { }
    });
  });

  upstream.on('error', err => {
    logger.error('chat connect upstream failed: ' + err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '上游连接失败: ' + err.message }));
    } else {
      try { res.end(); } catch (e) { }
    }
  });

  req.on('close', () => {
    if (!upstream.destroyed) {
      upstream.destroy();
      logger.info('chat client closed, upstream destroyed');
    }
  });

  upstream.write(payload);
  upstream.end();
}

module.exports = { handleChat };