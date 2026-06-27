var fs = require('fs');
var path = require('path');

var htmlDir = path.join(__dirname);
var dataDir = path.join(__dirname, '..', 'spapro', 'data');
var mappingPath = path.join(__dirname, 'mapping.json');
var passageStaticJsPath = path.join(__dirname, 'passage-static.js');
var TOTAL = 80;

if(!fs.existsSync(mappingPath)){
    console.error('映射表不存在，请先运行: node gen_font.js');
    process.exit(1);
}

var mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
var reverseMapping = {};
for(var k in mapping){ reverseMapping[mapping[k]] = k; }

var passageStaticJs = fs.readFileSync(passageStaticJsPath, 'utf8');

var startId = parseInt(process.argv[2] || '1', 10);
var endId = parseInt(process.argv[3] || '1', 10);

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

function mapChar(ch){
    return mapping[ch] || ch;
}

function mapText(text){
    return text.split('').map(mapChar).join('');
}

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
                var mappedKey = mapText(key);
                var mappedDisplay = mapText(entry.display || key);
                html += '<span class="wn"><span class="w'+outlineClass+'" data-key="'+esc(mappedKey)+'">'+
                        esc(mappedDisplay)+'</span>'+ctxHtml+'</span>';
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
    var mappedDisplay = mapText(display);
    var mappedQuery = mapText(query);
    return '<span class="w-raw" data-word="'+esc(mappedQuery)+'">'+esc(mappedDisplay)+'</span>';
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
    return String(s).replace(/^[\s""""''()'()\[\]{}]+/g,'').replace(/[\s""""''()'()\[\]{}.,!?;:]+$/g,'');
}
function buildCandidates(s){
    var base = String(s||''), lower = base.toLowerCase();
    var c1 = stripEdgePunct(base), c2 = stripEdgePunct(lower);
    var c3 = c1.replace(/('s|'s|s'|')|('$)/g,'');
    var c4 = c2.replace(/('s|'s|s'|')|('$)/g,'');
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
    var mappedWord = mapText(v.word);
    return '<div class="card'+outlineClass+'">' +
        '<div class="card-top"><span class="card-word">'+esc(mappedWord)+star+'</span></div>' +
        ctxHtml + '</div>';
}

function generatePassage(id){
    var num = String(id).padStart(2, '0');
    var dataPath = path.join(dataDir, 'p' + num + '.json');
    if(!fs.existsSync(dataPath)){
        console.log('  数据文件不存在: ' + dataPath);
        return false;
    }
    var data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

    var html = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n' +
    '<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '<title>PASSAGE ' + num + ' · 高考英语 3500 词</title>\n' +
    '<link rel="stylesheet" href="style.css">\n' +
    '<style>\n' +
    '@font-face {\n' +
    '  font-family: "AntiscrapeFont";\n' +
    '  src: url("fonts/custom.ttf") format("truetype");\n' +
    '  font-weight: normal;\n' +
    '  font-style: normal;\n' +
    '  font-display: swap;\n' +
    '}\n' +
    '.eng, .card-word { font-family: "AntiscrapeFont", serif !important; }\n' +
    '.w-g, .card-ctx, .cn { font-family: var(--font-cn), serif !important; }\n' +
    '.modal-word { font-family: var(--font-display), serif !important; }\n' +
    '</style>\n' +
    '</head>\n<body>\n';

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
        (id > 1 ? '<button class="nav-btn" onclick="location.href=\'passage-' + String(id-1).padStart(2,'0') + '.html\'">← 上一篇</button>'
                : '<button class="nav-btn" onclick="location.href=\'index.html\'" disabled>← 上一篇</button>') +
        (id < TOTAL ? '<button class="nav-btn" onclick="location.href=\'passage-' + String(id+1).padStart(2,'0') + '.html\'">下一篇 →</button>'
                    : '<button class="nav-btn" disabled>下一篇 →</button>') +
        '</div></div></div>';

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

    html += '<section class="vocab"><div class="vocab-head">' +
        '<h2>核心<em>词表</em></h2>' +
        '<div class="legend"><span class="l-core">核心词</span><span class="l-out">大纲词 *</span></div>' +
        '</div><div class="vocab-grid">';
    data.vocab.forEach(function(v){ html += renderVocabCard(v); });
    html += '</div></section></div>';

    html += '<footer>PASSAGE ' + num + ' · END</footer></div>';

    html += '<div class="modal-bg" id="modalBg"><div class="modal" id="modal">' +
        '<button class="modal-close" id="modalClose">✕</button><div id="modalContent"></div></div></div>';

    var mappedVocab = data.vocab.map(function(v){
        return { word: mapText(v.word), type: v.type, ctx: v.ctx };
    });

    html += '<script>\n';
    html += 'window.__REVERSE_MAP__ = ' + JSON.stringify(reverseMapping) + ';\n';
    html += 'window.__VOCAB__ = ' + JSON.stringify(mappedVocab) + ';\n';
    html += passageStaticJs;
    html += '\n</script>\n';

    html += '</body>\n</html>\n';

    var outPath = path.join(htmlDir, 'passage-' + num + '.html');
    fs.writeFileSync(outPath, html, 'utf8');
    return true;
}

var count = endId - startId + 1;
console.log('即将生成 passage-' + String(startId).padStart(2,'0') + ' 到 passage-' + String(endId).padStart(2,'0') + '，共 ' + count + ' 篇（含字体映射反爬）');

var readline = require('readline');
var rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('确认执行？(y/N) ', function(answer){
    rl.close();
    if(answer.toLowerCase() !== 'y'){
        console.log('已取消');
        return;
    }
    var ok = 0, fail = 0;
    for(var id = startId; id <= endId; id++){
        var num = String(id).padStart(2, '0');
        process.stdout.write('  passage-' + num + ' ... ');
        if(generatePassage(id)){
            ok++;
            console.log('OK');
        } else {
            fail++;
            console.log('FAIL');
        }
    }
    console.log('\n完成：成功 ' + ok + ' 篇，失败 ' + fail + ' 篇');
});