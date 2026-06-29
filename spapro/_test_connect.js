const http = require('http');

const proxyReq = http.request({
  hostname: '127.0.0.1',
  port: 18080,
  method: 'CONNECT',
  path: 'api.bilibili.com:443',
  headers: { Host: 'api.bilibili.com:443' },
});

proxyReq.on('connect', (proxyRes, socket) => {
  console.log('CONNECT statusCode:', proxyRes.statusCode);
  console.log('CONNECT headers:', proxyRes.headers);
  // 不做 TLS，立刻关闭
  socket.destroy();
  process.exit(0);
});
proxyReq.on('error', (e) => { console.log('ERR', e.message); process.exit(1); });
proxyReq.end();
