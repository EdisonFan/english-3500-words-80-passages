import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useNavigationType } from 'react-router-dom';
import HighlightedText from '../components/HighlightedText.jsx';
import { fetchPassage, fetchDict } from '../api/client.js';
import { useUIStore, useDictStore } from '../store/index.js';
import { findUnitTitle } from '../utils/helpers.js';

// 文章页：迁移自 app.js renderPassage / renderPassageContent
// 顶栏 + 正文（每段英文用 HighlightedText 渲染，词点击 → 跳 /dict?word=）
//
// ★单词点击跳转策略（双保险，对齐旧版 app.js openDictPage 的体验）
//   1) 优先 window.open 新标签页：标准浏览器里主标签页不销毁，滚动位置天然保留
//   2) iframe / 预览环境里 window.open 会被拦截 → 回退 SPA 内 navigate
//      此时 Passage 会被卸载，需在卸载前把 scrollY 存 sessionStorage
//      返回时（POP）读取并恢复；新进入（PUSH）滚到顶
export default function Passage() {
  const { bookId, pid } = useParams();
  const navigate = useNavigate();
  const navType = useNavigationType();
  const [state, setState] = useState({ loading: true, passage: null, error: null });
  const getDict = useDictStore(s => s.getDict);
  const setDict = useDictStore(s => s.setDict);

  useEffect(() => {
    const scrollKey = `passage-scroll:${bookId}:${pid}`;
    // 返回（POP）且有保存位置 → 恢复；否则滚到顶
    const saved = navType === 'POP' ? sessionStorage.getItem(scrollKey) : null;
    if (saved !== null) sessionStorage.removeItem(scrollKey);

    setState({ loading: true, passage: null, error: null });
    fetchPassage(bookId, pid)
      .then(j => {
        if (!j.ok) {
          setState({ loading: false, passage: null, error: j.error || '未知错误' });
        } else {
          setState({ loading: false, passage: j.passage, error: null });
          // 数据加载完成 + DOM 渲染后恢复滚动位置
          if (saved !== null) {
            requestAnimationFrame(() => window.scrollTo(0, parseInt(saved, 10) || 0));
          } else {
            window.scrollTo(0, 0);
          }
        }
      })
      .catch(e => setState({ loading: false, passage: null, error: e.message }));

    // 卸载或 bookId/pid 变化时：保存当前滚动位置（用于返回时恢复）
    return () => {
      sessionStorage.setItem(scrollKey, String(window.scrollY));
    };
  }, [bookId, pid, navType]);

  // 单词点击 → 跳 /dict?word=
  function handleWordClick(e, word) {
    e.stopPropagation();
    // 脉冲动画
    const target = e.currentTarget;
    target.classList.remove('pulsed');
    void target.offsetWidth;
    target.classList.add('pulsed');
    if (!word) return;

    const w = String(word).toLowerCase().trim();
    // 预热词典缓存：未命中则后台拉取写入 zustand，dict 页打开后命中零延迟
    if (!getDict(w)) {
      fetchDict(w).then(data => setDict(w, data)).catch(() => {});
    }

    const dictPath = `/dict?word=${encodeURIComponent(w)}`;
    // 优先新标签页打开（标准浏览器里主标签页不销毁，滚动位置天然保留）
    const fullUrl = `${window.location.origin}${window.location.pathname}#${dictPath}`;
    const win = window.open(fullUrl, '_blank');
    // iframe / 预览环境拦截弹窗 → win 为 null，回退 SPA 内跳转
    // 卸载前的 cleanup 会把 scrollY 存入 sessionStorage，返回时（POP）恢复
    if (!win) {
      navigate(dictPath);
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
