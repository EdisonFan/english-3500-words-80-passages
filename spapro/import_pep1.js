#!/usr/bin/env node
/**
 * 解析人教版 PEP1 源 markdown，生成 data/renjiao/pep1/ 数据结构
 *
 * 源格式：
 *   ## WELCOME UNIT｜欢迎单元
 *   ## Unit N｜xxx
 *   ### 课文一 · Reading and Thinking：XXX
 *   > 英文段落...
 *   **中文翻译**
 *   > 中文段落...
 *   ### 课文二 · Reading for Writing：XXX
 *   ### 单词表（Words and Expressions）
 *   | 单词 | 音标 | 词性 | 中文 |
 *
 * 输出：
 *   book.json             元数据 + 单元结构
 *   passages-index.json   文章摘要列表
 *   passages/pNNN.json    12 篇文章
 *
 * 重跑安全：先清空 passages/ 目录再写；book.json / passages-index.json 直接覆盖
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'data', 'renjiao', 'pep1_source.md');
const BOOK_DIR = path.join(__dirname, 'data', 'renjiao', 'pep1');
const PASSAGES_DIR = path.join(BOOK_DIR, 'passages');

const BOOK_ID = 'pep1';
const BOOK_TITLE = '高中英语 必修第一册';
const BOOK_SUBTITLE = '人教版 (2019 版)';

/* 单元顺序：按文件出现顺序 */
const UNIT_TITLES = {
    0: '欢迎单元',
    WELCOME: '欢迎单元',
    1: '青少年生活',
    2: '旅行',
    3: '运动与健康',
    4: '自然灾害',
    5: '世界各地的语言',
};

function uid(n) { return 'u' + String(n).padStart(2, '0'); }
function pid(n) { return 'p' + String(n).padStart(3, '0'); }
function pnum(n) { return String(n).padStart(2, '0'); }

function readText(p) {
    return fs.readFileSync(p, 'utf8');
}

function writeJson(p, obj) {
    fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

/* === 主流程 === */
function main() {
    if (!fs.existsSync(SRC)) {
        console.error('源文件不存在:', SRC);
        process.exit(1);
    }
    const md = readText(SRC);
    const lines = md.split(/\r?\n/);

    // 1. 按 ## WELCOME UNIT / ## Unit N 切分单元
    const unitRe = /^##\s+(WELCOME UNIT|Unit\s+\d+)/;
    const units = [];
    let curUnit = null;
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(unitRe);
        if (m) {
            if (curUnit) units.push(curUnit);
            curUnit = {
                start: i + 1,
                num: m[1] === 'WELCOME UNIT' ? 0 : parseInt(m[1].split(/\s+/)[1], 10),
                title: m[1] === 'WELCOME UNIT'
                    ? UNIT_TITLES.WELCOME
                    : UNIT_TITLES[parseInt(m[1].split(/\s+/)[1], 10)] || '',
                rawLines: [],
            };
        } else if (curUnit) {
            curUnit.rawLines.push(lines[i]);
        }
    }
    if (curUnit) units.push(curUnit);

    console.log('解析到 ' + units.length + ' 个单元');

    // 2. 每个单元找课文 + 单词表
    const passages = [];   // 所有文章
    const bookUnits = [];  // 写到 book.json 的单元信息

    units.forEach((u, unitIdx) => {
        // u.num=0 是 WELCOME
        const unitId = u.num === 0 ? 'u00' : uid(u.num);
        const unitTitle = u.title;
        const unitPassages = [];

        // 切分文章
        const articleRe = /^###\s+课文([一二])/;
        const vocabRe = /^###\s+单词表/;
        let curArticle = null;
        let inVocab = false;
        let curVocab = [];
        const rawText = u.rawLines.join('\n');
        const uLines = u.rawLines;

        for (let i = 0; i < uLines.length; i++) {
            const line = uLines[i];

            const am = line.match(articleRe);
            if (am) {
                // 收尾上一篇文章
                if (curArticle) {
                    unitPassages.push(curArticle);
                    curArticle = null;
                }
                const articleNum = am[1] === '一' ? 1 : 2;
                // 提取标题: ### 课文一 · Reading and Thinking：FIRST IMPRESSIONS（第一印象）
                const tm = line.match(/^###\s+课文[一二]\s*[·\.\-]\s*([^：:]+)[：:]\s*(.+)$/);
                let enTitle = '';
                let cnTitle = '';
                if (tm) {
                    enTitle = tm[1].trim();
                    cnTitle = tm[2].trim();
                } else {
                    enTitle = line.replace(/^###\s+课文[一二]\s*[·\.\-]\s*/, '').trim();
                }
                curArticle = {
                    unitNum: u.num,
                    articleNum: articleNum,
                    title: enTitle,
                    cnTitle: cnTitle,
                    enLines: [],   // 英文 blockquote 行(到 **中文翻译** 为止)
                    cnLines: [],   // 中文 blockquote 行
                    inCn: false,   // 是否到了中文部分
                };
                inVocab = false;
                continue;
            }

            if (vocabRe.test(line)) {
                if (curArticle) {
                    unitPassages.push(curArticle);
                    curArticle = null;
                }
                inVocab = true;
                continue;
            }

            if (inVocab) {
                // 单词表行
                if (line.trim().startsWith('|')) {
                    curVocab.push(line);
                } else if (line.trim() === '' && curVocab.length) {
                    // 表格结束（空行）
                }
                continue;
            }

            if (curArticle) {
                if (/^\*\*中文翻译\*\*\s*$/.test(line.trim())) {
                    curArticle.inCn = true;
                    continue;
                }
                if (curArticle.inCn) {
                    curArticle.cnLines.push(line);
                } else {
                    curArticle.enLines.push(line);
                }
            }
        }
        // 收尾
        if (curArticle) unitPassages.push(curArticle);
        if (curVocab.length) {
            // 单词表赋值给该单元所有文章(共享)
            unitPassages.forEach(p => { p.vocabRaw = curVocab.slice(); });
        }

        // 解析该单元的所有文章
        unitPassages.forEach(p => {
            const parsed = parseArticle(p, unitId, unitIdx);
            passages.push(parsed);
        });

        // 单元信息
        bookUnits.push({
            id: unitId,
            num: u.num,
            title: unitTitle,
            passages: unitPassages.map((_, i) => pid(unitIdx === 0 && u.num === 0 ? 0 : 0)).filter(() => false),
        });
    });

    // 重新构造 bookUnits(因为 passages 编号是按全局顺序)
    const numByUnit = {};
    passages.forEach(p => {
        if (!numByUnit[p.unitId]) numByUnit[p.unitId] = 0;
        numByUnit[p.unitId]++;
        p.id = pid(globalNum++);
        p.num = numByUnit[p.unitId];
    });

    // 重新生成 bookUnits.passages
    const finalUnits = [];
    const seenUnit = new Set();
    passages.forEach(p => {
        if (!seenUnit.has(p.unitId)) {
            seenUnit.add(p.unitId);
            finalUnits.push({
                id: p.unitId,
                num: p.unitNum,
                title: p.unitTitle,
                passages: [],
            });
        }
        finalUnits.find(u => u.id === p.unitId).passages.push(p.id);
    });

    // 3. 写文件
    fs.mkdirSync(PASSAGES_DIR, { recursive: true });
    const old = fs.readdirSync(PASSAGES_DIR);
    for (const f of old) fs.unlinkSync(path.join(PASSAGES_DIR, f));

    // passages-index
    const indexEntries = passages.map(p => ({
        id: p.id,
        num: p.num,
        unitId: p.unitId,
        title: p.title,
        cnTitle: p.cnTitle,
        preview: p.preview,
        wordCount: p.stats.words,
        coreCount: p.stats.core,
    }));
    writeJson(path.join(BOOK_DIR, 'passages-index.json'), {
        bookId: BOOK_ID,
        passages: indexEntries,
    });

    // 每篇文章单独文件
    passages.forEach(p => {
        writeJson(path.join(PASSAGES_DIR, p.id + '.json'), {
            id: p.num,
            stats: p.stats,
            paragraphs: p.paragraphs,
            vocab: p.vocab,
        });
    });

    // book.json
    const book = {
        id: BOOK_ID,
        title: BOOK_TITLE,
        subtitle: BOOK_SUBTITLE,
        cover: null,
        color: '#6E4FBE',
        desc: '人民教育出版社 2019 版高中英语必修第一册,12 篇主课文 + 单元单词表',
        passageCount: passages.length,
        units: finalUnits,
    };
    writeJson(path.join(BOOK_DIR, 'book.json'), book);

    // 4. 更新 data/books.json
    const booksPath = path.join(__dirname, 'data', 'books.json');
    let books = { books: [] };
    if (fs.existsSync(booksPath)) {
        try { books = JSON.parse(fs.readFileSync(booksPath, 'utf8')); } catch (e) { }
    }
    if (!Array.isArray(books.books)) books.books = [];
    const exist = books.books.findIndex(b => b.id === BOOK_ID);
    const entry = {
        id: BOOK_ID,
        path: 'renjiao/pep1',
        title: BOOK_TITLE,
        subtitle: BOOK_SUBTITLE,
        cover: null,
        color: '#6E4FBE',
        passageCount: passages.length,
        unitCount: finalUnits.length,
    };
    if (exist >= 0) books.books[exist] = entry;
    else books.books.push(entry);
    writeJson(booksPath, books);

    console.log('生成完成:');
    console.log('  - ' + passages.length + ' 篇文章 → ' + PASSAGES_DIR);
    console.log('  - ' + finalUnits.length + ' 单元 → ' + path.join(BOOK_DIR, 'book.json'));
    console.log('  - 摘要索引 → ' + path.join(BOOK_DIR, 'passages-index.json'));
    console.log('  - 总索引已更新 → ' + booksPath);

    // 统计信息
    let totalWords = 0, totalCore = 0;
    passages.forEach(p => { totalWords += p.stats.words; totalCore += p.stats.core; });
    console.log('  - 总词数 ' + totalWords + ', 核心词覆盖 ' + totalCore);
}

let globalNum = 1;

/* === 解析单篇文章 === */
function parseArticle(p, unitId, unitIdx) {
    // 切分英文段(按空行)
    const enParas = splitBlockquotes(p.enLines);
    const cnParas = splitBlockquotes(p.cnLines);

    // 配对段
    const paragraphs = [];
    const paraCount = Math.min(enParas.length, cnParas.length);
    for (let i = 0; i < paraCount; i++) {
        let en = enParas[i].trim();
        let cn = cnParas[i].trim();
        paragraphs.push({
            num: pnum(i + 1),
            en: en,
            cn: cn,
        });
    }

    // 解析单词表
    const vocabList = parseVocabTable(p.vocabRaw || []);

    // 全文英文(用于核心判断)
    const fullEn = paragraphs.map(para => para.en).join('\n');
    const fullEnLower = ' ' + fullEn.toLowerCase() + ' ';

    // 判断 core/outline + 加 {word} 标记
    let coreCount = 0;
    const vocabOut = [];
    const seenWord = new Set();
    vocabList.forEach(v => {
        if (seenWord.has(v.word.toLowerCase())) return;  // 去重
        seenWord.add(v.word.toLowerCase());

        const isPhrase = v.word.indexOf(' ') >= 0;
        let isCore = false;
        if (!isPhrase && /^[A-Za-z][A-Za-z'-]*$/.test(v.word)) {
            const re = new RegExp('\\b' + escapeRe(v.word) + '\\b', 'i');
            isCore = re.test(fullEn);
        }
        if (isCore) coreCount++;

        vocabOut.push({
            word: v.word,
            type: isCore ? 'core' : 'outline',
            phonetic: v.phonetic,
            pos: v.pos,
            meaning: v.meaning,
        });
    });

    // 给段落里 core 词加 {word} 标记(只对单词,大小写保留原文)
    if (paragraphs.length) {
        // 按词长降序排列,避免短词先匹配破坏长词
        const coreWords = vocabOut
            .filter(v => v.type === 'core' && v.word.indexOf(' ') < 0 && /^[A-Za-z][A-Za-z'-]*$/.test(v.word))
            .map(v => v.word)
            .sort((a, b) => b.length - a.length);

        paragraphs.forEach(para => {
            coreWords.forEach(w => {
                const re = new RegExp('\\b' + escapeRe(w) + '\\b', 'gi');
                para.en = para.en.replace(re, function (m) { return '{' + m + '}'; });
            });
        });
    }

    // 统计词数
    const words = countWords(fullEn);

    // 预览
    const firstEn = paragraphs[0] ? paragraphs[0].en : '';
    const preview = firstEn.replace(/[{}]/g, '').slice(0, 80).trim();
    const finalPreview = preview.length < firstEn.length ? preview + '…' : preview;

    return {
        id: '',  // 后填
        num: 0,  // 后填
        unitId: unitId,
        unitNum: p.unitNum,
        unitTitle: (UNIT_TITLES[p.unitNum] || ''),
        title: p.title,
        cnTitle: p.cnTitle,
        preview: finalPreview,
        stats: { words: words, core: coreCount },
        paragraphs: paragraphs,
        vocab: vocabOut,
    };
}

/* === 切分 blockquote 段(按空行 / 空 > 行分组) === */
function splitBlockquotes(lines) {
    const result = [];
    let cur = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // 真正的空行,或只含 > 的行,都当段分隔
        if (line.trim() === '' || /^>\s*$/.test(line)) {
            if (cur.length) {
                result.push(cur.join(' ').replace(/\s+/g, ' ').trim());
                cur = [];
            }
            continue;
        }
        if (/^>\s?/.test(line)) {
            cur.push(line.replace(/^>\s?/, ''));
        } else {
            // 普通文本行(不该出现,但兜底)
            if (cur.length) {
                cur.push(line);
            }
        }
    }
    if (cur.length) {
        result.push(cur.join(' ').replace(/\s+/g, ' ').trim());
    }
    return result.filter(s => s && s.length > 0);
}

/* === 解析单词表 === */
function parseVocabTable(rows) {
    const result = [];
    for (let i = 0; i < rows.length; i++) {
        const line = rows[i].trim();
        if (!line.startsWith('|')) continue;
        if (/^\|[\s\-:|]+\|$/.test(line)) continue;  // 分隔行
        if (/^\|\s*单词/.test(line)) continue;        // 表头

        // 切 4 列
        const cells = line.split('|').map(s => s.trim()).filter(s => s !== '');
        if (cells.length < 4) continue;

        const word = cells[0];
        const phonetic = cells[1];
        const pos = cells[2];
        const meaning = cells[3];

        if (!word) continue;
        result.push({ word: word, phonetic: phonetic, pos: pos, meaning: meaning });
    }
    return result;
}

function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countWords(text) {
    if (!text) return 0;
    // 简单按空格切,去掉标点
    const cleaned = text.replace(/[.,!?;:'"()\[\]{}]/g, ' ');
    const parts = cleaned.split(/\s+/).filter(s => s && /[A-Za-z]/.test(s));
    return parts.length;
}

main();
