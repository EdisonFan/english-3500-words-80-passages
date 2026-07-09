#!/usr/bin/env node
/**
 * 多本书结构迁移脚本（一次性）
 * - 读 data/p01..p80.json（老平铺格式）
 * - 复制到 data/<bookId>/passages/p001..p080.json（3 位补零）
 * - 生成 data/<bookId>/book.json（书元数据 + 16 单元结构）
 * - 生成 data/<bookId>/passages-index.json（80 篇摘要）
 * - 生成 data/books.json（总书索引）
 *
 * 重跑安全：先清空目标 passages 目录再写，book/passes-index/books 三份覆盖
 *
 * 用法： node migrate_books.js [--book-id 3500] [--book-title "高考英语 3500 词"] [--source-dir data]
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function getArg(name, def) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
}

const ROOT = __dirname;
const BOOK_ID = getArg('--book-id', '3500');
const BOOK_TITLE = getArg('--book-title', '高考英语 3500 词');
const BOOK_SUBTITLE = getArg('--book-subtitle', '80 篇精读');
const SOURCE_DIR = path.join(ROOT, getArg('--source-dir', 'data'));
const TARGET_DIR = path.join(ROOT, 'data', BOOK_ID);
const PASSAGES_DIR = path.join(TARGET_DIR, 'passages');

// 16 单元结构（从 app.js 搬过来）
const UNITS = [
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

/* 找 id 属于哪个单元 */
function findUnit(id) {
    for (let i = 0; i < UNITS.length; i++) {
        if (id >= UNITS[i].start && id <= UNITS[i].end) return UNITS[i];
    }
    return null;
}

/* 提取每段第一句作 preview（去 {word} 标记） */
function firstSentence(enText) {
    if (!enText) return '';
    const clean = enText.replace(/[{}]/g, '');
    // 找第一个句号（保留缩写：直接按 . 切，取前 80 字符）
    const dot = clean.search(/[.!?]\s/);
    const cut = dot > 0 ? clean.slice(0, dot + 1) : clean.slice(0, 80);
    return cut.length < clean.length ? cut + '…' : cut;
}

function pad3(n) { return String(n).padStart(3, '0'); }
function pad2(n) { return String(n).padStart(2, '0'); }
function uid(num) { return 'u' + pad2(num); }
function pid(num) { return 'p' + pad3(num); }

function main() {
    if (!fs.existsSync(SOURCE_DIR)) {
        console.error('错误：源目录不存在', SOURCE_DIR);
        process.exit(1);
    }

    // 准备目录
    fs.mkdirSync(PASSAGES_DIR, { recursive: true });

    // 清空旧 passages（重跑安全）
    const old = fs.readdirSync(PASSAGES_DIR);
    for (const f of old) fs.unlinkSync(path.join(PASSAGES_DIR, f));

    // 收集所有源文件
    const sources = fs.readdirSync(SOURCE_DIR)
        .filter(n => /^p\d+\.json$/.test(n))
        .sort();

    if (!sources.length) {
        console.error('错误：源目录没有 p*.json');
        process.exit(1);
    }

    const indexEntries = [];
    const unitPassages = UNITS.map(u => ({ id: uid(u.num), num: u.num, title: u.title, passages: [] }));

    for (const src of sources) {
        const m = src.match(/^p(\d+)\.json$/);
        if (!m) continue;
        const num = parseInt(m[1], 10);
        const id = pid(num);
        const srcPath = path.join(SOURCE_DIR, src);
        const dstPath = path.join(PASSAGES_DIR, id + '.json');
        const raw = fs.readFileSync(srcPath, 'utf8');
        const data = JSON.parse(raw);

        // 不改 passage 内容，只挪位置
        fs.writeFileSync(dstPath, raw, 'utf8');

        const unit = findUnit(num);
        const firstPara = data.paragraphs && data.paragraphs[0];
        const preview = firstPara ? firstSentence(firstPara.en) : '';

        indexEntries.push({
            id,
            num,
            unitId: unit ? uid(unit.num) : null,
            title: '第 ' + num + ' 篇',
            preview,
            wordCount: (data.stats && data.stats.words) || 0,
            coreCount: (data.stats && data.stats.core) || 0,
        });

        if (unit) {
            const u = unitPassages.find(x => x.id === uid(unit.num));
            if (u) u.passages.push(id);
        }
    }

    // 写 book.json
    const book = {
        id: BOOK_ID,
        title: BOOK_TITLE,
        subtitle: BOOK_SUBTITLE,
        cover: null,
        color: '#3B6EE8',
        desc: '高考英语 3500 词 · 80 篇精读，单词下方带上下文释义。',
        passageCount: indexEntries.length,
        units: unitPassages,
    };
    fs.writeFileSync(path.join(TARGET_DIR, 'book.json'),
        JSON.stringify(book, null, 2) + '\n', 'utf8');

    // 写 passages-index.json
    const index = {
        bookId: BOOK_ID,
        passages: indexEntries,
    };
    fs.writeFileSync(path.join(TARGET_DIR, 'passages-index.json'),
        JSON.stringify(index, null, 2) + '\n', 'utf8');

    // 写 data/books.json（总书索引）
    const booksPath = path.join(ROOT, 'data', 'books.json');
    let books = { books: [] };
    if (fs.existsSync(booksPath)) {
        try { books = JSON.parse(fs.readFileSync(booksPath, 'utf8')); }
        catch (e) { books = { books: [] }; }
    }
    if (!Array.isArray(books.books)) books.books = [];

    const exist = books.books.findIndex(b => b.id === BOOK_ID);
    const entry = {
        id: BOOK_ID,
        title: BOOK_TITLE,
        subtitle: BOOK_SUBTITLE,
        cover: null,
        color: '#3B6EE8',
        passageCount: indexEntries.length,
        unitCount: unitPassages.length,
    };
    if (exist >= 0) books.books[exist] = entry;
    else books.books.push(entry);

    fs.writeFileSync(booksPath,
        JSON.stringify(books, null, 2) + '\n', 'utf8');

    console.log('迁移完成:');
    console.log('  - ' + indexEntries.length + ' 篇文章 → ' + PASSAGES_DIR);
    console.log('  - ' + unitPassages.length + ' 单元 → ' + path.join(TARGET_DIR, 'book.json'));
    console.log('  - 摘要索引 → ' + path.join(TARGET_DIR, 'passages-index.json'));
    console.log('  - 总索引 → ' + booksPath);
}

main();
