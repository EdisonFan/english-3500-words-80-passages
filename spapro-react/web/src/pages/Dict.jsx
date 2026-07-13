import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { fetchDict, fetchSearchVideo } from '../api/client.js';
import { useDictStore } from '../store/index.js';

// 单词翻译页：迁移自 dict.html
// 原 dict.html 用 sessionStorage 接收数据 + URL 兜底；React 版统一走 URL ?word=xxx
// 词典结果缓存到 zustand 内存 store，避免来回切词重复请求
export default function Dict() {
  const [searchParams] = useSearchParams();
  const word = (searchParams.get('word') || '').toLowerCase().trim();
  const [dictState, setDictState] = useState({ loading: false, data: null, error: null });
  const [videoList, setVideoList] = useState(null); // null=未查, []=已查无, [...]有视频
  const mainEl = useRef(null);

  const getDict = useDictStore(s => s.getDict);
  const setDict = useDictStore(s => s.setDict);
  const getVideos = useDictStore(s => s.getVideos);
  const setVideos = useDictStore(s => s.setVideos);

  // 查词典
  useEffect(() => {
    if (!word) {
      setDictState({ loading: false, data: { word: '', error: '缺少单词参数' }, error: null });
      return;
    }
    window.scrollTo(0, 0);

    // 优先内存缓存
    const cached = getDict(word);
    if (cached) {
      setDictState({ loading: false, data: cached, error: null });
    } else {
      setDictState({ loading: true, data: { word, loading: true }, error: null });
      fetchDict(word)
        .then(data => {
          setDict(word, data);
          setDictState({ loading: false, data, error: null });
        })
        .catch(e => setDictState({ loading: false, data: { word, error: e.message }, error: null }));
    }
  }, [word]);

  // 查视频（dict 显示视频按钮）
  useEffect(() => {
    if (!word) return;
    const videoWord = (dictState.data && (dictState.data.prototype || dictState.data.word) || word).toLowerCase();

    const cachedVideos = getVideos(videoWord);
    if (cachedVideos !== undefined) {
      setVideoList(cachedVideos);
      return;
    }
    fetchSearchVideo(videoWord)
      .then(j => {
        const list = j && j.ok && j.list ? j.list : [];
        setVideos(videoWord, list);
        setVideoList(list);
      })
      .catch(() => {
        setVideos(videoWord, []);
        setVideoList([]);
      });
  }, [word, dictState.data]);

  if (!word) {
    return (
      <main className="dict-main">
        <div className="dict-empty">缺少单词参数</div>
      </main>
    );
  }

  const data = dictState.data || {};

  return (
    <>
      <header className="dict-topbar">
        <button className="dict-back" onClick={() => history.length > 1 ? history.back() : (window.location.hash = '#/')} aria-label="返回">
          <span className="dict-back-arrow">‹</span>
        </button>
        <div className="dict-topbar-title">{data.word || word}</div>
      </header>
      <main className="dict-main" ref={mainEl}>
        <DictContent data={data} videoList={videoList} videoWord={word} />
      </main>
    </>
  );
}

function DictContent({ data, videoList, videoWord }) {
  const navigate = useNavigate();

  if (data.loading) {
    return (
      <>
        <div className="dict-eyebrow">Dictionary</div>
        <div className="dict-word-row">
          <div className="dict-word">{data.word}</div>
        </div>
        <div className="dict-loading"><span className="dict-spinner"></span>查询中…</div>
      </>
    );
  }
  if (data.error) {
    return (
      <>
        <div className="dict-eyebrow">Dictionary</div>
        <div className="dict-word-row">
          <div className="dict-word">{data.word}</div>
          <VideoButton videoList={videoList} videoWord={videoWord} data={data} />
        </div>
        <div className="dict-empty">查询失败：{data.error}</div>
      </>
    );
  }
  if (!data.found) {
    return (
      <>
        <div className="dict-eyebrow">Dictionary</div>
        <div className="dict-word-row">
          <div className="dict-word">{data.word}</div>
          <VideoButton videoList={videoList} videoWord={videoWord} data={data} />
        </div>
        <div className="dict-empty">未找到该词的释义</div>
      </>
    );
  }

  return (
    <>
      <div className="dict-eyebrow">Dictionary</div>
      <div className="dict-word-row">
        <div className="dict-word">{data.word}</div>
        <VideoButton videoList={videoList} videoWord={videoWord} data={data} />
      </div>

      {data.base_form && (
        <div className="dict-base-form">← {data.base_form} 的所有格/缩写形式</div>
      )}

      {(data.phonetic_uk || data.audio_uk || data.phonetic_us || data.audio_us) && (
        <div className="dict-phon-row">
          {(data.phonetic_uk || data.audio_uk) && (
            <div className="phon-block">
              {data.phonetic_uk && <span className="phon-text">{data.phonetic_uk}</span>}
              {data.audio_uk && (
                <button className="audio-btn" onClick={e => playAudio(e.currentTarget, data.audio_uk)}>
                  <span className="audio-icon">🔊</span>英
                </button>
              )}
            </div>
          )}
          {(data.phonetic_us || data.audio_us) && (
            <div className="phon-block">
              {data.phonetic_us && <span className="phon-text">{data.phonetic_us}</span>}
              {data.audio_us && (
                <button className="audio-btn" onClick={e => playAudio(e.currentTarget, data.audio_us)}>
                  <span className="audio-icon">🔊</span>美
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {data.prototype && (
        <div className="dict-prototype">
          <span className="prototype-label">原型</span>
          <span className="prototype-value">{data.prototype}</span>
        </div>
      )}

      {data.exam_type && data.exam_type.length > 0 && (
        <div className="dict-exam-type">
          <span className="exam-type-label">考试</span>
          {data.exam_type.map((t, i) => <span className="exam-type-tag" key={i}>{t}</span>)}
        </div>
      )}

      {data.defs && data.defs.length > 0 && (
        <div className="dict-defs">
          {data.defs.map((d, i) => (
            <div className="dict-def" key={i}>
              {d.pos && <span className="pos">{d.pos}</span>}
              {d.meaning && <span className="meaning">{d.meaning}</span>}
            </div>
          ))}
        </div>
      )}

      {data.forms && data.forms.length > 0 && (
        <div className="dict-section">
          <div className="dict-section-label">变形</div>
          <div className="dict-section-body">
            {data.forms.map((f, i) => (
              <React.Fragment key={i}>
                {i > 0 && '；'}{f.name}: {f.value}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {data.examples && data.examples.length > 0 && (
        <div className="dict-section">
          <div className="dict-section-label">双语例句</div>
          {data.examples.map((ex, i) => (
            <div className="dict-example" key={i}>
              <div className="example-en">{wrapEnglish(ex.en, navigate)}</div>
              <div className="example-zh">{ex.zh}</div>
            </div>
          ))}
        </div>
      )}

      {data.synonyms && data.synonyms.length > 0 && (
        <div className="dict-section">
          <div className="dict-section-label">同义词</div>
          {data.synonyms.map((syn, i) => (
            <div className="dict-syn-item" key={i}>
              {syn.pos && <span className="syn-pos">{syn.pos}</span>}
              {syn.meaning && <span className="syn-meaning">{syn.meaning}</span>}
              <span className="syn-words">{wrapEnglish(syn.words.join(', '), navigate)}</span>
            </div>
          ))}
        </div>
      )}

      {data.phrs && data.phrs.length > 0 && (
        <div className="dict-section">
          <div className="dict-section-label">词组搭配</div>
          {data.phrs.map((p, i) => (
            <div className="dict-phr-item" key={i}>
              <span className="phr-phrase">{wrapEnglish(p.phrase, navigate)}</span>
              {p.translations && p.translations.length > 0 && (
                <span className="phr-trans">{p.translations.join('；')}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {data.individual && Object.keys(data.individual).length > 0 && (
        <IndividualSection ind={data.individual} navigate={navigate} />
      )}

      {data.sources && data.sources.length > 0 && (
        <div className="dict-source">
          数据来源：{data.sources.map(s => sourceLabel(s)).join(' + ')}
        </div>
      )}
    </>
  );
}

function sourceLabel(s) {
  return { 'youdao': '有道词典' }[s] || s;
}

function IndividualSection({ ind, navigate }) {
  return (
    <div className="dict-section">
      <div className="dict-section-label">考试信息</div>
      {(ind.level || ind.mnemonic) && (
        <div className="dict-ind-meta">{[ind.level, ind.mnemonic].filter(Boolean).join(' · ')}</div>
      )}
      {ind.examInfo && (ind.examInfo.frequency || ind.examInfo.year) && (
        <>
          <div className="dict-ind-exam-info">
            {ind.examInfo.frequency && (
              <span className="exam-stat">近{ind.examInfo.year || ''}年考频 <b>{ind.examInfo.frequency}</b></span>
            )}
            {ind.examInfo.recommendationRate && (
              <span className="exam-stat">推荐指数 <b>{ind.examInfo.recommendationRate}</b></span>
            )}
          </div>
          {ind.examInfo.questionTypeInfo && ind.examInfo.questionTypeInfo.length > 0 && (
            <div className="dict-ind-qtypes">
              {ind.examInfo.questionTypeInfo.map((q, i) => (
                <span className="qtype-tag" key={i}>{q.type} {q.time || ''}</span>
              ))}
            </div>
          )}
        </>
      )}
      {ind.idiomatic && ind.idiomatic.length > 0 && (
        <>
          {ind.idiomatic.map((c, i) => (
            <div className="dict-idiom-item" key={i}>
              <span className="idiom-en">{wrapEnglish(c.en, navigate)}</span>
              <span className="idiom-zh">{c.zh}</span>
            </div>
          ))}
        </>
      )}
      {ind.pastExamSents && ind.pastExamSents.length > 0 && (
        <div className="dict-ind-past-sents">
          <div className="dict-section-sub-label">真题例句</div>
          {ind.pastExamSents.map((s, i) => (
            <div className="dict-past-sent-item" key={i}>
              <div className="past-sent-en">{wrapEnglish(s.en, navigate)}</div>
              <div className="past-sent-zh">{s.zh}</div>
              {s.source && <div className="past-sent-src">{s.source}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 视频按钮：有视频时显示
function VideoButton({ videoList, videoWord, data }) {
  const navigate = useNavigate();
  if (!videoList || !videoList.length) return null;
  const w = (data.prototype || data.word || videoWord).toLowerCase();
  return (
    <button
      className="dict-video-btn"
      onClick={() => navigate(`/video?word=${encodeURIComponent(w)}`)}
    >
      <span className="dv-icon">▶</span> 教学视频
    </button>
  );
}

// 播放发音
function playAudio(btn, src) {
  try {
    const audio = new Audio(src);
    audio.play().catch(() => {});
    btn.classList.add('playing');
    setTimeout(() => btn.classList.remove('playing'), 600);
  } catch (e) {}
}

// 把纯英文文本里的单词包成可点击 span（跳转到 /dict?word=）
function wrapEnglish(text, navigate) {
  if (!text) return null;
  const re = /([A-Za-z][A-Za-z''']*)/g;
  const nodes = [];
  let lastIdx = 0;
  let match;
  let k = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIdx) nodes.push(text.slice(lastIdx, match.index));
    const word = match[1];
    const display = String(word).replace(/^[''']+|[''']+$/g, '');
    const query = display.replace(/['']/g, "'").toLowerCase();
    if (display) {
      nodes.push(
        <span
          className="dw"
          key={k++}
          onClick={e => { e.stopPropagation(); e.preventDefault(); navigate(`/dict?word=${encodeURIComponent(query)}`); }}
        >
          {display}
        </span>
      );
    }
    lastIdx = re.lastIndex;
  }
  if (lastIdx < text.length) nodes.push(text.slice(lastIdx));
  return nodes;
}

// （React.Fragment 已在文件顶部引入）
