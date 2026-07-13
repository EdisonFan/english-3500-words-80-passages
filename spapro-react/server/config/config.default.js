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

  // 静态文件：分别暴露前端 dist（根路径）和 data 目录（/data 前缀，给封面图等用）
  // 用 dirs 数组形式（egg-static 官方推荐），每个目录可独立配置 prefix
  // dynamic:true 让运行时新增文件也能访问（dev 友好）
  config.static = {
    dynamic: true,
    preload: false,
    dirs: [
      { prefix: '/', dir: path.join(__dirname, '..', '..', 'web', 'dist') },
      { prefix: '/data/', dir: path.join(__dirname, '..', 'data') },
    ],
  };

  return config;
};
