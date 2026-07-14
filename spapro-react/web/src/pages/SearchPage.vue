<template>
  <div>
    <div class="topbar">
      <div class="topbar-inner">
        <router-link class="topbar-left" to="/">
          <span class="dot"></span>
          <span>书库</span>
        </router-link>
        <div class="topbar-right">
          <span>全局搜词</span>
        </div>
      </div>
    </div>
    <div class="wrap search-page">
      <form class="search-box" @submit.prevent="doSearch">
        <input
          type="text"
          placeholder="搜索单词"
          autocomplete="off"
          v-model="input"
        />
        <button type="submit">搜索</button>
      </form>
      <div>
        <div v-if="!q"></div>
        <div v-else-if="loading" class="muted">正在搜索…</div>
        <div v-else-if="error" class="muted">搜索失败：{{ error }}</div>
        <div v-else-if="!results || !results.length" class="muted">未找到「{{ q }}」相关的结果</div>
        <template v-else>
          <div class="search-count">共 {{ results.length }} 篇文章命中</div>
          <div
            v-for="(r, i) in results"
            :key="r.bookId + '/' + r.pid + '/' + i"
            class="search-result-item"
          >
            <div class="sri-head">
              <span class="sri-book">{{ r.bookTitle }}</span>
              <router-link class="sri-link" :to="`/book/${r.bookId}/passage/${r.pid}`">
                {{ r.passageTitle }}
              </router-link>
              <span class="sri-count">{{ r.matches.length }} 处</span>
            </div>
            <div class="sri-matches">
              <div v-for="(m, mi) in r.matches" :key="mi" class="sri-match">
                <template v-if="m.type === 'vocab'">
                  <span class="search-tag search-tag-vocab">词汇表</span>
                  <span class="search-vocab-word">{{ m.word }}</span>
                  <span v-if="m.pos" class="search-vocab-pos">{{ m.pos }}</span>
                  <span v-if="m.meaning" class="search-vocab-meaning">{{ m.meaning }}</span>
                </template>
                <template v-else-if="m.type === 'marked'">
                  <span class="search-tag search-tag-marked">教学词 · 第{{ m.paraNum }}段</span>
                  <div class="search-snippet">{{ m.snippet }}</div>
                </template>
                <template v-else>
                  <span class="search-tag search-tag-text">正文 · 第{{ m.paraNum }}段</span>
                  <div class="search-snippet">{{ m.snippet }}</div>
                </template>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script>
import { fetchSearch } from '../api/client.js';

// 全局搜词页：迁移自 app.js renderSearch
export default {
  name: 'SearchPage',
  data() {
    return {
      input: '',
      loading: false,
      results: null,
      error: null,
    };
  },
  computed: {
    q() {
      return this.$route.query.q || '';
    },
  },
  watch: {
    q: {
      immediate: true,
      handler(v) {
        this.input = v;
        this.runSearch(v);
      },
    },
  },
  methods: {
    doSearch() {
      const v = this.input.trim();
      if (!v) return;
      this.$router.push({ path: '/search', query: { q: v } });
    },
    runSearch(q) {
      if (!q) {
        this.loading = false;
        this.results = null;
        this.error = null;
        return;
      }
      window.scrollTo(0, 0);
      this.loading = true;
      this.results = null;
      this.error = null;
      fetchSearch(q)
        .then(j => {
          if (!j.ok) {
            this.error = '搜索失败';
          } else {
            this.results = j.results || [];
          }
          this.loading = false;
        })
        .catch(e => {
          this.error = e.message;
          this.loading = false;
        });
    },
  },
};
</script>
