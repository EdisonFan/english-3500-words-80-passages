import React from 'react';
import { Link } from 'react-router-dom';
import { hashColor, pickFg } from '../utils/helpers.js';

// 书卡片：旧 app.js renderBookCard 的 React 版本
export default function BookCard({ book }) {
  const initial = (book.title || book.id || '?').trim().charAt(0).toUpperCase();
  const bg = book.color || hashColor(book.id);
  const fg = book.cover ? '#fff' : pickFg(bg);

  return (
    <Link className="book-card" to={`/book/${book.id}`}>
      <div className="book-cover" style={{ background: bg }}>
        {book.cover ? (
          <img
            className="book-img"
            src={book.cover}
            alt={book.title}
            onError={e => {
              e.target.outerHTML = `<span class="book-initial" style="background:${bg};color:${fg}">${initial}</span>`;
            }}
          />
        ) : (
          <span className="book-initial" style={{ background: bg, color: fg }}>
            {initial}
          </span>
        )}
      </div>
      <div className="book-meta">
        <div className="book-title">{book.title}</div>
        {book.subtitle ? <div className="book-sub">{book.subtitle}</div> : null}
        <div className="book-stats">
          <span>{book.unitCount || 0} 单元</span>
          <span className="dot">·</span>
          <span>{book.passageCount || 0} 篇文章</span>
        </div>
      </div>
    </Link>
  );
}
