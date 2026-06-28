/* === 高考英语 3500 词 SPA === */
var app = document.getElementById('app');
var modalBg = document.getElementById('modalBg');
var modalContent = document.getElementById('modalContent');
var modalClose = document.getElementById('modalClose');
var TOTAL = 80;  // 当前篇目数

/* === 16 个单元划分 === */
var UNITS = [
    { num: 1,  title: '校园生活',           start: 1,  end: 5  },
    { num: 2,  title: '教育与学习',         start: 6,  end: 10 },
    { num: 3,  title: '个人成长',           start: 11, end: 15 },
    { num: 4,  title: '自我管理',           start: 16, end: 20 },
    { num: 5,  title: '兴趣爱好',           start: 21, end: 25 },
    { num: 6,  title: '日常生活',           start: 26, end: 30 },
    { num: 7,  title: '健康生活',           start: 31, end: 35 },
    { num: 8,  title: '思维方式',           start: 36, end: 39 },
    { num: 9,  title: '社会交往',           start: 40, end: 45 },
    { num: 10, title: '工作与职业',         start: 46, end: 50 },
    { num: 11, title: '社会现象',           start: 51, end: 55 },
    { num: 12, title: '动物世界',           start: 56, end: 60 },
    { num: 13, title: '自然生态与环境保护', start: 61, end: 65 },
    { num: 14, title: '文学与艺术',         start: 66, end: 70 },
    { num: 15, title: '历史与文化',         start: 71, end: 75 },
    { num: 16, title: '科学与技术',         start: 76, end: 80 }
];

/* === 中文注释开关（全局） === */
var glossOn = true;
try {
    var saved = localStorage.getItem('spa_gloss');
    if (saved === 'off') glossOn = false;
} catch(e) {}

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
} catch(e) {}

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
    var hash = location.hash;
    var match = hash.match(/^#\/(\d+)$/);
    if (match) {
        renderPassage(parseInt(match[1], 10));
    } else {
        renderHome();
    }
}

/* === 首页 === */
function renderHome() {
    var html = '<div class="home">' +
        '<div class="home-head"><h1>高考英语 <em>3500 词</em></h1>' +
        '<p>80 篇精读 · 16 个单元 · 单词下方带上下文释义</p></div>';
    
    UNITS.forEach(function(unit) {
        html += '<div class="unit-section">' +
            '<div class="unit-head">' +
            '<span class="unit-num">UNIT ' + unit.num + '</span>' +
            '<span class="unit-title">' + unit.title + '</span>' +
            '<span class="unit-range">Passage ' + unit.start + '-' + unit.end + '</span>' +
            '</div><div class="passage-list">';
        
        for (var i = unit.start; i <= unit.end; i++) {
            var num = String(i).padStart(2, '0');
            html += '<a class="passage-item" href="#/' + i + '">' +
                    '<div class="pi-num">PASSAGE ' + num + '</div>' +
                    '<div class="pi-title">第 ' + i + ' 篇</div>' +
                    '<div class="pi-stats">点击阅读 →</div>' +
                    '</a>';
        }
        
        html += '</div></div>';
    });
    
    html += '</div>';
    app.innerHTML = html;
    window.scrollTo(0, 0);
}

/* === 渲染单篇 === */
function renderPassage(id) {
    if (id < 1 || id > TOTAL) { renderHome(); return; }
    
    fetch('data/p' + String(id).padStart(2, '0') + '.json')
        .then(function(r) { return r.json(); })
        .then(function(data) { renderPassageContent(id, data); })
        .catch(function(err) {
            app.innerHTML = '<div class="wrap"><div class="article"><p>加载失败：' + err.message + '</p></div></div>';
        });
}

function renderPassageContent(id, data) {
    var num = String(id).padStart(2, '0');
    
    // 缓存当前词表数据供弹窗使用
    window._currentVocab = data.vocab;
    
    // 1. 顶栏
    var html = '<div class="topbar"><div class="topbar-inner">' +
        '<div class="topbar-left" onclick="location.hash=\'#/\'">' +
        '<span class="dot"></span><span>PASSAGE ' + num + ' / ' + TOTAL + '</span></div>' +
        '<div class="topbar-right">' +
        '<span class="gloss-toggle" id="glossToggle" title="显示/隐藏英文词下方中文注释">' +
        '<span class="g-dot"></span><span class="g-label">中文释义</span></span>' +
        '<span class="trans-toggle" id="transToggle" title="显示/隐藏段落中文翻译">' +
        '<span class="t-dot"></span><span class="t-label">中文译文</span></span>' +
        '<span>Words <b>' + (data.stats.words || '') + '</b></span>' +
        '<span>Core <b>' + (data.stats.core || '') + '</b></span>' +
        '<button class="nav-btn" onclick="goPrev(' + id + ')" ' + (id <= 1 ? 'disabled' : '') + '>← 上一篇</button>' +
        '<button class="nav-btn" onclick="goNext(' + id + ')" ' + (id >= TOTAL ? 'disabled' : '') + '>下一篇 →</button>' +
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
    
    data.paragraphs.forEach(function(p) {
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
    
    data.vocab.forEach(function(v) {
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
    document.getElementById('glossToggle').addEventListener('click', function() {
        glossOn = !glossOn;
        try { localStorage.setItem('spa_gloss', glossOn ? 'on' : 'off'); } catch(e) {}
        applyGloss();
    });

    document.getElementById('transToggle').addEventListener('click', function() {
        transOn = !transOn;
        try { localStorage.setItem('spa_trans', transOn ? 'on' : 'off'); } catch(e) {}
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

    parts.forEach(function(part) {
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
    
    return '<div class="card' + outlineClass + '">' +
        '<div class="card-top"><span class="card-word">' + esc(v.word) + star + '</span></div>' +
        ctxHtml + '</div>';
}

/* === 单词点击 → 统一弹窗（事件委托） === */
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
    if (word) showDictModal(word);
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
        .then(function(r) { return r.json(); })
        .then(function(j) {
            _videoSearchCache[word] = (j && j.ok && j.list && j.list.length) ? j.list : [];
        })
        .catch(function(err) {
            // 获取失败也视为无视频,不显示按钮(后端日志已记录失败原因)
            _videoSearchCache[word] = [];
        })
        .then(function() {
            if (callback) callback();
        });
}

function showDictModal(word) {
    word = String(word || '').toLowerCase().trim();
    if (!word) return;

    // 先查内存缓存
    if (_dictCache[word]) {
        renderDictModal(_dictCache[word], _videoSearchCache[word]);
        // 视频列表没查过就异步补查,查完重新渲染弹窗(显示按钮)
        if (_videoSearchCache[word] === undefined) {
            _fetchVideoList(word, function() {
                renderDictModal(_dictCache[word], _videoSearchCache[word]);
            });
        }
        return;
    }

    // 显示 loading(此时视频还没查,不显示按钮)
    renderDictModal({ word: word, loading: true });

    // 查词典
    fetch('/api/dict?q=' + encodeURIComponent(word))
        .then(function(r) { return r.json(); })
        .then(function(data) {
            _dictCache[word] = data;
            renderDictModal(data, _videoSearchCache[word]);
        })
        .catch(function(err) {
            renderDictModal({ word: word, error: String(err.message || err) });
        });

    // 同时查视频列表(后端 _search_video 自带日志,这里只判断结果决定按钮显隐)
    if (_videoSearchCache[word] === undefined) {
        _fetchVideoList(word, function() {
            // 词典数据可能已回来,重新渲染弹窗(此时按钮按视频列表有无显示)
            if (_dictCache[word]) {
                renderDictModal(_dictCache[word], _videoSearchCache[word]);
            }
        });
    }
}

function renderDictModal(data, videoList) {
    var html = '<div class="modal-eyebrow">Dictionary</div>';

    // 视频按钮:只有确认获取到非空视频列表才显示
    // videoList 为 undefined(还没查)或 [](查了但没结果/失败)都不显示
    if (data.word && videoList && videoList.length) {
        html += '<button class="modal-video-btn" onclick="openVideoStage(\'' + esc(data.word) + '\')"><span class="mv-icon">▶</span> 教学视频</button>';
    }

    if (data.loading) {
        html += '<div class="modal-word">' + esc(data.word) + '</div>';
        html += '<div class="modal-dict-loading"><span class="dict-spinner"></span>查询中…</div>';
        modalContent.innerHTML = html;
        modalBg.classList.add('active');
        return;
    }

    if (data.error) {
        html += '<div class="modal-word">' + esc(data.word) + '</div>';
        html += '<div class="modal-dict-error">查询失败：' + esc(data.error) + '</div>';
        modalContent.innerHTML = html;
        modalBg.classList.add('active');
        return;
    }

    if (!data.found) {
        html += '<div class="modal-word">' + esc(data.word) + '</div>';
        html += '<div class="modal-dict-empty">未找到该词的释义</div>';
        modalContent.innerHTML = html;
        modalBg.classList.add('active');
        return;
    }

    // 单词
    html += '<div class="modal-word">' + esc(data.word) + '</div>';

    // 基础形式提示（所有格/缩写回退查询时显示）
    if (data.base_form) {
        html += '<div class="modal-base-form">← ' + esc(data.base_form) + ' 的所有格/缩写形式</div>';
    }

    // 音标 + 发音按钮（英式/美式分区）
    var phonRow = '<div class="modal-phon-row">';
    if (data.phonetic_uk || data.audio_uk) {
        phonRow += '<div class="phon-block">';
        if (data.phonetic_uk) phonRow += '<span class="phon-text">' + esc(data.phonetic_uk) + '</span>';
        if (data.audio_uk) phonRow += '<button class="audio-btn" onclick="playAudio(this, \'' + esc(data.audio_uk) + '\')"><span class="audio-icon">🔊</span>英</button>';
        phonRow += '</div>';
    }
    if (data.phonetic_us || data.audio_us) {
        phonRow += '<div class="phon-block">';
        if (data.phonetic_us) phonRow += '<span class="phon-text">' + esc(data.phonetic_us) + '</span>';
        if (data.audio_us) phonRow += '<button class="audio-btn" onclick="playAudio(this, \'' + esc(data.audio_us) + '\')"><span class="audio-icon">🔊</span>美</button>';
        phonRow += '</div>';
    }
    phonRow += '</div>';
    if (data.phonetic_uk || data.phonetic_us || data.audio_uk || data.audio_us) {
        html += phonRow;
    }

    // 中文释义（词性分区）
    if (data.defs && data.defs.length) {
        html += '<div class="modal-defs">';
        data.defs.forEach(function(d) {
            html += '<div class="modal-def">';
            if (d.pos) html += '<span class="pos">' + esc(d.pos) + '</span>';
            if (d.meaning) html += '<span class="meaning">' + esc(d.meaning) + '</span>';
            html += '</div>';
        });
        html += '</div>';
    }

    // 变形（复数/过去式等）
    if (data.forms && data.forms.length) {
        html += '<div class="modal-forms-group">';
        html += '<span class="forms-label">变形</span>';
        var formsText = data.forms.map(function(f) {
            return esc(f.name) + ': ' + esc(f.value);
        }).join('；');
        html += '<span class="forms-list">' + formsText + '</span>';
        html += '</div>';
    }

    // 双语例句
    if (data.examples && data.examples.length) {
        html += '<div class="modal-examples-group">';
        html += '<div class="examples-label">双语例句</div>';
        data.examples.forEach(function(ex, idx) {
            html += '<div class="modal-example">';
            html += '<div class="example-en">' + esc(ex.en) + '</div>';
            html += '<div class="example-zh">' + esc(ex.zh) + '</div>';
            html += '</div>';
        });
        html += '</div>';
    }

    // 同义词
    if (data.synonyms && data.synonyms.length) {
        html += '<div class="modal-syn-group">';
        html += '<div class="syn-label">同义词</div>';
        data.synonyms.forEach(function(syn) {
            html += '<div class="syn-item">';
            if (syn.pos) html += '<span class="syn-pos">' + esc(syn.pos) + '</span>';
            if (syn.meaning) html += '<span class="syn-meaning">' + esc(syn.meaning) + '</span>';
            html += '<span class="syn-words">' + esc(syn.words.join(', ')) + '</span>';
            html += '</div>';
        });
        html += '</div>';
    }

    // 数据源
    if (data.sources && data.sources.length) {
        var sourceLabels = { 'youdao': '有道词典' };
        var labels = data.sources.map(function(s) { return sourceLabels[s] || s; });
        html += '<div class="modal-dict-source">数据来源：' + esc(labels.join(' + ')) + '</div>';
    }

    modalContent.innerHTML = html;
    modalBg.classList.add('active');
}

/* 播放发音音频 */
function playAudio(btn, src) {
    // 阻止冒泡，避免触发弹窗关闭
    if (event) event.stopPropagation();
    try {
        var audio = new Audio(src);
        audio.play().catch(function() {});
        // 点击动画
        btn.classList.add('playing');
        setTimeout(function() { btn.classList.remove('playing'); }, 600);
    } catch(e) {}
}

var TAG_LABEL = {
    plural: '复数',
    past: '过去式',
    past_participle: '过去分词',
    ing: '现在分词',
    third_person: '第三人称单数',
    comparative: '比较级',
    superlative: '最高级',
    variant: '变体',
    abbrev: '缩写',
    alias: '别名'
};

/* === 弹窗关闭 === */
modalClose.addEventListener('click', function() { modalBg.classList.remove('active'); });
modalBg.addEventListener('click', function(e) {
    if (e.target === modalBg) modalBg.classList.remove('active');
});

/* === 单词教学视频层(抖音式上下滑动) === */
var videoStage = document.getElementById('videoStage');
var videoFeed = document.getElementById('videoFeed');
var videoStageClose = document.getElementById('videoStageClose');
// 视频流接口已合并进 spapro 同端口(8000),同源调用,无需跨域
var VIDEO_SERVER = '';
var _videoList = [];      // 搜索结果
var _videoIdx = 0;        // 当前播放索引
var _videoWord = '';      // 当前单词

// 打开视频层:关词典弹框 → 搜索 → 渲染 → 播第一个
function openVideoStage(word) {
    word = String(word || '').toLowerCase().trim();
    if (!word) return;
    _videoWord = word;
    _videoIdx = 0;

    // 关掉词典弹框
    modalBg.classList.remove('active');

    // 显示视频层
    videoStage.classList.add('active');

    // 优先用已缓存的视频列表(点按钮时通常已经查过了,避免重复请求)
    if (_videoSearchCache[word] && _videoSearchCache[word].length) {
        _videoList = _videoSearchCache[word];
        videoFeed.innerHTML = '';
        renderVideoFeed();
        setTimeout(function() { playVideoIdx(0); }, 100);
        return;
    }

    // 兜底:没缓存才请求(理论上走到这的概率很低,因为按钮显示说明已查过)
    videoFeed.innerHTML = '<div class="video-loading"><div class="video-spin"></div><div>搜索 "' + esc(word) + '" 的教学视频…</div></div>';
    _fetchVideoList(word, function() {
        if (!_videoSearchCache[word] || !_videoSearchCache[word].length) {
            videoFeed.innerHTML = '<div class="video-loading"><div>没找到 "' + esc(word) + '" 的教学视频</div></div>';
            return;
        }
        _videoList = _videoSearchCache[word];
        renderVideoFeed();
        setTimeout(function() { playVideoIdx(0); }, 100);
    });
}

// 渲染视频流:每屏一个视频
function renderVideoFeed() {
    var html = '';
    _videoList.forEach(function(v, i) {
        html += '<div class="video-card" data-idx="' + i + '">';
        html += '<video playsinline webkit-playsinline="true" preload="auto" loop controls controlslist="nodownload noplaybackrate noremoteplayback"';
        if (v.pic) html += ' poster="https:' + v.pic + '"';
        html += '></video>';
        html += '<div class="video-card-idx">' + (i + 1) + '/' + _videoList.length + '</div>';
        html += '<div class="video-card-info">';
        html += '<div class="video-card-word">' + esc(_videoWord) + '</div>';
        html += '<div class="video-card-title">' + esc(v.title) + '</div>';
        html += '<div class="video-card-meta">@' + esc(v.author) + ' · 播放 ' + fmtPlayCount(v.play) + ' · ' + esc(v.duration) + '</div>';
        html += '</div>';
        html += '</div>';
    });
    videoFeed.innerHTML = html;

    // 滚动监听(节流):停稳后切换播放
    var scrollTimer;
    videoFeed.onscroll = function() {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(function() {
            var idx = Math.round(videoFeed.scrollTop / videoFeed.clientHeight);
            if (idx !== _videoIdx) playVideoIdx(idx);
        }, 120);
    };
}

// 给当前视频设 src 并播放,预加载下一个,清理远处的释放带宽
function playVideoIdx(idx) {
    var cards = videoFeed.children;
    for (var i = 0; i < cards.length; i++) {
        var video = cards[i].querySelector('video');
        if (i === idx) {
            // 当前:设 src + 播放
            var srcUrl = VIDEO_SERVER + '/api/stream?bvid=' + _videoList[i].bvid;
            // src 没变就不重设,避免重启播放
            if (video.getAttribute('data-loaded') !== srcUrl) {
                video.src = srcUrl;
                video.setAttribute('data-loaded', srcUrl);
                video.load();
            }
            video.play().catch(function() {});
        } else if (i === idx + 1) {
            // 预加载下一个:设 src + load,但不 play(preload=auto 浏览器会预拉元数据和前段数据)
            var nextUrl = VIDEO_SERVER + '/api/stream?bvid=' + _videoList[i].bvid;
            if (video.getAttribute('data-loaded') !== nextUrl) {
                video.src = nextUrl;
                video.setAttribute('data-loaded', nextUrl);
                video.load();
            }
            video.pause();
        } else if (i === idx - 1) {
            // 上一个:已加载过,保留 src 但暂停(回滑时无需重新请求)
            video.pause();
        } else {
            // 远处:清掉 src 释放带宽和连接,避免同时拉 10 个流
            video.pause();
            if (video.src) {
                video.removeAttribute('src');
                video.removeAttribute('data-loaded');
                video.load();
            }
        }
    }
    _videoIdx = idx;
}

function fmtPlayCount(n) {
    n = Number(n) || 0;
    return n >= 10000 ? (n / 10000).toFixed(1) + '万' : n;
}

// 关闭视频层:暂停所有视频
videoStageClose.addEventListener('click', function() {
    var cards = videoFeed.children;
    for (var i = 0; i < cards.length; i++) {
        var video = cards[i].querySelector('video');
        if (video) { video.pause(); video.src = ''; }
    }
    videoStage.classList.remove('active');
});

/* === 上下篇导航 === */
function goPrev(id) { if (id > 1) location.hash = '#/' + (id - 1); }
function goNext(id) { if (id < TOTAL) location.hash = '#/' + (id + 1); }

/* === 启动 === */
router();