<template>
  <button v-if="videoList && videoList.length" class="dict-video-btn" @click="go">
    <span class="dv-icon">▶</span> 教学视频
  </button>
</template>

<script>
// dict 页内联教学视频按钮：有视频列表时显示，点击跳 /video?word=
export default {
  name: 'VideoButtonInline',
  props: {
    word: { type: String, default: '' },
    videoList: { default: null },
  },
  methods: {
    go() {
      const w = String(this.word || '').toLowerCase().trim();
      if (w) this.$router.push(`/video?word=${encodeURIComponent(w)}`);
    },
  },
};
</script>
