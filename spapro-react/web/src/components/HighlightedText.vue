<script>
import { findVocab } from '../utils/vocab.js';

// 把英文文本里的 {word} 标记 → .wn 高亮 span；其余普通英文单词 → .w-raw 可点击 span
// 与旧 app.js highlightWords + tokenizeAndWrap 完全一致
export default {
  name: 'HighlightedText',
  props: {
    text: { type: String, default: '' },
    vocab: { type: Array, default: () => [] },
  },
  methods: {
    onWordClick(e, key) {
      this.$emit('word-click', e, key);
    },
    // 把纯文本按英文单词切分，单词包成可点击 .w-raw span
    tokenizeRaw(text, baseIdx) {
      const re = /([A-Za-z][A-Za-z'''']*)/g;
      const nodes = [];
      let lastIdx = 0;
      let match;
      let k = 0;
      while ((match = re.exec(text)) !== null) {
        if (match.index > lastIdx) {
          nodes.push(text.slice(lastIdx, match.index));
        }
        const word = match[1];
        const display = String(word).replace(/^['''']+|['''']+$/g, '');
        const query = display.replace(/['']/g, "'").toLowerCase();
        if (display) {
          nodes.push(
            this.$createElement('span', {
              key: 'r' + baseIdx + '_' + (k++),
              class: 'w-raw',
              attrs: { 'data-word': query },
              on: { click: e => this.onWordClick(e, query) },
            }, [display])
          );
        }
        lastIdx = re.lastIndex;
      }
      if (lastIdx < text.length) {
        nodes.push(text.slice(lastIdx));
      }
      return nodes;
    },
  },
  render(h) {
    if (!this.text) return null;
    const parts = String(this.text).split(/(\{[^}]+\})/g);
    const nodes = [];
    parts.forEach((part, idx) => {
      const m = part.match(/^\{([^}]+)\}$/);
      if (m) {
        const key = m[1];
        const entry = findVocab(key, this.vocab);
        if (entry) {
          const outlineClass = entry.type === 'outline' ? ' outline' : '';
          const display = entry.display || key;
          nodes.push(
            h('span', { key: 'm' + idx, class: 'wn' }, [
              h('span', {
                class: 'w' + outlineClass,
                attrs: { 'data-key': key },
                on: { click: e => this.onWordClick(e, key) },
              }, [display]),
              entry.ctx ? h('span', { class: 'w-g' }, [entry.ctx]) : null,
            ])
          );
        } else {
          // 标记但 vocab 未命中：当作普通可点击词
          nodes.push(...this.tokenizeRaw(part, idx));
        }
      } else {
        // 纯文本：每个英文单词做成可点击
        nodes.push(...this.tokenizeRaw(part, idx));
      }
    });
    return h('span', { class: 'hl-root' }, nodes);
  },
};
</script>
