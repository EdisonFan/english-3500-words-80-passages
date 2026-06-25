#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""spapro 静态文件服务 + 有道词典代理（带缓存）

- 静态文件：index.html / app.js / style.css / data/*.json
- 词典代理：GET /api/dict?word=<word>  返回标准化 JSON
- 缓存策略：内存缓存 → data/cache/<word>.json → 有道 jsonapi
- 发音 URL：https://dict.youdao.com/dictvoice?audio=<word>&type=1(英)/2(美)
"""

import json
import os
import re
import threading
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(DIRECTORY, 'data', 'cache')
os.makedirs(CACHE_DIR, exist_ok=True)

_mem_cache = {}
_mem_cache_lock = threading.Lock()

YOUDAO_JSONAPI = 'https://dict.youdao.com/jsonapi?q='
YOUDAO_VOICE = 'https://dict.youdao.com/dictvoice?audio='
TIMEOUT = 6


def _safe_filename(word):
    safe = re.sub(r'[^\w\-]', '_', word.strip().lower())
    return safe or 'unknown'


def _voice_url(word, accent):
    # accent: 1=英式 2=美式
    return YOUDAO_VOICE + urllib.parse.quote(word) + '&type=' + str(accent)


def _fetch_youdao(word):
    """调用有道 jsonapi，解析为标准化结构。失败返回 None。"""
    url = YOUDAO_JSONAPI + urllib.parse.quote(word)
    req = urllib.request.Request(
        url,
        headers={'User-Agent': 'Mozilla/5.0 (spapro/dict-proxy)'}
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        raw = resp.read().decode('utf-8', errors='ignore')

    try:
        data = json.loads(raw)
    except ValueError:
        return None

    result = {
        'word': word,
        'phonetic_uk': '',
        'phonetic_us': '',
        'audio_uk': _voice_url(word, 1),
        'audio_us': _voice_url(word, 2),
        'defs': [],
        'forms': [],
        'examples': [],
        'synonyms': []
    }

    # ec.word[0]：释义/音标/变形
    ec = data.get('ec') or {}
    ec_word = ec.get('word') or []
    if ec_word:
        w0 = ec_word[0]
        # 音标
        ukphone = (w0.get('ukphone') or '').strip()
        usphone = (w0.get('usphone') or '').strip()
        if ukphone:
            result['phonetic_uk'] = '/' + ukphone + '/'
        if usphone:
            result['phonetic_us'] = '/' + usphone + '/'
        # 释义
        trs = w0.get('trs') or []
        for t in trs:
            tr = t.get('tr') or []
            meaning = ''
            if tr:
                # tr 是 [{"l":{"i":["xxx"]}}, ...]，文本里可能带 <b> 标签
                parts = []
                for item in tr:
                    l = item.get('l') or {}
                    i = l.get('i')
                    if isinstance(i, list):
                        parts.append(''.join(str(x) for x in i))
                    elif i is not None:
                        parts.append(str(i))
                meaning = ''.join(parts).strip()
            # meaning 里常带 pos 前缀（如 "int. 喂，你好"），提取出来
            pos = ''
            m = re.match(r'^([a-z]+\.)\s*(.+)$', meaning)
            if m:
                pos = m.group(1)
                meaning = m.group(2).strip()
            if pos or meaning:
                result['defs'].append({'pos': pos, 'meaning': meaning})
        # 变形
        wfs = w0.get('wfs') or []
        for wf in wfs:
            wf_name = (wf.get('wf') or {}).get('name') or ''
            wf_value = (wf.get('wf') or {}).get('value') or ''
            if wf_name and wf_value:
                result['forms'].append({'name': wf_name, 'value': wf_value})

    # blng_sents_part：双语例句（用纯文本 sentence，避开 sentence-eng 的 <b> 标签）
    blng = data.get('blng_sents_part') or {}
    sents = blng.get('sentence-pair') or []
    for s in sents[:8]:
        en = (s.get('sentence') or '').strip()
        zh = (s.get('sentence-translation') or '').strip()
        if en and zh:
            result['examples'].append({'en': en, 'zh': zh})

    # syno：同义词（结构 syno.synos[].syno.{pos, ws[].w, tran}）
    syno = data.get('syno') or {}
    synos = syno.get('synos') or []
    for s in synos[:5]:
        item = s.get('syno') or {}
        pos = (item.get('pos') or '').strip()
        meaning = (item.get('tran') or '').strip()
        ws = item.get('ws') or []
        word_list = [x.get('w') for x in ws if x.get('w')]
        if meaning or word_list:
            result['synonyms'].append({
                'pos': pos,
                'meaning': meaning,
                'words': word_list
            })

    # simple 兜底：ec 没拿到释义时
    if not result['defs']:
        simple = data.get('simple') or {}
        simple_word = simple.get('word') or []
        if simple_word:
            w0 = simple_word[0]
            simple_means = w0.get('means') or []
            for m in simple_means:
                pos = (m.get('pos') or '').strip()
                meaning = (m.get('value') or '').strip()
                if pos or meaning:
                    result['defs'].append({'pos': pos, 'meaning': meaning})
            # simple 里的音标兜底
            if not result['phonetic_uk']:
                uk = (w0.get('ukphone') or '').strip()
                if uk:
                    result['phonetic_uk'] = '/' + uk + '/'
            if not result['phonetic_us']:
                us = (w0.get('usphone') or '').strip()
                if us:
                    result['phonetic_us'] = '/' + us + '/'

    # 完全空则视为查不到
    if not result['defs'] and not result['examples'] and not result['synonyms']:
        return None

    return result


def _proxy_dict(word):
    """查询词典：内存缓存 → 文件缓存 → 有道 API → 写回两级缓存。"""
    if not word:
        return None

    # 1. 内存缓存
    with _mem_cache_lock:
        if word in _mem_cache:
            return _mem_cache[word]

    # 2. 文件缓存
    cache_file = os.path.join(CACHE_DIR, _safe_filename(word) + '.json')
    if os.path.exists(cache_file):
        try:
            with open(cache_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            with _mem_cache_lock:
                _mem_cache[word] = data
            return data
        except (ValueError, OSError):
            pass

    # 3. 调有道
    try:
        data = _fetch_youdao(word)
    except Exception:
        data = None

    if data:
        # 写文件缓存
        try:
            with open(cache_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except OSError:
            pass
        # 写内存缓存
        with _mem_cache_lock:
            _mem_cache[word] = data

    return data


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        # 简化日志：方法 + 路径 + 状态
        pass

    def _send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def _send_static(self, rel_path):
        # 防目录穿越
        rel_path = rel_path.lstrip('/')
        full = os.path.normpath(os.path.join(DIRECTORY, rel_path))
        if not full.startswith(DIRECTORY):
            self._send_json({'error': 'forbidden'}, 403)
            return

        if os.path.isdir(full):
            full = os.path.join(full, 'index.html')

        if not os.path.isfile(full):
            self._send_json({'error': 'not found', 'path': rel_path}, 404)
            return

        ext = os.path.splitext(full)[1].lower()
        mime = {
            '.html': 'text/html; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.json': 'application/json; charset=utf-8',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
        }.get(ext, 'application/octet-stream')

        try:
            with open(full, 'rb') as f:
                body = f.read()
        except OSError:
            self._send_json({'error': 'read error'}, 500)
            return

        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # 词典代理
        if path == '/api/dict':
            word = (query.get('word') or [''])[0].strip()
            if not word:
                self._send_json({'error': 'missing word'}, 400)
                return
            data = _proxy_dict(word)
            if data is None:
                self._send_json({'word': word, 'empty': True}, 404)
                return
            self._send_json(data)
            return

        # 根路径 → index.html
        if path == '/' or path == '':
            self._send_static('index.html')
            return

        # 其他静态文件
        self._send_static(path)


def main():
    server = ThreadingHTTPServer(('0.0.0.0', PORT), Handler)
    print('spapro serving on http://localhost:%d/' % PORT)
    print('static dir: %s' % DIRECTORY)
    print('cache dir:  %s' % CACHE_DIR)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nshutting down...')
        server.shutdown()


if __name__ == '__main__':
    main()
