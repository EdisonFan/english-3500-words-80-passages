/* === 静态版交互脚本（开关 + 单词弹窗） === */
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

/* === 单词点击弹窗 === */
function findVocabEntry(key){
    var vocab = window.__VOCAB__ || [];
    function uniq(l){ var s={},o=[]; for(var i=0;i<l.length;i++){ if(l[i]&&!s[l[i]]){s[l[i]]=true;o.push(l[i]);} } return o; }
    function strip(s){ return String(s).replace(/^[\s“”"‘’'()\[\]{}]+/g,'').replace(/[\s“”"‘’'()\[\]{}.,!?;:]+$/g,''); }
    function cand(s){ var b=String(s||''),lo=b.toLowerCase(); return uniq([b,lo,strip(b),strip(lo)]); }
    var cs = cand(key);
    for(var c=0;c<cs.length;c++) for(var i=0;i<vocab.length;i++) if(vocab[i].word===cs[c]) return vocab[i];
    return null;
}

function handleWordClick(e){
    var target = e.target.closest('.w, .w-raw');
    if(!target) return;
    e.stopPropagation();
    target.classList.remove('pulsed');
    void target.offsetWidth;
    target.classList.add('pulsed');

    if(target.classList.contains('w')){
        var key = target.getAttribute('data-key') || '';
        var entry = findVocabEntry(key);
        showStaticModal({
            word: entry ? entry.word : key,
            ctx: entry ? entry.ctx : '',
            type: entry ? entry.type : ''
        });
    } else {
        var word = target.getAttribute('data-word') || '';
        showRawModal(word);
    }
}

function showStaticModal(d){
    var html = '<div class="modal-eyebrow">Vocabulary</div>';
    html += '<div class="modal-word">' + esc(d.word) + '</div>';
    if(d.ctx){
        html += '<div class="modal-defs"><div class="modal-def">' +
            '<span class="pos">' + (d.type==='core'?'核心':'大纲') + '</span>' +
            '<span class="meaning">' + esc(d.ctx) + '</span></div></div>';
    }
    html += '<div class="modal-dict-empty">单词释义暂未预缓存</div>';
    modalContent.innerHTML = html;
    modalBg.classList.add('active');
}

function showRawModal(word){
    var html = '<div class="modal-eyebrow">Dictionary</div>';
    html += '<div class="modal-word">' + esc(word) + '</div>';
    html += '<div class="modal-dict-empty">该词释义暂未预缓存</div>';
    modalContent.innerHTML = html;
    modalBg.classList.add('active');
}

document.addEventListener('click', handleWordClick);
modalClose.addEventListener('click', function(){ modalBg.classList.remove('active'); });
modalBg.addEventListener('click', function(e){ if(e.target === modalBg) modalBg.classList.remove('active'); });
