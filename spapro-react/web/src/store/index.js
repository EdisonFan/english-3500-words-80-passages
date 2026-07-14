import Vue from 'vue';
import Vuex from 'vuex';

Vue.use(Vuex);

function loadFlag(key, def) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? def : v === 'on';
  } catch (e) {
    return def;
  }
}

// 词典/视频缓存（不响应式，跨组件 import 即可）
const _dictCache = {};
const _videoSearchCache = {};

export function getDict(word) {
  return _dictCache[String(word).toLowerCase()];
}
export function setDict(word, data) {
  _dictCache[String(word).toLowerCase()] = data;
}
export function getVideos(word) {
  return _videoSearchCache[String(word).toLowerCase()];
}
export function setVideos(word, list) {
  _videoSearchCache[String(word).toLowerCase()] = list;
}

export default new Vuex.Store({
  state: {
    ui: {
      glossOn: loadFlag('spa_gloss', true),
      transOn: loadFlag('spa_trans', false),
    },
    ai: { open: false, busy: false, history: [] },
  },
  mutations: {
    toggleGloss(s) {
      s.ui.glossOn = !s.ui.glossOn;
      try { localStorage.setItem('spa_gloss', s.ui.glossOn ? 'on' : 'off'); } catch (e) {}
    },
    toggleTrans(s) {
      s.ui.transOn = !s.ui.transOn;
      try { localStorage.setItem('spa_trans', s.ui.transOn ? 'on' : 'off'); } catch (e) {}
    },
    aiSetOpen(s, v) { s.ai.open = v; },
    aiSetBusy(s, v) { s.ai.busy = v; },
    aiPushUser(s, t) { s.ai.history = s.ai.history.concat([{ role: 'user', content: t }]); },
    aiPushAssistant(s, t) { s.ai.history = s.ai.history.concat([{ role: 'assistant', content: t }]); },
    aiClearHistory(s) { s.ai.history = []; },
  },
});
