/**
 * HTTP 客户端与响应工具：
 * - httpsGet：用 Node 24 内置 fetch（自动读 HTTPS_PROXY 环境变量、自动协商 HTTP/2）
 * - httpsRequestStream：流式版本，返回 Web ReadableStream（供视频流代理 pipe 用）
 * - sendJson：带 CORS 头的 JSON 响应
 */
const { Readable } = require('stream');

async function httpsGet(requestUrl, headers = {}, timeout = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const resp = await fetch(requestUrl, { headers, signal: controller.signal });
    const body = await resp.text();
    // headers 可能是 Headers 对象，统一转成普通对象
    const headersObj = {};
    resp.headers.forEach((v, k) => { headersObj[k] = v; });
    return { statusCode: resp.status, headers: headersObj, body };
  } finally {
    clearTimeout(timer);
  }
}

/* 流式版本：返回 { statusCode, headers, stream }，stream 是 Node Readable
   timeout 只作用于建连 + 拿到响应头阶段；流传输期间不主动中断 */
async function httpsRequestStream(requestUrl, headers = {}, timeout = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let resp;
  try {
    resp = await fetch(requestUrl, { headers, signal: controller.signal });
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
  clearTimeout(timer);
  const headersObj = {};
  resp.headers.forEach((v, k) => { headersObj[k] = v; });
  // resp.body 是 Web ReadableStream，转成 Node Readable 以便 pipe
  const stream = Readable.fromWeb(resp.body);
  return { statusCode: resp.status, headers: headersObj, stream };
}

function sendJson(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf-8');
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

module.exports = { httpsGet, httpsRequestStream, sendJson };
