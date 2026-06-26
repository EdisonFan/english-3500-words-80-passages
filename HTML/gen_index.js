// 生成静态索引页 index.html
var UNITS = [
    { num: 1,  title: '校园生活',           start: 1,  end: 5  },
    { num: 2,  title: '教育与学习',         start: 6,  end: 10 },
    { num: 3,  title: '个人成长',           start: 11, end: 15 },
    { num: 4,  title: '自我管理',           start: 16, end: 20 },
    { num: 5,  title: '兴趣爱好',           start: 21, end: 25 },
    { num: 6,  title: '日常生活',           start: 26, end: 30 },
    { num: 7,  title: '健康生活',           start: 31, end: 35 },
    { num: 8,  title: '思维方式',           start: 36, end: 39 },
    { num: 9,  title: '社会交往',           start: 40, end: 45 },
    { num: 10, title: '工作与职业',         start: 46, end: 50 },
    { num: 11, title: '社会现象',           start: 51, end: 55 },
    { num: 12, title: '动物世界',           start: 56, end: 60 },
    { num: 13, title: '自然生态与环境保护', start: 61, end: 65 },
    { num: 14, title: '文学与艺术',         start: 66, end: 70 },
    { num: 15, title: '历史与文化',         start: 71, end: 75 },
    { num: 16, title: '科学与技术',         start: 76, end: 80 }
];
var TOTAL = 80;

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

var html = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n' +
'<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
'<title>高考英语 3500 词 · 80 篇精读</title>\n<link rel="stylesheet" href="style.css">\n</head>\n<body>\n';

html += '<div class="home">' +
'<div class="home-head"><h1>高考英语 <em>3500 词</em></h1>' +
'<p>80 篇精读 · 16 个单元 · 单词下方带上下文释义</p></div>';

UNITS.forEach(function(unit){
    html += '<div class="unit-section">' +
        '<div class="unit-head">' +
        '<span class="unit-num">UNIT ' + unit.num + '</span>' +
        '<span class="unit-title">' + esc(unit.title) + '</span>' +
        '<span class="unit-range">Passage ' + unit.start + '-' + unit.end + '</span>' +
        '</div><div class="passage-list">';
    for (var i = unit.start; i <= unit.end; i++) {
        var num = String(i).padStart(2, '0');
        html += '<a class="passage-item" href="passage-' + num + '.html">' +
                '<div class="pi-num">PASSAGE ' + num + '</div>' +
                '<div class="pi-title">第 ' + i + ' 篇</div>' +
                '<div class="pi-stats">点击阅读 →</div>' +
                '</a>';
    }
    html += '</div></div>';
});

html += '</div>\n</body>\n</html>\n';

require('fs').writeFileSync('/workspace/HTML/index.html', html, 'utf8');
console.log('index.html 生成完成，' + TOTAL + ' 篇链接');
