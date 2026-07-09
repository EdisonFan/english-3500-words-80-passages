#!/usr/bin/env node
/**
 * 解析人教版 PEP2 源 markdown，生成 data/renjiao/pep2/ 数据结构
 *
 * 源格式（与 PEP1 不同）：
 *   ## Unit N - TITLE 中文标题
 *   ### Passage N - ENGLISH TITLE
 *   [en]
 *   <英文段，段间空行>
 *   [cn]
 *   <中文段，段间空行>
 *   [vocab]
 *   word | pos | meaning       (3 列：单词 / 词性 / 释义，PEP2 无音标)
 *
 * 输出：
 *   book.json             元数据 + 单元结构
 *   passages-index.json   文章摘要列表
 *   passages/pNNN.json    10 篇文章
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'data', 'renjiao', 'pep2_source.md');
const BOOK_DIR = path.join(__dirname, 'data', 'renjiao', 'pep2');
const PASSAGES_DIR = path.join(BOOK_DIR, 'passages');

const BOOK_ID = 'pep2';
const BOOK_TITLE = '高中英语 必修第二册';
const BOOK_SUBTITLE = '人教版 (2019 版)';
const BOOK_COLOR = '#2EA887';   // 蓝绿色,与 3500 / pep1 区分

/* 单元顺序：按文件出现顺序 */
const UNIT_TITLES = {
    1: 'Cultural Heritage 文化遗产',
    2: 'Wildlife Protection 野生动物保护',
    3: 'The Internet 互联网',
    4: 'History and Traditions 历史与传统',
    5: 'Music 音乐',
};

function uid(n) { return 'u' + String(n).padStart(2, '0'); }
function pid(n) { return 'p' + String(n).padStart(3, '0'); }
function pnum(n) { return String(n).padStart(2, '0'); }

function writeJson(p, obj) {
    fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

/* === 主流程 === */
function main() {
    if (!fs.existsSync(SRC)) {
        console.error('源文件不存在:', SRC);
        process.exit(1);
    }
    const md = fs.readFileSync(SRC, 'utf8');
    const lines = md.split(/\r?\n/);

    // 1. 按 ## Unit N 切分单元
    const unitRe = /^##\s+Unit\s+(\d+)/;
    const units = [];
    let curUnit = null;
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(unitRe);
        if (m) {
            if (curUnit) units.push(curUnit);
            curUnit = {
                start: i + 1,
                num: parseInt(m[1], 10),
                title: UNIT_TITLES[parseInt(m[1], 10)] || ('Unit ' + m[1]),
                rawLines: [],
            };
        } else if (curUnit) {
            curUnit.rawLines.push(lines[i]);
        }
    }
    if (curUnit) units.push(curUnit);

    console.log('解析到 ' + units.length + ' 个单元');

    // 2. 每个单元找课文
    const passages = [];
    const bookUnits = [];

    units.forEach((u, unitIdx) => {
        const unitId = uid(u.num);
        const unitTitle = u.title;
        const unitPassages = [];

        // 切分文章
        const articleRe = /^###\s+Passage\s+(\d+)\s*-?\s*(.*)$/;
        let curArticle = null;
        let curSection = null;   // 'en' | 'cn' | 'vocab' | null
        const vocabRows = [];

        for (let i = 0; i < u.rawLines.length; i++) {
            const line = u.rawLines[i];

            const am = line.match(articleRe);
            if (am) {
                if (curArticle) unitPassages.push(curArticle);
                const articleNum = parseInt(am[1], 10);
                const enTitle = am[2].trim();
                curArticle = {
                    unitNum: u.num,
                    articleNum: articleNum,
                    title: enTitle,
                    cnTitle: '',   // PEP2 标题不带中文,留空
                    enLines: [],
                    cnLines: [],
                    vocabRows: [],
                    curSection: null,
                };
                curSection = null;
                continue;
            }

            // 区段标记 [en] / [cn] / [vocab]
            const sm = line.match(/^\s*\[(en|cn|vocab)\]\s*$/i);
            if (sm && curArticle) {
                curSection = sm[1].toLowerCase();
                curArticle.curSection = curSection;
                continue;
            }

            // 收尾段（blockquote 说明 > 开头的解释文字也跳过）
            if (!curArticle) continue;
            if (line.trim().startsWith('>')) {
                // blockquote 注释行(只有 p010 有,跳过)
                continue;
            }

            if (curSection === 'en') {
                curArticle.enLines.push(line);
            } else if (curSection === 'cn') {
                curArticle.cnLines.push(line);
            } else if (curSection === 'vocab') {
                // PEP2 单词行形如 "heritage | n. | 遗产..."
                // PEP1 单词行形如 "| heritage | /.../ | n. | ... |"
                // 两种都收,parseVocabTable 会过滤(没 | 的行 / 分隔行 / 表头)
                if (line.trim() && line.includes('|')) {
                    curArticle.vocabRows.push(line);
                }
            }
        }
        // 收尾
        if (curArticle) unitPassages.push(curArticle);

        // 解析该单元的所有文章
        unitPassages.forEach(p => {
            const parsed = parseArticle(p, unitId);
            passages.push(parsed);
        });

        // 单元信息(先占位,后面再写 passsages 列表)
        bookUnits.push({
            id: unitId,
            num: u.num,
            title: unitTitle,
            passages: [],
        });
    });

    // 给 passages 编号
    const numByUnit = {};
    let globalNum = 1;
    passages.forEach(p => {
        if (!numByUnit[p.unitId]) numByUnit[p.unitId] = 0;
        numByUnit[p.unitId]++;
        p.id = pid(globalNum++);
        p.num = numByUnit[p.unitId];
    });

    // 填 bookUnits.passages
    const finalUnits = [];
    const seenUnit = new Set();
    passages.forEach(p => {
        if (!seenUnit.has(p.unitId)) {
            seenUnit.add(p.unitId);
            const u = bookUnits.find(x => x.id === p.unitId);
            finalUnits.push(u);
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
        color: BOOK_COLOR,
        desc: '人民教育出版社 2019 版高中英语必修第二册,10 篇主课文 + 单元单词表',
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
        path: 'renjiao/pep2',
        title: BOOK_TITLE,
        subtitle: BOOK_SUBTITLE,
        cover: null,
        color: BOOK_COLOR,
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

    // 统计
    let totalWords = 0, totalCore = 0;
    passages.forEach(p => { totalWords += p.stats.words; totalCore += p.stats.core; });
    console.log('  - 总词数 ' + totalWords + ', 核心词覆盖 ' + totalCore);
}

/* === 解析单篇文章 === */
function parseArticle(p, unitId) {
    // 切分英文段(按空行)
    const enParas = splitBlankLines(p.enLines);
    const cnParas = splitBlankLines(p.cnLines);

    // 配对段
    const paragraphs = [];
    const paraCount = Math.min(enParas.length, cnParas.length);
    for (let i = 0; i < paraCount; i++) {
        paragraphs.push({
            num: pnum(i + 1),
            en: enParas[i].trim(),
            cn: cnParas[i].trim(),
        });
    }

    // 解析单词表
    const vocabList = parseVocabTable(p.vocabRows || []);

    // 全文英文(用于核心判断)
    const fullEn = paragraphs.map(para => para.en).join('\n');

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
            phonetic: '',     // PEP2 无音标
            pos: v.pos,
            meaning: v.meaning,
        });
    });

    // 给段落里 core 词加 {word} 标记
    if (paragraphs.length) {
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
        id: '',
        num: 0,
        unitId: unitId,
        unitNum: p.unitNum,
        title: p.title,
        cnTitle: p.cnTitle,
        preview: finalPreview,
        stats: { words: words, core: coreCount },
        paragraphs: paragraphs,
        vocab: vocabOut,
    };
}

/* === 按空行切分(每段可以是多行) === */
function splitBlankLines(lines) {
    const result = [];
    let cur = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === '') {
            if (cur.length) {
                result.push(cur.join(' ').replace(/\s+/g, ' ').trim());
                cur = [];
            }
        } else {
            cur.push(line);
        }
    }
    if (cur.length) {
        result.push(cur.join(' ').replace(/\s+/g, ' ').trim());
    }
    return result.filter(s => s && s.length > 0);
}

/* === 解析 PEP2 单词表(3 列: word | pos | meaning,无外层 |) === */
function parseVocabTable(rows) {
    const result = [];
    for (let i = 0; i < rows.length; i++) {
        const line = rows[i].trim();
        if (!line) continue;
        // PEP2 格式: word | pos | meaning(没外层 |)
        // PEP1 格式: | word | phon | pos | meaning | (有外层 |)
        // 两种都认:用 | 切分,跳过空 cell
        if (!line.includes('|')) continue;
        if (/^\|[\s\-:|]+\|$/.test(line)) continue;  // 分隔行
        if (/^\|\s*单词/.test(line)) continue;        // 表头

        const cells = line.split('|').map(s => s.trim()).filter(s => s !== '');
        if (cells.length < 3) continue;

        // 兼容 PEP1 4 列格式(列1=word, 列2=phonetic, 列3=pos, 列4=meaning)
        // PEP2 3 列格式(列1=word, 列2=pos, 列3=meaning)
        let word, pos, meaning;
        if (cells.length >= 4 && /^\[.+]$/.test(cells[1])) {
            // PEP1 风格
            word = cells[0]; pos = cells[2]; meaning = cells[3];
        } else {
            word = cells[0]; pos = cells[1]; meaning = cells[2];
        }

        if (!word) continue;
        result.push({ word: word, pos: pos, meaning: meaning });
    }
    return result;
}

function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countWords(text) {
    if (!text) return 0;
    const cleaned = text.replace(/[.,!?;:'"()\[\]{}]/g, ' ');
    const parts = cleaned.split(/\s+/).filter(s => s && /[A-Za-z]/.test(s));
    return parts.length;
}

main();
