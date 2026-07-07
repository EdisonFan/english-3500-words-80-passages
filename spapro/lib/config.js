/**
 * 服务器配置：端口、目录、MIME 映射。
 */
const path = require('path');

const PORT = 8001;
const DIRECTORY = __dirname + path.sep + '..';
const CACHE_DIR = path.join(DIRECTORY, 'data', 'cache');
// const LOG_DIR = path.join(DIRECTORY, 'logs');  // 日志功能已禁用

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
};

module.exports = { PORT, DIRECTORY, CACHE_DIR, MIME_TYPES };
