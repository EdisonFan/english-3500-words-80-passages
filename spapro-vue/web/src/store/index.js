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
  const v = _dictCache[String(word).toLowerCase()];
  // 跳过历史缓存的错误结果，让调用方重新请求
  return (v && v.error) ? undefined : v;
}
export function setDict(word, data) {
  // 不缓存错误结果（如"词典服务不可达"），否则后续请求会永久命中缓存里的错误
  if (data && data.error) return;
  _dictCache[String(word).toLowerCase()] = data;
}
export function getVideos(word) {
  return _videoSearchCache[String(word).toLowerCase()];
}
export function setVideos(word, list) {
  _videoSearchCache[String(word).toLowerCase()] = list;
}
