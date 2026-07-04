#!/usr/bin/env python3
"""spapro_bx2 静态文件服务器(端口 8001)

- 静态文件:直接从 spapro_bx2/ 提供
- 词典代理:GET /api/dict?q=<word>
  1. 优先查 spapro/data/cache/(复用已有词典缓存)
  2. 缓存命中 → 返回
  3. 缓存未命中 → 调有道 jsonapi → 写回 spapro/data/cache/(统一累积)
"""
import http.server
import socketserver
import urllib.request
import urllib.parse
import json
import os
import re
import threading

PORT = 8001
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
# 词典缓存与 spapro 共享,持续积累
SPARO_DIR = os.path.abspath(os.path.join(DIRECTORY, '..', 'spapro'))
CACHE_DIR = os.path.join(SPARO_DIR, 'data', 'cache')

os.makedirs(CACHE_DIR, exist_ok=True)

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
        with _mem_cache_lock:
            if word in _mem_cache:
                self._send_json(200, _mem_cache[word])
                return

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
                pass

        result = self._fetch_youdao(word)

        if result.get('found'):
            try:
                with open(cache_path, 'w', encoding='utf-8') as f:
                    json.dump(result, f, ensure_ascii=False, indent=2)
            except Exception:
                pass

        with _mem_cache_lock:
            _mem_cache[word] = result

        self._send_json(200, result)

    def _safe_filename(self, word):
        safe = re.sub(r'[^\w\-]', '_', word.strip().lower())
        return safe or 'unknown'

    def _fetch_youdao(self, word):
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
            'word': word, 'found': False,
            'phonetic_uk': '', 'phonetic_us': '',
            'audio_uk': '', 'audio_us': '',
            'defs': [], 'forms': [], 'examples': [], 'synonyms': [],
        }

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
            trs = ec_word.get('trs') or []
            for tr in trs:
                for tr_item in (tr.get('tr') or []):
                    l = tr_item.get('l') or {}
                    parts = []
                    for i_item in (l.get('i') or []):
                        if isinstance(i_item, dict):
                            parts.append(i_item.get('#text', '') or '')
                        else:
                            parts.append(str(i_item))
                    full = ''.join(parts).strip()
                    if full:
                        pos, meaning = self._split_pos(full)
                        result['defs'].append({'pos': pos, 'meaning': meaning})
            for wf_item in (ec_word.get('wfs') or []):
                wf = wf_item.get('wf') or {}
                name = wf.get('name', '') or ''
                value = wf.get('value', '') or ''
                if name and value:
                    result['forms'].append({'name': name, 'value': value})

        if not result['defs']:
            simple = data.get('simple') or {}
            for sw in (simple.get('word') or []):
                means = sw.get('explain') or ''
                if means:
                    for m in means.split(';'):
                        m = m.strip()
                        if m:
                            pos, meaning = self._split_pos(m)
                            result['defs'].append({'pos': pos, 'meaning': meaning})
                    break

        for p in ((data.get('blng_sents_part') or {}).get('sentence-pair') or [])[:5]:
            en = re.sub(r'</?b>', '', (p.get('sentence-eng') or '').strip())
            zh = (p.get('sentence-translation') or '').strip()
            if en and zh:
                result['examples'].append({'en': en, 'zh': zh})

        for s in ((data.get('syno') or {}).get('synos') or [])[:3]:
            syno = s.get('syno') or {}
            words = [w.get('w', '') for w in (syno.get('ws') or []) if w.get('w')]
            if words:
                result['synonyms'].append({
                    'pos': syno.get('pos', '') or '',
                    'meaning': syno.get('tran', '') or '',
                    'words': words,
                })

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
    print(f'spapro_bx2 服务启动: http://localhost:{PORT}')
    print(f'  静态目录: {DIRECTORY}')
    print(f'  词典代理: /api/dict?q=<word>')
    print(f'  缓存目录(共享): {CACHE_DIR}  ({cache_count} 个单词已缓存)')
    with ThreadingServer(('0.0.0.0', PORT), Handler) as httpd:
        httpd.serve_forever()
