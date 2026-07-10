#!/usr/bin/env node
/**
 * 解析人教版 选择性必修第二册 源 markdown,生成 data/renjiao/sel2/ 数据结构
 *
 * 源格式(与 sel1 不同):
 *   ## UNIT N｜TITLE(中文)
 *   ### 课文X · TYPE: ENGLISH TITLE(中文)
 *   > 英文段 1
 *   > 英文段 2
 *   **中文翻译**
 *   > 中文段 1
 *   > 中文段 2
 *   ### 单词表(Words and Expressions)
 *   word | phonetic | pos | meaning   (4 列,单词/音标/词性/释义)
 *
 * 输出:
 *   book.json / passages-index.json / passages/p001..p010.json
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'data', 'renjiao', 'sel2_source.md');
const BOOK_DIR = path.join(__dirname, 'data', 'renjiao', 'sel2');
const PASSAGES_DIR = path.join(BOOK_DIR, 'passages');

const BOOK_ID = 'sel2';
const BOOK_TITLE = '高中英语 选择性必修第二册';
const BOOK_SUBTITLE = '人教版 (2019 版)';
const BOOK_COLOR = '#D17B3F';   // 橙棕色,与 sel1 钢蓝 / sel3 紫区分

const UNIT_TITLES = {
    1: 'Science and Scientists 科学与科学家',
    2: 'Bridging Cultures 沟通文化',
    3: 'Food and Culture 饮食与文化',
    4: 'Journey Across a Vast Land 穿越广袤大地',
    5: 'First Aid 急救',
};

function uid(n) { return 'u' + String(n).padStart(2, '0'); }
function pid(n) { return 'p' + String(n).padStart(3, '0'); }
function pnum(n) { return String(n).padStart(2, '0'); }

function writeJson(p, obj) {
    fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function main() {
    if (!fs.existsSync(SRC)) {
        console.error('源文件不存在:', SRC);
        process.exit(1);
    }
    const md = fs.readFileSync(SRC, 'utf8');
    const lines = md.split(/\r?\n/);

    // 1. 切分 ## UNIT N
    const unitRe = /^##\s+UNIT\s+(\d+)/i;
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
    if (units.length === 0) {
        console.error('ERROR: 没找到任何 UNIT 标题,源文件格式不对');
        process.exit(1);
    }

    // 2. 每个单元内解析:课文X (2 篇) + 单词表(单元级,挂到所有文章)
    const passages = [];
    const bookUnits = [];

    units.forEach(u => {
        const unitId = uid(u.num);
        const unitArticles = [];
        const unitVocabRows = [];
        let curArticle = null;
        let curSection = null;

        const articleRe = /^###\s+课文([一二三四五六])\s*·\s*([^：:]+)[：:]\s*(.+?)\s*$/;
        const vocabHeaderRe = /^###\s+单词表/;

        for (let i = 0; i < u.rawLines.length; i++) {
            const line = u.rawLines[i];

            const am = line.match(articleRe);
            if (am) {
                if (curArticle) unitArticles.push(curArticle);
                const cnNum = '一二三四五六'.indexOf(am[1]) + 1;
                const type = am[2].trim();
                const fullTitle = am[3].trim();
                // 拆分中英标题:  "ENGLISH TITLE（中文）" 或 "ENGLISH TITLE(中文)"
                const tm = fullTitle.match(/^(.+?)\s*[（(](.+?)[)）]\s*$/);
                const enTitle = tm ? tm[1].trim() : fullTitle;
                const cnTitle = tm ? tm[2].trim() : '';
                curArticle = {
                    unitNum: u.num,
                    articleNum: cnNum,
                    type: type,
                    title: enTitle,
                    cnTitle: cnTitle,
                    enLines: [],
                    cnLines: [],
                    curSection: null,
                };
                curSection = null;
                continue;
            }

            if (vocabHeaderRe.test(line)) {
                if (curArticle) {
                    unitArticles.push(curArticle);
                    curArticle = null;
                }
                curSection = 'vocab';
                continue;
            }

            if (curSection === 'vocab') {
                if (line.trim() && line.includes('|')) {
                    unitVocabRows.push(line);
                }
                continue;
            }

            if (!curArticle) continue;

            // 切换到中文段:遇到 "**中文翻译**" / "**中文翻译(...）**" 行
            if (/^\s*\*\*\s*中文翻译/.test(line)) {
                curSection = 'cn';
                curArticle.curSection = curSection;
                continue;
            }

            // 解析以 > 开头的引用行
            if (line.trim().startsWith('>')) {
                // 去掉前导 > 和一个空格
                const content = line.replace(/^\s*>\s?/, '').trim();
                if (!content) continue;
                if (curSection === null || curSection === 'en') {
                    curSection = 'en';
                    curArticle.enLines.push(content);
                } else if (curSection === 'cn') {
                    curArticle.cnLines.push(content);
                }
                continue;
            }

            // 跳过粗体段落标题,如 "**范文一 · ..."  或 "**Part 1 · ..." 或 "**信件一 · ..." 开头到行末
            if (line.trim().startsWith('**') && line.trim().endsWith('**')) continue;
            if (line.trim().startsWith('**') && /\*\*\s*$/.test(line.trim())) continue;

            // 忽略 [en] [cn] 风格标记(本格式无,防御性跳过)
            if (/^\s*\[(en|cn|vocab)\]\s*$/i.test(line)) {
                curSection = RegExp.$1.toLowerCase();
                curArticle.curSection = curSection;
                continue;
            }
        }
        if (curArticle) unitArticles.push(curArticle);

        // 单元级 vocab,挂到该单元所有文章
        const unitVocabList = parseVocabTable(unitVocabRows);

        unitArticles.forEach(p => {
            const parsed = parseArticle(p, unitId, unitVocabList);
            passages.push(parsed);
        });

        bookUnits.push({
            id: unitId,
            num: u.num,
            title: u.title,
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

    passages.forEach(p => {
        writeJson(path.join(PASSAGES_DIR, p.id + '.json'), {
            id: p.num,
            stats: p.stats,
            paragraphs: p.paragraphs,
            vocab: p.vocab,
        });
    });

    const book = {
        id: BOOK_ID,
        title: BOOK_TITLE,
        subtitle: BOOK_SUBTITLE,
        cover: null,
        color: BOOK_COLOR,
        desc: '人民教育出版社 2019 版高中英语选择性必修第二册,10 篇主课文 + 单元单词表',
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
        path: 'renjiao/' + BOOK_ID,
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

    let totalWords = 0, totalCore = 0;
    passages.forEach(p => { totalWords += p.stats.words; totalCore += p.stats.core; });
    console.log('  - 总词数 ' + totalWords + ', 核心词覆盖 ' + totalCore);
}

function parseArticle(p, unitId, unitVocabList) {
    const enParas = splitBlankLines(p.enLines);
    const cnParas = splitBlankLines(p.cnLines);

    const paragraphs = [];
    const paraCount = Math.min(enParas.length, cnParas.length);
    for (let i = 0; i < paraCount; i++) {
        paragraphs.push({
            num: pnum(i + 1),
            en: enParas[i].trim(),
            cn: cnParas[i].trim(),
        });
    }
    if (paragraphs.length === 0 && enParas.length > 0) {
        // 兜底:合并所有 enLines/cnLines 为单段(sel2 多为引用整体合并)
        const allEn = (p.enLines || []).join(' ').replace(/\s+/g, ' ').trim();
        const allCn = (p.cnLines || []).join(' ').replace(/\s+/g, ' ').trim();
        if (allEn) paragraphs.push({ num: pnum(1), en: allEn, cn: allCn });
    }

    const fullEn = paragraphs.map(para => para.en).join('\n');

    let coreCount = 0;
    const vocabOut = [];
    const seenWord = new Set();
    unitVocabList.forEach(v => {
        if (seenWord.has(v.word.toLowerCase())) return;
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
            phonetic: v.phonetic || '',
            pos: v.pos,
            meaning: v.meaning,
        });
    });

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

    const words = countWords(fullEn);
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

function parseVocabTable(rows) {
    const result = [];
    for (let i = 0; i < rows.length; i++) {
        const line = rows[i].trim();
        if (!line) continue;
        if (!line.includes('|')) continue;
        if (/^\|[\s\-:|]+\|$/.test(line)) continue;
        if (/^\|\s*单词/.test(line)) continue;

        const cells = line.split('|').map(s => s.trim()).filter(s => s !== '');
        if (cells.length < 3) continue;

        let word, pos, meaning, phonetic;
        if (cells.length >= 4) {
            // 4 列:word | phonetic | pos | meaning
            word = cells[0]; phonetic = cells[1]; pos = cells[2]; meaning = cells[3];
        } else {
            word = cells[0]; pos = cells[1]; meaning = cells[2]; phonetic = '';
        }

        if (!word) continue;
        result.push({ word: word, phonetic: phonetic || '', pos: pos, meaning: meaning });
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
