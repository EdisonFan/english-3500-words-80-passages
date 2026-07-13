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

<script setup>
import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { fetchSearchVideo, fetchVideoInfo, streamUrl } from '../api/client.js';
import { fmtPlayCount } from '../utils/helpers.js';

const route = useRoute();
const router = useRouter();
const list = ref(null); // null=加载中, []=无结果, [...]=有视频
const currentIdx = ref(0);
const feed = ref(null);

// 非响应式：视频信息缓存
const infoCache = {};

const word = computed(() => (route.query.word || '').toLowerCase().trim());

// 切换播放：当前播、下一个预加载、上一个保留、远处清 src
function playVideoIdx(idx) {
  const feedEl = feed.value;
  if (!feedEl || !list.value || !list.value.length) return;
  // 用 feed 容器的 querySelectorAll 拿到所有 <video> 元素（DOM 顺序与 list 一致）
  const cards = feedEl.querySelectorAll('video');
  for (let i = 0; i < cards.length; i++) {
    const video = cards[i];
    if (!video) continue;
    if (i === idx) {
      const src = streamUrl(list.value[i].bvid);
      if (video.getAttribute('data-loaded') !== src) {
        video.src = src;
        video.setAttribute('data-loaded', src);
        video.load();
      }
      video.play().catch(() => {});
    } else if (i === idx + 1) {
      const src = streamUrl(list.value[i].bvid);
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
  currentIdx.value = idx;
  fetchVideoInfoFor(idx);
}

function fetchVideoInfoFor(idx) {
  const v = list.value[idx];
  if (!v) return;
  const bvid = v.bvid;
  if (infoCache[bvid] !== undefined) return;
  infoCache[bvid] = null;
  fetchVideoInfo(bvid).catch(() => {});
}

function onScroll() {
  const feedEl = feed.value;
  if (!feedEl) return;
  const idx = Math.round(feedEl.scrollTop / feedEl.clientHeight);
  if (idx !== currentIdx.value) {
    playVideoIdx(idx);
  }
}

function toggleLandscape(idx) {
  const feedEl = feed.value;
  if (!feedEl) return;
  // 卡片是 feed 的直接子元素
  const card = feedEl.children[idx];
  if (card) card.classList.toggle('landscape');
}

function goBack() {
  if (window.history.length > 1) router.back();
  else router.push('/');
}

watch(word, (w) => {
  if (!w) { list.value = []; return; }
  list.value = null;
  fetchSearchVideo(w)
    .then(j => {
      list.value = j && j.ok && j.list ? j.list : [];
    })
    .catch(() => { list.value = []; });
}, { immediate: true });

watch(list, (v) => {
  if (v && v.length) {
    nextTick(() => {
      setTimeout(() => playVideoIdx(0), 100);
    });
  }
});

onBeforeUnmount(() => {
  // 离开页面暂停所有视频，避免后台播放
  const feedEl = feed.value;
  if (feedEl) {
    feedEl.querySelectorAll('video').forEach(v => { if (v) v.pause(); });
  }
});
</script>
