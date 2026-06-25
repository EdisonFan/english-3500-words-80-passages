#!/usr/bin/env python3
"""带词典代理的静态文件服务器，服务 spapro 应用。

- 静态文件：直接从当前目录提供（index.html / app.js / style.css / data/*.json）
- 词典代理：GET /api/dict?q=<word> → 转发到有道词典 suggest API，附加 CORS 头
"""
import http.server
import socketserver
import urllib.request
import urllib.parse
import json
import os
import threading

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

# 词典查询缓存（进程内，避免重复请求同一单词）
_dict_cache = {}
_cache_lock = threading.Lock()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # 所有响应都允许跨域（预览环境端口转发需要）
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        # 词典代理接口
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
        # 先查缓存
        with _cache_lock:
            if word in _dict_cache:
                self._send_json(200, _dict_cache[word])
                return

        # 调用有道 suggest API（返回简洁的中文释义）
        encoded = urllib.parse.quote(word)
        url = f'https://dict.youdao.com/suggest?q={encoded}&num=1&doctype=json'
        try:
            req = urllib.request.Request(
                url,
                headers={
                    'User-Agent': 'Mozilla/5.0 (compatible; SpaDictProxy/1.0)',
                    'Accept': 'application/json',
                },
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                raw = resp.read().decode('utf-8')
            youdao = json.loads(raw)

            # 统一输出结构，前端只关心这几个字段
            entries = (youdao.get('data') or {}).get('entries') or []
            entry = entries[0] if entries else {}
            result = {
                'word': word,
                'found': bool(entry),
                'entry': entry.get('entry', word),
                'explain': entry.get('explain', ''),
                'source': 'youdao',
            }

            with _cache_lock:
                _dict_cache[word] = result
            self._send_json(200, result)
        except urllib.error.URLError as e:
            self._send_json(502, {'word': word, 'found': False, 'error': f'词典服务不可达: {e.reason}',
                                  'entry': word, 'explain': '', 'source': 'youdao'})
        except Exception as e:
            self._send_json(500, {'word': word, 'found': False, 'error': f'服务器错误: {e}',
                                  'entry': word, 'explain': '', 'source': 'youdao'})

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
    with ThreadingServer(('0.0.0.0', PORT), Handler) as httpd:
        print(f'spapro 服务启动: http://localhost:{PORT}  (词典代理: /api/dict?q=<word>)')
        httpd.serve_forever()
