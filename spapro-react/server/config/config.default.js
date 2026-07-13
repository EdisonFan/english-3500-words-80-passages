'use strict';

const path = require('path');

module.exports = () => {
  const config = {};

  // 运行端口（与旧版保持一致）
  config.cluster = {
    listen: {
      port: 8001,
      hostname: '0.0.0.0',
    },
  };

  // 关闭 csrf / 安全限制里的 referer 校验，方便本地联调
  config.security = {
    csrf: { enable: false },
    domainWhiteList: ['*'],
  };

  // 跨域：开发期前端跑在 5173
  config.cors = {
    origin: '*',
    credentials: false,
    allowMethods: 'GET,HEAD,OPTIONS,POST,PUT,DELETE',
  };

  // 业务自定义配置：数据目录
  config.spapro = {
    dataDir: path.join(__dirname, '..', 'data'),
    // AI 上游
    antLing: {
      url: 'https://api.ant-ling.com/v1/chat/completions',
      apiKey: 'sk-studio-e74f74497f054887872e0ee05e7e0c74',
      model: 'Ling-2.6-flash',
    },
  };

  // 静态文件：生产环境可让后端直接吐前端 dist + /data/ 数据目录
  config.static = {
    dynamic: true,
    preload: false,
    dirs: [
      { prefix: '/', dir: path.join(__dirname, '..', '..', 'web', 'dist') },
      { prefix: '/data/', dir: path.join(__dirname, '..', 'data') },
    ],
  };

  // 启用 SPA fallback 中间件：访问前端路由（如 /book/xxx）返回 index.html
  config.middleware = ['spaFallback'];

  return config;
};
