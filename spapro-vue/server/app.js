'use strict';

const fs = require('fs');
const path = require('path');

class AppBootHook {
  constructor(app) {
    this.app = app;
  }

  configWillLoad() {
    // 启动时确保 data/cache 目录存在
    const cacheDir = path.join(this.app.config.spapro.dataDir, 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });
  }
}

module.exports = AppBootHook;
