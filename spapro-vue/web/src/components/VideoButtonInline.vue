<template>
  <button v-if="videoList && videoList.length" class="dict-video-btn" @click="go">
    <span class="dv-icon">▶</span> 教学视频
  </button>
</template>

<script setup>
import { useRouter } from 'vue-router';

const props = defineProps({
  word: { type: String, default: '' },
  videoList: { default: null },
});

const router = useRouter();

function go() {
  const w = String(props.word || '').toLowerCase().trim();
  if (w) router.push(`/video?word=${encodeURIComponent(w)}`);
}
</script>
