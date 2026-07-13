<template>
  <div id="app-root">
    <router-view v-slot="{ Component }">
      <keep-alive include="Passage">
        <component :is="Component" />
      </keep-alive>
    </router-view>
    <AIAssistant :visible="showAI" />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useUIStore } from './store';
import AIAssistant from './components/AIAssistant.vue';

const route = useRoute();
const uiStore = useUIStore();
const showAI = ref(false);

// 仅文章页显示 AI 助手
watch(() => route.path, (path) => {
  showAI.value = /^\/book\/[^/]+\/passage\//.test(path);
}, { immediate: true });

// body class 控制中文释义 / 译文的显隐
watch(() => uiStore.glossOn, (v) => {
  document.body.classList.toggle('no-gloss', !v);
}, { immediate: true });

watch(() => uiStore.transOn, (v) => {
  document.body.classList.toggle('show-trans', v);
}, { immediate: true });
</script>
