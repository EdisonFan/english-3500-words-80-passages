/**
 * 静态文件服务：从 DIRECTORY 提供文件，附加 CORS 头。
 */
const fs = require('fs');
const path = require('path');
const { DIRECTORY, MIME_TYPES } = require('./config');

function serveStatic(req, res) {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  let filePath = path.join(DIRECTORY, decodeURIComponent(parsed.pathname));
  if (filePath === DIRECTORY || filePath + path.sep === DIRECTORY) {
    filePath = path.join(DIRECTORY, 'index.html');
  }
  if (filePath.endsWith(path.sep)) {
    filePath = path.join(filePath, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Content-Length': data.length,
    });
    res.end(data);
  });
}

module.exports = { serveStatic };
