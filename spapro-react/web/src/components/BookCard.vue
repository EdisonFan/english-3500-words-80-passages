<template>
  <router-link class="book-card" :to="`/book/${book.id}`">
    <div class="book-cover" :style="{ background: bg }">
      <img
        v-if="book.cover && !imgFailed"
        class="book-img"
        :src="book.cover"
        :alt="book.title"
        @error="imgFailed = true"
      />
      <span v-else class="book-initial" :style="{ background: bg, color: fg }">{{ initial }}</span>
    </div>
    <div class="book-meta">
      <div class="book-title">{{ book.title }}</div>
      <div v-if="book.subtitle" class="book-sub">{{ book.subtitle }}</div>
      <div class="book-stats">
        <span>{{ book.unitCount || 0 }} 单元</span>
        <span class="dot">·</span>
        <span>{{ book.passageCount || 0 }} 篇文章</span>
      </div>
    </div>
  </router-link>
</template>

<script>
import { hashColor, pickFg } from '../utils/helpers.js';

export default {
  name: 'BookCard',
  props: {
    book: { type: Object, required: true },
  },
  data() {
    return { imgFailed: false };
  },
  computed: {
    initial() {
      return (this.book.title || this.book.id || '?').trim().charAt(0).toUpperCase();
    },
    bg() {
      return this.book.color || hashColor(this.book.id);
    },
    fg() {
      return this.book.cover ? '#fff' : pickFg(this.bg);
    },
  },
};
</script>
