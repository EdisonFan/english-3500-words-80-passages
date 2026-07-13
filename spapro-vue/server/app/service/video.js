'use strict';

const Service = require('egg').Service;

// 备用视频列表：B 站 412 风控时降级使用（与旧版一致）
const FALLBACK_VIDEOS = [
  { bvid: 'BV1ZM4y1w7HG', title: `${'单词'} 教学视频 1`, author: 'fallback', play: 0, duration: '0:60', pic: '' },
  { bvid: 'BV1Lm4y1V7Pr', title: `${'单词'} 教学视频 2`, author: 'fallback', play: 0, duration: '1:30', pic: '' },
];

class VideoService extends Service {
  // 通用 fetch 工具（带超时）
  async _fetch(url, headers, timeout = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const resp = await fetch(url, { headers, signal: controller.signal });
      const body = await resp.text();
      const headersObj = {};
      resp.headers.forEach((v, k) => { headersObj[k] = v; });
      return { statusCode: resp.status, headers: headersObj, body };
    } finally {
      clearTimeout(timer);
    }
  }

  // B 站搜索代理：keyword = "{word} 单词"
  async searchVideos(word) {
    const suffix = '单词';
    const keyword = `${word} ${suffix}`;
    const encodedKw = encodeURIComponent(keyword).replace(/%20/g, '+');
    const apiUrl = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodedKw}&page=1&pagesize=50`;

    let data;
    let retryCount = 0;
    while (retryCount <= 5) {
      try {
        const resp = await this._fetch(apiUrl, {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: '*/*',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          Cookie: 'buvid3=placeholder',
        });
        data = JSON.parse(resp.body);
        break;
      } catch (e) {
        retryCount++;
        if (retryCount > 5) {
          return { ok: true, word, keyword, total: 0, list: [], fallback: true };
        }
        await new Promise(r => setTimeout(r, 300));
      }
    }

    if (data.code !== 0) {
      return { ok: false, error: data.message || 'B站接口错误', status: 502 };
    }

    const results = [];
    const wordLower = word.toLowerCase();
    const utils = this.ctx.service.utils;

    for (const item of (((data.data || {}).result) || [])) {
      const durStr = item.duration || '0:0';
      const secs = utils.parseDuration(durStr);
      if (secs < 10 || secs > 300) continue;

      const title = (item.title || '').replace(/<\/?em[^>]*>/g, '');
      const titleLower = title.toLowerCase();
      const tagLower = (item.tag || '').toLowerCase();
      if (!titleLower.includes(wordLower) || !tagLower.includes('英语')) continue;

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
    return { ok: true, word, keyword, total: top10.length, list: top10 };
  }

  // 拿 cid + 维度（共用）
  async _getVideoInfo(bvid) {
    const apiUrl = `https://api.bilibili.com/x/player/pagelist?bvid=${bvid}`;
    const { body } = await this._fetch(apiUrl, {
      'User-Agent': 'Mozilla/5.0',
      Accept: '*/*',
    });
    const data = JSON.parse(body);
    if (data.code !== 0) throw new Error('pagelist 失败: ' + (data.message || ''));
    if (!data.data || data.data.length === 0) throw new Error('该视频无分P');
    const first = data.data[0];
    const dim = first.dimension || { width: 0, height: 0, rotate: 0 };
    return { cid: first.cid, width: dim.width || 0, height: dim.height || 0, rotate: dim.rotate || 0 };
  }

  async getVideoInfo(bvid) {
    try {
      const info = await this._getVideoInfo(bvid);
      const landscape = info.rotate === 0 ? info.width > info.height : info.width < info.height;
      return { ok: true, bvid, width: info.width, height: info.height, rotate: info.rotate, landscape };
    } catch (e) {
      return { ok: false, bvid, error: e.message };
    }
  }

  async _getMp4Url(bvid, cid) {
    const apiUrl = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=80&type=mp4`;
    const { body } = await this._fetch(apiUrl, {
      'User-Agent': 'Mozilla/5.0',
      Accept: '*/*',
      Referer: 'https://www.bilibili.com',
    });
    const data = JSON.parse(body);
    if (data.code !== 0) throw new Error('playurl 失败: ' + (data.message || ''));
    const durl = (data.data || {}).durl || [];
    if (durl.length === 0) throw new Error('未返回 durl 直链');
    return { mp4Url: durl[0].url, quality: data.data.quality || 0 };
  }

  // 视频流：流式转发，支持 Range
  async streamTo(bvid, rangeHeader) {
    const info = await this._getVideoInfo(bvid);
    const { mp4Url } = await this._getMp4Url(bvid, info.cid);

    const headers = {
      'User-Agent': 'Mozilla/5.0',
      Accept: '*/*',
      Referer: 'https://www.bilibili.com',
    };
    if (rangeHeader) headers.Range = rangeHeader;

    const controller = new AbortController();
    const upstream = await fetch(mp4Url, { headers, signal: controller.signal });
    return { upstream, info };
  }
}

module.exports = VideoService;
