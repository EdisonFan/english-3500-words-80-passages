import { createRouter, createWebHashHistory } from 'vue-router';
import Home from '../pages/Home.vue';
import Book from '../pages/Book.vue';
import Passage from '../pages/Passage.vue';
import SearchPage from '../pages/SearchPage.vue';
import Dict from '../pages/Dict.vue';
import Video from '../pages/Video.vue';

const routes = [
  { path: '/', component: Home, name: 'home' },
  { path: '/book/:bookId', component: Book, name: 'book' },
  { path: '/book/:bookId/passage/:pid', component: Passage, name: 'passage' },
  { path: '/search', component: SearchPage, name: 'search' },
  { path: '/dict', component: Dict, name: 'dict' },
  { path: '/video', component: Video, name: 'video' },
  // 兼容老 hash 路径 #/数字 → #/book/3500/passage/p00N
  {
    path: '/:n',
    beforeEnter: (to) => {
      const num = parseInt(to.params.n, 10);
      if (num >= 1 && num <= 80) {
        return `/book/3500/passage/p${String(num).padStart(3, '0')}`;
      }
      return '/';
    },
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  // ★keep-alive 的 Passage 页面自己管理滚动（onActivated/onDeactivated）
  // 这里只对非 Passage 路由处理；Passage 返回 false 让 router 不介入
  scrollBehavior(to, from, savedPosition) {
    // Passage 路由：交给组件的 onActivated 处理，router 不滚动
    if (to.name === 'passage') return false;
    // 其他路由：有 savedPosition（浏览器前进/后退）就用，否则滚到顶
    if (savedPosition) return savedPosition;
    return { top: 0 };
  },
});

export default router;
