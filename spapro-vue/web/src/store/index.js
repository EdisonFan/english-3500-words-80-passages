import { defineStore } from 'pinia';

function loadFlag(key, def) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? def : v === 'on';
  } catch (e) {
    return def;
  }
}

export const useUIStore = defineStore('ui', {
  state: () => ({
    glossOn: loadFlag('spa_gloss', false),
    transOn: loadFlag('spa_trans', false),
  }),
  actions: {
    toggleGloss() {
      this.glossOn = !this.glossOn;
      try { localStorage.setItem('spa_gloss', this.glossOn ? 'on' : 'off'); } catch (e) {}
    },
    toggleTrans() {
      this.transOn = !this.transOn;
      try { localStorage.setItem('spa_trans', this.transOn ? 'on' : 'off'); } catch (e) {}
    },
  },
});

// 词典/视频缓存（非响应式，模块级 Map，跨组件 import 即可）
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
