/**
 * 简单文件日志器，写入 LOG_DIR/spapro.log。
 */
const fs = require('fs');
const path = require('path');
const { LOG_DIR } = require('./config');

fs.mkdirSync(LOG_DIR, { recursive: true });

const logStream = fs.createWriteStream(path.join(LOG_DIR, 'spapro.log'), { flags: 'a' });

function formatMsg(level, msg) {
  const ts = new Date().toISOString();
  return `${ts} [${level}] ${msg}\n`;
}

const logger = {
  info(msg) { logStream.write(formatMsg('INFO', msg)); },
  warning(msg) { logStream.write(formatMsg('WARNING', msg)); },
  error(msg) { logStream.write(formatMsg('ERROR', msg)); },
};

module.exports = logger;
