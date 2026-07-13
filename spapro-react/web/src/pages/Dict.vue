<template>
  <div>
    <header class="dict-topbar">
      <button class="dict-back" @click="goBack" aria-label="返回">
        <span class="dict-back-arrow">‹</span>
      </button>
      <div class="dict-topbar-title">{{ (data && data.word) || word }}</div>
    </header>
    <main class="dict-main">
      <template v-if="!word">
        <div class="dict-empty">缺少单词参数</div>
      </template>
      <template v-else>
        <div class="dict-eyebrow">Dictionary</div>
        <div class="dict-word-row">
          <div class="dict-word">{{ (data && data.word) || word }}</div>
          <VideoButtonInline :word="videoWordForBtn" :video-list="videoList" />
        </div>

        <div v-if="data && data.loading" class="dict-loading">
          <span class="dict-spinner"></span>查询中…
        </div>

        <div v-else-if="data && data.error" class="dict-empty">
          查询失败：{{ data.error }}
        </div>

        <div v-else-if="data && !data.found" class="dict-empty">
          未找到该词的释义
        </div>

        <div v-else-if="data">
          <div v-if="data.base_form" class="dict-base-form">← {{ data.base_form }} 的所有格/缩写形式</div>

          <div
            v-if="data.phonetic_uk || data.audio_uk || data.phonetic_us || data.audio_us"
            class="dict-phon-row"
          >
            <div v-if="data.phonetic_uk || data.audio_uk" class="phon-block">
              <span v-if="data.phonetic_uk" class="phon-text">{{ data.phonetic_uk }}</span>
              <button
                v-if="data.audio_uk"
                class="audio-btn"
                @click="playAudio($event, data.audio_uk)"
              ><span class="audio-icon">🔊</span>英</button>
            </div>
            <div v-if="data.phonetic_us || data.audio_us" class="phon-block">
              <span v-if="data.phonetic_us" class="phon-text">{{ data.phonetic_us }}</span>
              <button
                v-if="data.audio_us"
                class="audio-btn"
                @click="playAudio($event, data.audio_us)"
              ><span class="audio-icon">🔊</span>美</button>
            </div>
          </div>

          <div v-if="data.prototype" class="dict-prototype">
            <span class="prototype-label">原型</span>
            <span class="prototype-value">{{ data.prototype }}</span>
          </div>

          <div v-if="data.exam_type && data.exam_type.length" class="dict-exam-type">
            <span class="exam-type-label">考试</span>
            <span v-for="(t, i) in data.exam_type" :key="i" class="exam-type-tag">{{ t }}</span>
          </div>

          <div v-if="data.defs && data.defs.length" class="dict-defs">
            <div v-for="(d, i) in data.defs" :key="i" class="dict-def">
              <span v-if="d.pos" class="pos">{{ d.pos }}</span>
              <span v-if="d.meaning" class="meaning">{{ d.meaning }}</span>
            </div>
          </div>

          <div v-if="data.forms && data.forms.length" class="dict-section">
            <div class="dict-section-label">变形</div>
            <div class="dict-section-body">
              <span v-for="(f, i) in data.forms" :key="i">
                <template v-if="i > 0">；</template>{{ f.name }}: {{ f.value }}
              </span>
            </div>
          </div>

          <div v-if="data.examples && data.examples.length" class="dict-section">
            <div class="dict-section-label">双语例句</div>
            <div v-for="(ex, i) in data.examples" :key="i" class="dict-example">
              <div class="example-en" v-html="wrapEnglish(ex.en)"></div>
              <div class="example-zh">{{ ex.zh }}</div>
            </div>
          </div>

          <div v-if="data.synonyms && data.synonyms.length" class="dict-section">
            <div class="dict-section-label">同义词</div>
            <div v-for="(syn, i) in data.synonyms" :key="i" class="dict-syn-item">
              <span v-if="syn.pos" class="syn-pos">{{ syn.pos }}</span>
              <span v-if="syn.meaning" class="syn-meaning">{{ syn.meaning }}</span>
              <span class="syn-words" v-html="wrapEnglish((syn.words || []).join(', '))"></span>
            </div>
          </div>

          <div v-if="data.phrs && data.phrs.length" class="dict-section">
            <div class="dict-section-label">词组搭配</div>
            <div v-for="(p, i) in data.phrs" :key="i" class="dict-phr-item">
              <span class="phr-phrase" v-html="wrapEnglish(p.phrase)"></span>
              <span v-if="p.translations && p.translations.length" class="phr-trans">
                {{ p.translations.join('；') }}
              </span>
            </div>
          </div>

          <IndividualSection v-if="data.individual && Object.keys(data.individual).length" :data="data.individual" />

          <div v-if="data.sources && data.sources.length" class="dict-source">
            数据来源：{{ data.sources.map(sourceLabel).join(' + ') }}
          </div>
        </div>
      </template>
    </main>
  </div>
</template>

<script>
import { fetchDict, fetchSearchVideo } from '../api/client.js';
import { getDict, setDict, getVideos, setVideos } from '../store/index.js';
import { esc } from '../utils/helpers.js';
import VideoButtonInline from '../components/VideoButtonInline.vue';
import IndividualSection from '../components/IndividualSection.vue';

// 把纯英文文本里的单词包成可点击 .dw span（document 事件委托处理点击）
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

function sourceLabel(s) {
  return ({ youdao: '有道词典' })[s] || s;
}

// 单词翻译页：迁移自 dict.html
// URL ?word=xxx，词典结果缓存到 store 内存，避免来回切词重复请求
export default {
  name: 'Dict',
  components: { VideoButtonInline, IndividualSection },
  data() {
    return {
      data: null,
      videoList: null, // null=未查, []=已查无, [...]=有视频
    };
  },
  computed: {
    word() {
      return (this.$route.query.word || '').toLowerCase().trim();
    },
    videoWordForBtn() {
      const d = this.data || {};
      return String((d.prototype || d.word) || this.word).toLowerCase();
    },
  },
  watch: {
    word: {
      immediate: true,
      handler(w) {
        if (!w) {
          this.data = { word: '', error: '缺少单词参数' };
          return;
        }
        this.loadDict(w);
      },
    },
  },
  mounted() {
    document.addEventListener('click', this.onDocClick);
  },
  beforeDestroy() {
    document.removeEventListener('click', this.onDocClick);
  },
  methods: {
    loadDict(word) {
      window.scrollTo(0, 0);
      this.videoList = null;
      const cached = getDict(word);
      if (cached) {
        this.data = cached;
        this.loadVideo(this.videoWordFor(cached, word));
      } else {
        this.data = { word, loading: true };
        fetchDict(word)
          .then(data => {
            setDict(word, data);
            this.data = data;
            this.loadVideo(this.videoWordFor(data, word));
          })
          .catch(e => {
            this.data = { word, error: e.message };
            this.loadVideo(word);
          });
      }
    },
    videoWordFor(data, word) {
      return String((data && (data.prototype || data.word)) || word).toLowerCase();
    },
    loadVideo(videoWord) {
      const cached = getVideos(videoWord);
      if (cached !== undefined) {
        this.videoList = cached;
        return;
      }
      fetchSearchVideo(videoWord)
        .then(j => {
          const list = j && j.ok && j.list ? j.list : [];
          setVideos(videoWord, list);
          this.videoList = list;
        })
        .catch(() => {
          setVideos(videoWord, []);
          this.videoList = [];
        });
    },
    onDocClick(e) {
      const el = e.target.closest && e.target.closest('.dw');
      if (!el) return;
      e.stopPropagation();
      e.preventDefault();
      const w = el.getAttribute('data-word');
      if (w) this.$router.push(`/dict?word=${encodeURIComponent(w)}`);
    },
    playAudio(ev, src) {
      const btn = ev.currentTarget;
      try {
        const audio = new Audio(src);
        audio.play().catch(() => {});
        btn.classList.add('playing');
        setTimeout(() => btn.classList.remove('playing'), 600);
      } catch (e) {}
    },
    goBack() {
      if (window.history.length > 1) this.$router.back();
      else this.$router.push('/');
    },
    wrapEnglish,
    sourceLabel,
  },
};
</script>
