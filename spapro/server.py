#!/usr/bin/env python3
"""带词典代理的静态文件服务器，服务 spapro 应用。

- 静态文件：直接从当前目录提供（index.html / app.js / style.css / data/*.json）
- 词典代理：GET /api/dict?q=<word>
    主源：dictionaryapi.dev（英英，提供音标/发音/词性/例句/同反义词）
    辅源：有道 suggest（中文释义）
    多源聚合后输出统一结构，对齐 spapro/data 的 vocab 结构
    所有响应附加 CORS 头
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

        result = self._aggregate(word)

        with _cache_lock:
            _dict_cache[word] = result
        self._send_json(200, result)

    def _aggregate(self, word):
        """聚合多源数据，输出统一结构"""
        result = {
            'word': word,
            'found': False,
            'phonetic': '',
            'audio_uk': '',
            'audio_us': '',
            'defs': [],          # [{pos, meaning(中文), en_definitions:[{definition, example}]}]
            'synonyms': [],
            'antonyms': [],
            'sources': [],
        }

        # 1. dictionaryapi.dev：音标、发音、词性、英文释义、例句、同反义词
        en_data = self._query_dictionaryapi(word)
        if en_data:
            result['sources'].append('dictionaryapi.dev')
            result['found'] = True
            # 音标：优先取有 text 的
            phonetics = en_data.get('phonetics') or []
            for p in phonetics:
                if p.get('text') and not result['phonetic']:
                    result['phonetic'] = p['text']
            # 发音：按 URL 后缀区分英式/美式
            for p in phonetics:
                audio = p.get('audio') or ''
                if not audio:
                    continue
                low = audio.lower()
                if '-uk' in low and not result['audio_uk']:
                    result['audio_uk'] = audio
                elif '-us' in low and not result['audio_us']:
                    result['audio_us'] = audio
                elif 'au' in low or 'australian' in low:
                    # 澳音补位：如果英式美式都缺，澳音当英式兜底
                    if not result['audio_uk']:
                        result['audio_uk'] = audio
            # 词性 + 英文释义 + 例句
            for m in en_data.get('meanings') or []:
                pos = m.get('partOfSpeech') or ''
                en_definitions = []
                for d in m.get('definitions') or []:
                    en_definitions.append({
                        'definition': d.get('definition') or '',
                        'example': d.get('example') or '',
                    })
                result['defs'].append({
                    'pos': pos,
                    'meaning': '',  # 中文释义留给有道填
                    'en_definitions': en_definitions,
                })
            # 同反义词（取首个 meaning 的）
            meanings = en_data.get('meanings') or []
            if meanings:
                result['synonyms'] = list(meanings[0].get('synonyms') or [])[:8]
                result['antonyms'] = list(meanings[0].get('antonyms') or [])[:8]

        # 2. 有道 suggest：中文释义（含词性）
        youdao_data = self._query_youdao(word)
        if youdao_data and youdao_data.get('found'):
            result['sources'].append('youdao')
            result['found'] = True
            explain = youdao_data.get('explain', '')
            if explain:
                # 解析"n. 苹果；vt. 放弃..."格式，按词性分配到 defs
                parsed_defs = self._parse_youdao_explain(explain)
                if parsed_defs:
                    # 如果 dictionaryapi.dev 已有词性结构，合并中文释义
                    if result['defs']:
                        self._merge_chinese_meanings(result['defs'], parsed_defs)
                    else:
                        for pd in parsed_defs:
                            result['defs'].append({
                                'pos': pd['pos'],
                                'meaning': pd['meaning'],
                                'en_definitions': [],
                            })
                else:
                    # 解析失败，整体塞到第一个义项
                    if result['defs']:
                        result['defs'][0]['meaning'] = explain
                    else:
                        result['defs'].append({'pos': '', 'meaning': explain, 'en_definitions': []})

        return result

    def _parse_youdao_explain(self, explain):
        """解析有道 explain 字段，如 'n. 苹果；vt. 放弃...'，返回 [{pos, meaning}]"""
        if not explain:
            return []
        import re
        # 按词性标记切分：词性标记形如 "n." "v." "adj." "adv." "vt." "vi." "prep." "conj." "pron." "num." "art." "int." 等
        pattern = re.compile(r'((?:n|v|vi|vt|aux|adj|adv|prep|conj|pron|num|art|int|abbr)\.\s*)')
        parts = pattern.split(explain)
        # parts 形如 ['', 'n. ', '苹果；', 'vt. ', '放弃...']
        defs = []
        i = 1
        while i < len(parts):
            pos = (parts[i] or '').strip()
            meaning = (parts[i + 1] or '').strip() if i + 1 < len(parts) else ''
            if pos or meaning:
                defs.append({'pos': pos, 'meaning': meaning})
            i += 2
        # 处理开头无词性的部分
        if not defs and explain.strip():
            defs.append({'pos': '', 'meaning': explain.strip()})
        return defs

    def _merge_chinese_meanings(self, defs, parsed_defs):
        """把有道的中文释义合并到 dictionaryapi.dev 的词性结构里"""
        # 按 pos 建索引（dictionaryapi.dev 用 noun/verb 等，有道用 n./v. 等，需归一化）
        pos_map = {
            'noun': 'n.', 'verb': 'v.', 'adjective': 'adj.', 'adverb': 'adv.',
            'pronoun': 'pron.', 'preposition': 'prep.', 'conjunction': 'conj.',
            'interjection': 'int.', 'determiner': 'det.', 'numeral': 'num.',
            'vi.': 'vi.', 'vt.': 'vt.', 'aux.': 'aux.', 'abbr.': 'abbr.',
        }
        # 给 defs 加 normalized pos
        for d in defs:
            d['_norm_pos'] = pos_map.get(d.get('pos', '').lower(), d.get('pos', ''))

        for pd in parsed_defs:
            target = None
            # 精确匹配
            for d in defs:
                if d.get('_norm_pos') == pd['pos']:
                    target = d
                    break
            # 模糊匹配：n. 匹配 noun；v. 匹配 verb/vi./vt.
            if not target:
                for d in defs:
                    np = d.get('_norm_pos', '')
                    pp = pd['pos']
                    if (pp == 'n.' and np in ('n.',)) or \
                       (pp in ('v.', 'vt.', 'vi.') and np in ('v.', 'vt.', 'vi.')) or \
                       (pp == 'adj.' and np == 'adj.') or \
                       (pp == 'adv.' and np == 'adv.'):
                        target = d
                        break
            if target:
                # 合并：如果 target 已有中文，追加；否则填入
                if target.get('meaning'):
                    target['meaning'] += '；' + pd['meaning']
                else:
                    target['meaning'] = pd['meaning']
            else:
                # 没匹配上，作为新义项加入
                defs.append({'pos': pd['pos'], 'meaning': pd['meaning'], 'en_definitions': []})

        # 清理临时字段
        for d in defs:
            d.pop('_norm_pos', None)

    def _query_dictionaryapi(self, word):
        """调用 dictionaryapi.dev，返回首个 entry 或 None"""
        url = f'https://api.dictionaryapi.dev/api/v2/entries/en/{urllib.parse.quote(word)}'
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (compatible; SpaDictProxy/1.0)'})
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read().decode('utf-8'))
            if isinstance(data, list) and data:
                return data[0]
            return None
        except Exception:
            return None

    def _query_youdao(self, word):
        """调用有道词典 suggest API"""
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
                'found': bool(entry),
                'entry': entry.get('entry', word),
                'explain': entry.get('explain', ''),
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
        print(f'spapro 服务启动: http://localhost:{PORT}  (词典代理: /api/dict?q=<word>)')
        print(f'  数据源: dictionaryapi.dev + 有道词典')
        httpd.serve_forever()
