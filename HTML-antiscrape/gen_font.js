var fs = require('fs');
var path = require('path');
var opentype = require('opentype.js');

var outputDir = path.join(__dirname, 'fonts');
var mappingPath = path.join(__dirname, 'mapping.json');

var BASE_FONT_CANDIDATES = [
    'C:\\Windows\\Fonts\\arial.ttf',
    'C:\\Windows\\Fonts\\Arial.ttf',
    'C:\\Windows\\Fonts\\ARIAL.TTF',
    'C:\\Windows\\Fonts\\calibri.ttf',
    'C:\\Windows\\Fonts\\Calibri.ttf',
    'C:\\Windows\\Fonts\\segoeui.ttf',
    'C:\\Windows\\Fonts\\SegoeUI.ttf',
    'C:\\Windows\\Fonts\\times.ttf',
    'C:\\Windows\\Fonts\\Times.ttf'
];

function findBaseFont(){
    for(var i = 0; i < BASE_FONT_CANDIDATES.length; i++){
        if(fs.existsSync(BASE_FONT_CANDIDATES[i])){
            console.log('使用基础字体: ' + BASE_FONT_CANDIDATES[i]);
            return BASE_FONT_CANDIDATES[i];
        }
    }
    console.error('未找到系统字体，请手动将 TTF 字体文件放到本目录下命名为 base-font.ttf');
    console.error('推荐使用免费字体如 Source Sans 3: https://github.com/adobe-fonts/source-sans');
    process.exit(1);
}

function shuffle(str){
    var arr = str.split('');
    for(var i = arr.length - 1; i > 0; i--){
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr.join('');
}

function generateMapping(){
    var lower = 'abcdefghijklmnopqrstuvwxyz';
    var upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    var digits = '0123456789';

    var sLower = shuffle(lower);
    var sUpper = shuffle(upper);
    var sDigits = shuffle(digits);

    var mapping = {};
    for(var i = 0; i < 26; i++){
        mapping[lower[i]] = sLower[i];
        mapping[upper[i]] = sUpper[i];
    }
    for(var i = 0; i < 10; i++){
        mapping[digits[i]] = sDigits[i];
    }
    return mapping;
}

function buildCustomFont(baseFont, mapping){
    var notdefGlyph = new opentype.Glyph({
        name: '.notdef',
        unicode: 0,
        advanceWidth: 650,
        path: new opentype.Path()
    });

    var spaceGlyph = baseFont.charToGlyph(' ');
    if(!spaceGlyph){
        spaceGlyph = new opentype.Glyph({
            name: 'space',
            unicode: 32,
            advanceWidth: 250,
            path: new opentype.Path()
        });
    }

    var glyphs = [notdefGlyph, spaceGlyph];
    var addedUnicodes = {0: true, 32: true};

    for(var orig in mapping){
        var origCode = orig.charCodeAt(0);
        var mappedCode = mapping[orig].charCodeAt(0);
        var origGlyph = baseFont.charToGlyph(orig);
        if(!origGlyph || !origGlyph.path) continue;

        var newGlyph = new opentype.Glyph({
            name: mapping[orig],
            unicode: mappedCode,
            advanceWidth: origGlyph.advanceWidth,
            path: origGlyph.path
        });
        if(!addedUnicodes[mappedCode]){
            glyphs.push(newGlyph);
            addedUnicodes[mappedCode] = true;
        }
    }

    var extraChars = '.,;:!?\'"()-—–…/[]{}@#$%^&*+=<>~`|\\_';
    for(var i = 0; i < extraChars.length; i++){
        var ch = extraChars[i];
        var code = ch.charCodeAt(0);
        if(addedUnicodes[code]) continue;
        var g = baseFont.charToGlyph(ch);
        if(g && g.path){
            glyphs.push(g);
            addedUnicodes[code] = true;
        }
    }

    return new opentype.Font({
        familyName: 'AntiscrapeFont',
        styleName: 'Regular',
        unitsPerEm: baseFont.unitsPerEm,
        ascender: baseFont.ascender,
        descender: baseFont.descender,
        glyphs: glyphs
    });
}

(function(){
    var baseFontPath = findBaseFont();
    console.log('加载基础字体...');
    var baseFont = opentype.parse(fs.readFileSync(baseFontPath));

    console.log('生成随机映射表...');
    var mapping = generateMapping();

    console.log('构建自定义字体...');
    var customFont = buildCustomFont(baseFont, mapping);

    fs.mkdirSync(outputDir, { recursive: true });
    var fontBuffer = Buffer.from(customFont.toArrayBuffer());
    var fontPath = path.join(outputDir, 'custom.ttf');
    fs.writeFileSync(fontPath, fontBuffer);
    console.log('字体已保存: ' + fontPath + ' (' + (fontBuffer.length / 1024).toFixed(1) + ' KB)');

    fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));
    console.log('映射表已保存: ' + mappingPath);

    console.log('\n映射预览 (a-z):');
    var lower = 'abcdefghijklmnopqrstuvwxyz';
    var preview = '';
    for(var i = 0; i < 26; i++){
        preview += lower[i] + '→' + mapping[lower[i]] + ' ';
        if((i + 1) % 13 === 0) preview += '\n';
    }
    console.log(preview);
})();