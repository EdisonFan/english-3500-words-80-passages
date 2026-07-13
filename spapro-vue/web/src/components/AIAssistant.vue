<template>
  <div v-if="visible">
    <button
      class="ai-fab"
      :class="{ 'ai-fab-hidden': open }"
      title="AI 助手"
      @click="open = true"
    >AI</button>

    <div
      v-if="open"
      class="ai-stage ai-stage-open"
      @click="onStageClick"
    >
      <div class="ai-panel">
        <div class="ai-header">
          <div>
            <span class="ai-header-title">AI 助手</span>
            <span class="ai-header-sub">Ling-2.6-flash</span>
          </div>
          <button class="ai-close" title="关闭" @click="open = false">✕</button>
        </div>

        <div class="ai-messages" ref="messagesEl">
          <div v-if="history.length === 0 && !streamingText && !error" class="ai-empty">
            <div class="ai-empty-icon">AI</div>
            <div>有什么英语问题想问我?试试下面的快捷提问:</div>
            <div class="ai-quick-row">
              <button
                v-for="p in quickPrompts"
                :key="p.label"
                class="ai-quick"
                @click="send(p.q)"
              >{{ p.label }}</button>
            </div>
          </div>

          <template v-for="(msg, i) in history" :key="msg.role + i">
            <div v-if="msg.role === 'user'">
              <div class="ai-msg ai-msg-user">{{ msg.content }}</div>
              <div class="ai-msg-meta">{{ now() }}</div>
            </div>
            <div v-else class="ai-msg ai-msg-bot">
              <Markdown :text="msg.content" />
            </div>
          </template>

          <div v-if="streamingText !== ''" class="ai-msg ai-msg-bot">
            <Markdown :text="streamingText" />
          </div>

          <div v-if="busy && streamingText === ''" class="ai-msg ai-msg-bot">
            <span class="ai-typing"><span></span><span></span><span></span></span>
          </div>

          <div v-if="error" class="ai-msg ai-msg-error">{{ error }}</div>
        </div>

        <div class="ai-input-wrap">
          <textarea
            class="ai-input"
            placeholder="输入消息…"
            rows="1"
            v-model="input"
            ref="inputEl"
            @keydown="onKeyDown"
            :disabled="busy"
          ></textarea>
          <button class="ai-send" @click="send()" :disabled="busy">发送</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue';
import { streamChat } from '../api/client.js';
import Markdown from './Markdown.vue';

const AI_SYSTEM_PROMPT = '你是一个高考英语学习助手,帮助用户精读英语文章、理解单词、解析语法和翻译。' +
  '回答要简洁、准确,用中文解释。涉及单词时给出音标、词性、释义和例句。';

const QUICK_PROMPTS = [
  { label: '解释中心思想', q: '解释这篇文章的中心思想' },
  { label: '语法重点', q: '列出本文的语法重点' },
  { label: '高级替换', q: '给我 5 个高级词汇替换' },
  { label: '翻译全文', q: '翻译成中文' },
];

const props = defineProps({
  visible: { type: Boolean, default: false },
});

const open = ref(false);
const busy = ref(false);
const history = ref([]);
const streamingText = ref('');
const error = ref(null);
const input = ref('');
const quickPrompts = QUICK_PROMPTS;

const messagesEl = ref(null);
const inputEl = ref(null);

function now() {
  const d = new Date();
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

function scrollBottom() {
  const el = messagesEl.value;
  if (el) el.scrollTop = el.scrollHeight;
}

function autoResize() {
  const el = inputEl.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(120, el.scrollHeight) + 'px';
}

function onStageClick(e) {
  if (e.target.className === 'ai-stage ai-stage-open') open.value = false;
}

function onKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
}

function send(text) {
  if (busy.value) return;
  const t = (text !== undefined ? text : input.value).trim();
  if (!t) return;
  input.value = '';

  const newHistory = history.value.concat([{ role: 'user', content: t }]);
  history.value = newHistory;
  busy.value = true;
  error.value = null;
  streamingText.value = '';

  const messages = [{ role: 'system', content: AI_SYSTEM_PROMPT }].concat(newHistory);
  streamChat(messages, {
    onDelta: acc => { streamingText.value = acc; },
  })
    .then(fullText => {
      history.value = history.value.concat([{ role: 'assistant', content: fullText || '(空响应)' }]);
      streamingText.value = '';
    })
    .catch(err => {
      error.value = '请求失败: ' + (err && err.message || err);
    })
    .finally(() => {
      busy.value = false;
      setTimeout(() => { if (inputEl.value) inputEl.value.focus(); }, 50);
    });
}

// 离开文章页强制关
watch(() => props.visible, (v) => {
  if (!v) open.value = false;
});

watch(history, () => { nextTick(scrollBottom); }, { deep: true });
watch(streamingText, () => { nextTick(scrollBottom); });
watch(error, () => { nextTick(scrollBottom); });
watch(input, () => { nextTick(autoResize); });
</script>
