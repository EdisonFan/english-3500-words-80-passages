/**
 * HTTP 客户端与响应工具：
 * - httpsGet：支持 HTTP 代理（CONNECT 隧道）+ HTTP/2 的 HTTPS GET 请求
 *   （B 站 api.bilibili.com 风控会拒绝 HTTP/1.1，必须走 HTTP/2）
 * - httpsRequestStream：返回响应流（供 pipeMp4 流式代理使用）
 * - sendJson：带 CORS 头的 JSON 响应
 */
const http = require('http');
const http2 = require('http2');
const tls = require('tls');

function getProxy() {
  return process.env.HTTPS_PROXY || process.env.https_proxy ||
         process.env.HTTP_PROXY || process.env.http_proxy;
}

/* 通过 HTTP 代理建立 CONNECT 隧道，返回原始 TCP socket */
function connectViaProxy(proxyUrl, targetHost, targetPort, timeout) {
  return new Promise((resolve, reject) => {
    const proxyParsed = new URL(proxyUrl);
    const proxyReq = http.request({
      hostname: proxyParsed.hostname,
      port: proxyParsed.port || 80,
      method: 'CONNECT',
      path: `${targetHost}:${targetPort}`,
      headers: { Host: `${targetHost}:${targetPort}` },
    });
    proxyReq.on('connect', (proxyRes, socket) => {
      if (proxyRes.statusCode !== 200) {
        reject(new Error(`代理 CONNECT 失败: ${proxyRes.statusCode}`));
        socket.destroy();
        return;
      }
      resolve(socket);
    });
    proxyReq.on('error', reject);
    proxyReq.setTimeout(timeout, () => {
      proxyReq.destroy();
      reject(new Error('proxy connect timeout'));
    });
    proxyReq.end();
  });
}

/* 建立 TLSSocket（带 ALPN 协商 h2） */
function tlsOverSocket(rawSocket, servername, timeout) {
  return new Promise((resolve, reject) => {
    const tlsSocket = tls.connect({
      socket: rawSocket,
      servername,
      ALPNProtocols: ['h2', 'http/1.1'],
    });
    tlsSocket.once('secureConnect', () => resolve(tlsSocket));
    tlsSocket.once('error', reject);
    tlsSocket.setTimeout(timeout, () => {
      tlsSocket.destroy();
      reject(new Error('tls handshake timeout'));
    });
  });
}

/* 在 TLSSocket 上发起 HTTP/2 GET 请求。needStream=true 返回响应流，否则缓冲 body */
function http2GetOverSocket(tlsSocket, targetHost, path, headers, timeout, needStream) {
  return new Promise((resolve, reject) => {
    const session = http2.connect(`https://${targetHost}`, {
      createConnection: () => tlsSocket,
    });
    session.on('error', reject);

    const req = session.request({
      ':method': 'GET',
      ':path': path,
      ':authority': targetHost,
      ':scheme': 'https',
      ...headers,
    });
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.on('response', (respHeaders) => {
      const statusCode = respHeaders[':status'];
      if (needStream) {
        resolve({ statusCode, headers: respHeaders, stream: req, session });
        return;
      }
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        session.close();
        resolve({ statusCode, headers: respHeaders, body });
      });
    });
    req.on('error', (e) => {
      session.close();
      reject(e);
    });
    req.end();
  });
}

/* 直连 HTTP/2 GET */
function http2GetDirect(targetHost, targetPort, path, headers, timeout, needStream) {
  return new Promise((resolve, reject) => {
    const session = http2.connect(`https://${targetHost}:${targetPort}`);
    session.on('error', reject);
    const req = session.request({
      ':method': 'GET',
      ':path': path,
      ':authority': targetHost,
      ':scheme': 'https',
      ...headers,
    });
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.on('response', (respHeaders) => {
      const statusCode = respHeaders[':status'];
      if (needStream) {
        resolve({ statusCode, headers: respHeaders, stream: req, session });
        return;
      }
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        session.close();
        resolve({ statusCode, headers: respHeaders, body });
      });
    });
    req.on('error', (e) => {
      session.close();
      reject(e);
    });
    req.end();
  });
}

function request(requestUrl, headers, timeout, needStream) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(requestUrl);
    const targetHost = parsed.hostname;
    const targetPort = parsed.port || 443;
    const path = parsed.pathname + parsed.search;
    const proxyUrl = getProxy();

    if (proxyUrl) {
      // 代理：CONNECT 隧道 → TLS(ALPN h2) → HTTP/2
      connectViaProxy(proxyUrl, targetHost, targetPort, timeout)
        .then((rawSocket) => tlsOverSocket(rawSocket, targetHost, timeout))
        .then((tlsSocket) => http2GetOverSocket(tlsSocket, targetHost, path, headers, timeout, needStream))
        .then(resolve)
        .catch(reject);
    } else {
      http2GetDirect(targetHost, targetPort, path, headers, timeout, needStream)
        .then(resolve)
        .catch(reject);
    }
  });
}

function httpsGet(requestUrl, headers = {}, timeout = 10000) {
  return request(requestUrl, headers, timeout, false);
}

/* 流式版本：返回响应流（用于视频流代理，支持 Range 与 pipe） */
function httpsRequestStream(requestUrl, headers = {}, timeout = 30000) {
  return request(requestUrl, headers, timeout, true);
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
