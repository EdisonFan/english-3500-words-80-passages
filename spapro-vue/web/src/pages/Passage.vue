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

    <div class="wrap" v-if="loading" id="passage-loading">
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
          <p v-if="p.cn" class="cn" v-html="p.cn"></p>
        </div>
      </article>
      <footer>PASSAGE {{ num }} · END</footer>
    </div>
  </div>
</template>

<script>
// ★ 用纯 Options API 声明组件，name 直接挂在外层对象上
// Vue 3 keep-alive 的 include 按组件 options.name 匹配
import HighlightedText from '../components/HighlightedText.vue';
import { fetchPassage, fetchDict } from '../api/client.js';
import { findUnitTitle } from '../utils/helpers.js';
import { getDict, setDict, useUIStore } from '../store/index.js';

export default {
  components: { HighlightedText },

  data() {
    return {
      /** 是否正在加载中 */
      loading: true,
      /** 当前文章数据 */
      passage: null,
      /** 加载错误信息 */
      error: null,
    };
  },

  computed: {
    /** 当前书籍 ID（来自路由参数） */
    bookId() { return this.$route.params.bookId; },
    /** 当前文章 ID（来自路由参数，格式 p001） */
    pid()    { return this.$route.params.pid; },
    /**
     * 路由唯一标识，用于 watch 监听。
     * 当从“上一篇”切换到“下一篇”时，Vue 会复用 Passage 组件实例而不重新执行 created。
     * 此时依赖 watch 监听这个组合 key 来触发重新加载文章数据。
     */
    routeKey() { return `${this.bookId}:${this.pid}`; },
    /** 文章序号（数字），用于翻页导航 */
    id() {
      const n = parseInt(String(this.pid).replace(/^p/, ''), 10);
      return n || (this.passage ? this.passage.id : 0) || 0;
    },
    /** 两位数字序号，用于显示 */
    num()       { return String(this.id).padStart(2, '0'); },
    /** 所属单元标题 */
    unitTitle() { return findUnitTitle(this.id); },
    /** 中文释义开关（读自 Pinia store） */
    glossOn()   { return useUIStore().glossOn; },
    /** 中文译文开关（读自 Pinia store） */
    transOn()   { return useUIStore().transOn; },
  },

  watch: {
    routeKey() {
      if (this.bookId && this.pid) {
        this.loadPassage();
      }
    },
  },

  created() {
    this.uiStore = useUIStore();
    this.loadPassage();
  },

  methods: {
    /** 切换中文释义显隐 */
    toggleGloss() { this.uiStore.toggleGloss(); },
    /** 切换中文译文显隐 */
    toggleTrans()  { this.uiStore.toggleTrans(); },

    /**
     * 加载文章数据。
     * 首次进入（created）和真正切换文章（watch routeKey 且 key 不同）时调用。
     * ★ _loadedKey 必须在函数开头立即赋值，这样 watch 在激活时触发，
     *   对比 _loadedKey 就能正确判断「已加载过，跳过」。
     */
    loadPassage() {
      this.loading = true;
      this.passage = null;
      this.error   = null;
      
      fetchPassage(this.bookId, this.pid)
        .then(j => {
          if (!j.ok) {
            this.error = j.error || '未知错误';
          } else {
            this.passage = j.passage;
          }
          this.loading = false;
        })
        .catch(e => {
          this.error = e.message;
          this.loading = false;
        });
    },

    /**
     * 处理单词点击：高亮动画 + 后台预取词典 + 跳转词典页。
     * @param {MouseEvent} e - 点击事件
     * @param {string} word - 被点击的单词
     */
    handleWordClick(e, word) {
      e.stopPropagation();
      // 触发点击波纹动画（移除再重新添加 class 以重置动画）
      const target = e.currentTarget;
      target.classList.remove('pulsed');
      void target.offsetWidth; // 强制回流，使 CSS 动画重新播放
      target.classList.add('pulsed');
      if (!word) return;
      const w = String(word).toLowerCase().trim();
      // 后台预取词典数据，跳转后命中缓存，秒显示
      if (!getDict(w)) {
        fetchDict(w).then(data => setDict(w, data)).catch(() => {});
      }
      // keep-alive 保留本页实例，返回时 activated 恢复滚动位置
      this.$router.push(`/dict?word=${encodeURIComponent(w)}`);
    },
  },
};
</script>
