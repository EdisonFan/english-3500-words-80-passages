import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { fetchSearch } from '../api/client.js';

// 全局搜词页：迁移自 app.js renderSearch
export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') || '';
  const [input, setInput] = useState(q);
  const [state, setState] = useState({ loading: false, results: null, error: null });

  // 同步 URL ?q 到 input
  useEffect(() => { setInput(q); }, [q]);

  // 触发搜索
  useEffect(() => {
    if (!q) { setState({ loading: false, results: null, error: null }); return; }
    window.scrollTo(0, 0);
    setState({ loading: true, results: null, error: null });
    fetchSearch(q)
      .then(j => {
        if (!j.ok) setState({ loading: false, results: null, error: '搜索失败' });
        else setState({ loading: false, results: j.results || [], error: null });
      })
      .catch(e => setState({ loading: false, results: null, error: e.message }));
  }, [q]);

  function doSearch(e) {
    if (e) e.preventDefault();
    const v = input.trim();
    if (!v) return;
    setSearchParams({ q: v });
  }

  return (
    <>
      <div className="topbar">
        <div className="topbar-inner">
          <Link className="topbar-left" to="/">
            <span className="dot"></span>
            <span>书库</span>
          </Link>
          <div className="topbar-right">
            <span>全局搜词</span>
          </div>
        </div>
      </div>
      <div className="wrap search-page">
        <form className="search-box" onSubmit={doSearch}>
          <input
            type="text"
            placeholder="搜索单词"
            autoComplete="off"
            value={input}
            onChange={e => setInput(e.target.value)}
          />
          <button type="submit">搜索</button>
        </form>
        <div>
          {!q ? null : state.loading ? (
            <div className="muted">正在搜索…</div>
          ) : state.error ? (
            <div className="muted">搜索失败：{state.error}</div>
          ) : !state.results || !state.results.length ? (
            <div className="muted">未找到「{q}」相关的结果</div>
          ) : (
            <SearchResults results={state.results} />
          )}
        </div>
      </div>
    </>
  );
}

function SearchResults({ results }) {
  return (
    <>
      <div className="search-count">共 {results.length} 篇文章命中</div>
      {results.map((r, i) => (
        <div className="search-result-item" key={r.bookId + '/' + r.pid + '/' + i}>
          <div className="sri-head">
            <span className="sri-book">{r.bookTitle}</span>
            <Link
              className="sri-link"
              to={`/book/${r.bookId}/passage/${r.pid}`}
            >
              {r.passageTitle}
            </Link>
            <span className="sri-count">{r.matches.length} 处</span>
          </div>
          <div className="sri-matches">
            {r.matches.map((m, mi) => <Match key={mi} m={m} />)}
          </div>
        </div>
      ))}
    </>
  );
}

function Match({ m }) {
  if (m.type === 'vocab') {
    return (
      <div className="sri-match">
        <span className="search-tag search-tag-vocab">词汇表</span>
        <span className="search-vocab-word">{m.word}</span>
        {m.pos ? <span className="search-vocab-pos">{m.pos}</span> : null}
        {m.meaning ? <span className="search-vocab-meaning">{m.meaning}</span> : null}
      </div>
    );
  }
  if (m.type === 'marked') {
    return (
      <div className="sri-match">
        <span className="search-tag search-tag-marked">教学词 · 第{m.paraNum}段</span>
        <div className="search-snippet">{m.snippet}</div>
      </div>
    );
  }
  return (
    <div className="sri-match">
      <span className="search-tag search-tag-text">正文 · 第{m.paraNum}段</span>
      <div className="search-snippet">{m.snippet}</div>
    </div>
  );
}
