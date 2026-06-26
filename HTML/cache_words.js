// 拉取指定文章的所有单词释义，缓存到 HTML/dict/<word>.json
// 复用 spapro/server.py 的有道 jsonapi 解析逻辑
var fs = require('fs');
var { execSync } = require('child_process');
var path = require('path');

var passageId = parseInt(process.argv[2] || '1', 10);
var num = String(passageId).padStart(2, '0');
var dataPath = '/workspace/spapro/data/p' + num + '.json';
var cacheDir = '/workspace/HTML/dict';

fs.mkdirSync(cacheDir, { recursive: true });

var data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// 1. vocab 列表的单词
var vocabWords = (data.vocab || []).map(function(v){ return v.word; });

// 2. 正文中所有英文单词（含非高亮的普通词）
var bodyWords = [];
(data.paragraphs || []).forEach(function(p){
    var en = p.en || '';
    // 去掉 {word} 的大括号，保留词
    var cleaned = en.replace(/\{([^}]+)\}/g, '$1');
    // 提取所有英文单词（含撇号），去首尾撇号
    var re = /[A-Za-z][A-Za-z']*/g;
    var m;
    while((m = re.exec(cleaned)) !== null){
        var w = m[0].replace(/^'+|'+$/g, '');
        if(w) bodyWords.push(w.toLowerCase());
    }
});

// 合并去重
var words = Array.from(new Set(vocabWords.concat(bodyWords)));

console.log('Passage ' + num + ' 共 ' + words.length + ' 个单词，开始拉取...');

function safeFilename(word){
    return String(word).trim().toLowerCase().replace(/[^\w\-]/g, '_') || 'unknown';
}

// 词性分割（复制自 server.py _split_pos）
function splitPos(text){
    var m = String(text).match(/^((?:n|v|vi|vt|aux|adj|adv|prep|conj|pron|num|art|int|abbr|det)\.)\s*(.*)/);
    if(m) return [m[1], m[2].trim()];
    return ['', String(text).trim()];
}

function fetchYoudao(word){
    var encoded = encodeURIComponent(word);
    var url = 'https://dict.youdao.com/jsonapi?q=' + encoded;
    try {
        var body = execSync('curl -s --max-time 10 -A "Mozilla/5.0" -H "Accept: application/json" "' + url + '"', { encoding: 'utf8', timeout: 15000 });
        return JSON.parse(body);
    } catch(e){ return null; }
}

function parseResult(word, data){
    var result = {
        word: word, found: false,
        phonetic_uk: '', phonetic_us: '',
        audio_uk: '', audio_us: '',
        defs: [], forms: [], examples: [], synonyms: []
    };
    if(!data) return result;

    // 1. ec (英汉词典)
    var ec = data.ec || {};
    var ecWordList = ec.word || [];
    if(ecWordList.length){
        var ecWord = ecWordList[0];
        result.found = true;
        result.phonetic_uk = ecWord.ukphone || '';
        result.phonetic_us = ecWord.usphone || '';
        var audioWord = encodeURIComponent(word);
        result.audio_uk = 'https://dict.youdao.com/dictvoice?audio=' + audioWord + '&type=1';
        result.audio_us = 'https://dict.youdao.com/dictvoice?audio=' + audioWord + '&type=2';
        // 中文释义
        var trs = ecWord.trs || [];
        trs.forEach(function(tr){
            var trList = tr.tr || [];
            trList.forEach(function(trItem){
                var l = trItem.l || {};
                var iList = l.i || [];
                var parts = [];
                iList.forEach(function(iItem){
                    if(typeof iItem === 'object') parts.push(iItem['#text'] || '');
                    else parts.push(String(iItem));
                });
                var full = parts.join('').trim();
                if(full){
                    var sp = splitPos(full);
                    result.defs.push({ pos: sp[0], meaning: sp[1] });
                }
            });
        });
        // 变形
        var wfs = ecWord.wfs || [];
        wfs.forEach(function(wfItem){
            var wf = wfItem.wf || {};
            var name = wf.name || '';
            var value = wf.value || '';
            if(name && value) result.forms.push({ name: name, value: value });
        });
    }

    // 2. simple 兜底
    if(!result.defs.length){
        var simple = data.simple || {};
        var swList = simple.word || [];
        if(swList.length){
            var sw = swList[0];
            result.found = true;
            var means = sw.explain || '';
            if(means){
                means.split(';').forEach(function(m){
                    m = m.trim();
                    if(m){
                        var sp = splitPos(m);
                        result.defs.push({ pos: sp[0], meaning: sp[1] });
                    }
                });
            }
        }
    }

    // 3. 双语例句
    var blng = data.blng_sents_part || {};
    var pairs = blng['sentence-pair'] || [];
    pairs.slice(0, 5).forEach(function(p){
        var en = (p['sentence-eng'] || '').trim().replace(/<\/?b>/g, '');
        var zh = (p['sentence-translation'] || '').trim();
        if(en && zh) result.examples.push({ en: en, zh: zh });
    });

    // 4. 同义词
    var synoRoot = data.syno || {};
    var synos = synoRoot.synos || [];
    synos.slice(0, 3).forEach(function(s){
        var syno = s.syno || {};
        var pos = syno.pos || '';
        var tran = syno.tran || '';
        var ws = syno.ws || [];
        var words = ws.map(function(w){ return w.w || ''; }).filter(Boolean);
        if(words.length) result.synonyms.push({ pos: pos, meaning: tran, words: words });
    });

    return result;
}

function sleep(ms){ require('child_process').execSync('sleep ' + (ms/1000)); }

(function(){
    var ok = 0, fail = 0, cached = 0;
    for(var i = 0; i < words.length; i++){
        var word = words[i];
        var cachePath = path.join(cacheDir, safeFilename(word) + '.json');
        // 已缓存则跳过
        if(fs.existsSync(cachePath)){
            cached++;
            continue;
        }
        process.stdout.write('[' + (i+1) + '/' + words.length + '] ' + word + ' ... ');
        var raw = fetchYoudao(word);
        var result = parseResult(word, raw);
        fs.writeFileSync(cachePath, JSON.stringify(result, null, 2), 'utf8');
        if(result.found){ ok++; console.log('OK'); }
        else { fail++; console.log('未找到'); }
        sleep(300); // 避免请求过快
    }
    console.log('\n完成：新增 ' + ok + ' 个，未找到 ' + fail + ' 个，已缓存跳过 ' + cached + ' 个');
    console.log('缓存目录：' + cacheDir);
})();
