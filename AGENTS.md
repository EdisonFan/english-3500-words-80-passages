# AGENTS.md

> 本文档供 AI 编码助手阅读，用于快速理解本工程的结构、约定与运行方式。
> 修改代码前请先通读本文档，尤其是「约定」和「已知坑」两节。

---

## 一、工程概览

**项目名称**：高考英语 3500 词 · 80 篇精读 SPA

**定位**：纯前端 + Python 后端代理的英语学习应用。用户阅读 80 篇精读文章，点击文中任意单词弹出词典释义，并可进一步点击「教学视频」按钮观看 B 站上该单词的教学视频（抖音式上下滑动切换）。

**技术栈**：
- 前端：原生 HTML / CSS / JavaScript（无框架，无构建步骤），Vuex 风格的模块化写在 `app.js` 单文件中
- 后端：Python 3 标准库 `http.server`（无第三方依赖），单端口 8000 同时服务静态文件和三个 API
- 数据：模拟数据，前端通过 fetch 拉取 `data/p*.json`

**当前主分支**：`Pro`（推送到 `origin/Pro`）

---

## 二、目录结构

```
/workspace
├── AGENTS.md                   ← 本文件
├── .gitignore
├── spapro/                     ← ★当前主工程目录（带 PRO 名字）
│   ├── server.py               ← ★Python 后端(8000端口),静态文件+词典代理+视频代理
│   ├── app.js                  ← ★前端主逻辑(路由/文章渲染/词典弹窗/视频层)
│   ├── index.html              ← 入口 HTML(含视频层容器)
│   ├── style.css               ← 全部样式(含抖音式视频流)
│   ├── data/
│   │   ├── p01.json ~ p80.json ← 80 篇精读文章数据(结构见 旧版 数据格式说明.md)
│   │   └── cache/              ← 词典查询缓存(<word>.json),运行时自动生成,勿手动改
│   ├── logs/
│   │   └── spapro.log          ← 后端日志(RotatingFileHandler,2MB切3个),运行时生成
│   ├── 数据格式说明.md          ← p*.json 数据结构规范(给人类看,内容详尽)
│   ├── convert_all.js          ← 数据转换脚本(Node,一次性生成 p*.json,非运行时)
│   ├── convert_p02.js
│   ├── verify_p02.js
│   └── unmatched_braced_words*.json ← 数据校验中间产物
│
├── HTML-antiscrape/            ← ⚠早期版本(反爬字体方案),已废弃,勿改
│   ├── dict/                   ← 离线词典 JSON(几百个词)
│   ├── passage-01.html ~ 16.html
│   └── batch_gen.js / gen_font.js / copy_dict.js
│
└── videoServer/                ← ⚠早期 Node 视频后端(3000端口),已废弃,勿改
    ├── server.js
    └── public/
```

**重要**：`spapro/` 是当前唯一活跃工程目录。`HTML-antiscrape/` 和 `videoServer/` 是历史遗留，已废弃，不要修改也不要参考其实现。

---

## 三、如何运行

```bash
cd /workspace/spapro
python3 server.py
# 服务监听 http://localhost:8000/
```

- 启动后浏览器访问 `http://localhost:8000/`
- 前端文件由 `server.py` 的 `SimpleHTTPRequestHandler` 直接从 `spapro/` 目录提供（改前端文件无需重启，强制刷新即可）
- 改 `server.py` 需要重启服务：`pkill -9 -f "python3 server.py"` 后重新启动

**沙箱环境注意**：
- 沙箱有 `HTTPS_PROXY=http://127.0.0.1:18080`，`http.client.HTTPSConnection` 不读此变量，必须用 `urllib.request` + `ProxyHandler` 显式构造 opener（`server.py` 的 `_pipe_mp4` 已处理）
- 沙箱出口 IP 会被 B 站间歇性风控（HTTP 412），此时搜索接口降级返回内置备用视频列表 `_FALLBACK_VIDEOS`（本地电脑运行不会触发）

---

## 四、后端 API（全在 `server.py`，端口 8000）

| 路由 | 方法 | 作用 |
|------|------|------|
| `/api/dict?q=<word>` | GET | 词典查询：内存缓存 → 本地文件缓存 `data/cache/<word>.json` → 有道 jsonapi；含缩写形式回退（`child's` → `child`） |
| `/api/search-video?word=<word>` | GET | B 站视频搜索代理，返回教学视频列表（见下方详细说明） |
| `/api/stream?bvid=<BV号>` | GET | B 站视频流代理：bvid → cid → mp4 直链 → 流式转发，支持 Range 断点续传 |
| 其他路径 | GET | 静态文件（由 SimpleHTTPRequestHandler 处理） |

所有响应附加 `Access-Control-Allow-Origin: *`。

### `/api/search-video` 详细行为（★关键逻辑）

```
输入: word=action
搜索关键词构造: keyword = "{word} 单词"        ← 后缀固定为"单词"
B站接口: https://api.bilibili.com/x/web-interface/search/type
         ?search_type=video&keyword=action+单词&page=1&pagesize=50
         (pagesize=50,一次性取前50条)

过滤规则(全部必须满足):
  ① 时长 10s ≤ duration ≤ 300s        (去掉广告切片和完整长课)
  ② 标题(小写)必须同时包含 word(小写) 和 "单词"   (双关键词过滤,确保是针对该词的讲解)

排序: 按播放量(play)降序
返回: 前 10 条
```

**为什么这么过滤**：用户场景是"背不下来这个单词，想找视频帮记"。单加后缀「单词」会混入通用背单词课；要求标题同时含「目标单词」和「单词」二字，才能精准命中针对该词的讲解视频。

### B 站接口踩坑（★修改搜索逻辑必看）

| 坑 | 表现 | 解决 |
|----|------|------|
| User-Agent 用长串 | 412 | UA 必须用短串 `"Mozilla/5.0"` |
| 不带 Cookie | 412 | 必须带 `Cookie: buvid3=placeholder` |
| 带 Referer | 412 | 搜索接口**不能**带 Referer |
| 空格编码成 `%20` | 412 | 必须用 `urllib.parse.quote_plus` 编码成 `+` |
| playurl 接口不带 Referer | 403 | playurl 和 CDN 直链**必须**带 `Referer: https://www.bilibili.com` |
| 前端 fetch 直链 | 403 | B 站检测 Origin，必须后端代理（已合并进同端口 8000） |
| `http.client.HTTPSConnection` 走沙箱代理 | 卡死 | 改用 `urllib.request` + `ProxyHandler`（见 `_pipe_mp4`） |

### 视频流代理链路

```
浏览器 <video> → /api/stream?bvid=BVxxx
                     ↓
              _get_cid(bvid)        → 调 pagelist 接口拿 cid
                     ↓
              _get_mp4_url(bvid,cid) → 调 playurl 接口(qn=80,type=mp4)拿 mp4 直链
                     ↓
              _pipe_mp4(mp4_url)    → 带 Referer + 透传 Range,64KB 一块流式转发
```

- B 站点播接口**只支持 MP4/DASH/FLV**，没有 m3u8/HLS，本项目用 `type=mp4`
- `qn=80`（720P）不登录会降级到 `qn=64`（480P）/`qn=16`（360P）
- mp4 直链 120 分钟过期，每次请求重新解析，不缓存
- Range 请求透传，支持浏览器拖进度条（`_pipe_mp4` 读取 `self.headers.get('Range')` 转发）

---

## 五、前端结构（`app.js`）

单文件，无框架。用 hash 路由（`#/1` ~ `#/80`）。

### 主要模块

| 函数/变量 | 职责 |
|-----------|------|
| `router()` | hash 路由分发 |
| `renderHome()` | 首页：16 单元 × 80 篇文章列表 |
| `renderPassage(id)` | 渲染单篇文章 + 词表 |
| `highlightWords(en, vocab)` | 把 `{word}` 标记转为可点击高亮 span |
| `tokenizeAndWrap(text)` | 把普通英文单词也包成可点击 span（走词典 API） |
| `handleWordClick(e)` | 单词点击事件委托 → 弹词典弹窗 |
| `showDictModal(word)` | 查词典（带内存缓存 `_dictCache`） |
| `renderDictModal(data)` | 渲染词典弹窗（含「教学视频」按钮） |
| `openVideoStage(word)` | ★打开视频层：关弹窗 → 搜索 → 渲染 → 播第一个 |
| `renderVideoFeed()` | 渲染抖音式视频流（CSS scroll-snap） |
| `playVideoIdx(idx)` | ★切换播放：当前播、下一个预加载、远处清 src |

### 视频层播放策略（★`playVideoIdx`，预加载逻辑）

```
对每个 video-card 中的 <video>:
  i === idx      → 设 src + load + play          (当前播放)
  i === idx + 1  → 设 src + load + pause         (预加载下一个,不播)
  i === idx - 1  → 保留 src + pause              (上一个,回滑免重载)
  其他           → removeAttribute('src') + load (远处清掉,释放带宽)
```

用 `data-loaded` 属性记录已加载的 src，避免重复设同一个 src 重启播放。

### 视频层 DOM 结构（`index.html`）

```html
<div class="video-stage" id="videoStage">       <!-- 全屏覆盖,z-index:9999 -->
    <button class="video-stage-close">✕</button>
    <div class="video-feed" id="videoFeed"></div> <!-- scroll-snap-type: y mandatory -->
</div>
```

每个 `.video-card` 占满一屏，`scroll-snap-align: start` + `scroll-snap-stop: always`（一次只滑一屏，防连滑）。

### 视频标签（`app.js` renderVideoFeed）

```js
<video playsinline webkit-playsinline preload="auto" loop
       controls controlslist="nodownload noplaybackrate noremoteplayback"
       poster="https:...">
```

- `controls`：原生进度条（用户要求，可拖动播放进度）
- `controlslist`：隐藏下载/倍速/远程播放，保持界面干净
- `object-fit: contain`：横屏视频留黑边保完整，不裁切（手机端友好）

---

## 六、数据格式

`spapro/data/p*.json` 的完整结构规范见 [spapro/数据格式说明.md](spapro/数据格式说明.md)。这里只列要点：

```jsonc
{
  "id": 3,
  "stats": { "words": 256, "core": 73 },
  "paragraphs": [
    { "num": "01", "en": "{technology} {use} {in} {class}", "cn": "..." }
    // 英文用 {word} 标记需高亮/解释的词
  ],
  "vocab": [
    {
      "word": "permit",           // lemma 原形
      "type": "outline",          // outline=大纲词 | core=核心词
      "ctx": "被允许",            // ★上下文释义(本文中该词的意思,单一精简)
      "forms": [ { "surface": "permitted", "tag": "past_participle" } ],
      "phonetic": "[pəˈmɪt]",
      "defs": [ { "pos": "v.", "meaning": "许可，允许" } ]
    }
  ]
}
```

**`ctx` 字段最易填错**：必须是当前文章语境下的单一中文释义，不要堆砌词典全部义项，不要混入英文变形说明。详见 `数据格式说明.md` 的「ctx 字段填写规范」。

---

## 七、约定（★改代码前必读）

1. **后端只用 Python**，不要引入 Node 后端。早期 `videoServer/`（Node, 3000端口）已废弃，功能已合并进 `spapro/server.py`（8000端口，同源避免跨域）。
2. **视频功能三件套接口顺序**：搜索（search/type）→ pagelist（BV→cid）→ playurl（BV+cid→mp4直链）。修改时保持这个链路。
3. **搜索关键词后缀固定为"单词"**（不要改回"发音"，那是早期错误方案，用户明确否决）。改后缀要同步改过滤条件里的 `suffix` 变量。
4. **日志写文件不写 stdout**：用 `logging` + `RotatingFileHandler`（`logs/spapro.log`，2MB 切 3 个）。沙箱终端不能被日志刷屏。改日志要保留日志程序，不要误删。
5. **不要用正则批量改 JSON**：2026-06-23 踩坑，`[^）]*` 跨行匹配会吞掉字段。用 `json` 模块解析后改再写回，改完用 `json.loads()` 校验。
6. **前端改完不用重启服务**（静态文件直接读盘）；**后端改完必须重启**。
7. **模拟数据**：本项目是纯前端演示 + 后端代理，不实现接口的"业务逻辑层"，数据交互用 `data/p*.json` 模拟数据。
8. **跨组件状态**：用模块级变量管理（如 `_videoList` / `_videoIdx`），不引入 Vuex（项目规则提到 Vuex 风格，但实际用全局变量简化）。

---

## 八、已知坑与降级策略

### B 站 412 风控
- **触发**：沙箱出口 IP 高频请求 B 站搜索接口
- **表现**：`HTTP Error 412: Precondition Failed`
- **降级**：返回 `_FALLBACK_VIDEOS`（4 条内置 BVID，实测能播），响应里 `fallback: true` 标记
- **本地电脑运行**：不会触发，走真实搜索

### video.onerror NotSupportedError
- **历史问题**：早期 Node 版 `videoServer` 流式转发时内容损坏
- **解决**：废弃 Node 后端，改用 Python `urllib.request` + `ProxyHandler` 走沙箱 HTTPS 代理的 CONNECT 隧道，同源调用

### mp4 直链过期
- 直链 120 分钟过期，`_pipe_mp4` 每次请求重新走 pagelist → playurl 解析，不缓存直链

### BrokenPipeError / ConnectionResetError
- 浏览器拖进度条会断开旧连接，`_pipe_mp4` 捕获后 `break`，属正常

---

## 九、常用操作速查

| 任务 | 做法 |
|------|------|
| 重启后端 | `pkill -9 -f "python3 server.py"; cd /workspace/spapro && setsid python3 server.py < /dev/null > /dev/null 2>&1 &` |
| 看后端日志 | `tail -f /workspace/spapro/logs/spapro.log` |
| 测搜索接口 | `curl -s "http://localhost:8000/api/search-video?word=action" \| python3 -m json.tool` |
| 测视频流 | 浏览器访问 `http://localhost:8000/api/stream?bvid=BV1ZM4y1w7HG` 应能下载/播放 mp4 |
| 改前端生效 | 强制刷新浏览器（Ctrl+Shift+R），无需重启 |
| 提交代码 | 在 `Pro` 分支提交并 `git push origin Pro` |

---

## 十、Git 分支

- `Pro`：当前主开发分支，推送到 `origin/Pro`
- `trae/agent-*`：AI 辅助开发的工作分支，完成后合并回 `Pro`

提交信息风格：`feat: 英语学习视频方案探讨`（中文，feat/fix/refactor 前缀）。
