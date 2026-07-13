import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import HighlightedText from '../components/HighlightedText.jsx';
import { fetchPassage } from '../api/client.js';
import { useUIStore, useDictStore } from '../store/index.js';
import { findUnitTitle } from '../utils/helpers.js';

// 文章页：迁移自 app.js renderPassage / renderPassageContent
// 顶栏 + 正文（每段英文用 HighlightedText 渲染，词点击 → 跳 /dict?word=）
export default function Passage() {
  const { bookId, pid } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, passage: null, error: null });
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

  // 单词点击 → 跳 /dict?word=（新标签页打开）
  function handleWordClick(e, word) {
    e.stopPropagation();
    // 脉冲动画（与旧版一致）
    const target = e.currentTarget;
    target.classList.remove('pulsed');
    void target.offsetWidth;
    target.classList.add('pulsed');
    if (word) {
      // 兜底查词典并写缓存（dict 页会读这个缓存命中加速）
      const w = String(word).toLowerCase().trim();
      navigate(`/dict?word=${encodeURIComponent(w)}`);
    }
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
