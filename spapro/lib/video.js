/**
 * 视频模块：
 * - handleSearchVideo：B 站搜索代理，关键词加 "单词" 后缀，过滤时长 10s~5min
 * - handleStream：B 站视频流式代理，支持 Range
 */
const https = require('https');
const { httpsGet, sendJson } = require('./http');
const { parseDuration } = require('./utils');
const logger = require('./logger');

async function handleSearchVideo(word, res) {
  const suffix = '单词';
  const keyword = `${word} ${suffix}`;
  const encodedKw = encodeURIComponent(keyword).replace(/%20/g, '+');
  const apiUrl = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodedKw}&page=1&pagesize=50`;

  logger.info(`[search-video] 收到请求 word=${JSON.stringify(word)} keyword=${JSON.stringify(keyword)}`);

  let data;
  let retryCount = 0;
  while (retryCount <= 5) {
    try {
      const resp = await httpsGet(apiUrl, {
        'User-Agent': 'Mozilla/5.0',
        'Cookie': 'buvid3=placeholder',
      });
      data = JSON.parse(resp.body);
      console.log(data);
      logger.info(`[search-video] B站返回 code=${data.code} numResults=${(data.data || {}).numResults}`);
      break;
    } catch (e) {
      retryCount++;
      if (retryCount > 5) {
        logger.warning(`[search-video] ❌ 请求失败: ${e.message}`);
        sendJson(res, 200, {
          ok: true, word, keyword, total: 0, list: [], fallback: true,
        });
        return;
      }
      logger.warning(`[search-video] ⚠️ 请求失败，准备第${retryCount}次重试: ${e.message}`);
      await new Promise(r => setTimeout(r, 300));
    }
  }

  if (data.code !== 0) {
    logger.error(`[search-video] ❌ B站接口错误: ${data.message}`);
    sendJson(res, 502, { ok: false, error: data.message || 'B站接口错误' });
    return;
  }

  const results = [];
  let filteredOutTitle = 0;
  const wordLower = word.toLowerCase();

  for (const item of ((data.data || {}).result) || []) {
    const durStr = item.duration || '0:0';
    const secs = parseDuration(durStr);
    if (secs < 10 || secs > 300) continue;

    const title = (item.title || '').replace(/<\/?em[^>]*>/g, '');
    const titleLower = title.toLowerCase();
    const tagLower = (item.tag || '').toLowerCase();
    if (!titleLower.includes(wordLower) || !tagLower.includes('英语')) {
      filteredOutTitle++;
      continue;
    }

    results.push({
      bvid: item.bvid || '',
      title,
      author: item.author || '',
      play: item.play || 0,
      duration: durStr,
      pic: item.pic || '',
    });
  }

  results.sort((a, b) => b.play - a.play);
  const top10 = results.slice(0, 10);

  logger.info(`[search-video] ✅ 过滤后返回 ${top10.length} 条 (标题不含单词过滤掉 ${filteredOutTitle} 条)`);

  sendJson(res, 200, {
    ok: true, word, keyword, total: top10.length, list: top10,
  });
}

function getCid(bvid) {
  const apiUrl = `https://api.bilibili.com/x/player/pagelist?bvid=${bvid}`;
  return httpsGet(apiUrl, { 'User-Agent': 'Mozilla/5.0' }).then(({ body }) => {
    const data = JSON.parse(body);
    if (data.code !== 0) throw new Error('pagelist 失败: ' + (data.message || ''));
    if (!data.data || data.data.length === 0) throw new Error('该视频无分P');
    return data.data[0].cid;
  });
}

function getMp4Url(bvid, cid) {
  const apiUrl = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=80&type=mp4`;
  return httpsGet(apiUrl, {
    'User-Agent': 'Mozilla/5.0',
    'Referer': 'https://www.bilibili.com',
  }).then(({ body }) => {
    const data = JSON.parse(body);
    if (data.code !== 0) throw new Error('playurl 失败: ' + (data.message || ''));
    const durl = (data.data || {}).durl || [];
    if (durl.length === 0) throw new Error('未返回 durl 直链');
    return { mp4Url: durl[0].url, quality: data.data.quality || 0 };
  });
}

function pipeMp4(mp4Url, req, res, onHeadersSent) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(mp4Url);
    const headers = {
      'User-Agent': 'Mozilla/5.0',
      'Referer': 'https://www.bilibili.com',
    };
    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }

    let proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy ||
                   process.env.HTTP_PROXY || process.env.http_proxy;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers,
    };

    if (proxyUrl) {
      const proxyParsed = new URL(proxyUrl);
      options.hostname = proxyParsed.hostname;
      options.port = proxyParsed.port || 443;
      options.path = mp4Url;
      options.headers = { ...options.headers, Host: parsed.hostname };
    }

    const upstreamReq = https.request(options, (upstreamRes) => {
      const outHeaders = {};
      const passThrough = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
      for (const k of passThrough) {
        if (upstreamRes.headers[k]) {
          outHeaders[k] = upstreamRes.headers[k];
        }
      }
      if (!outHeaders['content-type']) {
        outHeaders['content-type'] = 'video/mp4';
      }
      if (!outHeaders['accept-ranges']) {
        outHeaders['accept-ranges'] = 'bytes';
      }

      // === A方案：客户端浏览器磁盘缓存 ===
      // 同一 bvid 对应视频内容固定，URL 稳定 → 浏览器按 URL 缓存整文件
      // 命中后循环播放/刷新页面/重开浏览器均走 disk cache，0 网络请求
      // 仅对成功响应（200 完整 / 206 Range）加缓存，错误响应不缓存
      const sc = upstreamRes.statusCode;
      if (sc === 200 || sc === 206) {
        outHeaders['Cache-Control'] = 'public, max-age=86400, immutable';
        if (upstreamRes.headers['last-modified']) {
          outHeaders['Last-Modified'] = upstreamRes.headers['last-modified'];
        }
        if (upstreamRes.headers['etag']) {
          outHeaders['ETag'] = upstreamRes.headers['etag'];
        }
      }

      res.writeHead(upstreamRes.statusCode, outHeaders);
      onHeadersSent(true);

      upstreamRes.pipe(res);

      upstreamRes.on('end', resolve);
      upstreamRes.on('error', reject);
    });

    upstreamReq.on('error', reject);
    upstreamReq.setTimeout(30000, () => { upstreamReq.destroy(); reject(new Error('timeout')); });
    upstreamReq.end();
  });
}

function handleStream(bvid, req, res) {
  let headersSent = false;

  logger.info(`[stream] 收到请求 bvid=${bvid} range=${req.headers.range || '(无)'}`);

  getCid(bvid)
    .then((cid) => {
      logger.info(`[stream] 拿到 cid=${cid}`);
      return getMp4Url(bvid, cid).then(({ mp4Url, quality }) => {
        logger.info(`[stream] 拿到直链 quality=${quality}`);
        return pipeMp4(mp4Url, req, res, (sent) => { headersSent = sent; });
      });
    })
    .then(() => {
      logger.info(`[stream] ✅ 流式传输完成 bvid=${bvid}`);
    })
    .catch((e) => {
      logger.error(`[stream] ❌ 错误 bvid=${bvid}: ${e.message}`);
      if (!headersSent) {
        sendJson(res, 502, { ok: false, error: `视频流错误: ${e.message}` });
      }
    });
}

module.exports = { handleSearchVideo, handleStream };
