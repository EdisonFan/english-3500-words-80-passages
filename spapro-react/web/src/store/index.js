// 全局状态：替代原 app.js 中的全局变量
// - glossOn / transOn：中文注释/译文显示开关（持久化到 localStorage）
// - dictCache / videoSearchCache：词典和视频列表的内存缓存
// - ai 助手状态：open/busy/history
import { create } from 'zustand';

function loadFlag(key, def) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? def : v === 'on';
  } catch (e) {
    return def;
  }
}

export const useUIStore = create((set, get) => ({
  glossOn: loadFlag('spa_gloss', true),
  transOn: loadFlag('spa_trans', false),

  toggleGloss() {
    const next = !get().glossOn;
    try { localStorage.setItem('spa_gloss', next ? 'on' : 'off'); } catch (e) {}
    set({ glossOn: next });
  },

  toggleTrans() {
    const next = !get().transOn;
    try { localStorage.setItem('spa_trans', next ? 'on' : 'off'); } catch (e) {}
    set({ transOn: next });
  },
}));

// 词典内存缓存（替代原 _dictCache）
const _dictCache = {};
// 视频列表内存缓存（替代原 _videoSearchCache）
const _videoSearchCache = {};

export const useDictStore = create(() => ({
  // 词典缓存
  getDict(word) { return _dictCache[word.toLowerCase()]; },
  setDict(word, data) { _dictCache[word.toLowerCase()] = data; },

  // 视频缓存
  getVideos(word) { return _videoSearchCache[word.toLowerCase()]; },
  setVideos(word, list) { _videoSearchCache[word.toLowerCase()] = list; },
}));

// AI 助手状态
export const useAIStore = create((set, get) => ({
  open: false,
  busy: false,
  history: [],
  setOpen(v) { set({ open: v }); },
  pushUser(text) {
    const h = get().history.concat([{ role: 'user', content: text }]);
    set({ history: h });
  },
  pushAssistant(text) {
    const h = get().history.concat([{ role: 'assistant', content: text }]);
    set({ history: h });
  },
  setBusy(b) { set({ busy: b }); },
  clearHistory() { set({ history: [] }); },
}));
