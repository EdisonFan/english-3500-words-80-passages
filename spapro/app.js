/* === 高考英语 3500 词 SPA === */
var app = document.getElementById('app');
var modalBg = document.getElementById('modalBg');
var modalContent = document.getElementById('modalContent');
var modalClose = document.getElementById('modalClose');
var TOTAL = 2;  // spapro 当前已迁移 Passage 1-2

/* === 16 个单元划分 === */
var UNITS = [
    { num: 1, title: '校园生活', start: 1, end: 2 }
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
                '<p class="eng">' + highlightWords(p.en, data.vocab) + '</p></div>';
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
    
    // 4. 译文
    html += '<section class="translation"><div class="translation-inner">' +
        '<div class="translation-head"><div class="label">Translation</div>' +
        '<h2>中文<em>译文</em></h2></div>';
    
    data.paragraphs.forEach(function(p) {
        if (p.cn) {
            html += '<div class="t-para"><div class="t-para-num">PARAGRAPH ' + p.num + '</div>' +
                    '<p>' + p.cn + '</p></div>';
        }
    });
    
    html += '</div></section>';
    
    // 5. 页脚
    html += '<footer>PASSAGE ' + num + ' · END</footer>';
    
    app.innerHTML = html;
    applyGloss();
    window.scrollTo(0, 0);
    
    // 绑定开关
    document.getElementById('glossToggle').addEventListener('click', function() {
        glossOn = !glossOn;
        try { localStorage.setItem('spa_gloss', glossOn ? 'on' : 'off'); } catch(e) {}
        applyGloss();
    });
    
    // 绑定高亮词点击（事件委托）
    app.addEventListener('click', handleWordClick);
}

/* === 高亮词渲染：把 {word} 标记转为 .wn 结构 === */
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
                html += '<span class="w-no-gloss">' + esc(key) + '</span>';
            }
        } else {
            html += esc(part);
        }
    });
    
    return html;
}

function findVocab(key, vocab) {
    for (var i = 0; i < vocab.length; i++) {
        if (vocab[i].word === key) return vocab[i];
    }
    for (var j = 0; j < vocab.length; j++) {
        var forms = vocab[j].forms || [];
        for (var k = 0; k < forms.length; k++) {
            if (forms[k].surface === key) return vocab[j];
        }
    }
    return null;
}

/* === 词表卡片渲染 === */
function renderVocabCard(v) {
    var outlineClass = v.type === 'outline' ? ' outline' : '';
    var star = v.type === 'outline' ? '<span class="star">*</span>' : '';
    
    var memoryHtml = renderMemory(v.memory, 'card');
    var defsHtml = renderDefs(v.defs || [], 'card');
    
    return '<div class="card' + outlineClass + '">' +
        '<div class="card-top"><span class="card-word">' + esc(v.word) + star + '</span>' +
        '<span class="card-phon">' + esc(v.phonetic) + '</span></div>' +
        memoryHtml + '<div class="card-def">' + defsHtml + '</div></div>';
}

function renderMemory(memory, scope) {
    if (!memory || !memory.length) return '';
    var cls = scope === 'modal' ? 'modal-extras' : 'card-extras';
    var itemCls = scope === 'modal' ? 'modal-extra mem' : 'extra mem';
    var html = '<div class="' + cls + '">';
    memory.forEach(function(text) {
        html += '<div class="' + itemCls + '"><span class="tag">记</span>' + esc(text) + '</div>';
    });
    html += '</div>';
    return html;
}

function renderDefs(defs, scope) {
    var html = '';
    defs.forEach(function(d) {
        if (scope === 'modal') {
            html += '<div class="modal-def"><span class="pos">' + esc(d.pos) + '</span><span class="meaning">' + esc(d.meaning) + '</span></div>';
            html += renderDefExtras(d.extras || [], 'modal');
        } else {
            if (d.pos) html += '<span class="pos">' + esc(d.pos) + '</span>';
            html += esc(d.meaning) + ' ';
            html += renderDefExtras(d.extras || [], 'card');
        }
    });
    return html.trim();
}

function renderDefExtras(extras, scope) {
    if (!extras || !extras.length) return '';
    var cls = scope === 'modal' ? 'modal-extras' : 'card-extras';
    var itemBase = scope === 'modal' ? 'modal-extra ' : 'extra ';
    var html = '<div class="' + cls + '">';
    extras.forEach(function(x) {
        var items = x.items || [];
        items.forEach(function(item) {
            html += '<div class="' + itemBase + esc(x.type) + '"><span class="tag">' + esc(x.label) + '</span>' + esc(item) + '</div>';
        });
    });
    html += '</div>';
    return html;
}

/* === 高亮词点击 → 弹窗（事件委托） === */
function handleWordClick(e) {
    var target = e.target.closest('.w');
    if (!target) return;
    
    e.stopPropagation();
    target.classList.remove('pulsed');
    void target.offsetWidth;
    target.classList.add('pulsed');
    showModal(target.getAttribute('data-key'));
}

function showModal(key) {
    // 需要当前篇目的 vocab 数据，从全局缓存取
    if (!window._currentVocab) return;
    var entry = findVocab(key, window._currentVocab);
    if (!entry) return;
    
    var html = '<div class="modal-eyebrow">Vocabulary</div>';
    html += '<div class="modal-word">' + esc(entry.word) + '</div>';
    html += '<div class="modal-phon">' + esc(entry.phonetic) + '</div>';
    html += renderMemory(entry.memory, 'modal');
    html += '<div class="modal-defs">' + renderDefs(entry.defs || [], 'modal') + '</div>';
    
    modalContent.innerHTML = html;
    modalBg.classList.add('active');
}

modalClose.addEventListener('click', function() { modalBg.classList.remove('active'); });
modalBg.addEventListener('click', function(e) {
    if (e.target === modalBg) modalBg.classList.remove('active');
});

/* === 上下篇导航 === */
function goPrev(id) { if (id > 1) location.hash = '#/' + (id - 1); }
function goNext(id) { if (id < TOTAL) location.hash = '#/' + (id + 1); }

/* === 启动 === */
router();
