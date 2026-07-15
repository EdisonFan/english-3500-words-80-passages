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
              <div v-if="dictData.base_form" class="dict-base-form">← {{ dictData.base_form }} 的所有格/缩写形式</div>

              <div class="dict-word-row">
                <div class="dict-word">{{ dictData.word || q }}</div>
              </div>

              <div
                v-if="dictData.phonetic_uk || dictData.audio_uk || dictData.phonetic_us || dictData.audio_us"
                class="dict-phon-row"
              >
                <div v-if="dictData.phonetic_uk || dictData.audio_uk" class="phon-block">
                  <span v-if="dictData.phonetic_uk" class="phon-text">{{ dictData.phonetic_uk }}</span>
                  <button
                    v-if="dictData.audio_uk"
                    class="audio-btn"
                    @click="playAudio($event, dictData.audio_uk)"
                  ><span class="audio-icon">🔊</span>英</button>
                </div>
                <div v-if="dictData.phonetic_us || dictData.audio_us" class="phon-block">
                  <span v-if="dictData.phonetic_us" class="phon-text">{{ dictData.phonetic_us }}</span>
                  <button
                    v-if="dictData.audio_us"
                    class="audio-btn"
                    @click="playAudio($event, dictData.audio_us)"
                  ><span class="audio-icon">🔊</span>美</button>
                </div>
              </div>

              <div v-if="dictData.prototype" class="dict-prototype">
                <span class="prototype-label">原型</span>
                <span class="prototype-value">{{ dictData.prototype }}</span>
              </div>

              <div v-if="dictData.exam_type && dictData.exam_type.length" class="dict-exam-type">
                <span class="exam-type-label">考试</span>
                <span v-for="(t, i) in dictData.exam_type" :key="i" class="exam-type-tag">{{ t }}</span>
              </div>

              <div v-if="dictData.defs && dictData.defs.length" class="dict-defs">
                <div v-for="(d, i) in dictData.defs" :key="i" class="dict-def">
                  <span v-if="d.pos" class="pos">{{ d.pos }}</span>
                  <span v-if="d.meaning" class="meaning">{{ d.meaning }}</span>
                </div>
              </div>

              <div v-if="dictData.forms && dictData.forms.length" class="dict-section">
                <div class="dict-section-label">变形</div>
                <div class="dict-section-body">
                  <span v-for="(f, i) in dictData.forms" :key="i">
                    <template v-if="i > 0">；</template>{{ f.name }}: {{ f.value }}
                  </span>
                </div>
              </div>

              <div v-if="dictData.examples && dictData.examples.length" class="dict-section">
                <div class="dict-section-label">双语例句</div>
                <div v-for="(ex, i) in dictData.examples" :key="i" class="dict-example">
                  <div class="example-en">{{ ex.en }}</div>
                  <div class="example-zh">{{ ex.zh }}</div>
                </div>
              </div>

              <div v-if="dictData.synonyms && dictData.synonyms.length" class="dict-section">
                <div class="dict-section-label">同义词</div>
                <div v-for="(syn, i) in dictData.synonyms" :key="i" class="dict-syn-item">
                  <span v-if="syn.pos" class="syn-pos">{{ syn.pos }}</span>
                  <span v-if="syn.meaning" class="syn-meaning">{{ syn.meaning }}</span>
                  <span class="syn-words">{{ (syn.words || []).join(', ') }}</span>
                </div>
              </div>

              <div v-if="dictData.phrs && dictData.phrs.length" class="dict-section">
                <div class="dict-section-label">词组搭配</div>
                <div v-for="(p, i) in dictData.phrs" :key="i" class="dict-phr-item">
                  <span class="phr-phrase">{{ p.phrase }}</span>
                  <span v-if="p.translations && p.translations.length" class="phr-trans">
                    {{ p.translations.join('；') }}
                  </span>
                </div>
              </div>

              <IndividualSection v-if="dictData.individual && Object.keys(dictData.individual).length" :data="dictData.individual" />

              <div v-if="dictData.sources && dictData.sources.length" class="dict-source">
                数据来源：{{ dictData.sources.map(sourceLabel).join(' + ') }}
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
import IndividualSection from '../components/IndividualSection.vue';

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

function sourceLabel(s) {
  return ({ youdao: '有道词典' })[s] || s;
}

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
