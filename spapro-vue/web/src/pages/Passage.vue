<template>
  <div>
    <div class="topbar" v-if="!loading && passage">
      <div class="topbar-inner">
        <router-link class="topbar-left" :to="`/book/${bookId}`">
          <span class="dot"></span>
          <span>PASSAGE {{ num }} / {{ (passage && passage._bookPassageCount) || '?' }}</span>
        </router-link>
        <div class="topbar-right">
          <span
            class="gloss-toggle"
            :class="{ off: !glossOn }"
            title="显示/隐藏英文词下方中文注释"
            @click="toggleGloss"
          >
            <span class="g-dot"></span>
            <span class="g-label">{{ glossOn ? '中文释义' : '已隐藏' }}</span>
          </span>
          <span
            class="trans-toggle"
            :class="{ off: !transOn }"
            title="显示/隐藏段落中文翻译"
            @click="toggleTrans"
          >
            <span class="t-dot"></span>
            <span class="t-label">{{ transOn ? '中文译文' : '译文隐藏' }}</span>
          </span>
          <span>Words <b>{{ (passage.stats && passage.stats.words) || '' }}</b></span>
          <span>Core <b>{{ (passage.stats && passage.stats.core) || '' }}</b></span>
          <router-link
            v-if="id > 1"
            class="nav-btn"
            :to="`/book/${bookId}/passage/p${String(id - 1).padStart(3, '0')}`"
          >← 上一篇</router-link>
          <router-link
            class="nav-btn"
            :to="`/book/${bookId}/passage/p${String(id + 1).padStart(3, '0')}`"
          >下一篇 →</router-link>
        </div>
      </div>
    </div>

    <div class="wrap" v-if="loading">
      <div class="article">
        <p class="muted">正在加载…</p>
      </div>
    </div>

    <div class="wrap" v-else-if="error || !passage">
      <div class="article">
        <p>加载失败：{{ error || '未知错误' }}</p>
      </div>
    </div>

    <div class="wrap" v-else>
      <article class="article">
        <div class="section-tag">English · {{ unitTitle }}</div>
        <div class="para" v-for="p in passage.paragraphs" :key="p.num">
          <div class="para-num">{{ p.num }}</div>
          <p class="eng">
            <HighlightedText :text="p.en" :vocab="passage.vocab" @word-click="handleWordClick" />
          </p>
          <p v-if="p.cn" class="cn">{{ p.cn }}</p>
        </div>
      </article>
      <footer>PASSAGE {{ num }} · END</footer>
    </div>
  </div>
</template>

<script>
// ★ 用纯 Options API 声明组件，name 直接挂在外层对象上
// Vue 3 keep-alive 的 include 按组件 options.name 匹配
// 这种方式最稳，不会受 <script setup> 双块合并影响
import HighlightedText from '../components/HighlightedText.vue';
import { fetchPassage, fetchDict } from '../api/client.js';
import { findUnitTitle } from '../utils/helpers.js';
import { getDict, setDict, useUIStore } from '../store/index.js';

export default {
  name: 'Passage', // ★ 必须，与 App.vue 的 keep-alive include="Passage" 匹配
  components: { HighlightedText },
  data() {
    return {
      loading: true,
      passage: null,
      error: null,
      routeKey: '',
      scrollTop: 0,
    };
  },
  computed: {
    bookId() { return this.$route.params.bookId; },
    pid() { return this.$route.params.pid; },
    id() {
      const n = parseInt(String(this.pid).replace(/^p/, ''), 10);
      return n || (this.passage ? this.passage.id : 0) || 0;
    },
    num() { return String(this.id).padStart(2, '0'); },
    unitTitle() { return findUnitTitle(this.id); },
    glossOn() { return this.$store?.state?.ui?.glossOn ?? useUIStore().glossOn; },
    transOn() { return this.$store?.state?.ui?.transOn ?? useUIStore().transOn; },
  },
  watch: {
    '$route.params.bookId'() { this.checkRouteChange(); },
    '$route.params.pid'() { this.checkRouteChange(); },
  },
  created() {
    this.uiStore = useUIStore();
    this.loadPassage();
  },
  // ★★★ keep-alive 核心 ★★★
  // - deactivated：跳走前保存当前 scrollY
  // - activated：返回时恢复 scrollY；首次进入不恢复
  deactivated() {
    this.scrollTop = window.scrollY;
    console.log('[Passage] deactivated, saved scrollTop=', this.scrollTop);
  },
  activated() {
    console.log('[Passage] activated, scrollTop=', this.scrollTop);
    // 用 requestAnimationFrame 确保在路由 scrollBehavior 之后执行
    requestAnimationFrame(() => {
      if (this.scrollTop > 0) {
        window.scrollTo(0, this.scrollTop);
        console.log('[Passage] restored scroll to', this.scrollTop);
      }
    });
  },
  methods: {
    toggleGloss() { this.uiStore.toggleGloss(); },
    toggleTrans() { this.uiStore.toggleTrans(); },
    checkRouteChange() {
      const newKey = this.bookId + ':' + this.pid;
      if (newKey !== this.routeKey) {
        this.loadPassage();
      }
    },
    loadPassage() {
      this.routeKey = this.bookId + ':' + this.pid;
      this.loading = true;
      this.passage = null;
      this.error = null;
      window.scrollTo(0, 0);
      fetchPassage(this.bookId, this.pid)
        .then(j => {
          if (!j.ok) this.error = j.error || '未知错误';
          else this.passage = j.passage;
          this.loading = false;
        })
        .catch(e => {
          this.error = e.message;
          this.loading = false;
        });
    },
    handleWordClick(e, word) {
      e.stopPropagation();
      const target = e.currentTarget;
      target.classList.remove('pulsed');
      void target.offsetWidth;
      target.classList.add('pulsed');
      if (!word) return;
      const w = String(word).toLowerCase().trim();
      if (!getDict(w)) {
        fetchDict(w).then(data => setDict(w, data)).catch(() => {});
      }
      // SPA 内跳转（keep-alive 会保留 Passage 状态）
      this.$router.push(`/dict?word=${encodeURIComponent(w)}`);
    },
  },
};
</script>
