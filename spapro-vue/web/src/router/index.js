import { createRouter, createWebHashHistory } from 'vue-router';
import Home from '../pages/Home.vue';
import Book from '../pages/Book.vue';
import Passage from '../pages/Passage.vue';
import SearchPage from '../pages/SearchPage.vue';
import Dict from '../pages/Dict.vue';
import Video from '../pages/Video.vue';

const routes = [
  { path: '/', component: Home, name: 'home' },
  { path: '/book/:bookId', component: Book, name: 'book' , meta: { restoreScroll: true }},
  { path: '/book/:bookId/passage/:pid', component: Passage, name: 'passage', meta: { restoreScroll: true } },
  { path: '/search', component: SearchPage, name: 'search' },
  { path: '/dict', component: Dict, name: 'dict', meta: { restoreScroll: true } },
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
  scrollBehavior(to, from, savedPosition) {
    let targetTop = 0;
    if (savedPosition) {
      targetTop = savedPosition.top;
    }

    if (targetTop > 0 && to.meta.restoreScroll) {
      return new Promise((resolve) => {
        let routeSwapped = false;

        const observer = new MutationObserver(() => {
          // 第一次触发 Mutation 说明 Vue 已经把旧页面（如 Dict）的 DOM 卸载，新页面（如 Passage 的 Loading 态）已挂载
          routeSwapped = true;
          
          // 只有在路由确实切换后，并且页面高度被异步数据撑开到足够滚动时，才执行恢复
          if (routeSwapped && document.documentElement.scrollHeight >= targetTop) {
            observer.disconnect();
            resolve({ top: targetTop });
          }
        });

        observer.observe(document.getElementById('app-root') || document.body, { 
          childList: true, 
          subtree: true 
        });

        // 兜底：最多等待 0.5 秒
        setTimeout(() => {
          observer.disconnect();
          resolve({ top: targetTop });
        }, 500);
      });
    }

    return { top: targetTop };
  },
});

export default router;
