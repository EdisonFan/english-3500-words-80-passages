import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import HighlightedText from '../components/HighlightedText.jsx';
import { fetchPassage, fetchDict } from '../api/client.js';
import { useUIStore, useDictStore } from '../store/index.js';
import { findUnitTitle } from '../utils/helpers.js';

// 文章页：迁移自 app.js renderPassage / renderPassageContent
// 顶栏 + 正文（每段英文用 HighlightedText 渲染，词点击 → 新标签页打开 /dict?word=）
//
// ★点击单词用 window.open 新标签页打开（与旧版 app.js openDictPage 一致）
//   - 主标签页（文章页）不被销毁，滚动位置浏览器天然保留
//   - React Router 内 navigate 会卸载 Passage 组件导致滚动丢失，弃用
//   - 同时预热词典缓存：拉到的数据塞 zustand，dict 新标签页打开后命中零延迟
export default function Passage() {
  const { bookId, pid } = useParams();
  const [state, setState] = useState({ loading: true, passage: null, error: null });
  const getDict = useDictStore(s => s.getDict);
  const setDict = useDictStore(s => s.setDict);

  useEffect(() => {
    window.scrollTo(0, 0);
    setState({ loading: true, passage: null, error: null });
    fetchPassage(bookId, pid)
      .then(j => {
        if (!j.ok) {
          setState({ loading: false, passage: null, error: j.error || '未知错误' });
        } else {
          setState({ loading: false, passage: j.passage, error: null });
        }
      })
      .catch(e => setState({ loading: false, passage: null, error: e.message }));
  }, [bookId, pid]);

  // 单词点击 → 新标签页打开 /dict?word=（与旧版一致）
  function handleWordClick(e, word) {
    e.stopPropagation();
    // 脉冲动画
    const target = e.currentTarget;
    target.classList.remove('pulsed');
    void target.offsetWidth;
    target.classList.add('pulsed');
    if (!word) return;

    const w = String(word).toLowerCase().trim();
    // 预热词典缓存：未命中则后台拉取写入 zustand，dict 新标签页打开后命中零延迟
    if (!getDict(w)) {
      fetchDict(w).then(data => setDict(w, data)).catch(() => {});
    }
    // 新标签页打开（不被弹窗拦截：用户点击触发，浏览器允许）
    const url = `#/dict?word=${encodeURIComponent(w)}`;
    window.open(url, '_blank');
  }

  if (state.loading) {
    return (
      <div className="wrap">
        <div className="article">
          <p className="muted">正在加载…</p>
        </div>
      </div>
    );
  }
  if (state.error || !state.passage) {
    return (
      <div className="wrap">
        <div className="article">
          <p>加载失败：{state.error || '未知错误'}</p>
        </div>
      </div>
    );
  }

  const data = state.passage;
  const id = parseInt(String(pid).replace(/^p/, ''), 10) || data.id || 0;
  const num = String(id).padStart(2, '0');
  const unitTitle = findUnitTitle(id);

  return (
    <>
      <PassageTopBar bookId={bookId} pid={pid} num={num} data={data} id={id} />
      <div className="wrap">
        <article className="article">
          <div className="section-tag">English · {unitTitle || ''}</div>
          {data.paragraphs.map(p => (
            <div className="para" key={p.num}>
              <div className="para-num">{p.num}</div>
              <p className="eng">
                <HighlightedText text={p.en} vocab={data.vocab} onWordClick={handleWordClick} />
              </p>
              {p.cn ? <p className="cn">{p.cn}</p> : null}
            </div>
          ))}
        </article>
        <footer>PASSAGE {num} · END</footer>
      </div>
    </>
  );
}

function PassageTopBar({ bookId, pid, num, data, id }) {
  const glossOn = useUIStore(s => s.glossOn);
  const transOn = useUIStore(s => s.transOn);
  const toggleGloss = useUIStore(s => s.toggleGloss);
  const toggleTrans = useUIStore(s => s.toggleTrans);

  return (
    <div className="topbar">
      <div className="topbar-inner">
        <Link className="topbar-left" to={`/book/${bookId}`}>
          <span className="dot"></span>
          <span>PASSAGE {num} / {data._bookPassageCount || '?'}</span>
        </Link>
        <div className="topbar-right">
          <span
            className={`gloss-toggle${glossOn ? '' : ' off'}`}
            id="glossToggle"
            title="显示/隐藏英文词下方中文注释"
            onClick={toggleGloss}
          >
            <span className="g-dot"></span>
            <span className="g-label">{glossOn ? '中文释义' : '已隐藏'}</span>
          </span>
          <span
            className={`trans-toggle${transOn ? '' : ' off'}`}
            id="transToggle"
            title="显示/隐藏段落中文翻译"
            onClick={toggleTrans}
          >
            <span className="t-dot"></span>
            <span className="t-label">{transOn ? '中文译文' : '译文隐藏'}</span>
          </span>
          <span>Words <b>{(data.stats && data.stats.words) || ''}</b></span>
          <span>Core <b>{(data.stats && data.stats.core) || ''}</b></span>
          {id > 1 && (
            <Link className="nav-btn" to={`/book/${bookId}/passage/p${String(id - 1).padStart(3, '0')}`}>
              ← 上一篇
            </Link>
          )}
          <Link className="nav-btn" to={`/book/${bookId}/passage/p${String(id + 1).padStart(3, '0')}`}>
            下一篇 →
          </Link>
        </div>
      </div>
    </div>
  );
}
