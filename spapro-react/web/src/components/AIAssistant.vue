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

        <div class="ai-messages" ref="messages">
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

          <template v-for="(msg, i) in history">
            <div v-if="msg.role === 'user'" :key="'u' + i">
              <div class="ai-msg ai-msg-user">{{ msg.content }}</div>
              <div class="ai-msg-meta">{{ now() }}</div>
            </div>
            <div v-else class="ai-msg ai-msg-bot" :key="'b' + i">
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
            ref="input"
            @keydown="onKeyDown"
            :disabled="busy"
          ></textarea>
          <button class="ai-send" @click="send()" :disabled="busy">发送</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
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

function now() {
  const d = new Date();
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

// AI 助手：迁移自 app.js _ai 全局对象与相关函数
// 悬浮按钮 + 弹层 + 流式 SSE 响应
export default {
  name: 'AIAssistant',
  components: { Markdown },
  props: {
    visible: { type: Boolean, default: false },
  },
  data() {
    return {
      open: false,
      busy: false,
      history: [],
      streamingText: '',
      error: null,
      input: '',
      quickPrompts: QUICK_PROMPTS,
    };
  },
  watch: {
    visible(v) {
      // 离开文章页强制关
      if (!v) this.open = false;
    },
    history() { this.$nextTick(this.scrollBottom); },
    streamingText() { this.$nextTick(this.scrollBottom); },
    error() { this.$nextTick(this.scrollBottom); },
    input() { this.$nextTick(this.autoResize); },
  },
  methods: {
    now,
    scrollBottom() {
      const el = this.$refs.messages;
      if (el) el.scrollTop = el.scrollHeight;
    },
    autoResize() {
      const el = this.$refs.input;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = Math.min(120, el.scrollHeight) + 'px';
    },
    onStageClick(e) {
      if (e.target.className === 'ai-stage ai-stage-open') this.open = false;
    },
    onKeyDown(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.send();
      }
    },
    send(text) {
      if (this.busy) return;
      const t = (text !== undefined ? text : this.input).trim();
      if (!t) return;
      this.input = '';

      const newHistory = this.history.concat([{ role: 'user', content: t }]);
      this.history = newHistory;
      this.busy = true;
      this.error = null;
      this.streamingText = '';

      const messages = [{ role: 'system', content: AI_SYSTEM_PROMPT }].concat(newHistory);
      streamChat(messages, {
        onDelta: acc => { this.streamingText = acc; },
      })
        .then(fullText => {
          this.history = this.history.concat([{ role: 'assistant', content: fullText || '(空响应)' }]);
          this.streamingText = '';
        })
        .catch(err => {
          this.error = '请求失败: ' + (err && err.message || err);
        })
        .finally(() => {
          this.busy = false;
          setTimeout(() => { if (this.$refs.input) this.$refs.input.focus(); }, 50);
        });
    },
  },
};
</script>
