#!/usr/bin/env python3
"""带词典代理的静态文件服务器，服务 spapro 应用。

- 静态文件：直接从当前目录提供（index.html / app.js / style.css / data/*.json）
- 词典代理：GET /api/dict?q=<word>
    优先调用百度翻译 API（需在 dict_config.py 配置凭证）
    百度失败或未配置时，回退到有道词典 suggest API
    所有响应附加 CORS 头
"""
import http.server
import socketserver
import urllib.request
import urllib.parse
import json
import os
import hashlib
import threading

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

# 读取百度翻译 API 凭证（从 gitignore 的 dict_config.py）
BAIDU_APPID = ""
BAIDU_SECRET = ""
try:
    from dict_config import BAIDU_APPID as _APPID, BAIDU_SECRET as _SECRET
    BAIDU_APPID = _APPID
    BAIDU_SECRET = _SECRET
except ImportError:
    pass

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

        result = None
        # 1. 优先用百度翻译 API
        if BAIDU_APPID and BAIDU_SECRET:
            result = self._query_baidu(word)

        # 2. 百度失败/未命中/未配置 → 回退到有道词典
        need_fallback = (result is None) or (result and not result.get('found'))
        if need_fallback:
            youdao_result = self._query_youdao(word)
            if youdao_result and youdao_result.get('found'):
                result = youdao_result
            elif result is None:
                # 百度完全异常时，用有道的错误信息兜底
                result = youdao_result or {
                    'word': word, 'found': False, 'entry': word,
                    'explain': '', 'source': 'none', 'error': '所有词典源均不可用',
                }

        with _cache_lock:
            _dict_cache[word] = result
        self._send_json(200, result)

    def _query_baidu(self, word):
        """调用百度翻译 API，返回统一结构或 None（异常时）"""
        import random
        salt = str(random.randint(10000, 99999))
        sign_str = BAIDU_APPID + word + salt + BAIDU_SECRET
        sign = hashlib.md5(sign_str.encode('utf-8')).hexdigest()
        params = {
            'q': word,
            'from': 'en',
            'to': 'zh',
            'appid': BAIDU_APPID,
            'salt': salt,
            'sign': sign,
        }
        url = 'https://fanyi-api.baidu.com/api/trans/vip/translate?' + urllib.parse.urlencode(params)
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (compatible; SpaDictProxy/1.0)'})
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read().decode('utf-8'))
            # 百度错误响应：{"error_code": "54001", "error_msg": "Invalid Sign"}
            if 'error_code' in data:
                return {
                    'word': word, 'found': False, 'entry': word, 'explain': '',
                    'source': 'baidu', 'error': f"百度错误 {data.get('error_code')}: {data.get('error_msg', '')}",
                }
            trans_result = data.get('trans_result') or []
            if not trans_result:
                return {
                    'word': word, 'found': False, 'entry': word, 'explain': '',
                    'source': 'baidu',
                }
            # 合并多段译文（单词查询通常只有一段）
            meanings = '；'.join(item.get('dst', '') for item in trans_result if item.get('dst'))
            return {
                'word': word,
                'found': bool(meanings),
                'entry': word,
                'explain': meanings,
                'source': 'baidu',
            }
        except Exception as e:
            return None

    def _query_youdao(self, word):
        """调用有道词典 suggest API，返回统一结构或 None（异常时）"""
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
            entries = (youdao.get('data') or {}).get('entries') or []
            entry = entries[0] if entries else {}
            return {
                'word': word,
                'found': bool(entry),
                'entry': entry.get('entry', word),
                'explain': entry.get('explain', ''),
                'source': 'youdao',
            }
        except Exception:
            return None

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
        baidu_status = '已配置' if (BAIDU_APPID and BAIDU_SECRET) else '未配置（仅用有道）'
        print(f'spapro 服务启动: http://localhost:{PORT}  (词典代理: /api/dict?q=<word>)')
        print(f'  百度翻译 API: {baidu_status}')
        httpd.serve_forever()
