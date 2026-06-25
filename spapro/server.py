#!/usr/bin/env python3
"""带词典代理的静态文件服务器，服务 spapro 应用。

- 静态文件：直接从当前目录提供（index.html / app.js / style.css / data/*.json）
- 词典代理：GET /api/dict?q=<word>
    数据源：有道词典 jsonapi（一个接口提供中文释义/音标/英式美式发音/双语例句/变形/同义词）
    输出统一结构，对齐 spapro/data 的 vocab 结构
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

        result = self._query_youdao_jsonapi(word)

        with _cache_lock:
            _dict_cache[word] = result
        self._send_json(200, result)

    def _query_youdao_jsonapi(self, word):
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
                'phonetic_us': '', 'phonetic_uk': '',
                'audio_us': '', 'audio_uk': '',
                'defs': [], 'examples': [], 'forms': [], 'synonyms': [],
                'sources': [], 'error': f'词典服务不可达: {e}',
            }

        result = {
            'word': word,
            'found': False,
            'phonetic_us': '',
            'phonetic_uk': '',
            'audio_us': '',
            'audio_uk': '',
            'defs': [],          # [{pos, meaning}]
            'examples': [],      # [{en, zh}]
            'forms': [],         # [{name, value}]  如 {name:'复数', value:'apples'}
            'synonyms': [],      # [{pos, words:[], meaning}]
            'sources': ['youdao'],
        }

        # 1. ec (英汉词典)：音标、发音、中文释义、变形
        ec = data.get('ec') or {}
        ec_word_list = ec.get('word') or []
        if ec_word_list:
            ec_word = ec_word_list[0]
            result['found'] = True
            result['phonetic_us'] = ec_word.get('usphone', '') or ''
            result['phonetic_uk'] = ec_word.get('ukphone', '') or ''
            # 发音 URL：有道 dictvoice 接口，audio=单词&type=1(英式)/2(美式)
            if ec_word.get('usspeech') or ec_word.get('ukspeech') or True:
                # 用单词本身作为 audio 参数更稳定
                audio_word = urllib.parse.quote(word)
                result['audio_us'] = f'https://dict.youdao.com/dictvoice?audio={audio_word}&type=2'
                result['audio_uk'] = f'https://dict.youdao.com/dictvoice?audio={audio_word}&type=1'
            # 中文释义 trs
            trs = ec_word.get('trs') or []
            for tr in trs:
                tr_list = tr.get('tr') or []
                for tr_item in tr_list:
                    l = tr_item.get('l') or {}
                    i_list = l.get('i') or []
                    meaning_parts = []
                    for i_item in i_list:
                        if isinstance(i_item, dict):
                            meaning_parts.append(i_item.get('#text', '') or '')
                        else:
                            meaning_parts.append(str(i_item))
                    full_meaning = ''.join(meaning_parts).strip()
                    if full_meaning:
                        # 解析词性：如 "n. 苹果" → pos=n., meaning=苹果
                        pos, meaning = self._split_pos(full_meaning)
                        result['defs'].append({'pos': pos, 'meaning': meaning})
            # 变形 wfs
            wfs = ec_word.get('wfs') or []
            for wf_item in wfs:
                wf = wf_item.get('wf') or {}
                name = wf.get('name', '') or ''
                value = wf.get('value', '') or ''
                if name and value:
                    result['forms'].append({'name': name, 'value': value})

        # 2. simple：兜底中文释义（ec 没有时）
        if not result['defs']:
            simple = data.get('simple') or {}
            simple_word_list = simple.get('word') or []
            if simple_word_list:
                sw = simple_word_list[0]
                result['found'] = True
                means = sw.get('explain') or ''
                if means:
                    # 按 ";" 切分多个释义
                    for m in means.split(';'):
                        m = m.strip()
                        if not m:
                            continue
                        pos, meaning = self._split_pos(m)
                        result['defs'].append({'pos': pos, 'meaning': meaning})

        # 3. blng_sents_part：双语例句
        blng = data.get('blng_sents_part') or {}
        pairs = blng.get('sentence-pair') or []
        for p in pairs[:5]:  # 最多取 5 条
            en = (p.get('sentence-eng') or '').strip()
            # 去掉 <b> 标签的纯文本（前端可自行高亮，这里保留原文供前端处理）
            en_clean = re.sub(r'</?b>', '', en)
            zh = (p.get('sentence-translation') or '').strip()
            if en_clean and zh:
                result['examples'].append({'en': en_clean, 'zh': zh})

        # 4. syno：同义词
        syno_root = data.get('syno') or {}
        synos = syno_root.get('synos') or []
        for s in synos[:3]:  # 最多 3 组
            syno = s.get('syno') or {}
            pos = syno.get('pos', '') or ''
            tran = syno.get('tran', '') or ''
            ws = syno.get('ws') or []
            words = [w.get('w', '') for w in ws if w.get('w')]
            if words:
                result['synonyms'].append({'pos': pos, 'meaning': tran, 'words': words})

        return result

    def _split_pos(self, text):
        """从释义文本中分离词性，如 'n. 苹果' → ('n.', '苹果')"""
        if not text:
            return '', ''
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
    with ThreadingServer(('0.0.0.0', PORT), Handler) as httpd:
        print(f'spapro 服务启动: http://localhost:{PORT}  (词典代理: /api/dict?q=<word>)')
        print(f'  数据源: 有道词典 jsonapi（中文释义/音标/英式美式发音/双语例句/变形/同义词）')
        httpd.serve_forever()
