/*!
 * 听力朗读组件 · 80 篇精读
 * ---------------------------------------------------------------
 * 音频由 GitHub Actions + 微软 Edge TTS 生成（en-US-AriaNeural, -20%），
 * 发布在仓库的 tts-audio 分支 / tts-3 Release 上。
 *
 * 用法（零依赖）：
 *   文章页：<body data-passage="07">  +  <script src="listen.js"></script>
 *   首页  ：<script src="listen.js"></script>（自动扫描 .passage-item）
 *   SPA   ：渲染完成后调用 Listen.mountPassage(n) / Listen.mountHome()
 *
 * 离线使用：把 80 个 mp3 放在页面同目录，并在引入本脚本前设置
 *   <script>window.LISTEN_LOCAL = true;</script>
 * 组件会优先读相对路径 pNN.mp3，失败再回退到 CDN / Release。
 */
(function (global) {
    'use strict';

    var REPO = 'EdisonFan/english-3500-words-80-passages';
    var BRANCH = 'tts-audio';
    var RELEASE = 'tts-3';
    var CDN = 'https://cdn.jsdelivr.net/gh/' + REPO + '@' + BRANCH + '/';
    var FALLBACK = 'https://github.com/' + REPO + '/releases/download/' + RELEASE + '/';

    var doc = global.document;
    var localFirst = !!global.LISTEN_LOCAL
        || /[?&]local=1(?:&|$)/.test(global.location ? global.location.search : '');

    function pad(n) {
        n = parseInt(n, 10) || 1;
        return (n < 10 ? '0' : '') + n;
    }

    /** 返回某篇的候选音频地址（按优先级）。失败会自动尝试下一个。 */
    function urls(n) {
        var file = 'p' + pad(n) + '.mp3';
        return localFirst
            ? [file, CDN + file, FALLBACK + file]
            : [CDN + file, FALLBACK + file, file];
    }

    function fmt(sec) {
        if (!isFinite(sec) || sec < 0) { sec = 0; }
        var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function el(tag, cls, text) {
        var node = doc.createElement(tag);
        if (cls) { node.className = cls; }
        if (text !== undefined) { node.textContent = text; }
        return node;
    }

    /* ---------------------------------------------------------------
     * 单例播放器：首页 80 个按钮共用一个 Audio，避免多段音频叠播
     * --------------------------------------------------------------- */
    var shared = null;      // Audio
    var sharedBtn = null;   // 当前高亮的按钮
    var sharedId = null;

    function stopShared() {
        if (shared) {
            try { shared.pause(); } catch (e) { }
        }
        if (sharedBtn) { sharedBtn.classList.remove('playing'); sharedBtn.textContent = '🔊 听力'; }
        sharedBtn = null;
        sharedId = null;
    }

    function toggleListAudio(id, btn) {
        if (sharedId === id && shared && !shared.paused) {
            stopShared();
            return;
        }
        stopShared();
        var list = urls(id);
        var idx = 0;
        shared = new Audio();
        shared.preload = 'none';
        sharedBtn = btn;
        sharedId = id;
        btn.classList.add('playing');
        btn.textContent = '⏸ 暂停';

        shared.addEventListener('error', function () {
            idx += 1;
            if (idx < list.length) {
                shared.src = list[idx];
                shared.load();
                shared.play().catch(function () { });
            } else {
                btn.textContent = '⚠ 加载失败';
                btn.classList.remove('playing');
            }
        });
        shared.addEventListener('ended', stopShared);
        shared.src = list[idx];
        var p = shared.play();
        if (p && p.catch) {
            p.catch(function () {
                // 自动播放被浏览器拦截时，保留按钮状态供用户再点一次
                btn.textContent = '▶ 播放';
            });
        }
    }

    /** 首页：给每个 .passage-item 追加「听力」按钮（事件委托，不嵌套 button） */
    function mountHome() {
        if (!doc) { return; }
        var items = doc.querySelectorAll('.passage-item');
        if (!items.length) { return; }
        Array.prototype.forEach.call(items, function (item) {
            if (item.querySelector('.pi-listen')) { return; }
            var href = item.getAttribute('href') || '';
            var m = href.match(/(\d{1,2})(?:\.html)?$/);
            var id = m ? parseInt(m[1], 10) : 0;
            if (!id || id < 1 || id > 80) { return; }
            var btn = el('span', 'pi-listen');
            btn.setAttribute('role', 'button');
            btn.setAttribute('tabindex', '0');
            btn.setAttribute('data-id', String(id));
            btn.setAttribute('title', '播放第 ' + id + ' 篇慢速朗读');
            btn.textContent = '🔊 听力';
            item.appendChild(btn);
        });
        // 委托到 document，兼容 SPA 重新渲染
        if (!mountHome._bound) {
            doc.addEventListener('click', function (e) {
                var t = e.target;
                var btn = t && t.closest ? t.closest('.pi-listen') : null;
                if (!btn) { return; }
                e.preventDefault();
                e.stopPropagation();
                toggleListAudio(parseInt(btn.getAttribute('data-id'), 10), btn);
            });
            doc.addEventListener('keydown', function (e) {
                if (e.key !== 'Enter' && e.key !== ' ') { return; }
                var btn = e.target && e.target.closest ? e.target.closest('.pi-listen') : null;
                if (!btn) { return; }
                e.preventDefault();
                toggleListAudio(parseInt(btn.getAttribute('data-id'), 10), btn);
            });
            mountHome._bound = true;
        }
    }

    /* ---------------------------------------------------------------
     * 文章页：插入一条听力栏（大播放按钮 + 原生 controls + 下载）
     * --------------------------------------------------------------- */
    function mountPassage(n) {
        if (!doc) { return; }
        n = parseInt(n, 10);
        if (!n || n < 1 || n > 80) { return; }
        stopShared();

        var old = doc.getElementById('listenBar');
        if (old && old.parentNode) { old.parentNode.removeChild(old); }

        var list = urls(n);
        var bar = el('div', 'listen-bar');
        bar.id = 'listenBar';

        var inner = el('div', 'listen-bar-inner');

        var ico = el('span', 'listen-ico', '🎧');
        var meta = el('div', 'listen-meta');
        meta.appendChild(el('strong', '', '本篇听力朗读'));
        meta.appendChild(el('small', '', '慢速 -20% · 美音女声 · 第 ' + n + ' 篇'));

        var play = el('button', 'listen-play', '▶ 播放');
        play.type = 'button';
        play.setAttribute('aria-label', '播放本篇朗读');

        var dl = el('a', 'listen-dl', '下载');
        dl.href = list[0];
        dl.setAttribute('download', 'p' + pad(n) + '.mp3');
        dl.setAttribute('target', '_blank');
        dl.setAttribute('rel', 'noopener');

        inner.appendChild(ico);
        inner.appendChild(meta);
        inner.appendChild(play);
        inner.appendChild(dl);
        bar.appendChild(inner);

        var row = el('div', 'listen-row');
        var audio = el('audio', 'listen-audio');
        audio.id = 'listenAudio';
        audio.controls = true;
        audio.preload = 'none';
        audio.src = list[0];
        var time = el('span', 'listen-time', '0:00 / --:--');
        row.appendChild(audio);
        row.appendChild(time);
        bar.appendChild(row);

        var idx = 0;
        audio.addEventListener('error', function () {
            idx += 1;
            if (idx < list.length) {
                audio.src = list[idx];
                dl.href = list[idx];
                audio.load();
            } else {
                time.textContent = '音频加载失败，点「下载」另存';
            }
        });
        audio.addEventListener('loadedmetadata', function () {
            time.textContent = '0:00 / ' + fmt(audio.duration);
        });
        audio.addEventListener('timeupdate', function () {
            time.textContent = fmt(audio.currentTime) + ' / ' + fmt(audio.duration);
        });
        audio.addEventListener('play', function () { play.textContent = '⏸ 暂停'; play.classList.add('playing'); });
        audio.addEventListener('pause', function () { play.textContent = '▶ 播放'; play.classList.remove('playing'); });
        audio.addEventListener('ended', function () { play.textContent = '↻ 重播'; play.classList.remove('playing'); });

        play.addEventListener('click', function () {
            if (audio.paused) {
                audio.play().catch(function () { });
            } else {
                audio.pause();
            }
        });

        // 插到正文之前（.wrap 前），没有就插到 #app 最前
        var anchor = doc.querySelector('.wrap');
        if (anchor && anchor.parentNode) {
            anchor.parentNode.insertBefore(bar, anchor);
        } else {
            var container = doc.getElementById('app') || doc.body;
            container.insertBefore(bar, container.firstChild);
        }
        return bar;
    }

    /* ---------------------------------------------------------------
     * 自动初始化
     * --------------------------------------------------------------- */
    function auto() {
        if (!doc) { return; }
        var bodyId = doc.body && doc.body.getAttribute('data-passage');
        if (bodyId) { mountPassage(parseInt(bodyId, 10)); }
        if (doc.querySelector('.passage-item')) { mountHome(); }
    }

    global.Listen = {
        urls: urls,
        mountPassage: mountPassage,
        mountHome: mountHome,
        stop: stopShared,
        auto: auto
    };

    if (doc) {
        if (doc.readyState === 'loading') {
            doc.addEventListener('DOMContentLoaded', auto);
        } else {
            auto();
        }
    }
})(window);
