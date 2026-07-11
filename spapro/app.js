/* === 高考英语 3500 词 SPA === */
var app = document.getElementById('app');
var TOTAL = 80;  // 当前篇目数

/* === 16 个单元划分 === */
var UNITS = [
    { num: 1, title: '校园生活', start: 1, end: 5 },
    { num: 2, title: '教育与学习', start: 6, end: 10 },
    { num: 3, title: '个人成长', start: 11, end: 15 },
    { num: 4, title: '自我管理', start: 16, end: 20 },
    { num: 5, title: '兴趣爱好', start: 21, end: 25 },
    { num: 6, title: '日常生活', start: 26, end: 30 },
    { num: 7, title: '健康生活', start: 31, end: 35 },
    { num: 8, title: '思维方式', start: 36, end: 39 },
    { num: 9, title: '社会交往', start: 40, end: 45 },
    { num: 10, title: '工作与职业', start: 46, end: 50 },
    { num: 11, title: '社会现象', start: 51, end: 55 },
    { num: 12, title: '动物世界', start: 56, end: 60 },
    { num: 13, title: '自然生态与环境保护', start: 61, end: 65 },
    { num: 14, title: '文学与艺术', start: 66, end: 70 },
    { num: 15, title: '历史与文化', start: 71, end: 75 },
    { num: 16, title: '科学与技术', start: 76, end: 80 }
];

/* === 中文注释开关（全局） === */
var glossOn = true;
try {
    var saved = localStorage.getItem('spa_gloss');
    if (saved === 'off') glossOn = false;
} catch (e) { }

function applyGloss() {
    var toggle = document.getElementById('glossToggle');
    if (!toggle) return;
    if (glossOn) {
        document.body.classList.remove('no-gloss');
        toggle.classList.remove('off');
        toggle.querySelector('.g-label').textContent = '中文释义';
    } else {
        document.body.classList.add('no-gloss');
        toggle.classList.add('off');
        toggle.querySelector('.g-label').textContent = '已隐藏';
    }
}

/* === 段落中文译文开关（全局，默认隐藏） === */
var transOn = false;
try {
    var savedT = localStorage.getItem('spa_trans');
    if (savedT === 'on') transOn = true;
} catch (e) { }

function applyTrans() {
    var toggle = document.getElementById('transToggle');
    if (!toggle) return;
    if (transOn) {
        document.body.classList.add('show-trans');
        toggle.classList.remove('off');
        toggle.querySelector('.t-label').textContent = '中文译文';
    } else {
        document.body.classList.remove('show-trans');
        toggle.classList.add('off');
        toggle.querySelector('.t-label').textContent = '译文隐藏';
    }
}

/* === HTML 转义 === */
function esc(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/* === 路由 === */
window.addEventListener('hashchange', router);

function router() {
    var hash = location.hash || '';

    // 兼容老路径 #/数字 → 重定向到新路径 #/book/3500/passage/p001
    var oldM = hash.match(/^#\/(\d+)$/);
    if (oldM) {
        var n = parseInt(oldM[1], 10);
        if (n >= 1 && n <= 80) {
            location.replace('#/book/3500/passage/p' + String(n).padStart(3, '0'));
            return;
        }
    }

    // #/dict/<word> 词典覆盖层(不销毁正文 DOM)
    var dm = hash.match(/^#\/dict\/(.+)$/);
    if (dm) {
        renderDictLayer(decodeURIComponent(dm[1]));
        return;
    }

    // #/book/<bookId>/passage/<pid> 文章页
    var pm = hash.match(/^#\/book\/([^/]+)\/passage\/([^/]+)$/);
    if (pm) {
        var bookId = decodeURIComponent(pm[1]);
        var pid = decodeURIComponent(pm[2]);
        // 从词典层返回到同一篇文章 → 不重新渲染,保留滚动位置
        if (_dictLayerOpen && _renderedPassage &&
            _renderedPassage.bookId === bookId && _renderedPassage.pid === pid) {
            _hideDictLayer();
            mountAIAssistant(true);
            return;
        }
        _hideDictLayer();
        renderPassage(bookId, pid);
        mountAIAssistant(true);
        return;
    }

    // #/book/<bookId> 单元目录页
    var bm = hash.match(/^#\/book\/([^/]+)$/);
    if (bm) {
        _hideDictLayer();
        renderBook(decodeURIComponent(bm[1]));
        mountAIAssistant(false);
        return;
    }

    // 默认：书列表
    _hideDictLayer();
    renderHome();
    mountAIAssistant(false);
}

/* === 书列表页（首页） === */
function renderHome() {
    app.innerHTML = '<div class="home"><div class="home-head"><h1>英语精读 · 书房</h1>' +
        '<p class="muted">选择一本书开始阅读</p></div><div id="bookGrid" class="book-grid">' +
        '<div class="book-loading">正在加载书库…</div></div></div>';
    window.scrollTo(0, 0);

    fetch('/api/books')
        .then(function (r) { return r.json(); })
        .then(function (j) {
            var grid = document.getElementById('bookGrid');
            if (!grid) return;
            if (!j || !j.ok || !j.books || !j.books.length) {
                grid.innerHTML = '<div class="book-empty">书库是空的</div>';
                return;
            }
            grid.innerHTML = j.books.map(renderBookCard).join('');
        })
        .catch(function (err) {
            var grid = document.getElementById('bookGrid');
            if (grid) grid.innerHTML = '<div class="book-empty">加载失败：' + esc(err.message) + '</div>';
        });
}

function hashColor(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    var hue = Math.abs(h) % 360;
    return 'hsl(' + hue + ', 60%, 55%)';
}

function pickFg(bg) {
    // bg: '#RRGGBB' 或 'hsl(h, s%, l%)'
    var rgb = parseColor(bg);
    if (!rgb) return '#fff';
    var lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    return lum > 0.6 ? '#1a1a1a' : '#ffffff';
}

function parseColor(c) {
    if (!c) return null;
    var m = String(c).match(/^#([0-9a-f]{6})$/i);
    if (m) {
        return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
    }
    var hm = String(c).match(/^hsl\(\s*\d+\s*,\s*\d+%\s*,\s*(\d+)%\s*\)$/);
    if (hm) return null; // hsl 简化为亮色阈值判断
    return null;
}

function renderBookCard(b) {
    var initial = (b.title || b.id || '?').trim().charAt(0).toUpperCase();
    var bg = b.color || hashColor(b.id);
    var fg = b.cover ? '#fff' : pickFg(bg);
    var coverHtml = b.cover
        ? '<img class="book-img" src="' + esc(b.cover) + '" alt="' + esc(b.title) + '" ' +
          'onerror="this.outerHTML=\'<span class=book-initial style=background:' + esc(bg) + ';color:' + esc(fg) + '>' + esc(initial) + '</span>\'">'
        : '<span class="book-initial" style="background:' + esc(bg) + ';color:' + esc(fg) + '">' + esc(initial) + '</span>';

    return '<a class="book-card" href="#/book/' + esc(b.id) + '">' +
        '<div class="book-cover" style="background:' + esc(bg) + '">' + coverHtml + '</div>' +
        '<div class="book-meta">' +
        '<div class="book-title">' + esc(b.title) + '</div>' +
        (b.subtitle ? '<div class="book-sub">' + esc(b.subtitle) + '</div>' : '') +
        '<div class="book-stats">' +
        '<span>' + (b.unitCount || 0) + ' 单元</span>' +
        '<span class="dot">·</span>' +
        '<span>' + (b.passageCount || 0) + ' 篇文章</span>' +
        '</div></div></a>';
}

/* === 单元目录页 === */
function renderBook(bookId) {
    app.innerHTML = '<div class="book-page"><div class="book-page-head"><div class="muted">正在加载…</div></div></div>';
    window.scrollTo(0, 0);

    fetch('/api/book/' + encodeURIComponent(bookId))
        .then(function (r) { return r.json(); })
        .then(function (j) {
            if (!j || !j.ok) {
                app.innerHTML = '<div class="book-page"><p class="muted">书不存在或加载失败</p>' +
                    '<p><a class="link" href="#">← 返回书库</a></p></div>';
                return;
            }
            renderBookContent(j.book, j.passages);
        })
        .catch(function (err) {
            app.innerHTML = '<div class="book-page"><p class="muted">加载失败：' + esc(err.message) + '</p></div>';
        });
}

function renderBookContent(book, passages) {
    var byId = {};
    for (var i = 0; i < passages.length; i++) byId[passages[i].id] = passages[i];

    var html = '<div class="topbar"><div class="topbar-inner">' +
        '<div class="topbar-left" onclick="location.hash=\'\'">' +
        '<span class="dot"></span><span>书库</span></div>' +
        '<div class="topbar-right">' +
        '<span class="book-page-name">' + esc(book.title) + '</span>' +
        '</div></div></div>';

    html += '<div class="wrap book-page"><div class="book-page-head">' +
        '<div class="book-page-title">' + esc(book.title) + '</div>' +
        (book.subtitle ? '<div class="book-page-sub muted">' + esc(book.subtitle) + '</div>' : '') +
        (book.desc ? '<div class="book-page-desc muted">' + esc(book.desc) + '</div>' : '') +
        '<div class="book-page-stats">' +
        '<span>' + (book.units || []).length + ' 单元</span>' +
        '<span class="dot">·</span>' +
        '<span>' + (book.passageCount || 0) + ' 篇文章</span>' +
        '</div></div>';

    (book.units || []).forEach(function (unit) {
        html += '<div class="unit-section">' +
            '<div class="unit-head">' +
            '<span class="unit-num">UNIT ' + unit.num + '</span>' +
            '<span class="unit-title">' + esc(unit.title) + '</span>' +
            '<span class="unit-range">' + unit.passages.length + ' 篇</span>' +
            '</div><div class="passage-list">';

        unit.passages.forEach(function (pid) {
            var p = byId[pid];
            if (!p) {
                // 索引里没有，回退一个简单占位
                html += '<a class="passage-item" href="#/book/' + esc(book.id) + '/passage/' + esc(pid) + '">' +
                    '<div class="pi-num">PASSAGE ' + esc(pid.replace(/^p/, '')) + '</div>' +
                    '<div class="pi-title muted">（摘要缺失）</div></a>';
                return;
            }
            html += '<a class="passage-item" href="#/book/' + esc(book.id) + '/passage/' + esc(p.id) + '">' +
                '<div class="pi-num">PASSAGE ' + String(p.num).padStart(2, '0') + '</div>' +
                '<div class="pi-title">' + esc(p.title) + '</div>' +
                (p.preview ? '<div class="pi-preview">' + esc(p.preview) + '</div>' : '') +
                '<div class="pi-stats">词数 ' + (p.wordCount || 0) + ' · 核心 ' + (p.coreCount || 0) + '</div>' +
                '</a>';
        });

        html += '</div></div>';
    });

    html += '</div>';
    app.innerHTML = html;
    window.scrollTo(0, 0);
}

/* === 渲染单篇 === */
function renderPassage(bookId, pid) {
    if (!bookId || !pid) { renderHome(); return; }

    app.innerHTML = '<div class="wrap"><div class="article"><p class="muted">正在加载…</p></div></div>';

    fetch('/api/book/' + encodeURIComponent(bookId) + '/passage/' + encodeURIComponent(pid))
        .then(function (r) { return r.json(); })
        .then(function (j) {
            if (!j || !j.ok) {
                app.innerHTML = '<div class="wrap"><div class="article"><p>加载失败：' + esc((j && j.error) || '未知错误') + '</p></div></div>';
                return;
            }
            renderPassageContent(bookId, pid, j.passage);
        })
        .catch(function (err) {
            app.innerHTML = '<div class="wrap"><div class="article"><p>加载失败：' + esc(err.message) + '</p></div></div>';
        });
}

function renderPassageContent(bookId, pid, data) {
    var id = parseInt(String(pid).replace(/^p/, ''), 10) || data.id || 0;
    var num = String(id).padStart(2, '0');

    // 记录当前已渲染的文章(供 dict 返回时判断是否需要重新渲染)
    _renderedPassage = { bookId: bookId, pid: pid };

    // 缓存当前词表数据供跳转使用
    // (词表 UI 已移除,但 highlightWords 仍需 vocab 用于 {word} 标记)

    // 1. 顶栏
    var html = '<div class="topbar"><div class="topbar-inner">' +
        '<div class="topbar-left" onclick="location.hash=\'#/book/' + esc(bookId) + '\'">' +
        '<span class="dot"></span><span>PASSAGE ' + num + ' / ' + (data._bookPassageCount || '?') + '</span></div>' +
        '<div class="topbar-right">' +
        '<span class="gloss-toggle" id="glossToggle" title="显示/隐藏英文词下方中文注释">' +
        '<span class="g-dot"></span><span class="g-label">中文释义</span></span>' +
        '<span class="trans-toggle" id="transToggle" title="显示/隐藏段落中文翻译">' +
        '<span class="t-dot"></span><span class="t-label">中文译文</span></span>' +
        '<span>Words <b>' + ((data.stats && data.stats.words) || '') + '</b></span>' +
        '<span>Core <b>' + ((data.stats && data.stats.core) || '') + '</b></span>' +
        '<button class="nav-btn" onclick="goPrev(\'' + esc(bookId) + '\',' + id + ')">← 上一篇</button>' +
        '<button class="nav-btn" onclick="goNext(\'' + esc(bookId) + '\',' + id + ')">下一篇 →</button>' +
        '</div></div></div>';

    // 2. 正文
    var unitTitle = '';
    for (var i = 0; i < UNITS.length; i++) {
        if (id >= UNITS[i].start && id <= UNITS[i].end) {
            unitTitle = UNITS[i].title;
            break;
        }
    }
    html += '<div class="wrap"><article class="article">' +
        '<div class="section-tag">English · ' + (unitTitle || '') + '</div>';

    data.paragraphs.forEach(function (p) {
        html += '<div class="para"><div class="para-num">' + p.num + '</div>' +
            '<p class="eng">' + highlightWords(p.en, data.vocab) + '</p>' +
            (p.cn ? '<p class="cn">' + p.cn + '</p>' : '') +
            '</div>';
    });

    html += '</article>';

    // 4. 页脚
    html += '<footer>PASSAGE ' + num + ' · END</footer>';

    app.innerHTML = html;
    applyGloss();
    applyTrans();
    window.scrollTo(0, 0);

    // 绑定开关
    document.getElementById('glossToggle').addEventListener('click', function () {
        glossOn = !glossOn;
        try { localStorage.setItem('spa_gloss', glossOn ? 'on' : 'off'); } catch (e) { }
        applyGloss();
    });

    document.getElementById('transToggle').addEventListener('click', function () {
        transOn = !transOn;
        try { localStorage.setItem('spa_trans', transOn ? 'on' : 'off'); } catch (e) { }
        applyTrans();
    });

    // 绑定高亮词点击（事件委托）
    app.addEventListener('click', handleWordClick);
}

/* === 高亮词渲染：把 {word} 标记转为 .wn 结构，其余普通单词也做成可点击 === */
function highlightWords(enText, vocab) {
    // 按 {word} 分割
    var parts = enText.split(/(\{[^}]+\})/g);
    var html = '';

    parts.forEach(function (part) {
        var m = part.match(/^\{([^}]+)\}$/);
        if (m) {
            var key = m[1];
            var entry = findVocab(key, vocab);
            if (entry) {
                var outlineClass = entry.type === 'outline' ? ' outline' : '';
                var ctxHtml = entry.ctx ? '<span class="w-g">' + esc(entry.ctx) + '</span>' : '';
                html += '<span class="wn"><span class="w' + outlineClass + '" data-key="' + esc(key) + '">' +
                    esc(entry.display || key) + '</span>' + ctxHtml + '</span>';
            } else {
                // 标记了但 vocab 未命中：也做成可点击，走词典 API
                html += makeRawWordSpan(key);
            }
        } else {
            // 纯文本：把每个英文单词都做成可点击
            html += tokenizeAndWrap(part);
        }
    });

    return html;
}

/* 把纯文本按"英文单词 / 非单词"切分，单词包成可点击 span */
function tokenizeAndWrap(text) {
    if (!text) return '';
    var html = '';
    var re = /([A-Za-z][A-Za-z''']*)/g;
    var lastIdx = 0;
    var match;
    while ((match = re.exec(text)) !== null) {
        if (match.index > lastIdx) {
            html += esc(text.slice(lastIdx, match.index));
        }
        html += makeRawWordSpan(match[1]);
        lastIdx = re.lastIndex;
    }
    if (lastIdx < text.length) {
        html += esc(text.slice(lastIdx));
    }
    return html;
}

/* 生成一个可点击的普通单词 span（走词典 API） */
function makeRawWordSpan(word) {
    var display = String(word).replace(/^[''']+|[''']+$/g, '');
    if (!display) return esc(word);
    var query = display.replace(/['']/g, "'").toLowerCase();
    return '<span class="w-raw" data-word="' + esc(query) + '">' + esc(display) + '</span>';
}

function findVocab(key, vocab) {
    function uniq(list) {
        var seen = {};
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var v = list[i];
            if (!v) continue;
            if (seen[v]) continue;
            seen[v] = true;
            out.push(v);
        }
        return out;
    }

    function stripEdgePunct(s) {
        return String(s)
            .replace(/^[\s“”"‘’'()\[\]{}]+/g, '')
            .replace(/[\s“”"‘’'()\[\]{}.,!?;:]+$/g, '');
    }

    function buildCandidates(s) {
        var base = String(s || '');
        var lower = base.toLowerCase();
        var c1 = stripEdgePunct(base);
        var c2 = stripEdgePunct(lower);
        var c3 = c1.replace(/(’s|'s|s’|’)$|('$)/g, '');
        var c4 = c2.replace(/(’s|'s|s’|’)$|('$)/g, '');
        return uniq([base, lower, c1, c2, c3, c4]);
    }

    var candidates = buildCandidates(key);

    for (var c = 0; c < candidates.length; c++) {
        var cand = candidates[c];
        for (var i = 0; i < vocab.length; i++) {
            if (vocab[i].word === cand) return vocab[i];
        }
    }

    for (var c2 = 0; c2 < candidates.length; c2++) {
        var cand2 = candidates[c2];
        for (var j = 0; j < vocab.length; j++) {
            var forms = vocab[j].forms || [];
            for (var k = 0; k < forms.length; k++) {
                if (forms[k].surface === cand2) return vocab[j];
            }
        }
    }

    return null;
}

/* === 词表卡片渲染（已删除 - 词表 UI 移除,单词通过正文点击查翻译） === */

/* === 单词点击 → 跳转独立翻译页（事件委托） === */
function handleWordClick(e) {
    var target = e.target.closest('.w, .w-raw');
    if (!target) return;
    e.stopPropagation();
    // 脉冲动画
    target.classList.remove('pulsed');
    void target.offsetWidth;
    target.classList.add('pulsed');
    // 获取单词：.w 用 data-key，.w-raw 用 data-word
    var word = target.getAttribute('data-key') || target.getAttribute('data-word');
    if (word) openDictPage(word);
}

/* === 词典 API 查询（非 vocab 单词） === */
var _dictCache = {};
// 视频列表缓存:word -> 数组
//   undefined = 还没查过; [] = 已查但无结果/失败; [item,...] = 有视频
var _videoSearchCache = {};

/* 查询单词的视频列表,结果存入 _videoSearchCache
   后端 _search_video 自带日志,这里只负责判断结果决定按钮显隐 */
function _fetchVideoList(word, callback) {
    fetch('/api/search-video?word=' + encodeURIComponent(word))
        .then(function (r) { return r.json(); })
        .then(function (j) {
            console.log('[search-video] word =', word, 'j =', j);
            _videoSearchCache[word] = (j && j.ok && j.list && j.list.length) ? j.list : [];
        })
        .catch(function (err) {
            // 获取失败也视为无视频,不显示按钮
            _videoSearchCache[word] = [];
        })
        .then(function () {
            if (callback) callback();
        });
}

/* === 词典覆盖层(SPA 内 keep-alive,类似淘宝列表→详情) ===
   - 点单词 → location.hash = '#/dict/<word>',不离开 SPA
   - 正文 DOM 不销毁,仅被 dictLayer 覆盖
   - 返回时 hash 变回 passage 路由,隐藏 dictLayer,正文滚动位置天然保留 */
var _dictLayer = null;
var _dictLayerOpen = false;
var _renderedPassage = null;  // { bookId, pid } 当前已渲染的文章(用于判断返回时是否需要重新渲染)

function openDictPage(word) {
    word = String(word || '').toLowerCase().trim();
    if (!word) return;
    location.hash = '#/dict/' + encodeURIComponent(word);
}

function _ensureDictLayer() {
    if (_dictLayer) return;
    _dictLayer = document.getElementById('dictLayer');
}

function _showDictLayer() {
    _ensureDictLayer();
    _dictLayer.style.display = '';
    _dictLayerOpen = true;
}

function _hideDictLayer() {
    if (!_dictLayer) _ensureDictLayer();
    if (_dictLayer) _dictLayer.style.display = 'none';
    _dictLayerOpen = false;
}

/* 播放发音音频 */
function playAudio(btn, src) {
    if (window.event) window.event.stopPropagation();
    try {
        var audio = new Audio(src);
        audio.play().catch(function () { });
        btn.classList.add('playing');
        setTimeout(function () { btn.classList.remove('playing'); }, 600);
    } catch (e) { }
}

/* 跳到单词对应的视频页(仍用独立 video.html) */
function openVideoPage(word, list) {
    word = String(word || '').toLowerCase().trim();
    if (!word) return;
    try {
        sessionStorage.setItem('videoList', JSON.stringify(list || []));
        sessionStorage.setItem('videoWord', word);
    } catch (e) { }
    location.href = '/video.html?word=' + encodeURIComponent(word);
}

function openVideoFromBtn(btn) {
    var word = (btn.getAttribute('data-videoword') || '').toLowerCase().trim();
    var list = [];
    try { list = JSON.parse(btn.getAttribute('data-videolist') || '[]'); } catch (e) {}
    openVideoPage(word, list);
}

/* 创建/更新"教学视频"按钮(幂等) */
function _insertVideoBtn(data, videoList, container) {
    var row = container.querySelector('.dict-word-row');
    if (!row || !data || !data.word) return;
    var existing = row.querySelector('.dict-video-btn');
    if (!videoList || !videoList.length) {
        if (existing) existing.remove();
        return;
    }
    var videoWord = (data.prototype || data.word).toLowerCase();
    var listJson = JSON.stringify(videoList);
    if (existing) {
        existing.setAttribute('data-videoword', videoWord);
        existing.setAttribute('data-videolist', listJson);
    } else {
        var btn = document.createElement('button');
        btn.className = 'dict-video-btn';
        btn.setAttribute('data-videoword', videoWord);
        btn.setAttribute('data-videolist', listJson);
        btn.innerHTML = '<span class="dv-icon">\u25B6</span> 教学视频';
        btn.addEventListener('click', function () { openVideoFromBtn(this); });
        row.appendChild(btn);
    }
}

/* sessionStorage 路径专用:补查视频 */
function _maybeFetchAndInsertVideo(data, container) {
    if (!data || !data.word) return;
    var row = container.querySelector('.dict-word-row');
    if (row && row.querySelector('.dict-video-btn')) return;
    var videoWord = (data.prototype || data.word).toLowerCase();
    fetch('/api/search-video?word=' + encodeURIComponent(videoWord))
        .then(function (r) { return r.json(); })
        .then(function (j) {
            if (j && j.ok && j.list && j.list.length) {
                _insertVideoBtn(data, j.list, container);
            }
        })
        .catch(function () { });
}

/* 把翻译页内英文单词包成可点击 .dw */
var _DICT_EN_SELECTOR = [
    '.example-en', '.phr-phrase', '.syn-words', '.idiom-en', '.past-sent-en', '.prototype-value'
].join(',');

function _tokenizeEnglish(text) {
    if (!text) return '';
    var re = /([A-Za-z][A-Za-z''']*)/g;
    var html = '';
    var lastIdx = 0;
    var match;
    while ((match = re.exec(text)) !== null) {
        if (match.index > lastIdx) {
            html += esc(text.slice(lastIdx, match.index));
        }
        var word = match[1];
        var display = String(word).replace(/^[''']+|[''']+$/g, '');
        var query = display.replace(/['']/g, "'").toLowerCase();
        html += '<span class="dw" data-word="' + esc(query) + '">' + esc(display) + '</span>';
        lastIdx = re.lastIndex;
    }
    if (lastIdx < text.length) {
        html += esc(text.slice(lastIdx));
    }
    return html;
}

function _wrapDictEnglish(container) {
    var nodes = container.querySelectorAll(_DICT_EN_SELECTOR);
    for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (el.getAttribute('data-wrapped') === '1') continue;
        el.setAttribute('data-wrapped', '1');
        el.innerHTML = _tokenizeEnglish(el.textContent || '');
    }
}

/* 渲染词典内容到 dictLayer */
function _renderDictPage(data, videoList) {
    _ensureDictLayer();
    var titleEl = _dictLayer.querySelector('.dict-topbar-title');
    var mainEl = _dictLayer.querySelector('.dict-main');

    if (data && data.word) {
        if (titleEl) titleEl.textContent = data.word;
        document.title = data.word + ' \u00B7 \u5355\u8BCD\u7FFB\u8BD91';
    }

    var html = '<div class="dict-eyebrow">Dictionary</div>';
    var videoBtnHtml = '';

    if (data && data.loading) {
        html += '<div class="dict-word-row"><div class="dict-word">' + esc(data.word) + '</div>' + videoBtnHtml + '</div>';
        html += '<div class="dict-loading"><span class="dict-spinner"></span>\u67E5\u8BE2\u4E2D\u2026</div>';
        mainEl.innerHTML = html;
        return;
    }

    if (data && data.error) {
        html += '<div class="dict-word-row"><div class="dict-word">' + esc(data.word || '') + '</div>' + videoBtnHtml + '</div>';
        html += '<div class="dict-empty">\u67E5\u8BE2\u5931\u8D25\uFF1A' + esc(data.error) + '</div>';
        mainEl.innerHTML = html;
        _insertVideoBtn(data, videoList, mainEl);
        return;
    }

    if (!data || !data.found) {
        html += '<div class="dict-word-row"><div class="dict-word">' + esc((data && data.word) || '') + '</div>' + videoBtnHtml + '</div>';
        html += '<div class="dict-empty">\u672A\u627E\u5230\u8BE5\u8BCD\u7684\u91CA\u4E49</div>';
        mainEl.innerHTML = html;
        _insertVideoBtn(data, videoList, mainEl);
        return;
    }

    html += '<div class="dict-word-row"><div class="dict-word">' + esc(data.word) + '</div>' + videoBtnHtml + '</div>';

    if (data.base_form) {
        html += '<div class="dict-base-form">\u2190 ' + esc(data.base_form) + ' \u7684\u6240\u6709\u683C/\u7F29\u5199\u5F62\u5F0F</div>';
    }

    var phonRow = '<div class="dict-phon-row">';
    if (data.phonetic_uk || data.audio_uk) {
        phonRow += '<div class="phon-block">';
        if (data.phonetic_uk) phonRow += '<span class="phon-text">' + esc(data.phonetic_uk) + '</span>';
        if (data.audio_uk) phonRow += '<button class="audio-btn" onclick="playAudio(this, \'' + esc(data.audio_uk) + '\')"><span class="audio-icon">\uD83D\uDD0A</span>\u82F1</button>';
        phonRow += '</div>';
    }
    if (data.phonetic_us || data.audio_us) {
        phonRow += '<div class="phon-block">';
        if (data.phonetic_us) phonRow += '<span class="phon-text">' + esc(data.phonetic_us) + '</span>';
        if (data.audio_us) phonRow += '<button class="audio-btn" onclick="playAudio(this, \'' + esc(data.audio_us) + '\')"><span class="audio-icon">\uD83D\uDD0A</span>\u7F8E</button>';
        phonRow += '</div>';
    }
    phonRow += '</div>';
    if (data.phonetic_uk || data.phonetic_us || data.audio_uk || data.audio_us) {
        html += phonRow;
    }

    if (data.prototype) {
        html += '<div class="dict-prototype"><span class="prototype-label">\u539F\u578B</span><span class="prototype-value">' + esc(data.prototype) + '</span></div>';
    }

    if (data.exam_type && data.exam_type.length) {
        html += '<div class="dict-exam-type">';
        html += '<span class="exam-type-label">\u8003\u8BD5</span>';
        data.exam_type.forEach(function (t) {
            html += '<span class="exam-type-tag">' + esc(t) + '</span>';
        });
        html += '</div>';
    }

    if (data.defs && data.defs.length) {
        html += '<div class="dict-defs">';
        data.defs.forEach(function (d) {
            html += '<div class="dict-def">';
            if (d.pos) html += '<span class="pos">' + esc(d.pos) + '</span>';
            if (d.meaning) html += '<span class="meaning">' + esc(d.meaning) + '</span>';
            html += '</div>';
        });
        html += '</div>';
    }

    if (data.forms && data.forms.length) {
        html += '<div class="dict-section">';
        html += '<div class="dict-section-label">\u53D8\u5F62</div>';
        var formsText = data.forms.map(function (f) {
            return esc(f.name) + ': ' + esc(f.value);
        }).join('\uFF1B');
        html += '<div class="dict-section-body">' + formsText + '</div>';
        html += '</div>';
    }

    if (data.examples && data.examples.length) {
        html += '<div class="dict-section">';
        html += '<div class="dict-section-label">\u53CC\u8BED\u4F8B\u53E5</div>';
        data.examples.forEach(function (ex) {
            html += '<div class="dict-example">';
            html += '<div class="example-en">' + esc(ex.en) + '</div>';
            html += '<div class="example-zh">' + esc(ex.zh) + '</div>';
            html += '</div>';
        });
        html += '</div>';
    }

    if (data.synonyms && data.synonyms.length) {
        html += '<div class="dict-section">';
        html += '<div class="dict-section-label">\u540C\u4E49\u8BCD</div>';
        data.synonyms.forEach(function (syn) {
            html += '<div class="dict-syn-item">';
            if (syn.pos) html += '<span class="syn-pos">' + esc(syn.pos) + '</span>';
            if (syn.meaning) html += '<span class="syn-meaning">' + esc(syn.meaning) + '</span>';
            html += '<span class="syn-words">' + esc(syn.words.join(', ')) + '</span>';
            html += '</div>';
        });
        html += '</div>';
    }

    if (data.phrs && data.phrs.length) {
        html += '<div class="dict-section">';
        html += '<div class="dict-section-label">\u8BCD\u7EC4\u642D\u914D</div>';
        data.phrs.forEach(function (p) {
            html += '<div class="dict-phr-item">';
            html += '<span class="phr-phrase">' + esc(p.phrase) + '</span>';
            if (p.translations && p.translations.length) {
                html += '<span class="phr-trans">' + esc(p.translations.join('\uFF1B')) + '</span>';
            }
            html += '</div>';
        });
        html += '</div>';
    }

    if (data.individual && Object.keys(data.individual).length) {
        var ind = data.individual;
        html += '<div class="dict-section">';
        html += '<div class="dict-section-label">\u8003\u8BD5\u4FE1\u606F</div>';

        var indMeta = [];
        if (ind.level) indMeta.push(esc(ind.level));
        if (ind.mnemonic) indMeta.push(esc(ind.mnemonic));
        if (indMeta.length) {
            html += '<div class="dict-ind-meta">' + indMeta.join(' \u00B7 ') + '</div>';
        }

        if (ind.examInfo && (ind.examInfo.frequency || ind.examInfo.year)) {
            html += '<div class="dict-ind-exam-info">';
            if (ind.examInfo.frequency) html += '<span class="exam-stat">\u8FD1' + esc(String(ind.examInfo.year || '')) + '\u5E74\u8003\u9891 <b>' + esc(String(ind.examInfo.frequency)) + '</b></span>';
            if (ind.examInfo.recommendationRate) html += '<span class="exam-stat">\u63A8\u8350\u6307\u6570 <b>' + esc(String(ind.examInfo.recommendationRate)) + '</b></span>';
            html += '</div>';
            if (ind.examInfo.questionTypeInfo && ind.examInfo.questionTypeInfo.length) {
                html += '<div class="dict-ind-qtypes">';
                ind.examInfo.questionTypeInfo.forEach(function (q) {
                    html += '<span class="qtype-tag">' + esc(q.type) + ' ' + esc(String(q.time || '')) + '</span>';
                });
                html += '</div>';
            }
        }

        if (ind.idiomatic && ind.idiomatic.length) {
            ind.idiomatic.forEach(function (c) {
                html += '<div class="dict-idiom-item">';
                html += '<span class="idiom-en">' + esc(c.en) + '</span>';
                html += '<span class="idiom-zh">' + esc(c.zh) + '</span>';
                html += '</div>';
            });
        }

        if (ind.pastExamSents && ind.pastExamSents.length) {
            html += '<div class="dict-ind-past-sents">';
            html += '<div class="dict-section-sub-label">\u771F\u9898\u4F8B\u53E5</div>';
            ind.pastExamSents.forEach(function (s) {
                html += '<div class="dict-past-sent-item">';
                html += '<div class="past-sent-en">' + esc(s.en) + '</div>';
                html += '<div class="past-sent-zh">' + esc(s.zh) + '</div>';
                if (s.source) html += '<div class="past-sent-src">' + esc(s.source) + '</div>';
                html += '</div>';
            });
            html += '</div>';
        }
        html += '</div>';
    }

    if (data.sources && data.sources.length) {
        var sourceLabels = { 'youdao': '\u6709\u9053\u8BCD\u5178' };
        var labels = data.sources.map(function (s) { return sourceLabels[s] || s; });
        html += '<div class="dict-source">\u6570\u636E\u6765\u6E90\uFF1A' + esc(labels.join(' + ')) + '</div>';
    }

    mainEl.innerHTML = html;
    _insertVideoBtn(data, videoList, mainEl);
    _wrapDictEnglish(mainEl);
}

/* 打开词典覆盖层并加载指定单词 */
function renderDictLayer(word) {
    word = String(word || '').toLowerCase().trim();
    if (!word) return;

    _ensureDictLayer();
    _showDictLayer();
    _dictLayer.scrollTop = 0;

    // 构建 topbar + main 骨架(每次重新构建以防残留)
    _dictLayer.innerHTML =
        '<header class="dict-topbar">' +
            '<button class="dict-back" id="dictBackBtn" aria-label="\u8FD4\u56DE">' +
                '<span class="dict-back-arrow">\u2039</span>' +
            '</button>' +
            '<div class="dict-topbar-title">' + esc(word) + '</div>' +
        '</header>' +
        '<main class="dict-main">' +
            '<div class="dict-loading"><span class="dict-spinner"></span>\u52A0\u8F7D\u4E2D\u2026</div>' +
        '</main>';

    // 返回按钮:history.back()
    var backBtn = _dictLayer.querySelector('#dictBackBtn');
    if (backBtn) {
        backBtn.addEventListener('click', function () {
            if (history.length > 1) {
                history.back();
            } else {
                location.hash = _renderedPassage
                    ? ('#/book/' + _renderedPassage.bookId + '/passage/' + _renderedPassage.pid)
                    : '';
            }
        });
    }

    // 翻译页内英文单词点击 → 跳到另一个词
    var mainEl = _dictLayer.querySelector('.dict-main');
    if (mainEl) {
        mainEl.addEventListener('click', function (e) {
            var target = e.target.closest('.dw');
            if (!target) return;
            e.stopPropagation();
            e.preventDefault();
            var w = target.getAttribute('data-word');
            if (w) location.hash = '#/dict/' + encodeURIComponent(w);
        });
    }

    // 优先用内存缓存(命中零延迟)
    if (_dictCache[word]) {
        var data = _dictCache[word];
        var videoWord = (data.prototype || word).toLowerCase();
        var cachedVideo = _videoSearchCache[videoWord];
        _renderDictPage(data, (cachedVideo && cachedVideo.length) ? cachedVideo : []);
        // 没有视频缓存则补查
        if (!cachedVideo || !cachedVideo.length) {
            _maybeFetchAndInsertVideo(data, mainEl);
        }
        return;
    }

    // 未命中缓存 → loading + fetch
    _renderDictPage({ word: word, loading: true }, []);
    fetch('/api/dict?q=' + encodeURIComponent(word))
        .then(function (r) { return r.json(); })
        .then(function (data) {
            _dictCache[word] = data;
            var vWord = (data && data.prototype ? data.prototype : word).toLowerCase();
            return fetch('/api/search-video?word=' + encodeURIComponent(vWord))
                .then(function (r) { return r.json(); })
                .then(function (j) {
                    var list = (j && j.ok && j.list) ? j.list : [];
                    if (list && list.length) {
                        _videoSearchCache[vWord] = list;
                    }
                    _renderDictPage(data, list);
                })
                .catch(function () { _renderDictPage(data, []); });
        })
        .catch(function (err) {
            _renderDictPage({ word: word, error: String(err.message || err) }, []);
        });
}

/* === 移动端判断（用于决定翻译页/视频页打开方式） === */
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent);
}

/* === 上下篇导航 === */
function goPrev(bookId, id) { if (id > 1) location.hash = '#/book/' + bookId + '/passage/p' + String(id - 1).padStart(3, '0'); }
function goNext(bookId, id) { if (id < TOTAL) location.hash = '#/book/' + bookId + '/passage/p' + String(id + 1).padStart(3, '0'); }

/* === AI 助手:悬浮按钮 + 弹层(只在正文页显示) === */
var _ai = { mounted: false, open: false, busy: false, history: [] };
var _aiFab, _aiStage, _aiMessages, _aiInput, _aiSend, _aiClose;
var _AI_SYSTEM_PROMPT = '你是一个高考英语学习助手,帮助用户精读英语文章、理解单词、解析语法和翻译。' +
    '回答要简洁、准确,用中文解释。涉及单词时给出音标、词性、释义和例句。';

function mountAIAssistant(show) {
    if (show) {
        if (!_ai.mounted) {
            _buildAIShells();
            _ai.mounted = true;
        }
        _aiFab.classList.remove('ai-fab-hidden');
    } else {
        if (_ai.mounted) {
            _aiFab.classList.add('ai-fab-hidden');
            closeAIChat();
        }
    }
}

function _buildAIShells() {
    // 悬浮按钮
    _aiFab = document.createElement('button');
    _aiFab.className = 'ai-fab';
    _aiFab.textContent = 'AI';
    _aiFab.title = 'AI 助手';
    _aiFab.onclick = openAIChat;
    document.body.appendChild(_aiFab);

    // 弹层
    _aiStage = document.createElement('div');
    _aiStage.className = 'ai-stage';
    _aiStage.innerHTML =
        '<div class="ai-panel">' +
            '<div class="ai-header">' +
                '<div><span class="ai-header-title">AI 助手</span>' +
                '<span class="ai-header-sub">Ling-2.6-flash</span></div>' +
                '<button class="ai-close" title="关闭">✕</button>' +
            '</div>' +
            '<div class="ai-messages"></div>' +
            '<div class="ai-input-wrap">' +
                '<textarea class="ai-input" placeholder="输入消息…" rows="1"></textarea>' +
                '<button class="ai-send">发送</button>' +
            '</div>' +
        '</div>';
    document.body.appendChild(_aiStage);

    _aiMessages = _aiStage.querySelector('.ai-messages');
    _aiInput = _aiStage.querySelector('.ai-input');
    _aiSend = _aiStage.querySelector('.ai-send');
    _aiClose = _aiStage.querySelector('.ai-close');

    _aiClose.onclick = closeAIChat;
    _aiSend.onclick = function () { _doSend(); };
    _aiInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            _doSend();
        }
    });
    // 自动调整输入框高度
    _aiInput.addEventListener('input', function () {
        _aiInput.style.height = 'auto';
        _aiInput.style.height = Math.min(120, _aiInput.scrollHeight) + 'px';
    });
    // 点背景关闭
    _aiStage.addEventListener('click', function (e) {
        if (e.target === _aiStage) closeAIChat();
    });

    _renderEmpty();
}

function _renderEmpty() {
    if (_ai.history.length > 0) return;
    _aiMessages.innerHTML =
        '<div class="ai-empty">' +
            '<div class="ai-empty-icon">AI</div>' +
            '<div>有什么英语问题想问我?试试下面的快捷提问:</div>' +
            '<div class="ai-quick-row">' +
                '<button class="ai-quick" data-q="解释这篇文章的中心思想">解释中心思想</button>' +
                '<button class="ai-quick" data-q="列出本文的语法重点">语法重点</button>' +
                '<button class="ai-quick" data-q="给我 5 个高级词汇替换">高级替换</button>' +
                '<button class="ai-quick" data-q="翻译成中文">翻译全文</button>' +
            '</div>' +
        '</div>';
    var quicks = _aiMessages.querySelectorAll('.ai-quick');
    for (var i = 0; i < quicks.length; i++) {
        quicks[i].onclick = function () {
            _aiInput.value = this.getAttribute('data-q');
            _doSend();
        };
    }
}

function openAIChat() {
    if (_ai.open) return;
    _ai.open = true;
    _aiStage.classList.add('ai-stage-open');
    setTimeout(function () { _aiInput.focus(); }, 50);
}

function closeAIChat() {
    if (!_ai.open) return;
    _ai.open = false;
    _aiStage.classList.remove('ai-stage-open');
}

function _escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

function _appendUserMsg(text) {
    _clearEmpty();
    var div = document.createElement('div');
    div.innerHTML =
        '<div class="ai-msg ai-msg-user">' + _escapeHtml(text) + '</div>' +
        '<div class="ai-msg-meta">' + _now() + '</div>';
    _aiMessages.appendChild(div);
    _scrollDown();
}

function _appendBotPlaceholder() {
    _clearEmpty();
    var holder = document.createElement('div');
    holder.innerHTML =
        '<div class="ai-msg ai-msg-bot"><span class="ai-typing"><span></span><span></span><span></span></span></div>';
    _aiMessages.appendChild(holder);
    _scrollDown();
    return holder;
}

function _updateBotContent(holder, text) {
    var msg = holder.querySelector('.ai-msg');
    if (!msg) return;
    msg.innerHTML = _renderMarkdown(text);
    _scrollDown();
}

/* 轻量 markdown 渲染(支持:粗体/标题/列表/行内代码/分隔线/换行/段落/GFM表格) */
function _escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}
function _inlineMd(s) {
    // 先转义,再放回受控标签
    var t = _escapeHtml(s);
    // 行内代码 `xxx`
    t = t.replace(/`([^`]+?)`/g, function (_, c) { return '<code>' + c + '</code>'; });
    // 粗体 **xxx** (非贪婪)
    t = t.replace(/\*\*([^*\n]+?)\*\*/g, function (_, c) { return '<strong>' + c + '</strong>'; });
    // 斜体 *xxx* (避免和 ** 冲突,只匹配单个 * 包围的非星号)
    t = t.replace(/(^|[^*])\*([^*\n]+?)\*/g, function (_, p, c) { return p + '<em>' + c + '</em>'; });
    return t;
}
// 检测一行是否为 GFM 表格行（以 | 开头/结尾）
function _isTableRow(line) {
    return /^\|(.+\|)+\s*$/.test(line.trim());
}
// 检测是否为表格分隔行 |---|---|
function _isTableSep(line) {
    return /^\|[-\s:|]+\s*$/.test(line.trim());
}
// 解析一个单元格内容
function _parseTableCell(s) {
    s = s.trim();
    // 去掉首尾可能的空格
    return _inlineMd(s);
}

function _renderMarkdown(text) {
    if (!text) return '';
    var lines = text.split('\n');
    var out = [];
    var inList = false;
    var listType = null;   // 'ul' | 'ol'
    var para = [];
    var inTable = false;
    var tableRows = [];   // 收集表格行

    function flushPara() {
        if (para.length) {
            out.push('<p>' + _inlineMd(para.join(' ')) + '</p>');
            para = [];
        }
    }
    function flushList() {
        if (inList) { out.push('</' + listType + '>'); inList = false; listType = null; }
    }
    function flushTable() {
        if (!inTable || tableRows.length < 2) {
            // 表格不完整，当普通文本输出
            for (var t = 0; t < tableRows.length; t++) {
                para.push(tableRows[t]);
            }
            tableRows = [];
            inTable = false;
            return;
        }
        // 解析表头（第一行）和数据行（跳过分隔行）
        var headerCells = tableRows[0].split('|').filter(function(c){return c.trim()!=='';});
        var dataStart = 2; // 跳过分隔行（索引1）
        var html = '<table><thead><tr>';
        for (var hi = 0; hi < headerCells.length; hi++) {
            html += '<th>' + _parseTableCell(headerCells[hi]) + '</th>';
        }
        html += '</tr></thead><tbody>';
        for (var di = dataStart; di < tableRows.length; di++) {
            var cells = tableRows[di].split('|').filter(function(c){return c.trim()!=='';});
            html += '<tr>';
            for (var ci = 0; ci < cells.length; ci++) {
                html += '<td>' + _parseTableCell(cells[ci]) + '</td>';
            }
            html += '</tr>';
        }
        html += '</tbody></table>';
        out.push(html);
        tableRows = [];
        inTable = false;
    }

    for (var i = 0; i < lines.length; i++) {
        var raw = lines[i];
        var line = raw.replace(/\s+$/, '');
        var trimmed = line.trim();

        // 空行
        if (!trimmed) {
            if (inTable) { flushTable(); }
            flushPara(); flushList();
            continue;
        }

        // 表格行检测
        if (_isTableRow(trimmed) || (inTable && _isTableSep(trimmed))) {
            flushPara(); flushList();
            if (!inTable) { inTable = true; }
            tableRows.push(trimmed);
            continue;
        }

        // 非表格行：如果在表格中，先关闭表格
        if (inTable) { flushTable(); }

        // 标题 ### / ##
        var h = trimmed.match(/^(#{1,4})\s+(.+)$/);
        if (h) {
            flushPara(); flushList();
            var level = Math.min(6, h[1].length + 1);  // ## → h3, ### → h4
            out.push('<h' + level + '>' + _inlineMd(h[2]) + '</h' + level + '>');
            continue;
        }

        // 分隔线 ---
        if (/^-{3,}\s*$/.test(trimmed)) {
            flushPara(); flushList();
            out.push('<hr>');
            continue;
        }

        // 有序列表 1. / 2.
        var ol = trimmed.match(/^(\d+)\.\s+(.+)$/);
        if (ol) {
            flushPara();
            if (!inList || listType !== 'ol') { flushList(); out.push('<ol>'); inList = true; listType = 'ol'; }
            out.push('<li>' + _inlineMd(ol[2]) + '</li>');
            continue;
        }

        // 无序列表 - /* 
        var ul = trimmed.match(/^[-*+]\s+(.+)$/);
        if (ul) {
            flushPara();
            if (!inList || listType !== 'ul') { flushList(); out.push('<ul>'); inList = true; listType = 'ul'; }
            out.push('<li>' + _inlineMd(ul[1]) + '</li>');
            continue;
        }

        // 普通段落
        flushList();
        para.push(line);
    }
    // 结束时清理
    if (inTable) { flushTable(); }
    flushPara();
    flushList();
    return out.join('');
}

function _appendError(text) {
    _clearEmpty();
    var div = document.createElement('div');
    div.innerHTML =
        '<div class="ai-msg ai-msg-error">' + _escapeHtml(text) + '</div>';
    _aiMessages.appendChild(div);
    _scrollDown();
}

function _clearEmpty() {
    var empty = _aiMessages.querySelector('.ai-empty');
    if (empty) empty.remove();
}

function _scrollDown() {
    _aiMessages.scrollTop = _aiMessages.scrollHeight;
}

function _now() {
    var d = new Date();
    return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

function _doSend() {
    if (_ai.busy) return;
    var text = (_aiInput.value || '').trim();
    if (!text) return;
    _aiInput.value = '';
    _aiInput.style.height = 'auto';

    _appendUserMsg(text);
    _ai.history.push({ role: 'user', content: text });

    var holder = _appendBotPlaceholder();
    _ai.busy = true;
    _aiSend.disabled = true;
    _aiInput.disabled = true;

    _streamChat(_ai.history, holder)
        .then(function () {
            // ok
        })
        .catch(function (err) {
            // 移除占位,改为错误提示
            try { holder.remove(); } catch (e) { }
            _appendError('请求失败: ' + (err && err.message || err));
        })
        .then(function () {
            _ai.busy = false;
            _aiSend.disabled = false;
            _aiInput.disabled = false;
            _aiInput.focus();
        });
}

function _streamChat(history, holder) {
    return new Promise(function (resolve, reject) {
        var acc = '';
        fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: [{ role: 'system', content: _AI_SYSTEM_PROMPT }].concat(history) }),
        }).then(function (res) {
            if (!res.ok) {
                res.text().then(function (t) {
                    reject(new Error('HTTP ' + res.status + ' ' + (t || '').slice(0, 200)));
                });
                return;
            }
            var reader = res.body.getReader();
            var decoder = new TextDecoder('utf-8');
            var buf = '';
            function pump() {
                reader.read().then(function (r) {
                    if (r.done) {
                        // 流结束
                        _updateBotContent(holder, acc || '(空响应)');
                        _ai.history.push({ role: 'assistant', content: acc });
                        resolve();
                        return;
                    }
                    buf += decoder.decode(r.value, { stream: true });
                    var lines = buf.split('\n');
                    buf = lines.pop() || '';
                    for (var i = 0; i < lines.length; i++) {
                        var line = lines[i].trim();
                        if (!line) continue;
                        if (line.indexOf('data:') !== 0) continue;
                        var payload = line.slice(5).trim();
                        if (payload === '[DONE]') {
                            _updateBotContent(holder, acc || '(空响应)');
                            _ai.history.push({ role: 'assistant', content: acc });
                            resolve();
                            return;
                        }
                        try {
                            var obj = JSON.parse(payload);
                            var delta = obj.choices && obj.choices[0] && obj.choices[0].delta;
                            if (delta && delta.content) {
                                acc += delta.content;
                                _updateBotContent(holder, acc);
                            }
                        } catch (e) { /* 忽略坏行 */ }
                    }
                    pump();
                }, function (err) { reject(err); });
            }
            pump();
        }, function (err) { reject(err); });
    });
}

/* === 启动 === */
router();
