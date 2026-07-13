<template>
  <div class="dict-section" v-if="hasContent">
    <div class="dict-section-label">考试信息</div>
    <div v-if="data.level || data.mnemonic" class="dict-ind-meta">
      {{ [data.level, data.mnemonic].filter(Boolean).join(' · ') }}
    </div>
    <template v-if="data.examInfo && (data.examInfo.frequency || data.examInfo.year)">
      <div class="dict-ind-exam-info">
        <span v-if="data.examInfo.frequency" class="exam-stat">
          近{{ data.examInfo.year || '' }}年考频 <b>{{ data.examInfo.frequency }}</b>
        </span>
        <span v-if="data.examInfo.recommendationRate" class="exam-stat">
          推荐指数 <b>{{ data.examInfo.recommendationRate }}</b>
        </span>
      </div>
      <div
        v-if="data.examInfo.questionTypeInfo && data.examInfo.questionTypeInfo.length"
        class="dict-ind-qtypes"
      >
        <span
          v-for="(q, i) in data.examInfo.questionTypeInfo"
          :key="i"
          class="qtype-tag"
        >{{ q.type }} {{ q.time || '' }}</span>
      </div>
    </template>
    <div v-if="data.idiomatic && data.idiomatic.length">
      <div
        v-for="(c, i) in data.idiomatic"
        :key="i"
        class="dict-idiom-item"
      >
        <span class="idiom-en" v-html="wrapEnglish(c.en)"></span>
        <span class="idiom-zh">{{ c.zh }}</span>
      </div>
    </div>
    <div v-if="data.pastExamSents && data.pastExamSents.length" class="dict-ind-past-sents">
      <div class="dict-section-sub-label">真题例句</div>
      <div
        v-for="(s, i) in data.pastExamSents"
        :key="i"
        class="dict-past-sent-item"
      >
        <div class="past-sent-en" v-html="wrapEnglish(s.en)"></div>
        <div class="past-sent-zh">{{ s.zh }}</div>
        <div v-if="s.source" class="past-sent-src">{{ s.source }}</div>
      </div>
    </div>
  </div>
</template>

<script>
import { esc } from '../utils/helpers.js';

// 把纯英文文本里的单词包成可点击 .dw span（点击由 Dict 页的 document 事件委托处理）
function wrapEnglish(text) {
  if (!text) return '';
  const re = /([A-Za-z][A-Za-z'''']*)/g;
  let out = '';
  let lastIdx = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIdx) out += esc(text.slice(lastIdx, match.index));
    const word = match[1];
    const display = String(word).replace(/^['''']+|['''']+$/g, '');
    const query = display.replace(/['']/g, "'").toLowerCase();
    if (display) {
      out += `<span class="dw" data-word="${esc(query)}">${esc(display)}</span>`;
    }
    lastIdx = re.lastIndex;
  }
  if (lastIdx < text.length) out += esc(text.slice(lastIdx));
  return out;
}

export default {
  name: 'IndividualSection',
  props: {
    data: { type: Object, default: () => ({}) },
  },
  computed: {
    hasContent() {
      const d = this.data || {};
      return !!(d.level || d.mnemonic ||
        (d.examInfo && (d.examInfo.frequency || d.examInfo.year)) ||
        (d.idiomatic && d.idiomatic.length) ||
        (d.pastExamSents && d.pastExamSents.length));
    },
  },
  methods: {
    wrapEnglish,
  },
};
</script>
