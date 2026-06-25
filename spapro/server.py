#!/usr/bin/env python3
"""带词典代理 + 本地缓存的静态文件服务器，服务 spapro 应用。

- 静态文件：直接从当前目录提供
- 词典代理：GET /api/dict?q=<word>
    1. 先查 data/cache/<word>.json 本地缓存
    2. 缓存命中 → 直接返回
    3. 缓存未命中 → 调有道 jsonapi → 保存到 data/cache/ → 返回
    逐步积累本地词典库，避免依赖外网 API
    所有响应附加 CORS 头
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
        super().do_GET()

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