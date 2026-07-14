<template>
  <div>
    <div class="topbar">
      <div class="topbar-inner">
        <router-link class="topbar-left" to="/">
          <span class="dot"></span>
          <span>书库</span>
        </router-link>
        <div class="topbar-right">
          <span class="book-page-name">{{ title }}</span>
        </div>
      </div>
    </div>

    <div v-if="loading" class="wrap book-page">
      <div class="book-page-head">
        <div class="muted">正在加载…</div>
      </div>
    </div>

    <div v-else-if="error || !book" class="wrap book-page">
      <p class="muted">{{ error || '书不存在或加载失败' }}</p>
      <p><router-link class="link" to="/">← 返回书库</router-link></p>
    </div>

    <div v-else class="wrap book-page">
      <div class="book-page-head">
        <div class="book-page-title">{{ book.title }}</div>
        <div v-if="book.subtitle" class="book-page-sub muted">{{ book.subtitle }}</div>
        <div v-if="book.desc" class="book-page-desc muted">{{ book.desc }}</div>
        <div class="book-page-stats">
          <span>{{ (book.units || []).length }} 单元</span>
          <span class="dot">·</span>
          <span>{{ book.passageCount || 0 }} 篇文章</span>
        </div>
      </div>
      <div
        v-for="unit in (book.units || [])"
        :key="unit.id || unit.num"
        class="unit-section"
      >
        <div class="unit-head">
          <span class="unit-num">UNIT {{ unit.num }}</span>
          <span class="unit-title">{{ unit.title }}</span>
          <span class="unit-range">{{ unit.passages.length }} 篇</span>
        </div>
        <div class="passage-list">
          <router-link
            v-for="pid in unit.passages"
            :key="pid"
            class="passage-item"
            :to="`/book/${bookId}/passage/${pid}`"
          >
            <template v-if="byId[pid]">
              <div class="pi-num">PASSAGE {{ String(byId[pid].num).padStart(2, '0') }}</div>
              <div class="pi-title">{{ byId[pid].title }}</div>
              <div v-if="byId[pid].preview" class="pi-preview">{{ byId[pid].preview }}</div>
              <div class="pi-stats">词数 {{ byId[pid].wordCount || 0 }} · 核心 {{ byId[pid].coreCount || 0 }}</div>
            </template>
            <template v-else>
              <div class="pi-num">PASSAGE {{ pid.replace(/^p/, '') }}</div>
              <div class="pi-title muted">（摘要缺失）</div>
            </template>
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { fetchBook } from '../api/client.js';

const route = useRoute();
const loading = ref(true);
const book = ref(null);
const passages = ref([]);
const error = ref(null);

const bookId = computed(() => route.params.bookId);
const title = computed(() => loading.value ? '加载中…' : (book.value ? book.value.title : ''));
const byId = computed(() => {
  const m = {};
  (passages.value || []).forEach(p => { m[p.id] = p; });
  return m;
});

function loadBook() {
  window.scrollTo(0, 0);
  loading.value = true;
  book.value = null;
  passages.value = [];
  error.value = null;
  fetchBook(bookId.value)
    .then(j => {
      if (!j.ok) {
        error.value = j.error || '加载失败';
      } else {
        book.value = j.book;
        passages.value = j.passages || [];
      }
      loading.value = false;
    })
    .catch(e => {
      error.value = e.message;
      loading.value = false;
    });
}

onMounted(loadBook);
watch(() => route.params.bookId, loadBook);
</script>
