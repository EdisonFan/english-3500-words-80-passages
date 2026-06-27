#!/usr/bin/env python3
"""带词典代理 + 本地缓存的静态文件服务器，服务 spapro 应用。

- 静态文件：直接从当前目录提供
- 词典代理：GET /api/dict?q=<word>
    1. 先查 data/cache/<word>.json 本地缓存
    2. 缓存命中 → 直接返回
    3. 缓存未命中 → 调有道 jsonapi → 保存到 data/cache/ → 返回
    逐步积累本地词典库，避免依赖外网 API
    所有响应附加 CORS 头

- 视频搜索代理：GET /api/search-video?word=<word>
    代理调用 B 站搜索接口，关键词自动加 "单词 发音" 后缀，
    过滤时长 10s~5min，按播放量降序，返回前 10 条。
    返回结构里的 bvid 可直接喂给 videoServer 的 /api/stream 播放。
"""
import http.server
import socketserver
import urllib.request
import urllib.parse
import json
import os
import re
import threading

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(DIRECTORY, 'data', 'cache')

# 确保缓存目录存在
os.makedirs(CACHE_DIR, exist_ok=True)

# 进程内缓存（避免反复读盘）
_mem_cache = {}
_mem_cache_lock = threading.Lock()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/dict':
            params = urllib.parse.parse_qs(parsed.query)
            word = (params.get('q', [''])[0] or '').strip()
            if not word:
                self._send_json(400, {'error': '缺少参数 q'})
                return
            self._proxy_dict(word)
            return
        if parsed.path == '/api/search-video':
            params = urllib.parse.parse_qs(parsed.query)
            word = (params.get('word', [''])[0] or '').strip()
            if not word:
                self._send_json(400, {'error': '缺少参数 word'})
                return
            self._search_video(word)
            return
        super().do_GET()

    def _search_video(self, word):
        """代理 B 站搜索，返回适合学单词的教学视频列表。

        - 关键词加 "单词 发音" 后缀，过滤掉广告/产品视频
        - 过滤时长 10s~5min（太短的广告切片、太长的完整课都不要）
        - 按播放量降序，取前 10 条
        - 返回的 bvid 直接喂给 videoServer 的 /api/stream 播放
        """
        keyword = f'{word} 发音'  # 加后缀，搜教学视频而非产品/新闻
        # 注意：B站搜索接口要求空格编码成 + 而非 %20，否则 412
        encoded_kw = urllib.parse.quote_plus(keyword)
        url = ('https://api.bilibili.com/x/web-interface/search/type'
               f'?search_type=video&keyword={encoded_kw}'
               '&page=1&pagesize=30')
        try:
            req = urllib.request.Request(url, headers={
                # B 站搜索接口风控较严，实测组合：
                # - User-Agent 用短串 "Mozilla/5.0" 能过，长 UA 反而 412
                # - 必须带 Cookie 占位(buvid3)，否则 412
                # - 不能带 Referer，带 Referer 反而 412
                'User-Agent': 'Mozilla/5.0',
                'Cookie': 'buvid3=placeholder',
            })
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode('utf-8'))
        except Exception as e:
            self._send_json(502, {'ok': False, 'error': f'B站搜索失败: {e}'})
            return

        if data.get('code') != 0:
            self._send_json(502, {'ok': False, 'error': data.get('message', 'B站接口错误')})
            return

        results = []
        for item in (data.get('data') or {}).get('result') or []:
            # 时长解析："3:45" → 秒数；过滤 10s~300s
            dur_str = item.get('duration', '0:0')
            secs = self._parse_duration(dur_str)
            if secs < 10 or secs > 300:
                continue
            # 清理标题里的 <em> 高亮标签
            title = re.sub(r'</?em[^>]*>', '', item.get('title', ''))
            results.append({
                'bvid': item.get('bvid', ''),
                'title': title,
                'author': item.get('author', ''),
                'play': item.get('play', 0),
                'duration': dur_str,
                'pic': item.get('pic', ''),
            })

        # 按播放量降序，取前 10
        results.sort(key=lambda x: x['play'], reverse=True)
        results = results[:10]

        self._send_json(200, {
            'ok': True,
            'word': word,
            'keyword': keyword,
            'total': len(results),
            'list': results,
        })

    @staticmethod
    def _parse_duration(s):
        """'3:45' → 225 秒；'1:02:30' → 3750 秒"""
        parts = s.split(':')
        secs = 0
        for p in parts:
            try:
                secs = secs * 60 + int(p)
            except ValueError:
                return 0
        return secs

    def _proxy_dict(self, word):
        # 1. 查内存缓存（当前进程）
        with _mem_cache_lock:
            if word in _mem_cache:
                self._send_json(200, _mem_cache[word])
                return

        # 2. 查本地缓存文件
        cache_path = os.path.join(CACHE_DIR, self._safe_filename(word) + '.json')
        if os.path.isfile(cache_path):
            try:
                with open(cache_path, 'r', encoding='utf-8') as f:
                    cached = json.load(f)
                with _mem_cache_lock:
                    _mem_cache[word] = cached
                self._send_json(200, cached)
                return
            except Exception:
                pass  # 缓存文件损坏，重新拉取

        # 3. 调有道 jsonapi
        result = self._fetch_youdao(word)

        # 3.5 如果原始词未找到且含撇号，尝试基础形式回退查询
        if not result.get('found') and ("'" in word or "\u2019" in word):
            base = self._strip_contraction(word)
            if base and base != word:
                base_result = self._fetch_youdao(base)
                if base_result.get('found'):
                    base_result['word'] = word
                    base_result['base_form'] = base
                    result = base_result

        if result.get('found'):
            # 保存到缓存文件（积累本地词典库）
            try:
                with open(cache_path, 'w', encoding='utf-8') as f:
                    json.dump(result, f, ensure_ascii=False, indent=2)
            except Exception:
                pass

        # 4. 写入内存缓存
        with _mem_cache_lock:
            _mem_cache[word] = result

        self._send_json(200, result)

    def _strip_contraction(self, word):
        """去除英语缩写/所有格后缀，返回基础形式

        处理模式：
          - xxx's  (所有格/缩写 is): child's → child, it's → it
          - xxx't  (缩写 not):       don't → do, isn't → is
          - xxx're (缩写 are):        they're → they
          - xxx've (缩写 have):       they've → they
          - xxx'll (缩写 will):       they'll → they
          - xxx'd  (缩写 would/had):  they'd → they
          - xxx'm  (缩写 am):         I'm → I
        同时处理 ASCII 撇号 ' 和 Unicode 右弯引号 '
        """
        ap = r"['\u2019]"
        patterns = [
            (ap + r"s$", ''),       # 所有格 / is
            (r"n" + ap + r"t$", ''),  # not (don't → do, isn't → is)
            (ap + r"re$", ''),      # are
            (ap + r"ve$", ''),      # have
            (ap + r"ll$", ''),      # will
            (ap + r"d$", ''),       # would / had
            (ap + r"m$", ''),       # am
        ]
        for suffix, _ in patterns:
            base = re.sub(suffix, '', word)
            if base and base != word:
                return base
        return None

    def _safe_filename(self, word):
        """将单词转为安全的文件名（空格→_，特殊字符编码）"""
        safe = re.sub(r'[^\w\-]', '_', word.strip().lower())
        return safe or 'unknown'

    def _fetch_youdao(self, word):
        """调用有道词典 jsonapi，解析返回统一结构"""
        encoded = urllib.parse.quote(word)
        url = f'https://dict.youdao.com/jsonapi?q={encoded}'
        try:
            req = urllib.request.Request(
                url,
                headers={
                    'User-Agent': 'Mozilla/5.0 (compatible; SpaDictProxy/1.0)',
                    'Accept': 'application/json',
                },
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode('utf-8'))
        except Exception as e:
            return {
                'word': word, 'found': False,
                'phonetic_uk': '', 'phonetic_us': '',
                'audio_uk': '', 'audio_us': '',
                'defs': [], 'forms': [], 'examples': [], 'synonyms': [],
                'error': f'词典服务不可达: {e}',
            }

        result = {
            'word': word,
            'found': False,
            'phonetic_uk': '',
            'phonetic_us': '',
            'audio_uk': '',
            'audio_us': '',
            'defs': [],
            'forms': [],
            'examples': [],
            'synonyms': [],
        }

        # 1. ec (英汉词典)
        ec = data.get('ec') or {}
        ec_word_list = ec.get('word') or []
        if ec_word_list:
            ec_word = ec_word_list[0]
            result['found'] = True
            result['phonetic_uk'] = ec_word.get('ukphone', '') or ''
            result['phonetic_us'] = ec_word.get('usphone', '') or ''
            audio_word = urllib.parse.quote(word)
            result['audio_uk'] = f'https://dict.youdao.com/dictvoice?audio={audio_word}&type=1'
            result['audio_us'] = f'https://dict.youdao.com/dictvoice?audio={audio_word}&type=2'
            # 中文释义
            trs = ec_word.get('trs') or []
            for tr in trs:
                tr_list = tr.get('tr') or []
                for tr_item in tr_list:
                    l = tr_item.get('l') or {}
                    i_list = l.get('i') or []
                    parts = []
                    for i_item in i_list:
                        if isinstance(i_item, dict):
                            parts.append(i_item.get('#text', '') or '')
                        else:
                            parts.append(str(i_item))
                    full = ''.join(parts).strip()
                    if full:
                        pos, meaning = self._split_pos(full)
                        result['defs'].append({'pos': pos, 'meaning': meaning})
            # 变形
            wfs = ec_word.get('wfs') or []
            for wf_item in wfs:
                wf = wf_item.get('wf') or {}
                name = wf.get('name', '') or ''
                value = wf.get('value', '') or ''
                if name and value:
                    result['forms'].append({'name': name, 'value': value})

        # 2. simple 兜底
        if not result['defs']:
            simple = data.get('simple') or {}
            simple_word_list = simple.get('word') or []
            if simple_word_list:
                sw = simple_word_list[0]
                result['found'] = True
                means = sw.get('explain') or ''
                if means:
                    for m in means.split(';'):
                        m = m.strip()
                        if m:
                            pos, meaning = self._split_pos(m)
                            result['defs'].append({'pos': pos, 'meaning': meaning})

        # 3. 双语例句
        blng = data.get('blng_sents_part') or {}
        pairs = blng.get('sentence-pair') or []
        for p in pairs[:5]:
            en = (p.get('sentence-eng') or '').strip()
            en_clean = re.sub(r'</?b>', '', en)
            zh = (p.get('sentence-translation') or '').strip()
            if en_clean and zh:
                result['examples'].append({'en': en_clean, 'zh': zh})

        # 4. 同义词
        syno_root = data.get('syno') or {}
        synos = syno_root.get('synos') or []
        for s in synos[:3]:
            syno = s.get('syno') or {}
            pos = syno.get('pos', '') or ''
            tran = syno.get('tran', '') or ''
            ws = syno.get('ws') or []
            words = [w.get('w', '') for w in ws if w.get('w')]
            if words:
                result['synonyms'].append({'pos': pos, 'meaning': tran, 'words': words})

        return result

    def _split_pos(self, text):
        m = re.match(r'^((?:n|v|vi|vt|aux|adj|adv|prep|conj|pron|num|art|int|abbr|det)\.)\s*(.*)', text)
        if m:
            return m.group(1), m.group(2).strip()
        return '', text.strip()

    def _send_json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class ThreadingServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    cache_count = len([n for n in os.listdir(CACHE_DIR) if n.endswith('.json')])
    with ThreadingServer(('0.0.0.0', PORT), Handler) as httpd:
        print(f'spapro 服务启动: http://localhost:{PORT}')
        print(f'  词典代理: /api/dict?q=<word>')
        print(f'  数据源: 有道词典 jsonapi')
        print(f'  本地缓存: {CACHE_DIR}/  ({cache_count} 个单词已缓存)')
        httpd.serve_forever()