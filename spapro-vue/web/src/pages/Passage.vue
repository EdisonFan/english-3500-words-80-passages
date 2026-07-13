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
            @click="uiStore.toggleGloss()"
          >
            <span class="g-dot"></span>
            <span class="g-label">{{ glossOn ? '中文释义' : '已隐藏' }}</span>
          </span>
          <span
            class="trans-toggle"
            :class="{ off: !transOn }"
            title="显示/隐藏段落中文翻译"
            @click="uiStore.toggleTrans()"
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

    <div class="wrap" v-if="loading">
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
          <p v-if="p.cn" class="cn">{{ p.cn }}</p>
        </div>
      </article>
      <footer>PASSAGE {{ num }} · END</footer>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onActivated, onDeactivated, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import HighlightedText from '../components/HighlightedText.vue';
import { fetchPassage, fetchDict } from '../api/client.js';
import { findUnitTitle } from '../utils/helpers.js';
import { getDict, setDict, useUIStore } from '../store/index.js';

// ★ 显式声明组件 name（Vue 3.3+ 的 defineOptions），keep-alive 按此名匹配
defineOptions({ name: 'Passage' });

const route = useRoute();
const router = useRouter();
const uiStore = useUIStore();

const loading = ref(true);
const passage = ref(null);
const error = ref(null);
const routeKey = ref('');
// ★保存滚动位置（keep-alive 切出时记录，切入时恢复）
const scrollTop = ref(0);

const bookId = computed(() => route.params.bookId);
const pid = computed(() => route.params.pid);
const id = computed(() => {
  const n = parseInt(String(pid.value).replace(/^p/, ''), 10);
  return n || (passage.value ? passage.value.id : 0) || 0;
});
const num = computed(() => String(id.value).padStart(2, '0'));
const unitTitle = computed(() => findUnitTitle(id.value));
const glossOn = computed(() => uiStore.glossOn);
const transOn = computed(() => uiStore.transOn);

function loadPassage() {
  routeKey.value = bookId.value + ':' + pid.value;
  loading.value = true;
  passage.value = null;
  error.value = null;
  window.scrollTo(0, 0); // 新进入文章：滚到顶
  fetchPassage(bookId.value, pid.value)
    .then(j => {
      if (!j.ok) error.value = j.error || '未知错误';
      else passage.value = j.passage;
      loading.value = false;
    })
    .catch(e => {
      error.value = e.message;
      loading.value = false;
    });
}

function handleWordClick(e, word) {
  e.stopPropagation();
  // 脉冲动画（与旧版一致）
  const target = e.currentTarget;
  target.classList.remove('pulsed');
  void target.offsetWidth;
  target.classList.add('pulsed');
  if (!word) return;
  const w = String(word).toLowerCase().trim();
  // 预热词典缓存（dict 页会读这个缓存命中加速）
  if (!getDict(w)) {
    fetchDict(w).then(data => setDict(w, data)).catch(() => {});
  }
  // SPA 内跳转（keep-alive 会保留 Passage 状态）
  router.push(`/dict?word=${encodeURIComponent(w)}`);
}

onMounted(() => {
  console.log('[Passage] onMounted, route=', route.params);
  loadPassage();
});
watch(() => [route.params.bookId, route.params.pid], () => {
  const newKey = bookId.value + ':' + pid.value;
  if (newKey !== routeKey.value) loadPassage();
});

// ★★★ keep-alive 核心：切出时记滚动位置，切入时恢复 ★★★
onDeactivated(() => {
  scrollTop.value = window.scrollY;
  console.log('[Passage] onDeactivated, saved scrollTop=', scrollTop.value);
});
onActivated(() => {
  console.log('[Passage] onActivated, will restore scrollTop=', scrollTop.value);
  // 用 requestAnimationFrame 确保在路由 scrollBehavior 之后执行
  requestAnimationFrame(() => {
    if (scrollTop.value > 0) {
      window.scrollTo(0, scrollTop.value);
      console.log('[Passage] restored scroll to', scrollTop.value);
    }
  });
});
</script>
