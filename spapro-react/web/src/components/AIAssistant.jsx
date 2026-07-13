import React, { useState, useRef, useEffect } from 'react';
import { streamChat } from '../api/client.js';
import Markdown from './Markdown.jsx';

const AI_SYSTEM_PROMPT = '你是一个高考英语学习助手,帮助用户精读英语文章、理解单词、解析语法和翻译。' +
  '回答要简洁、准确,用中文解释。涉及单词时给出音标、词性、释义和例句。';

const QUICK_PROMPTS = [
  { label: '解释中心思想', q: '解释这篇文章的中心思想' },
  { label: '语法重点', q: '列出本文的语法重点' },
  { label: '高级替换', q: '给我 5 个高级词汇替换' },
  { label: '翻译全文', q: '翻译成中文' },
];

// AI 助手：迁移自 app.js _ai 全局对象与相关函数
// 悬浮按钮 + 弹层 + 流式 SSE 响应
export default function AIAssistant({ visible }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]); // [{role, content}]
  const [streamingText, setStreamingText] = useState(''); // 当前流式累积文本
  const [error, setError] = useState(null);
  const [input, setInput] = useState('');
  const messagesRef = useRef(null);
  const inputRef = useRef(null);

  // 不显示时隐藏 fab
  if (!visible && open) setOpen(false);

  // 自动滚到底
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [history, streamingText, error]);

  // 自动调整 textarea 高度
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(120, inputRef.current.scrollHeight) + 'px';
    }
  }, [input]);

  function send(text) {
    if (busy) return;
    const t = (text !== undefined ? text : input).trim();
    if (!t) return;
    setInput('');

    const newHistory = history.concat([{ role: 'user', content: t }]);
    setHistory(newHistory);
    setBusy(true);
    setError(null);
    setStreamingText('');

    const messages = [{ role: 'system', content: AI_SYSTEM_PROMPT }].concat(newHistory);
    streamChat(messages, {
      onDelta: acc => setStreamingText(acc),
    })
      .then(fullText => {
        setHistory(h => h.concat([{ role: 'assistant', content: fullText || '(空响应)' }]));
        setStreamingText('');
      })
      .catch(err => {
        setError('请求失败: ' + (err && err.message || err));
      })
      .finally(() => {
        setBusy(false);
        setTimeout(() => inputRef.current && inputRef.current.focus(), 50);
      });
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  if (!visible) return null;

  return (
    <>
      <button
        className={`ai-fab${open ? ' ai-fab-hidden' : ''}`}
        title="AI 助手"
        onClick={() => setOpen(true)}
      >AI</button>

      {open && (
        <div
          className="ai-stage ai-stage-open"
          onClick={e => { if (e.target.className === 'ai-stage ai-stage-open') setOpen(false); }}
        >
          <div className="ai-panel">
            <div className="ai-header">
              <div>
                <span className="ai-header-title">AI 助手</span>
                <span className="ai-header-sub">Ling-2.6-flash</span>
              </div>
              <button className="ai-close" title="关闭" onClick={() => setOpen(false)}>✕</button>
            </div>

            <div className="ai-messages" ref={messagesRef}>
              {history.length === 0 && !streamingText && !error && (
                <div className="ai-empty">
                  <div className="ai-empty-icon">AI</div>
                  <div>有什么英语问题想问我?试试下面的快捷提问:</div>
                  <div className="ai-quick-row">
                    {QUICK_PROMPTS.map(p => (
                      <button
                        className="ai-quick"
                        key={p.label}
                        onClick={() => send(p.q)}
                      >{p.label}</button>
                    ))}
                  </div>
                </div>
              )}

              {history.map((msg, i) => (
                <MessageBubble key={i} msg={msg} />
              ))}

              {streamingText !== '' && (
                <div className="ai-msg ai-msg-bot">
                  <Markdown text={streamingText} />
                </div>
              )}

              {busy && streamingText === '' && (
                <div className="ai-msg ai-msg-bot">
                  <span className="ai-typing"><span></span><span></span><span></span></span>
                </div>
              )}

              {error && (
                <div className="ai-msg ai-msg-error">{error}</div>
              )}
            </div>

            <div className="ai-input-wrap">
              <textarea
                className="ai-input"
                placeholder="输入消息…"
                rows="1"
                value={input}
                ref={inputRef}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={busy}
              />
              <button
                className="ai-send"
                onClick={() => send()}
                disabled={busy}
              >发送</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MessageBubble({ msg }) {
  if (msg.role === 'user') {
    return (
      <>
        <div className="ai-msg ai-msg-user">{msg.content}</div>
        <div className="ai-msg-meta">{now()}</div>
      </>
    );
  }
  return (
    <div className="ai-msg ai-msg-bot">
      <Markdown text={msg.content} />
    </div>
  );
}

function now() {
  const d = new Date();
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}
