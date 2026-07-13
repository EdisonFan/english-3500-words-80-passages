import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchBook } from '../api/client.js';

// 单元目录页：迁移自 app.js renderBook / renderBookContent
export default function Book() {
  const { bookId } = useParams();
  const [state, setState] = useState({ loading: true, book: null, passages: [], error: null });

  useEffect(() => {
    window.scrollTo(0, 0);
    setState({ loading: true, book: null, passages: [], error: null });
    fetchBook(bookId)
      .then(j => {
        if (!j.ok) {
          setState({ loading: false, book: null, passages: [], error: j.error || '加载失败' });
        } else {
          setState({ loading: false, book: j.book, passages: j.passages || [], error: null });
        }
      })
      .catch(e => setState({ loading: false, book: null, passages: [], error: e.message }));
  }, [bookId]);

  if (state.loading) {
    return (
      <>
        <TopBar title="加载中…" bookId={bookId} />
        <div className="wrap book-page">
          <div className="book-page-head">
            <div className="muted">正在加载…</div>
          </div>
        </div>
      </>
    );
  }
  if (state.error || !state.book) {
    return (
      <div className="wrap book-page">
        <p className="muted">{state.error || '书不存在或加载失败'}</p>
        <p><Link className="link" to="/">← 返回书库</Link></p>
      </div>
    );
  }

  const book = state.book;
  const byId = {};
  state.passages.forEach(p => { byId[p.id] = p; });

  return (
    <>
      <TopBar title={book.title} bookId={bookId} />
      <div className="wrap book-page">
        <div className="book-page-head">
          <div className="book-page-title">{book.title}</div>
          {book.subtitle ? <div className="book-page-sub muted">{book.subtitle}</div> : null}
          {book.desc ? <div className="book-page-desc muted">{book.desc}</div> : null}
          <div className="book-page-stats">
            <span>{(book.units || []).length} 单元</span>
            <span className="dot">·</span>
            <span>{book.passageCount || 0} 篇文章</span>
          </div>
        </div>
        {(book.units || []).map(unit => (
          <div className="unit-section" key={unit.id || unit.num}>
            <div className="unit-head">
              <span className="unit-num">UNIT {unit.num}</span>
              <span className="unit-title">{unit.title}</span>
              <span className="unit-range">{unit.passages.length} 篇</span>
            </div>
            <div className="passage-list">
              {unit.passages.map(pid => {
                const p = byId[pid];
                if (!p) {
                  return (
                    <Link className="passage-item" key={pid} to={`/book/${bookId}/passage/${pid}`}>
                      <div className="pi-num">PASSAGE {pid.replace(/^p/, '')}</div>
                      <div className="pi-title muted">（摘要缺失）</div>
                    </Link>
                  );
                }
                return (
                  <Link className="passage-item" key={pid} to={`/book/${bookId}/passage/${p.id}`}>
                    <div className="pi-num">PASSAGE {String(p.num).padStart(2, '0')}</div>
                    <div className="pi-title">{p.title}</div>
                    {p.preview ? <div className="pi-preview">{p.preview}</div> : null}
                    <div className="pi-stats">词数 {p.wordCount || 0} · 核心 {p.coreCount || 0}</div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function TopBar({ title, bookId }) {
  return (
    <div className="topbar">
      <div className="topbar-inner">
        <Link className="topbar-left" to="/">
          <span className="dot"></span>
          <span>书库</span>
        </Link>
        <div className="topbar-right">
          <span className="book-page-name">{title}</span>
        </div>
      </div>
    </div>
  );
}
