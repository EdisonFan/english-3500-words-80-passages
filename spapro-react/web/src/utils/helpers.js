// 工具函数：迁移自旧 app.js / dict.html 的散落工具

// HTML 转义（用于把动态内容安全地拼到 innerHTML 时；React 默认转义，仅个别 dangerouslySetInnerHTML 用）
export function esc(text) {
  if (text === undefined || text === null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 由 id 生成稳定的 hue 颜色
export function hashColor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 60%, 55%)`;
}

export function parseColor(c) {
  if (!c) return null;
  const m = String(c).match(/^#([0-9a-f]{6})$/i);
  if (m) {
    return [
      parseInt(m[1].slice(0, 2), 16),
      parseInt(m[1].slice(2, 4), 16),
      parseInt(m[1].slice(4, 6), 16),
    ];
  }
  // hsl 简化处理，返回 null 走默认
  return null;
}

export function pickFg(bg) {
  const rgb = parseColor(bg);
  if (!rgb) return '#fff';
  const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  return lum > 0.6 ? '#1a1a1a' : '#ffffff';
}

// 旧版 UNITS 数组（3500 词的 16 单元），仅文章页顶栏 unit 标题用
export const UNITS = [
  { num: 1, title: '校园生活', start: 1, end: 5 },
  { num: 2, title: '教育与学习', start: 6, end: 10 },
  { num: 3, title: '个人成长', start: 11, end: 15 },
  { num: 4, title: '自我管理', start: 16, end: 20 },
  { num: 5, title: '兴趣爱好', start: 21, end: 25 },
  { num: 6, title: '日常生活', start: 26, end: 30 },
  { num: 7, title: '健康生活', start: 31, end: 35 },
  { num: 8, title: '思维方式', start: 36, end: 39 },
  { num: 9, title: '社会交往', start: 40, end: 45 },
  { num: 10, title: '工作与职业', start: 46, end: 50 },
  { num: 11, title: '社会现象', start: 51, end: 55 },
  { num: 12, title: '动物世界', start: 56, end: 60 },
  { num: 13, title: '自然生态与环境保护', start: 61, end: 65 },
  { num: 14, title: '文学与艺术', start: 66, end: 70 },
  { num: 15, title: '历史与文化', start: 71, end: 75 },
  { num: 16, title: '科学与技术', start: 76, end: 80 },
];

// 找 unit 标题
export function findUnitTitle(id) {
  for (const u of UNITS) {
    if (id >= u.start && id <= u.end) return u.title;
  }
  return '';
}

// 移动端判断
export function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent);
}

// 播放次数格式化
export function fmtPlayCount(n) {
  n = Number(n) || 0;
  return n >= 10000 ? (n / 10000).toFixed(1) + '万' : n;
}

// 把数字补 0（pid 用 p001 格式）
export function padPid(n) {
  return 'p' + String(n).padStart(3, '0');
}
