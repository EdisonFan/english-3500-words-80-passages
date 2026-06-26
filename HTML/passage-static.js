/* === 静态版交互脚本（开关 + 单词弹窗，加载本地缓存释义） === */
var modalBg = document.getElementById('modalBg');
var modalContent = document.getElementById('modalContent');
var modalClose = document.getElementById('modalClose');

/* === 中文释义开关 === */
var glossOn = true;
try { if (localStorage.getItem('spa_gloss') === 'off') glossOn = false; } catch(e) {}
function applyGloss(){
    var t = document.getElementById('glossToggle');
    if(!t) return;
    if(glossOn){
        document.body.classList.remove('no-gloss');
        t.classList.remove('off');
        t.querySelector('.g-label').textContent = '中文释义';
    } else {
        document.body.classList.add('no-gloss');
        t.classList.add('off');
        t.querySelector('.g-label').textContent = '已隐藏';
    }
}

/* === 中文译文开关 === */
var transOn = false;
try { if (localStorage.getItem('spa_trans') === 'on') transOn = true; } catch(e) {}
function applyTrans(){
    var t = document.getElementById('transToggle');
    if(!t) return;
    if(transOn){
        document.body.classList.add('show-trans');
        t.classList.remove('off');
        t.querySelector('.t-label').textContent = '中文译文';
    } else {
        document.body.classList.remove('show-trans');
        t.classList.add('off');
        t.querySelector('.t-label').textContent = '译文隐藏';
    }
}

applyGloss();
applyTrans();

document.getElementById('glossToggle').addEventListener('click', function(){
    glossOn = !glossOn;
    try { localStorage.setItem('spa_gloss', glossOn ? 'on' : 'off'); } catch(e) {}
    applyGloss();
});
document.getElementById('transToggle').addEventListener('click', function(){
    transOn = !transOn;
    try { localStorage.setItem('spa_trans', transOn ? 'on' : 'off'); } catch(e) {}
    applyTrans();
});

/* === HTML 转义 === */
function esc(text){
    if(!text) return '';
    return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* === 本地缓存读取（内存缓存 + fetch 文件） === */
var _dictCache = {};
function safeFilename(word){
    var s = String(word).trim().toLowerCase().replace(/[^\w\-]/g, '_');
    return s || 'unknown';
}

function loadDict(word){
    word = String(word).toLowerCase().trim();
    if(!word) return Promise.resolve(null);
    if(_dictCache[word]) return Promise.resolve(_dictCache[word]);
    var file = 'dict/' + safeFilename(word) + '.json';
    return fetch(file)
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(d){
            // 未找到时，尝试去掉所有格/复数后回退查原形
            if(!d || !d.found){
                var base = word.replace(/(’s|'s|s’|’)$/g, '').replace(/s$/i, '');
                if(base && base !== word){
                    return loadDict(base).then(function(d2){
                        var result = d2 || d;
                        _dictCache[word] = result;
                        return result;
                    });
                }
            }
            _dictCache[word] = d;
            return d;
        })
        .catch(function(){ return null; });
}

/* === 弹窗渲染（复制自 app.js renderDictModal） === */
function renderDictModal(data, fallbackWord){
    var html = '<div class="modal-eyebrow">Dictionary</div>';
    var word = (data && data.word) || fallbackWord || '';

    if(!data || !data.found){
        html += '<div class="modal-word">' + esc(word) + '</div>';
        html += '<div class="modal-dict-empty">该词释义暂未预缓存</div>';
        modalContent.innerHTML = html;
        modalBg.classList.add('active');
        return;
    }

    html += '<div class="modal-word">' + esc(data.word) + '</div>';

    // 音标 + 发音按钮
    var phonRow = '<div class="modal-phon-row">';
    if(data.phonetic_uk || data.audio_uk){
        phonRow += '<div class="phon-block">';
        if(data.phonetic_uk) phonRow += '<span class="phon-text">' + esc(data.phonetic_uk) + '</span>';
        if(data.audio_uk) phonRow += '<button class="audio-btn" onclick="playAudio(this, \'' + esc(data.audio_uk) + '\')"><span class="audio-icon">🔊</span>英</button>';
        phonRow += '</div>';
    }
    if(data.phonetic_us || data.audio_us){
        phonRow += '<div class="phon-block">';
        if(data.phonetic_us) phonRow += '<span class="phon-text">' + esc(data.phonetic_us) + '</span>';
        if(data.audio_us) phonRow += '<button class="audio-btn" onclick="playAudio(this, \'' + esc(data.audio_us) + '\')"><span class="audio-icon">🔊</span>美</button>';
        phonRow += '</div>';
    }
    phonRow += '</div>';
    if(data.phonetic_uk || data.phonetic_us || data.audio_uk || data.audio_us) html += phonRow;

    // 中文释义
    if(data.defs && data.defs.length){
        html += '<div class="modal-defs">';
        data.defs.forEach(function(d){
            html += '<div class="modal-def">';
            if(d.pos) html += '<span class="pos">' + esc(d.pos) + '</span>';
            if(d.meaning) html += '<span class="meaning">' + esc(d.meaning) + '</span>';
            html += '</div>';
        });
        html += '</div>';
    }

    // 变形
    if(data.forms && data.forms.length){
        html += '<div class="modal-forms-group">';
        html += '<span class="forms-label">变形</span>';
        var formsText = data.forms.map(function(f){ return esc(f.name) + ': ' + esc(f.value); }).join('；');
        html += '<span class="forms-list">' + formsText + '</span>';
        html += '</div>';
    }

    // 双语例句
    if(data.examples && data.examples.length){
        html += '<div class="modal-examples-group">';
        html += '<div class="examples-label">双语例句</div>';
        data.examples.forEach(function(ex){
            html += '<div class="modal-example">';
            html += '<div class="example-en">' + esc(ex.en) + '</div>';
            html += '<div class="example-zh">' + esc(ex.zh) + '</div>';
            html += '</div>';
        });
        html += '</div>';
    }

    // 同义词
    if(data.synonyms && data.synonyms.length){
        html += '<div class="modal-syn-group">';
        html += '<div class="syn-label">同义词</div>';
        data.synonyms.forEach(function(syn){
            html += '<div class="syn-item">';
            if(syn.pos) html += '<span class="syn-pos">' + esc(syn.pos) + '</span>';
            if(syn.meaning) html += '<span class="syn-meaning">' + esc(syn.meaning) + '</span>';
            html += '<span class="syn-words">' + esc(syn.words.join(', ')) + '</span>';
            html += '</div>';
        });
        html += '</div>';
    }

    modalContent.innerHTML = html;
    modalBg.classList.add('active');
}

/* 播放发音音频 */
function playAudio(btn, src){
    if(event) event.stopPropagation();
    try {
        var audio = new Audio(src);
        audio.play().catch(function(){});
        btn.classList.add('playing');
        setTimeout(function(){ btn.classList.remove('playing'); }, 600);
    } catch(e) {}
}

/* === 单词点击 === */
function handleWordClick(e){
    var target = e.target.closest('.w, .w-raw');
    if(!target) return;
    e.stopPropagation();
    target.classList.remove('pulsed');
    void target.offsetWidth;
    target.classList.add('pulsed');

    var word = target.getAttribute('data-key') || target.getAttribute('data-word') || '';
    if(!word) return;
    // loading 占位
    modalContent.innerHTML = '<div class="modal-eyebrow">Dictionary</div><div class="modal-word">' + esc(word) + '</div><div class="modal-dict-loading"><span class="dict-spinner"></span>查询中…</div>';
    modalBg.classList.add('active');

    loadDict(word).then(function(d){
        renderDictModal(d, word);
    });
}

document.addEventListener('click', handleWordClick);
modalClose.addEventListener('click', function(){ modalBg.classList.remove('active'); });
modalBg.addEventListener('click', function(e){ if(e.target === modalBg) modalBg.classList.remove('active'); });
