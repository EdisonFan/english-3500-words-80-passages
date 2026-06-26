// 生成静态第一篇 passage-01.html
// 复用 spapro/app.js 的渲染逻辑，内联 p01 数据
var fs = require('fs');
var data = JSON.parse(fs.readFileSync('/workspace/spapro/data/p01.json', 'utf8'));

var TOTAL = 80;
var id = 1;
var num = String(id).padStart(2, '0');

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

function esc(text){
    if(!text) return '';
    return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* === 高亮词渲染（复制自 app.js） === */
function highlightWords(enText, vocab){
    var parts = enText.split(/(\{[^}]+\})/g);
    var html = '';
    parts.forEach(function(part){
        var m = part.match(/^\{([^}]+)\}$/);
        if(m){
            var key = m[1];
            var entry = findVocab(key, vocab);
            if(entry){
                var outlineClass = entry.type === 'outline' ? ' outline' : '';
                var ctxHtml = entry.ctx ? '<span class="w-g">'+esc(entry.ctx)+'</span>' : '';
                html += '<span class="wn"><span class="w'+outlineClass+'" data-key="'+esc(key)+'">'+
                        esc(entry.display || key)+'</span>'+ctxHtml+'</span>';
            } else {
                html += makeRawWordSpan(key);
            }
        } else {
            html += tokenizeAndWrap(part);
        }
    });
    return html;
}

function tokenizeAndWrap(text){
    if(!text) return '';
    var html = '';
    var re = /([A-Za-z][A-Za-z']*)/g;
    var lastIdx = 0;
    var match;
    while((match = re.exec(text)) !== null){
        if(match.index > lastIdx) html += esc(text.slice(lastIdx, match.index));
        html += makeRawWordSpan(match[1]);
        lastIdx = re.lastIndex;
    }
    if(lastIdx < text.length) html += esc(text.slice(lastIdx));
    return html;
}

function makeRawWordSpan(word){
    var display = String(word).replace(/^'+|'+$/g, '');
    if(!display) return esc(word);
    var query = display.toLowerCase();
    return '<span class="w-raw" data-word="'+esc(query)+'">'+esc(display)+'</span>';
}

function uniq(list){
    var seen = {}, out = [];
    for(var i=0;i<list.length;i++){
        var v = list[i];
        if(!v||seen[v]) continue;
        seen[v] = true;
        out.push(v);
    }
    return out;
}
function stripEdgePunct(s){
    return String(s).replace(/^[\s“”"‘’'()\[\]{}]+/g,'').replace(/[\s“”"‘’'()\[\]{}.,!?;:]+$/g,'');
}
function buildCandidates(s){
    var base = String(s||''), lower = base.toLowerCase();
    var c1 = stripEdgePunct(base), c2 = stripEdgePunct(lower);
    var c3 = c1.replace(/(’s|'s|s’|’)$|('$)/g,'');
    var c4 = c2.replace(/(’s|'s|s’|’)$|('$)/g,'');
    return uniq([base, lower, c1, c2, c3, c4]);
}
function findVocab(key, vocab){
    var candidates = buildCandidates(key);
    for(var c=0;c<candidates.length;c++){
        var cand = candidates[c];
        for(var i=0;i<vocab.length;i++) if(vocab[i].word === cand) return vocab[i];
    }
    for(var c2=0;c2<candidates.length;c2++){
        var cand2 = candidates[c2];
        for(var j=0;j<vocab.length;j++){
            var forms = vocab[j].forms || [];
            for(var k=0;k<forms.length;k++) if(forms[k].surface === cand2) return vocab[j];
        }
    }
    return null;
}

function renderVocabCard(v){
    var outlineClass = v.type === 'outline' ? ' outline' : '';
    var star = v.type === 'outline' ? '<span class="star">*</span>' : '';
    var ctxHtml = v.ctx ? '<span class="card-ctx">'+esc(v.ctx)+'</span>' : '';
    return '<div class="card'+outlineClass+'">' +
        '<div class="card-top"><span class="card-word">'+esc(v.word)+star+'</span></div>' +
        ctxHtml + '</div>';
}

/* === 组装 HTML === */
var html = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n' +
'<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
'<title>PASSAGE 01 · 高考英语 3500 词</title>\n<link rel="stylesheet" href="style.css">\n</head>\n<body>\n';

// 顶栏
html += '<div id="app"><div class="topbar"><div class="topbar-inner">' +
    '<div class="topbar-left" onclick="location.href=\'index.html\'">' +
    '<span class="dot"></span><span>PASSAGE ' + num + ' / ' + TOTAL + '</span></div>' +
    '<div class="topbar-right">' +
    '<span class="gloss-toggle" id="glossToggle" title="显示/隐藏英文词下方中文注释">' +
    '<span class="g-dot"></span><span class="g-label">中文释义</span></span>' +
    '<span class="trans-toggle" id="transToggle" title="显示/隐藏段落中文翻译">' +
    '<span class="t-dot"></span><span class="t-label">中文译文</span></span>' +
    '<span>Words <b>' + (data.stats.words || '') + '</b></span>' +
    '<span>Core <b>' + (data.stats.core || '') + '</b></span>' +
    '<button class="nav-btn" onclick="location.href=\'index.html\'" disabled>← 上一篇</button>' +
    '<button class="nav-btn" onclick="location.href=\'passage-02.html\'">下一篇 →</button>' +
    '</div></div></div>';

// 正文
var unitTitle = '';
for(var i=0;i<UNITS.length;i++){ if(id>=UNITS[i].start && id<=UNITS[i].end){ unitTitle = UNITS[i].title; break; } }
html += '<div class="wrap"><article class="article">' +
    '<div class="section-tag">English · ' + esc(unitTitle) + '</div>';

data.paragraphs.forEach(function(p){
    html += '<div class="para"><div class="para-num">' + p.num + '</div>' +
            '<p class="eng">' + highlightWords(p.en, data.vocab) + '</p>' +
            (p.cn ? '<p class="cn">' + p.cn + '</p>' : '') +
            '</div>';
});
html += '</article>';

// 词表
html += '<section class="vocab"><div class="vocab-head">' +
    '<h2>核心<em>词表</em></h2>' +
    '<div class="legend"><span class="l-core">核心词</span><span class="l-out">大纲词 *</span></div>' +
    '</div><div class="vocab-grid">';
data.vocab.forEach(function(v){ html += renderVocabCard(v); });
html += '</div></section></div>';

// 页脚
html += '<footer>PASSAGE ' + num + ' · END</footer></div>';

// 弹窗结构
html += '<div class="modal-bg" id="modalBg"><div class="modal" id="modal">' +
    '<button class="modal-close" id="modalClose">✕</button><div id="modalContent"></div></div></div>';

// 内联数据 + 交互脚本
html += '<script>\n';
html += 'window.__VOCAB__ = ' + JSON.stringify(data.vocab) + ';\n';
html += fs.readFileSync('/workspace/HTML/passage-static.js', 'utf8');
html += '\n</script>\n';

html += '</body>\n</html>\n';

fs.writeFileSync('/workspace/HTML/passage-01.html', html, 'utf8');
console.log('passage-01.html 生成完成');
