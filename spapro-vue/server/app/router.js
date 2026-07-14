'use strict';

module.exports = app => {
  const { router, controller } = app;

  // 多本书
  router.get('/api/books', controller.books.list);
  router.get('/api/book/:bookId', controller.books.show);
  router.get('/api/book/:bookId/passage/:pid', controller.books.passage);

  // 词典
  router.get('/api/dict', controller.dict.show);

  // 视频搜索 + 视频流
  router.get('/api/search-video', controller.video.search);
  router.get('/api/video-info', controller.video.info);
  router.get('/api/stream', controller.video.stream);

  // AI 聊天（SSE 流）
  router.post('/api/chat', controller.chat.send);

  // 全局搜词
  router.get('/api/search', controller.search.search);
};
