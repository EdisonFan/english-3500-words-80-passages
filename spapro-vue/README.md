# SPAPRO-Vue 说明

## 项目定位

`spapro-vue/` 是 `spapro/` 的一个相对独立的重构版本，采用前后端分离结构：

- 前端：Vue 3 + Vite + Pinia
- 后端：Egg.js
- 数据：本地 JSON 模拟数据
- 功能：书籍列表、文章阅读、查词、视频检索与播放、全局搜词、AI 助手对话

它不是旧版原生前端的简单补丁，而是一套可以单独运行、单独维护的工程。

## 目录结构

```text
spapro-vue/
├── README.md                # 本说明文档
├── web/                     # Vue 前端
│   ├── src/
│   │   ├── api/             # 前端 API 封装
│   │   ├── components/      # 通用组件
│   │   ├── pages/           # 页面组件
│   │   ├── router/          # 路由
│   │   ├── store/           # Pinia + 模块级缓存
│   │   ├── utils/           # 工具函数
│   │   ├── App.vue
│   │   └── main.js
│   ├── public/
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
└── server/                  # Egg.js 后端
    ├── app/
    │   ├── controller/      # 控制器
    │   ├── middleware/      # 中间件
    │   ├── service/         # 业务逻辑
    │   └── router.js        # API 路由
    ├── config/              # Egg 配置
    ├── data/                # 本地书籍与文章数据
    ├── app.js               # 启动时初始化 cache 目录
    └── package.json
```

## 技术栈

### 前端

- Vue 3
- Vue Router 4
- Pinia
- Vite 5

### 后端

- Egg.js 3
- egg-cors
- https-proxy-agent

## 运行方式

本项目默认前后端分开启动：

- 前端开发服务器：`5173`
- 后端 API 服务：`8001`

### 1. 启动后端

```bash
cd /workspace/spapro-vue/server
npm install
npm run dev
```

后端默认监听：

```text
http://localhost:8001
```

### 2. 启动前端

```bash
cd /workspace/spapro-vue/web
npm install
npm run dev
```

前端默认地址：

```text
http://localhost:5173
```

### 3. 前后端联调规则

前端开发期通过 `vite.config.js` 代理以下路径到后端：

- `/api` -> `http://localhost:8001`
- `/data` -> `http://localhost:8001`

因此浏览器访问前端地址后，API 请求会自动转发到 Egg 服务。

## 生产构建

### 前端构建

```bash
cd /workspace/spapro-vue/web
npm run build
```

构建产物输出到：

```text
web/dist
```

### 后端静态托管

后端已配置静态目录：

- `/` 对应 `web/dist`
- `/data/` 对应 `server/data`

也就是说，前端构建完成后，Egg 可以直接托管打包后的 SPA 和数据文件。

## 核心功能

### 1. 多本书与文章阅读

后端通过 `server/data/books.json` 管理书籍入口，支持：

- `3500`
- `renjiao/pep1`
- `renjiao/pep2`
- `renjiao/pep3`
- `renjiao/sel1`
- `renjiao/sel2`
- `renjiao/sel3`

相关接口：

- `GET /api/books`
- `GET /api/book/:bookId`
- `GET /api/book/:bookId/passage/:pid`

### 2. 查词

查词接口：

- `GET /api/dict?q=<word>`

实现特点：

- 先查内存缓存
- 再查 `server/data/cache/`
- 未命中时请求有道 `jsonapi`
- 支持缩写回退，如带 `'` 的单词回退到原形尝试查询

### 3. 视频搜索与播放

相关接口：

- `GET /api/search-video?word=<word>`
- `GET /api/video-info?bvid=<bvid>`
- `GET /api/stream?bvid=<bvid>`

实现特点：

- 通过 B 站搜索接口拉取候选视频
- 通过 `pagelist` 获取 `cid`
- 通过 `playurl` 获取 MP4 地址
- 后端流式代理视频，支持 `Range`

### 4. 全局搜词

搜索接口：

- `GET /api/search?q=<word>`

用于跨书籍、跨文章搜词定位。

### 5. AI 助手

聊天接口：

- `POST /api/chat`

实现特点：

- 后端以 SSE 流式方式把上游模型输出转发给前端
- 前端通过流式读取逐步更新回答
- 上游模型配置位于 `server/config/config.default.js`

## 前端结构说明

### 页面

`web/src/pages/` 目前主要包含：

- `Home.vue`：首页
- `Book.vue`：书籍详情与文章列表
- `Passage.vue`：文章阅读页
- `Dict.vue`：词典页
- `Video.vue`：视频页
- `SearchPage.vue`：全局搜索页

### 组件

`web/src/components/` 目前主要包含：

- `BookCard.vue`：书籍卡片
- `HighlightedText.vue`：高亮词渲染
- `VideoButtonInline.vue`：内联视频入口
- `AIAssistant.vue`：AI 对话组件
- `Markdown.vue`：Markdown 渲染
- `IndividualSection.vue`：词典拓展信息区块

### 状态管理

`web/src/store/index.js` 中同时包含两类状态：

- Pinia 响应式状态：如全局显示开关
- 模块级缓存：如词典缓存、视频搜索缓存

这是一个偏轻量的状态管理方案，没有引入更复杂的分层设计。

## 后端结构说明

### controller

负责接收请求和组织响应，当前主要包括：

- `books.js`
- `dict.js`
- `video.js`
- `search.js`
- `chat.js`

### service

负责具体业务逻辑，当前主要包括：

- `books.js`：书籍与文章读取
- `dict.js`：词典查询与缓存
- `video.js`：B 站视频搜索与流代理
- `search.js`：全局搜索
- `chat.js`：AI 流式对话
- `utils.js`：公共工具函数

### middleware

- `spaFallback.js`：用于 SPA 路由回退，支持直接访问前端页面路径

## 数据组织

数据位于 `server/data/`，其中主要包括：

- `books.json`：书籍总索引
- `<book>/book.json`：单本书元信息
- `<book>/passages-index.json`：文章索引
- `<book>/passages/pNNN.json`：文章数据
- `cache/`：词典缓存目录，启动时自动创建

## 与旧版 spapro 的关系

可以把这个目录理解为 Vue 版重构工程：

- `spapro/`：旧版，原生 HTML/CSS/JS + Python `http.server`
- `spapro-vue/`：新版，Vue + Egg.js

两者的数据主题和业务目标相近，但实现方式不同。维护 `spapro-vue/` 时，可以把它视为一套相对独立的工程，不需要依赖旧版目录才能运行。

## 已知事项

- 当前仓库中没有单独的 `README` 之外的运行文档，本文件就是该目录的入口说明
- 后端配置里包含 AI 上游地址与密钥配置，实际部署时更建议改为环境变量注入
- 如果只改前端代码，一般只需要重启 Vite 或直接热更新
- 如果修改 Egg 配置或后端逻辑，需要重启后端服务

## 建议的维护入口

初次进入这个目录时，建议按下面顺序阅读：

1. `web/package.json`
2. `server/package.json`
3. `web/src/router/index.js`
4. `web/src/pages/Passage.vue`
5. `server/app/router.js`
6. `server/app/service/books.js`
7. `server/app/service/dict.js`
8. `server/app/service/video.js`

这样可以最快建立对前后端整体结构的理解。
