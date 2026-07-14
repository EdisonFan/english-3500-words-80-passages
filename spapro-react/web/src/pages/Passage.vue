<template>
  <div>
    <div class="topbar" v-if="!loading && passage">
      <div class="topbar-inner">
        <router-link class="topbar-left" :to="`/book/${bookId}`">
          <span class="dot"></span>
          <span>PASSAGE {{ num }} / {{ passage._bookPassageCount || '?' }}</span>
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
import HighlightedText from '../components/HighlightedText.vue';
import { fetchPassage, fetchDict } from '../api/client.js';
import { getDict, setDict } from '../store/index.js';
import { findUnitTitle } from '../utils/helpers.js';

// 文章页：迁移自 app.js renderPassage / renderPassageContent
// ★ name 必须为 'Passage'，与 App.vue 的 keep-alive include 对应
export default {
  name: 'Passage',
  components: { HighlightedText },
  data() {
    return {
      loading: true,
      passage: null,
      error: null,
      routeKey: '',
      scrollTop: 0, // ★保存滚动位置
    };
  },
  computed: {
    bookId() {
      return this.$route.params.bookId;
    },
    pid() {
      return this.$route.params.pid;
    },
    id() {
      const n = parseInt(String(this.pid).replace(/^p/, ''), 10);
      return n || (this.passage ? this.passage.id : 0) || 0;
    },
    num() {
      return String(this.id).padStart(2, '0');
    },
    unitTitle() {
      return findUnitTitle(this.id);
    },
    glossOn() {
      return this.$store.state.ui.glossOn;
    },
    transOn() {
      return this.$store.state.ui.transOn;
    },
  },
  watch: {
    $route() {
      const newKey = this.bookId + ':' + this.pid;
      if (newKey !== this.routeKey) {
        this.loadPassage();
      }
    },
  },
  created() {
    this.loadPassage();
  },
  // ★★★ keep-alive 核心 ★★★
  deactivated() {
    this.scrollTop = window.scrollY;
  },
  activated() {
    this.$nextTick(() => {
      if (this.scrollTop > 0) {
        window.scrollTo(0, this.scrollTop);
      }
    });
  },
  methods: {
    loadPassage() {
      this.routeKey = this.bookId + ':' + this.pid;
      this.loading = true;
      this.passage = null;
      this.error = null;
      window.scrollTo(0, 0); // 新进入文章：滚到顶
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
      // 脉冲动画（与旧版一致）
      const target = e.currentTarget;
      target.classList.remove('pulsed');
      void target.offsetWidth;
      target.classList.add('pulsed');
      if (!word) return;
      const w = String(word).toLowerCase().trim();
      // 预热词典缓存（dict 页会读这个缓存命中加速）
      if (!getDict(w)) {
        fetchDict(w).then(data => setDict(w, data)).catch(() => {});
      }
      // SPA 内跳转（keep-alive 会保留 Passage 状态）
      this.$router.push(`/dict?word=${encodeURIComponent(w)}`);
    },
    toggleGloss() {
      this.$store.commit('toggleGloss');
    },
    toggleTrans() {
      this.$store.commit('toggleTrans');
    },
  },
};
</script>
