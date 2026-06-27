var fs = require('fs');
var path = require('path');

var srcDir = path.join(__dirname, '..', 'HTML', 'dict');
var destDir = path.join(__dirname, 'dict');

if(!fs.existsSync(srcDir)){
    console.error('源目录不存在: ' + srcDir);
    process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });

var files = fs.readdirSync(srcDir).filter(function(f){ return f.endsWith('.json'); });
var copied = 0;
files.forEach(function(f){
    var src = path.join(srcDir, f);
    var dest = path.join(destDir, f);
    if(!fs.existsSync(dest)){
        fs.copyFileSync(src, dest);
        copied++;
    }
});

console.log('复制完成：' + copied + ' 个新文件，' + (files.length - copied) + ' 个已存在跳过');
console.log('dict 目录共 ' + fs.readdirSync(destDir).length + ' 个文件');