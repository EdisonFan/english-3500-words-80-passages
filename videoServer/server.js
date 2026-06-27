// B站视频流式代理服务 —— 零依赖,原生 Node,支持 HTTP 代理
// 解决三个前端绕不过的问题:① CORS/Origin 403 ② mp4 直链 Referer 防盗链 ③ 直链 120 分钟过期(每次请求重新解析)
const http = require('http');
const net = require('net');
const tls = require('tls');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const REFERER = 'https://www.bilibili.com';

// 解析代理环境变量(沙箱环境有代理,用户本地一般没有)
function getProxy() {
  return process.env.https_proxy || process.env.HTTPS_PROXY || null;
}

// 建立到目标 https 的连接(有代理则走 CONNECT 隧道),返回可读写的 tls socket
function connect(target) {
  return new Promise((resolve, reject) => {
    const proxy = getProxy();
    const onErr = (e) => reject(new Error('connect 失败: ' + e.message));

    if (proxy) {
      const p = new URL(proxy);
      const raw = net.connect(Number(p.port), p.hostname);
      raw.on('error', onErr);
      raw.on('connect', () => {
        raw.write(`CONNECT ${target.hostname}:443 HTTP/1.1\r\nHost: ${target.hostname}:443\r\n\r\n`);
      });
      const onData = (buf) => {
        const idx = buf.indexOf('\r\n\r\n');
        if (idx === -1) return;
        const head = buf.slice(0, idx).toString();
        if (!/^HTTP\/1\.[01] 200/.test(head)) {
          raw.destroy();
          return reject(new Error('代理 CONNECT 失败: ' + head.split('\r\n')[0]));
        }
        raw.removeListener('data', onData);
        const t = tls.connect({ socket: raw, servername: target.hostname }, () => resolve(t));
        t.on('error', onErr);
      };
      raw.on('data', onData);
    } else {
      const t = tls.connect({ host: target.hostname, port: 443, servername: target.hostname }, () => resolve(t));
      t.on('error', onErr);
    }
  });
}

// 解码 chunked body
function decodeChunked(buf) {
  let out = Buffer.alloc(0);
  let i = 0;
  while (i < buf.length) {
    const lineEnd = buf.indexOf('\r\n', i);
    if (lineEnd === -1) break;
    const size = parseInt(buf.slice(i, lineEnd).toString(), 16);
    if (!size) break;
    out = Buffer.concat([out, buf.slice(lineEnd + 2, lineEnd + 2 + size)]);
    i = lineEnd + 2 + size + 2;
  }
  return out;
}

// 发送 HTTP 请求并返回 { status, headers, body },用于拿 JSON
async function getJSON(urlStr, extraHeaders = {}) {
  const target = new URL(urlStr);
  const sock = await connect(target);
  const reqPath = target.pathname + target.search;
  const heads = { Host: target.hostname, 'User-Agent': UA, Connection: 'close', ...extraHeaders };
  let raw = `GET ${reqPath} HTTP/1.1\r\n`;
  for (const [k, v] of Object.entries(heads)) raw += `${k}: ${v}\r\n`;
  raw += '\r\n';
  sock.write(raw);
  const chunks = [];
  for await (const c of sock) chunks.push(c);
  const buf = Buffer.concat(chunks);
  const hEnd = buf.indexOf('\r\n\r\n');
  const head = buf.slice(0, hEnd).toString();
  const lines = head.split('\r\n');
  const status = parseInt(lines[0].split(' ')[1]);
  const h = {};
  for (let i = 1; i < lines.length; i++) {
    const ci = lines[i].indexOf(':');
    if (ci > -1) h[lines[i].slice(0, ci).trim().toLowerCase()] = lines[i].slice(ci + 1).trim();
  }
  let body = buf.slice(hEnd + 4);
  if (h['transfer-encoding'] && h['transfer-encoding'].includes('chunked')) {
    body = decodeChunked(body);
  }
  if (status !== 200) throw new Error(`HTTP ${status}: ${body.slice(0, 200)}`);
  return JSON.parse(body.toString());
}

// 第一步:BV 号 -> cid
async function getCid(bvid) {
  const j = await getJSON(`https://api.bilibili.com/x/player/pagelist?bvid=${bvid}`);
  if (j.code !== 0) throw new Error('pagelist 失败: ' + j.message);
  if (!j.data || !j.data.length) throw new Error('该视频无分P');
  return { cid: j.data[0].cid, title: j.data[0].part };
}

// 第二步:BV + cid -> mp4 直链
async function getMp4Url(bvid, cid) {
  const url = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=80&type=mp4`;
  const j = await getJSON(url, { Referer: REFERER });
  if (j.code !== 0) throw new Error('playurl 失败: ' + j.message);
  if (!j.data || !j.data.durl || !j.data.durl.length) throw new Error('未返回 durl 直链');
  return {
    url: j.data.durl[0].url,
    size: j.data.durl[0].size,
    quality: j.data.quality,
    acceptDesc: j.data.accept_description
  };
}

// 流式拉取 mp4 并 pipe 给客户端,透传 Range
async function pipeMp4(mp4Url, req, res) {
  const target = new URL(mp4Url);
  const sock = await connect(target);
  const reqPath = target.pathname + target.search;
  const heads = { Host: target.hostname, 'User-Agent': UA, Referer: REFERER, Connection: 'close' };
  if (req.headers.range) heads.Range = req.headers.range;
  let raw = `GET ${reqPath} HTTP/1.1\r\n`;
  for (const [k, v] of Object.entries(heads)) raw += `${k}: ${v}\r\n`;
  raw += '\r\n';
  sock.write(raw);

  // 先读响应头,解析状态码与关键头,再 pipe 剩余 body
  let buf = Buffer.alloc(0);
  let headerParsed = false;
  for await (const c of sock) {
    buf = Buffer.concat([buf, c]);
    if (!headerParsed) {
      const idx = buf.indexOf('\r\n\r\n');
      if (idx === -1) continue;
      const head = buf.slice(0, idx).toString();
      const lines = head.split('\r\n');
      const status = parseInt(lines[0].split(' ')[1]);
      const h = {};
      for (let i = 1; i < lines.length; i++) {
        const ci = lines[i].indexOf(':');
        if (ci > -1) h[lines[i].slice(0, ci).trim().toLowerCase()] = lines[i].slice(ci + 1).trim();
      }
      const outHeaders = { 'Content-Type': h['content-type'] || 'video/mp4', 'Accept-Ranges': 'bytes' };
      if (h['content-length']) outHeaders['Content-Length'] = h['content-length'];
      if (h['content-range']) outHeaders['Content-Range'] = h['content-range'];
      res.writeHead(status, outHeaders);
      const rest = buf.slice(idx + 4);
      if (rest.length) res.write(rest);
      headerParsed = true;
    } else {
      res.write(c);
    }
  }
  res.end();
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  res.setHeader('Access-Control-Allow-Origin', '*');

  // 调试接口:解析直链
  if (u.pathname === '/api/resolve') {
    const bvid = u.searchParams.get('bvid');
    if (!bvid) return send(res, 400, { ok: false, error: 'missing bvid' });
    try {
      const { cid, title } = await getCid(bvid);
      const info = await getMp4Url(bvid, cid);
      return send(res, 200, { ok: true, bvid, cid, title, ...info });
    } catch (e) {
      console.error('[resolve error]', e);
      return send(res, 500, { ok: false, error: e.message });
    }
  }

  // 核心接口:流式代理 mp4,前端 <video src="/api/stream?bvid=xxx"> 直接用
  if (u.pathname === '/api/stream') {
    const bvid = u.searchParams.get('bvid');
    if (!bvid) return send(res, 400, 'missing bvid');
    try {
      const { cid } = await getCid(bvid);
      const { url: mp4Url } = await getMp4Url(bvid, cid);
      await pipeMp4(mp4Url, req, res);
    } catch (e) {
      console.error('[stream error]', e);
      if (!res.headersSent) send(res, 500, 'stream error: ' + e.message);
    }
    return;
  }

  // 静态文件
  let filePath = u.pathname === '/' ? '/index.html' : u.pathname;
  const full = path.join(__dirname, 'public', filePath);
  fs.readFile(full, (err, data) => {
    if (err) return send(res, 404, 'Not Found');
    const ext = path.extname(full).toLowerCase();
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

function send(res, code, body) {
  const isObj = typeof body === 'object';
  res.writeHead(code, { 'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8' });
  res.end(isObj ? JSON.stringify(body, null, 2) : body);
}

server.listen(PORT, () => {
  console.log(`视频代理服务已启动: http://localhost:${PORT}`);
  console.log(`代理设置: ${getProxy() || '直连(无代理)'}`);
  console.log(`播放页:   http://localhost:${PORT}/`);
  console.log(`调试接口: http://localhost:${PORT}/api/resolve?bvid=BV1LhcZz3En4`);
});
