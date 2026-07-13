import React, { useEffect } from 'react';
import { Routes, Route, useLocation, Navigate, useParams } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Book from './pages/Book.jsx';
import Passage from './pages/Passage.jsx';
import SearchPage from './pages/SearchPage.jsx';
import Dict from './pages/Dict.jsx';
import Video from './pages/Video.jsx';
import AIAssistant from './components/AIAssistant.jsx';
import { useUIStore } from './store/index.js';

// 根据开关给 body 加 class（与旧 app.js applyGloss/applyTrans 等价）
function useBodyClass() {
  const glossOn = useUIStore(s => s.glossOn);
  const transOn = useUIStore(s => s.transOn);
  useEffect(() => {
    document.body.classList.toggle('no-gloss', !glossOn);
  }, [glossOn]);
  useEffect(() => {
    document.body.classList.toggle('show-trans', transOn);
  }, [transOn]);
}

// 兼容老 hash 路径 #/数字 → #/book/3500/passage/p00N
function LegacyRedirect() {
  const { n } = useParams();
  const num = parseInt(n, 10);
  if (num >= 1 && num <= 80) {
    return <Navigate to={`/book/3500/passage/p${String(num).padStart(3, '0')}`} replace />;
  }
  return <Navigate to="/" replace />;
}

export default function App() {
  useBodyClass();
  const location = useLocation();

  // AI 助手只在文章页显示（与旧版一致）
  const showAI = /^\/book\/[^/]+\/passage\//.test(location.pathname);

  return (
    <>
      <Routes>
        <Route path="/:n" element={<LegacyRedirect />} />
        <Route path="/" element={<Home />} />
        <Route path="/book/:bookId" element={<Book />} />
        <Route path="/book/:bookId/passage/:pid" element={<Passage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/dict" element={<Dict />} />
        <Route path="/video" element={<Video />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <AIAssistant visible={showAI} />
    </>
  );
}
