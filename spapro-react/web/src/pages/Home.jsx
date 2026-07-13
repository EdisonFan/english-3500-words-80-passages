import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import BookCard from '../components/BookCard.jsx';
import { fetchBooks } from '../api/client.js';

// 首页：书列表 + 全局搜索框（迁移自 app.js renderHome）
export default function Home() {
  const [books, setBooks] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo(0, 0);
    fetchBooks()
      .then(setBooks)
      .catch(e => setError(e.message));
  }, []);

  function doSearch(e) {
    if (e) e.preventDefault();
    const v = q.trim();
    if (v) navigate(`/search?q=${encodeURIComponent(v)}`);
  }

  return (
    <div className="home">
      <div className="home-head">
        <h1>英语精读 · 书房</h1>
        <p className="muted">选择一本书开始阅读</p>
      </div>
      <form className="search-box" onSubmit={doSearch}>
        <input
          type="text"
          placeholder="搜索单词，例如 action / permit"
          autoComplete="off"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <button type="submit">搜索</button>
      </form>
      <div className="book-grid">
        {books === null && !error ? (
          <div className="book-loading">正在加载书库…</div>
        ) : error ? (
          <div className="book-empty">加载失败：{error}</div>
        ) : books.length === 0 ? (
          <div className="book-empty">书库是空的</div>
        ) : (
          books.map(b => <BookCard key={b.id} book={b} />)
        )}
      </div>
    </div>
  );
}
