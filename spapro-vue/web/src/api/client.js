// API 客户端：所有 fetch 调用集中在此

// fetch 简单封装：返回 json
async function fetchJson(url) {
  const r = await fetch(url);
  return r.json();
}

// GET /api/books
export function fetchBooks() {
  return fetchJson('/api/books').then(j => j.books || []);
}

// GET /api/book/:bookId
export function fetchBook(bookId) {
  return fetchJson('/api/book/' + encodeURIComponent(bookId));
}

// GET /api/book/:bookId/passage/:pid
export function fetchPassage(bookId, pid) {
  return fetchJson(`/api/book/${encodeURIComponent(bookId)}/passage/${encodeURIComponent(pid)}`);
}

// GET /api/dict?q=<word>
export function fetchDict(word) {
  return fetchJson('/api/dict?q=' + encodeURIComponent(word));
}

// GET /api/search-video?word=<word>
export function fetchSearchVideo(word) {
  return fetchJson('/api/search-video?word=' + encodeURIComponent(word));
}

// GET /api/video-info?bvid=<bvid>
export function fetchVideoInfo(bvid) {
  return fetchJson('/api/video-info?bvid=' + encodeURIComponent(bvid));
}

// GET /api/search?q=<word>
export function fetchSearch(q) {
  return fetchJson('/api/search?q=' + encodeURIComponent(q));
}

// 视频流 URL
export function streamUrl(bvid, download = false) {
  return `/api/stream?bvid=${encodeURIComponent(bvid)}${download ? '&download=1' : ''}`;
}

// 流式 chat：返回 reader，调用方消费 SSE 行
export async function streamChat(messages, { onDelta, signal } = {}) {
  const resp = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error('HTTP ' + resp.status + ' ' + (t || '').slice(0, 200));
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  let acc = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.indexOf('data:') !== 0) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') return acc;
      try {
        const obj = JSON.parse(payload);
        const delta = obj.choices && obj.choices[0] && obj.choices[0].delta;
        if (delta && delta.content) {
          acc += delta.content;
          if (onDelta) onDelta(acc);
        }
      } catch (e) { /* 坏行忽略 */ }
    }
  }
  return acc;
}
