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

    // #/book/<bookId>/passage/<pid> 文章页
    var pm = hash.match(/^#\/book\/([^/]+)\/passage\/([^/]+)$/);
    if (pm) {
        renderPassage(decodeURIComponent(pm[1]), decodeURIComponent(pm[2]));
        return;
    }

    // #/book/<bookId> 单元目录页
    var bm = hash.match(/^#\/book\/([^/]+)$/);
    if (bm) {
        renderBook(decodeURIComponent(bm[1]));
        return;
    }

    // 默认：书列表
    renderHome();
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

    // 缓存当前词表数据供跳转使用
    window._currentVocab = data.vocab;

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

    // 3. 词表
    html += '<section class="vocab"><div class="vocab-head">' +
        '<h2>核心<em>词表</em></h2>' +
        '<div class="legend"><span class="l-core">核心词</span><span class="l-out">大纲词 *</span></div>' +
        '</div><div class="vocab-grid">';

    data.vocab.forEach(function (v) {
        html += renderVocabCard(v);
    });

    html += '</div></section></div>';

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
    // 绑定词表卡片点击（事件委托）
    app.addEventListener('click', handleCardClick);
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

/* === 词表卡片渲染（精简版：仅显示 word/type/ctx） === */
function renderVocabCard(v) {
    var outlineClass = v.type === 'outline' ? ' outline' : '';
    var star = v.type === 'outline' ? '<span class="star">*</span>' : '';
    var ctxHtml = v.ctx ? '<span class="card-ctx">' + esc(v.ctx) + '</span>' : '';

    return '<div class="card' + outlineClass + '" data-word="' + esc(v.word) + '">' +
        '<div class="card-top"><span class="card-word">' + esc(v.word) + star + '</span></div>' +
        ctxHtml + '</div>';
}

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

/* === 词表卡片点击 → 跳转独立翻译页 === */
function handleCardClick(e) {
    var target = e.target.closest('.card');
    if (!target) return;
    var word = target.getAttribute('data-word');
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

/* === 跳转独立翻译页 ===
   - 把 word + (如有) 已缓存的词典数据 + (如有) 已缓存的视频列表打包塞 sessionStorage
   - dict.html 取出后立即删除,避免下次打开残留
   - PC:新标签页打开(保留文章页可回看);手机:当前页跳转(用浏览器返回) */
function openDictPage(word) {
    word = String(word || '').toLowerCase().trim();
    if (!word) return;

    var payload = { word: word, dictData: null, videoList: [] };

    // 把已缓存的词典数据带过去(命中则 dict.html 零延迟渲染,未命中由 dict.html 走 URL 兜底查)
    if (_dictCache[word]) {
        payload.dictData = _dictCache[word];
        var videoWord = (_dictCache[word].prototype || word).toLowerCase();
        var cachedVideo = _videoSearchCache[videoWord];
        if (cachedVideo && cachedVideo.length) {
            payload.videoList = cachedVideo;
        }
    }

    try {
        sessionStorage.setItem('dictPayload', JSON.stringify(payload));
    } catch (e) { }

    var url = '/dict.html?word=' + encodeURIComponent(word);
    if (isMobileDevice()) {
        location.href = url;
    } else {
        window.open(url, '_blank');
    }
}

/* === 移动端判断（用于决定翻译页/视频页打开方式） === */
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent);
}

/* === 上下篇导航 === */
function goPrev(bookId, id) { if (id > 1) location.hash = '#/book/' + bookId + '/passage/p' + String(id - 1).padStart(3, '0'); }
function goNext(bookId, id) { if (id < TOTAL) location.hash = '#/book/' + bookId + '/passage/p' + String(id + 1).padStart(3, '0'); }

/* === 启动 === */
router();