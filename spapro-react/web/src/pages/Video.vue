<template>
  <div>
    <div v-if="!word" class="video-loading"><div>缺少单词参数</div></div>

    <div v-else-if="list === null" class="video-loading">
      <div class="video-spin"></div>
      <div>搜索 "{{ word }}" 的教学视频…</div>
    </div>

    <div v-else-if="!list.length" class="video-loading">
      <div>没找到 "{{ word }}" 的教学视频</div>
    </div>

    <div v-else class="video-page">
      <button class="video-back" @click="goBack" aria-label="返回">
        <span class="video-back-arrow">‹</span>
      </button>
      <div class="video-feed" id="videoFeed" ref="feed" @scroll.passive="onScroll">
        <div
          v-for="(v, i) in list"
          :key="v.bvid"
          class="video-card"
          :data-idx="i"
        >
          <div class="card-corner-btns">
            <button class="card-landscape-btn" title="横屏播放" @click="toggleLandscape(i)">⟲</button>
            <a
              class="card-download-btn"
              title="下载视频"
              :href="streamUrl(v.bvid, true)"
              :download="v.bvid + '.mp4'"
              target="_blank"
              rel="noopener"
            >⬇</a>
          </div>
          <video
            ref="videos"
            playsinline
            webkit-playsinline="true"
            preload="auto"
            loop
            controls
            controlslist="nodownload noplaybackrate noremoteplayback"
            :poster="v.pic ? 'https:' + v.pic : ''"
          ></video>
          <div class="video-card-idx">{{ i + 1 }}/{{ list.length }}</div>
          <div class="video-card-info">
            <div class="video-card-word">{{ word }}</div>
            <div class="video-card-title">{{ v.title }}</div>
            <div class="video-card-meta">@{{ v.author }} · 播放 {{ fmtPlayCount(v.play) }} · {{ v.duration }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { fetchSearchVideo, fetchVideoInfo, streamUrl } from '../api/client.js';
import { fmtPlayCount } from '../utils/helpers.js';

// 教学视频页：迁移自 video.html
// 抖音式上下滑动切换视频（CSS scroll-snap）
export default {
  name: 'Video',
  data() {
    return {
      list: null, // null=加载中, []=无结果, [...]=有视频
      currentIdx: 0,
    };
  },
  computed: {
    word() {
      return (this.$route.query.word || '').toLowerCase().trim();
    },
  },
  watch: {
    word: {
      immediate: true,
      handler(w) {
        if (!w) { this.list = []; return; }
        this.list = null;
        fetchSearchVideo(w)
          .then(j => {
            this.list = j && j.ok && j.list ? j.list : [];
          })
          .catch(() => { this.list = []; });
      },
    },
    list(v) {
      if (v && v.length) {
        this.$nextTick(() => {
          setTimeout(() => this.playVideoIdx(0), 100);
        });
      }
    },
  },
  created() {
    // 非响应式：视频信息缓存
    this.infoCache = {};
  },
  beforeDestroy() {
    // 离开页面暂停所有视频，避免后台播放
    const cards = this.$refs.videos;
    if (cards) {
      cards.forEach(v => { if (v) { v.pause(); } });
    }
  },
  methods: {
    streamUrl,
    fmtPlayCount,
    // 切换播放：当前播、下一个预加载、上一个保留、远处清 src
    playVideoIdx(idx) {
      const cards = this.$refs.videos;
      if (!cards || !this.list || !this.list.length) return;
      for (let i = 0; i < cards.length; i++) {
        const video = cards[i];
        if (!video) continue;
        if (i === idx) {
          const src = streamUrl(this.list[i].bvid);
          if (video.getAttribute('data-loaded') !== src) {
            video.src = src;
            video.setAttribute('data-loaded', src);
            video.load();
          }
          video.play().catch(() => {});
        } else if (i === idx + 1) {
          const src = streamUrl(this.list[i].bvid);
          if (video.getAttribute('data-loaded') !== src) {
            video.src = src;
            video.setAttribute('data-loaded', src);
            video.load();
          }
          video.pause();
        } else if (i === idx - 1) {
          video.pause();
        } else {
          video.pause();
          if (video.src) {
            video.removeAttribute('src');
            video.removeAttribute('data-loaded');
            video.load();
          }
        }
      }
      this.currentIdx = idx;
      this.fetchVideoInfoFor(idx);
    },
    fetchVideoInfoFor(idx) {
      const v = this.list[idx];
      if (!v) return;
      const bvid = v.bvid;
      if (this.infoCache[bvid] !== undefined) return;
      this.infoCache[bvid] = null;
      fetchVideoInfo(bvid).catch(() => {});
    },
    onScroll() {
      const feed = this.$refs.feed;
      if (!feed) return;
      const idx = Math.round(feed.scrollTop / feed.clientHeight);
      if (idx !== this.currentIdx) {
        this.playVideoIdx(idx);
      }
    },
    toggleLandscape(idx) {
      const feed = this.$refs.feed;
      if (!feed) return;
      const card = feed.children[idx];
      if (card) card.classList.toggle('landscape');
    },
    goBack() {
      if (window.history.length > 1) this.$router.back();
      else this.$router.push('/');
    },
  },
};
</script>
