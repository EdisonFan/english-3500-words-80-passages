<template>
  <div class="home">
    <div class="home-head">
      <h1>英语精读 · 书房</h1>
      <p class="muted">选择一本书开始阅读</p>
    </div>
    <form class="search-box" @submit.prevent="doSearch">
      <input
        type="text"
        placeholder="搜索单词，例如 action / permit"
        autocomplete="off"
        v-model="q"
      />
      <button type="submit">搜索</button>
    </form>
    <div class="book-grid">
      <div v-if="books === null && !error" class="book-loading">正在加载书库…</div>
      <div v-else-if="error" class="book-empty">加载失败：{{ error }}</div>
      <div v-else-if="books.length === 0" class="book-empty">书库是空的</div>
      <BookCard v-else v-for="b in books" :key="b.id" :book="b" />
    </div>
  </div>
</template>

<script>
import BookCard from '../components/BookCard.vue';
import { fetchBooks } from '../api/client.js';

// 首页：书列表 + 全局搜索框（迁移自 app.js renderHome）
export default {
  name: 'Home',
  components: { BookCard },
  data() {
    return {
      books: null,
      error: null,
      q: '',
    };
  },
  mounted() {
    window.scrollTo(0, 0);
    fetchBooks()
      .then(books => { this.books = books; })
      .catch(e => { this.error = e.message; });
  },
  methods: {
    doSearch() {
      const v = this.q.trim();
      if (v) this.$router.push(`/search?q=${encodeURIComponent(v)}`);
    },
  },
};
</script>
