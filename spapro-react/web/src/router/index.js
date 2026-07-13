import Vue from 'vue';
import VueRouter from 'vue-router';
import Home from '../pages/Home.vue';
import Book from '../pages/Book.vue';
import Passage from '../pages/Passage.vue';
import SearchPage from '../pages/SearchPage.vue';
import Dict from '../pages/Dict.vue';
import Video from '../pages/Video.vue';

Vue.use(VueRouter);

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
    beforeEnter: (to, from, next) => {
      const num = parseInt(to.params.n, 10);
      if (num >= 1 && num <= 80) {
        next(`/book/3500/passage/p${String(num).padStart(3, '0')}`);
      } else {
        next('/');
      }
    },
  },
  { path: '*', redirect: '/' },
];

const router = new VueRouter({
  mode: 'hash',
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition;
    return { x: 0, y: 0 };
  },
});

export default router;
