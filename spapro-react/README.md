# spapro-react · 高考英语精读 SPA（前后端分离版）

旧 `spapro/`（vanilla JS + Node http 单端口）改造为标准前后端分离架构：
- 后端：**Egg.js**（端口 8001），纯 REST API + SSE，无静态文件服务
- 前端：**Vite + React 18 + JS**（端口 5173），HashRouter，所有页面（含原 dict.html/video.html）改为 React 路由

## 目录结构

```
spapro-react/
├── server/                    # Egg.js 后端
│   ├── app/
│   │   ├── controller/       # books/dict/video/chat/search
│   │   ├── service/          # 业务逻辑（迁移自旧 lib/）
│   │   ├── router.js
│   │   └── service/utils.js
│   ├── config/
│   │   ├── config.default.js
│   │   └── plugin.js
│   ├── data/                 # 复制自 spapro/data（books.json + 7 本书）
│   ├── app.js                # boot hook（启动建 cache 目录）
│   └── package.json
└── web/                       # React + Vite 前端
    ├── public/style.css      # 复制自 spapro/style.css + 视频页样式合并
    ├── src/
    │   ├── api/client.js     # fetch 封装 + streamChat SSE
    │   ├── store/index.js    # Zustand：UI 开关 / 词典缓存 / AI 状态
    │   ├── utils/            # helpers + findVocab
    │   ├── components/       # BookCard/HighlightedText/Markdown/AIAssistant
    │   ├── pages/            # Home/Book/Passage/SearchPage/Dict/Video
    │   ├── App.jsx           # 路由表 + body class 绑定
    │   └── main.jsx
    └── package.json
```

## 启动开发

```bash
# 1. 后端
cd spapro-react/server
npm install
npm run dev            # http://localhost:8001

# 2. 前端（另开终端）
cd spapro-react/web
npm install
npm run dev            # http://localhost:5173
```

Vite dev server 已配置代理：`/api/*` 和 `/data/*` → `http://localhost:8001`，避免跨域。

## API 一览（与旧版兼容）

| 路由 | 方法 | 作用 |
|------|------|------|
| `/api/books` | GET | 书列表 |
| `/api/book/:bookId` | GET | 单本书 + 单元 + 文章索引 |
| `/api/book/:bookId/passage/:pid` | GET | 单篇文章 |
| `/api/dict?q=<word>` | GET | 词典代理（有道 + 缓存） |
| `/api/search-video?word=<word>` | GET | B 站搜索代理（关键词 + 单词后缀，双关键词过滤） |
| `/api/stream?bvid=<bvid>` | GET | B 站视频流代理（pagelist→playurl→mp4，支持 Range） |
| `/api/video-info?bvid=<bvid>` | GET | 视频宽高/横竖屏 |
| `/api/chat` | POST | AI 聊天（SSE 流式，转发到 ant-ling） |
| `/api/search?q=<word>` | GET | 全局搜词（遍历所有书所有文章） |

## 路由一览

| 路径 | 对应页面 | 旧版 |
|------|---------|------|
| `#/` | 首页（书库 + 全局搜索） | app.js renderHome |
| `#/book/:bookId` | 单元目录页 | app.js renderBook |
| `#/book/:bookId/passage/:pid` | 文章页 | app.js renderPassage |
| `#/search?q=` | 全局搜词结果 | app.js renderSearch |
| `#/dict?word=` | 单词翻译页 | dict.html |
| `#/video?word=` | 抖音式视频流页 | video.html |
| `#/<数字>` | 兼容老 hash → 重定向到 `#/book/3500/passage/p00N` | — |

## 关键迁移点

1. **状态管理**：原 `app.js` 用全局变量 `_dictCache` / `_videoSearchCache` / `_ai` → 改为 Zustand store（`store/index.js`）。`glossOn/transOn` 持久化到 localStorage。
2. **dict / video 跳转**：原版用 `window.open('/dict.html?word=')` + sessionStorage 传 payload → 改为 React Router 导航 + URL query + 内存缓存，告别 sessionStorage 兜底。
3. **文章里单词点击**：原版 `tokenizeAndWrap` 字符串拼接 → React 组件 `HighlightedText`（含 `RawWord` 子组件），事件委托改为每个 span 自己 onClick。
4. **AI 助手 markdown**：原 `_renderMarkdown` 字符串模板 → React 组件 `Markdown`，`dangerouslySetInnerHTML` 注入解析后 HTML（保留表格/列表/标题支持）。
5. **B 站 412 风控降级**：保留 `fallback: true` 标记（后端 service/video.js）。
6. **沙箱代理**：chat 模块仍读 `HTTPS_PROXY` 环境变量（保留 `https-proxy-agent` 依赖）。
7. **样式**：`spapro/style.css` 1517 行原样保留 + video.html 内联样式合并到末尾。

## 生产部署

```bash
# 1. 前端构建
cd spapro-react/web && npm run build      # 产物在 web/dist/

# 2. 后端 egg-scripts 启动（config.default.js 已配置 static 指向 web/dist）
cd ../server && npm start
# 浏览器访问 http://localhost:8001/ 即可同时拿到前端 + API
```

## 与旧版的差异

- 旧版 `app.js` 1054 行 → 拆分为 React 组件 + hooks + store
- 旧版 `dict.html` 448 行 + `video.html` 278 行 → React 路由页面
- 旧版 `lib/*.js` 9 个模块 → Egg.js `app/service/*.js` 6 个 service + 5 个 controller
- API 行为与旧版完全一致（搜索关键词后缀「单词」、B 站短串 UA、Range 透传、有道词典缓存等）
