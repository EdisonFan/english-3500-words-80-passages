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
        <template v-else>
          <!-- 词典释义（来自有道） -->
          <div class="search-dict">
            <div v-if="dictLoading" class="muted">正在查询词典…</div>
            <div v-else-if="dictError" class="muted">词典查询失败：{{ dictError }}</div>
            <div v-else-if="dictData && dictData.found">
              <div class="sd-head">
                <span class="sd-word">{{ dictData.word || q }}</span>
                <span v-if="dictData.phonetic_uk" class="sd-phon">{{ dictData.phonetic_uk }}</span>
                <button
                  v-if="dictData.audio_uk"
                  class="sd-audio"
                  @click="playAudio($event, dictData.audio_uk)"
                >🔊英</button>
                <span v-if="dictData.phonetic_us" class="sd-phon">{{ dictData.phonetic_us }}</span>
                <button
                  v-if="dictData.audio_us"
                  class="sd-audio"
                  @click="playAudio($event, dictData.audio_us)"
                >🔊美</button>
              </div>
              <div v-if="dictData.defs && dictData.defs.length" class="sd-defs">
                <div v-for="(d, i) in dictData.defs" :key="i" class="sd-def">
                  <span v-if="d.pos" class="sd-pos">{{ d.pos }}</span>
                  <span v-if="d.meaning" class="sd-meaning">{{ d.meaning }}</span>
                </div>
              </div>
            </div>
            <div v-else-if="dictData && !dictData.found" class="muted">词典未收录「{{ q }}」</div>
          </div>

          <!-- 文章命中结果 -->
          <div v-if="loading" class="muted">正在搜索…</div>
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
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { fetchSearch, fetchDict } from '../api/client.js';

const route = useRoute();
const router = useRouter();
const input = ref('');
const loading = ref(false);
const results = ref(null);
const error = ref(null);

// 词典释义状态
const dictData = ref(null);
const dictLoading = ref(false);
const dictError = ref(null);

const q = computed(() => route.query.q || '');

function doSearch() {
  const v = input.value.trim();
  if (!v) return;
  router.push({ path: '/search', query: { q: v } });
}

function playAudio(ev, src) {
  const btn = ev.currentTarget;
  try {
    const audio = new Audio(src);
    audio.play().catch(() => {});
    btn.classList.add('playing');
    setTimeout(() => btn.classList.remove('playing'), 600);
  } catch (e) {}
}

function runSearch(query) {
  if (!query) {
    loading.value = false;
    results.value = null;
    error.value = null;
    dictData.value = null;
    dictLoading.value = false;
    dictError.value = null;
    return;
  }
  window.scrollTo(0, 0);
  loading.value = true;
  results.value = null;
  error.value = null;
  fetchSearch(query)
    .then(j => {
      if (!j.ok) {
        error.value = '搜索失败';
      } else {
        results.value = j.results || [];
      }
      loading.value = false;
    })
    .catch(e => {
      error.value = e.message;
      loading.value = false;
    });

  // 同时查词典
  dictData.value = null;
  dictError.value = null;
  dictLoading.value = true;
  fetchDict(query)
    .then(d => {
      dictData.value = d;
      dictLoading.value = false;
    })
    .catch(e => {
      dictError.value = e.message;
      dictLoading.value = false;
    });
}

watch(q, (v) => {
  input.value = v;
  runSearch(v);
}, { immediate: true });
</script>
