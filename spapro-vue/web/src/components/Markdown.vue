<template>
  <div v-html="html"></div>
</template>

<script setup>
import { computed } from 'vue';

// 轻量 markdown 渲染：粗体/斜体/标题/列表/行内代码/分隔线/GFM 表格
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function inlineMd(s) {
  let t = escapeHtml(s);
  t = t.replace(/`([^`]+?)`/g, (_, c) => `<code>${c}</code>`);
  t = t.replace(/\*\*([^*\n]+?)\*\*/g, (_, c) => `<strong>${c}</strong>`);
  t = t.replace(/(^|[^*])\*([^*\n]+?)\*/g, (_, p, c) => p + `<em>${c}</em>`);
  return t;
}

function isTableRow(line) {
  return /^\|(.+\|)+\s*$/.test(line.trim());
}
function isTableSep(line) {
  return /^\|[-\s:|]+\s*$/.test(line.trim());
}
function parseTableCell(s) {
  return inlineMd(s.trim());
}

function renderMarkdown(text) {
  if (!text) return '';
  const lines = text.split('\n');
  const out = [];
  let inList = false;
  let listType = null;
  let para = [];
  let inTable = false;
  let tableRows = [];

  function flushPara() {
    if (para.length) {
      out.push('<p>' + inlineMd(para.join(' ')) + '</p>');
      para = [];
    }
  }
  function flushList() {
    if (inList) { out.push('</' + listType + '>'); inList = false; listType = null; }
  }
  function flushTable() {
    if (!inTable || tableRows.length < 2) {
      for (const t of tableRows) para.push(t);
      tableRows = [];
      inTable = false;
      return;
    }
    const headerCells = tableRows[0].split('|').filter(c => c.trim() !== '');
    let html = '<table><thead><tr>';
    for (const c of headerCells) html += '<th>' + parseTableCell(c) + '</th>';
    html += '</tr></thead><tbody>';
    for (let di = 2; di < tableRows.length; di++) {
      const cells = tableRows[di].split('|').filter(c => c.trim() !== '');
      html += '<tr>';
      for (const c of cells) html += '<td>' + parseTableCell(c) + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
    out.push(html);
    tableRows = [];
    inTable = false;
  }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    const trimmed = line.trim();

    if (!trimmed) {
      if (inTable) flushTable();
      flushPara(); flushList();
      continue;
    }

    if (isTableRow(trimmed) || (inTable && isTableSep(trimmed))) {
      flushPara(); flushList();
      if (!inTable) inTable = true;
      tableRows.push(trimmed);
      continue;
    }
    if (inTable) flushTable();

    const h = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (h) {
      flushPara(); flushList();
      const level = Math.min(6, h[1].length + 1);
      out.push(`<h${level}>${inlineMd(h[2])}</h${level}>`);
      continue;
    }
    if (/^-{3,}\s*$/.test(trimmed)) {
      flushPara(); flushList();
      out.push('<hr>');
      continue;
    }
    const ol = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (ol) {
      flushPara();
      if (!inList || listType !== 'ol') { flushList(); out.push('<ol>'); inList = true; listType = 'ol'; }
      out.push('<li>' + inlineMd(ol[2]) + '</li>');
      continue;
    }
    const ul = trimmed.match(/^[-*+]\s+(.+)$/);
    if (ul) {
      flushPara();
      if (!inList || listType !== 'ul') { flushList(); out.push('<ul>'); inList = true; listType = 'ul'; }
      out.push('<li>' + inlineMd(ul[1]) + '</li>');
      continue;
    }
    flushList();
    para.push(line);
  }
  if (inTable) flushTable();
  flushPara();
  flushList();
  return out.join('');
}

const props = defineProps({
  text: { type: String, default: '' },
});

const html = computed(() => renderMarkdown(props.text));
</script>
