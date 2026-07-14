import { defineStore } from 'pinia';

export const useUIStore = defineStore('ui', {
  state: () => ({
    // 全局开关：初始始终为关闭，不读 localStorage
    glossOn: false,
    transOn: false,
  }),
  actions: {
    toggleGloss() { this.glossOn = !this.glossOn; },
    toggleTrans() { this.transOn = !this.transOn; },
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
