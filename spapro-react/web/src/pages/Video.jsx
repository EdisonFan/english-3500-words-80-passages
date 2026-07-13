import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { fetchSearchVideo, fetchVideoInfo, streamUrl } from '../api/client.js';
import { fmtPlayCount } from '../utils/helpers.js';

// 教学视频页：迁移自 video.html
// 抖音式上下滑动切换视频（CSS scroll-snap）
export default function Video() {
  const [searchParams] = useSearchParams();
  const word = (searchParams.get('word') || '').toLowerCase().trim();
  const [list, setList] = useState(null); // null=加载中, []=无结果, [...]=有视频
  const [currentIdx, setCurrentIdx] = useState(0);
  const feedRef = useRef(null);
  const videoRefs = useRef([]); // 每个 video 元素
  const infoCacheRef = useRef({});

  // 搜索视频
  useEffect(() => {
    if (!word) { setList([]); return; }
    setList(null);
    fetchSearchVideo(word)
      .then(j => {
        setList(j && j.ok && j.list ? j.list : []);
      })
      .catch(() => setList([]));
  }, [word]);

  // 渲染完后播第一个
  useEffect(() => {
    if (list && list.length) {
      const t = setTimeout(() => playVideoIdx(0), 100);
      return () => clearTimeout(t);
    }
  }, [list]);

  // 滚动监听（节流）：停稳后切换播放
  const onScroll = useCallback(() => {
    const feed = feedRef.current;
    if (!feed) return;
    const idx = Math.round(feed.scrollTop / feed.clientHeight);
    if (idx !== currentIdx) {
      setCurrentIdx(idx);
      playVideoIdx(idx);
    }
  }, [currentIdx]);

  // 切换播放：当前播、下一个预加载、上一个保留、远处清 src
  function playVideoIdx(idx) {
    const cards = videoRefs.current;
    if (!cards || !list || !list.length) return;
    for (let i = 0; i < cards.length; i++) {
      const video = cards[i];
      if (!video) continue;
      if (i === idx) {
        const src = streamUrl(list[i].bvid);
        if (video.getAttribute('data-loaded') !== src) {
          video.src = src;
          video.setAttribute('data-loaded', src);
          video.load();
        }
        video.play().catch(() => {});
      } else if (i === idx + 1) {
        const src = streamUrl(list[i].bvid);
        if (video.getAttribute('data-loaded') !== src) {
          video.src = src;
          video.setAttribute('data-loaded', src);
          video.load();
        }
        video.pause();
      } else if (i === idx - 1) {
        video.pause();
      } else {
        video.pause();
        if (video.src) {
          video.removeAttribute('src');
          video.removeAttribute('data-loaded');
          video.load();
        }
      }
    }
    setCurrentIdx(idx);
    fetchVideoInfoFor(idx);
  }

  function fetchVideoInfoFor(idx) {
    const v = list[idx];
    if (!v) return;
    const bvid = v.bvid;
    if (infoCacheRef.current[bvid] !== undefined) return;
    infoCacheRef.current[bvid] = null;
    fetchVideoInfo(bvid).catch(() => {});
  }

  // 切到新视频时还原竖屏模式（旧版有 landscape 切换，这里先简化为竖屏播放）
  function toggleLandscape(idx) {
    const feed = feedRef.current;
    if (!feed) return;
    const card = feed.children[idx];
    if (card) card.classList.toggle('landscape');
  }

  function goBack() {
    if (history.length > 1) history.back();
    else window.location.hash = '#/';
  }

  if (!word) {
    return <div className="video-loading"><div>缺少单词参数</div></div>;
  }
  if (list === null) {
    return (
      <div className="video-loading">
        <div className="video-spin"></div>
        <div>搜索 "{word}" 的教学视频…</div>
      </div>
    );
  }
  if (!list.length) {
    return <div className="video-loading"><div>没找到 "{word}" 的教学视频</div></div>;
  }

  return (
    <div className="video-page">
      <button className="video-back" onClick={goBack} aria-label="返回">
        <span className="video-back-arrow">‹</span>
      </button>
      <div className="video-feed" id="videoFeed" ref={feedRef} onScroll={onScroll}>
        {list.map((v, i) => (
          <div className="video-card" data-idx={i} key={v.bvid}>
            <div className="card-corner-btns">
              <button
                className="card-landscape-btn"
                title="横屏播放"
                onClick={() => toggleLandscape(i)}
              >⟲</button>
              <a
                className="card-download-btn"
                title="下载视频"
                href={streamUrl(v.bvid, true)}
                download={`${v.bvid}.mp4`}
                target="_blank"
                rel="noopener"
              >⬇</a>
            </div>
            <video
              ref={el => { videoRefs.current[i] = el; }}
              playsInline
              webkit-playsinline="true"
              preload="auto"
              loop
              controls
              controlsList="nodownload noplaybackrate noremoteplayback"
              poster={v.pic ? 'https:' + v.pic : undefined}
            />
            <div className="video-card-idx">{i + 1}/{list.length}</div>
            <div className="video-card-info">
              <div className="video-card-word">{word}</div>
              <div className="video-card-title">{v.title}</div>
              <div className="video-card-meta">@{v.author} · 播放 {fmtPlayCount(v.play)} · {v.duration}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
