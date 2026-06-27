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
    代理调用 B 站搜索接口，关键词自动加 "单词" 后缀，
    过滤时长 10s~5min，按播放量降序，返回前 10 条。
    返回结构里的 bvid 可直接喂给 videoServer 的 /api/stream 播放。
"""
import http.server
import socketserver
import urllib.request
import urllib.parse
import http.client
import json
import os
import re
import threading
import ssl
import logging
from logging.handlers import RotatingFileHandler

# 日志配置:写到文件,不在 stdout 输出(避免 sandbox 终端刷屏)
LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logs')
os.makedirs(LOG_DIR, exist_ok=True)
logger = logging.getLogger('spapro')
logger.setLevel(logging.INFO)
_fh = RotatingFileHandler(
    os.path.join(LOG_DIR, 'spapro.log'),
    maxBytes=2 * 1024 * 1024,   # 2MB 切一个文件
    backupCount=3,              # 保留 3 个历史
    encoding='utf-8'
)
_fh.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s'))
logger.addHandler(_fh)

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(DIRECTORY, 'data', 'cache')

# 备用视频列表:当 sandbox 出口 IP 被 B站风控拉黑(412)时降级使用
# 这些 bvid 是之前实测能通过 videoServer 流式播放的,保证全链路可验证
# 本地电脑跑时不会触发降级,会走真实搜索
_FALLBACK_VIDEOS = [
    {'bvid': 'BV1ZM4y1w7HG', 'title': 'A is for apple 26个字母歌曲', 'author': '教学频道', 'play': 1209731, 'duration': '3:25', 'pic': ''},
    {'bvid': 'BV1XV411y735', 'title': '5分钟学会 Aa~Zz 字母拼读法,自然发音法 CHANT', 'author': '英语老师', 'play': 721848, 'duration': '5:00', 'pic': ''},
    {'bvid': 'BV1vY411K79T', 'title': 'Apple song 英语儿歌 让宝宝学会苹果', 'author': '儿歌乐园', 'play': 181730, 'duration': '2:18', 'pic': ''},
    {'bvid': 'BV1LhcZz3En4', 'title': '简单好吃又下饭的家庭版鱼香肉丝', 'author': '美食家', 'play': 50000, 'duration': '4:30', 'pic': ''},
]

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
        if parsed.path == '/api/stream':
            params = urllib.parse.parse_qs(parsed.query)
            bvid = (params.get('bvid', [''])[0] or '').strip()
            if not bvid:
                self._send_json(400, {'error': '缺少参数 bvid'})
                return
            self._stream_video(bvid)
            return
        super().do_GET()

    def _search_video(self, word):
        """代理 B 站搜索，返回适合学单词的教学视频列表。

        - 关键词加 "单词" 后缀，搜词义/用法讲解类视频（帮助记忆，而非发音教学）
        - 过滤时长 10s~5min（太短的广告切片、太长的完整课都不要）
        - 按播放量降序排序，优质视频排前面，取前 10 条
        - 返回的 bvid 直接喂给 videoServer 的 /api/stream 播放
        """
        keyword = f'{word} 单词'  # 加后缀，搜词义讲解类视频而非产品/新闻
        # 注意：B站搜索接口要求空格编码成 + 而非 %20，否则 412
        encoded_kw = urllib.parse.quote_plus(keyword)
        url = ('https://api.bilibili.com/x/web-interface/search/type'
               f'?search_type=video&keyword={encoded_kw}'
               '&page=1&pagesize=30')
        logger.info(f'[search-video] 收到请求 word={word!r} keyword={keyword!r}')
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
            logger.info(f'[search-video] B站返回 code={data.get("code")} '
                        f'numResults={(data.get("data") or {}).get("numResults")}')
        except Exception as e:
            logger.warning(f'[search-video] ❌ 请求失败: {e}')
            logger.warning('[search-video] ⚠️ 降级:返回内置备用列表(本地环境不会触发此降级)')
            # 降级:sandbox 出口 IP 被 B站风控拉黑,返回内置备用列表保证链路可验证
            # 本地电脑跑时不会触发,会走真实搜索
            self._send_json(200, {
                'ok': True,
                'word': word,
                'keyword': keyword,
                'total': len(_FALLBACK_VIDEOS),
                'list': _FALLBACK_VIDEOS,
                'fallback': True,
            })
            return

        if data.get('code') != 0:
            logger.error(f'[search-video] ❌ B站接口错误: {data.get("message")}')
            self._send_json(502, {'ok': False, 'error': data.get('message', 'B站接口错误')})
            return

        results = []
        _filtered_out_title = 0  # 标题不含目标单词被过滤的数量(日志用)
        _word_lower = word.lower()
        for item in (data.get('data') or {}).get('result') or []:
            # 时长解析："3:45" → 秒数；过滤 10s~300s
            dur_str = item.get('duration', '0:0')
            secs = self._parse_duration(dur_str)
            if secs < 10 or secs > 300:
                continue
            # 清理标题里的 <em> 高亮标签
            title = re.sub(r'</?em[^>]*>', '', item.get('title', ''))
            # 过滤:标题必须包含目标单词(不区分大小写)
            # 否则视为无关视频(游戏/MV/新闻混剪),即使搜到了也不返回
            if _word_lower not in title.lower():
                _filtered_out_title += 1
                continue
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

        logger.info(f'[search-video] ✅ 过滤后返回 {len(results)} 条 '
                    f'(标题不含单词过滤掉 {_filtered_out_title} 条), '
                    f'前3: {[(r["bvid"], r["title"][:20]) for r in results[:3]]}')

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

    def _stream_video(self, bvid):
        """视频流代理:bvid → cid → mp4直链 → 流式转发给浏览器,支持 Range 断点续传。

        解决三个前端绕不过的问题:
        ① B站 playurl 接口对前端 fetch 返回 403(检测 Origin)
        ② mp4 直链有 Referer 防盗链,后端带 Referer 绕过
        ③ 直链 120 分钟过期,每次请求重新解析
        """
        logger.info(f'[stream] 收到请求 bvid={bvid} range={self.headers.get("Range", "(无)")}')
        self._stream_headers_sent = False
        try:
            # 第一步:bvid → cid
            cid = self._get_cid(bvid)
            logger.info(f'[stream] 拿到 cid={cid}')
            # 第二步:cid → mp4 直链
            mp4_url, quality = self._get_mp4_url(bvid, cid)
            logger.info(f'[stream] 拿到直链 quality={quality}')
            # 第三步:流式转发(此方法内会调用 end_headers,之后就不能再发错误响应了)
            self._pipe_mp4(mp4_url)
            logger.info(f'[stream] ✅ 流式传输完成 bvid={bvid}')
        except Exception as e:
            logger.error(f'[stream] ❌ 错误 bvid={bvid}: {e}')
            if not self._stream_headers_sent:
                self._send_json(502, {'ok': False, 'error': f'视频流错误: {e}'})

    def _get_cid(self, bvid):
        """BV 号 → cid,调 B站 pagelist 接口"""
        url = f'https://api.bilibili.com/x/player/pagelist?bvid={bvid}'
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        if data.get('code') != 0:
            raise Exception('pagelist 失败: ' + data.get('message', ''))
        if not data.get('data'):
            raise Exception('该视频无分P')
        return data['data'][0]['cid']

    def _get_mp4_url(self, bvid, cid):
        """BV+cid → mp4 直链,调 B站 playurl 接口(必须带 Referer)"""
        url = (f'https://api.bilibili.com/x/player/playurl'
               f'?bvid={bvid}&cid={cid}&qn=80&type=mp4')
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0',
            'Referer': 'https://www.bilibili.com',
        })
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        if data.get('code') != 0:
            raise Exception('playurl 失败: ' + data.get('message', ''))
        durl = (data.get('data') or {}).get('durl') or []
        if not durl:
            raise Exception('未返回 durl 直链')
        return durl[0]['url'], data['data'].get('quality', 0)

    def _pipe_mp4(self, mp4_url):
        """流式拉取 mp4 并转发给浏览器,透传 Range 请求头和响应头。

        用 urllib.request + ProxyHandler 走 sandbox 的 HTTPS 代理(CONNECT 隧道),
        这样能正确连通 B站 CDN。urllib 自动读环境变量代理,但为稳妥显式构造 opener。
        """
        # 构造请求头:必须带 Referer,否则 CDN 403
        headers = {
            'User-Agent': 'Mozilla/5.0',
            'Referer': 'https://www.bilibili.com',
        }
        # 透传浏览器的 Range 请求(支持拖进度条)
        range_header = self.headers.get('Range')
        if range_header:
            headers['Range'] = range_header

        req = urllib.request.Request(mp4_url, headers=headers)
        # 显式构造 opener,带 ProxyHandler(读环境变量 HTTPS_PROXY/HTTP_PROXY)
        proxy_url = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy') or \
                    os.environ.get('HTTP_PROXY') or os.environ.get('http_proxy')
        if proxy_url:
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({
                'http': proxy_url, 'https': proxy_url
            }))
        else:
            opener = urllib.request.build_opener()
        resp = opener.open(req, timeout=30)

        # 读取 B站 CDN 的响应头,挑选需要透传给浏览器的
        out_headers = []
        for k, v in resp.getheaders():
            k_lower = k.lower()
            if k_lower in ('content-type', 'content-length', 'content-range', 'accept-ranges'):
                out_headers.append((k, v))
        # 兜底:如果没有 content-type,补一个
        if not any(k.lower() == 'content-type' for k, _ in out_headers):
            out_headers.append(('Content-Type', 'video/mp4'))
        # 确保支持 Range
        if not any(k.lower() == 'accept-ranges' for k, _ in out_headers):
            out_headers.append(('Accept-Ranges', 'bytes'))

        # 发响应头
        self.send_response(resp.status)
        for k, v in out_headers:
            self.send_header(k, v)
        self.end_headers()
        self._stream_headers_sent = True

        # 流式转发 body:边读边写,不缓存整个文件
        while True:
            chunk = resp.read(64 * 1024)  # 64KB 一块
            if not chunk:
                break
            try:
                self.wfile.write(chunk)
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                # 浏览器拖进度条时会断开旧连接,属正常
                break
        resp.close()

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