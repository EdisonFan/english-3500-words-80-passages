/**
 * HTTP 客户端与响应工具：
 * - httpsGet：支持环境变量代理的 GET 请求
 * - sendJson：带 CORS 头的 JSON 响应
 */
const https = require('https');

function httpsGet(requestUrl, headers = {}, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(requestUrl);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers,
    };

    let proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy ||
                   process.env.HTTP_PROXY || process.env.http_proxy;

    if (proxyUrl) {
      const proxyParsed = new URL(proxyUrl);
      options.hostname = proxyParsed.hostname;
      options.port = proxyParsed.port || 443;
      options.path = requestUrl;
      options.headers = { ...options.headers, Host: parsed.hostname };
    }

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        resolve({ statusCode: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
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

module.exports = { httpsGet, sendJson };
