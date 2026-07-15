<template>
  <div class="home">
    <button
      class="home-share"
      title="分享当前地址"
      @click="shareUrl"
    >
      <span v-if="!copied">分享</span>
      <span v-else>已复制</span>
    </button>
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

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import BookCard from '../components/BookCard.vue';
import { fetchBooks } from '../api/client.js';

const router = useRouter();
const books = ref(null);
const error = ref(null);
const q = ref('');
const copied = ref(false);

onMounted(() => {
  window.scrollTo(0, 0);
  fetchBooks()
    .then(list => { books.value = list; })
    .catch(e => { error.value = e.message; });
});

function doSearch() {
  const v = q.value.trim();
  if (v) router.push(`/search?q=${encodeURIComponent(v)}`);
}

// 复制当前地址到剪贴板，优先用 navigator.clipboard，失败回退到 textarea + execCommand
function shareUrl() {
  const url = window.location.href;
  const done = () => {
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 1500);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(done).catch(() => fallbackCopy(url, done));
  } else {
    fallbackCopy(url, done);
  }
}

function fallbackCopy(text, cb) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    cb();
  } catch (e) {}
}
</script>
