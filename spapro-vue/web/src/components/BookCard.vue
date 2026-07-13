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

<script setup>
import { ref, computed } from 'vue';
import { hashColor, pickFg } from '../utils/helpers.js';

const props = defineProps({
  book: { type: Object, required: true },
});

const imgFailed = ref(false);

const initial = computed(() => {
  return (props.book.title || props.book.id || '?').trim().charAt(0).toUpperCase();
});
const bg = computed(() => props.book.color || hashColor(props.book.id));
const fg = computed(() => (props.book.cover ? '#fff' : pickFg(bg.value)));
</script>
