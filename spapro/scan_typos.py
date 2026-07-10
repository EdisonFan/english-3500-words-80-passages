#!/usr/bin/env python3
"""
扫所有 data/renjiao/*/passages/*.json + data/3500/passages/*.json 的中文段落,
查找真正可疑的错字:
  1. 虚词错位:的了的 / 在了了 / 是是 / 的的 / 了了 / 得了得
  2. 了字冗余:动词+了+了出来/过去/进来/进去/起来/过来/上来/下来/出去
              → 中间"了"多余,应是动词+(出/过/进/起/上/下/去)
  3. 多余的"的":如"提的出"应该是"提出",模式(动词+的+出/过/到)
  4. 常见错字:作坐/象像/在再 等
"""
import json
import re
import os

# 模式 (pattern, 描述, 严重程度)
# 严重程度: high=几乎肯定是错字, medium=很可能错字, low=需要人工确认
PATTERNS = [
    # ===== high: 几乎肯定是错字 =====
    (r'了了[出过去进来起上下去]', '"了" 字冗余:了+了+(出/过/进/起/上/下/去)'),
    (r'([一-龥])了([一-龥])了[，,。.\s]', '连续 "了" 中间夹字: ...了X了...'),
    (r'的了的', '的/了/的 错位'),
    (r'在了了', '在/了/了 错位'),
    (r'在了的', '在/了/的 错位'),
    (r'的了了', '的/了/了 错位'),
    (r'的了是', '的/了/是 错位'),
    (r'了在了', '了/在/了 错位'),
    (r'了是了', '了/是/了 错位'),
    (r'是了是', '是/了/是 错位'),

    # ===== medium: 很可能错字 =====
    (r'的了在', '的/了/在 错位'),
    (r'了在是', '了/在/是 错位'),
    (r'的了得', '的/了/得 错位'),
    (r'在了是', '在/了/是 错位'),
    (r'的了有', '的/了/有 错位'),
    (r'的了都', '的/了/都 错位'),
    (r'的了会', '的/了/会 错位'),
    (r'了在了', '了/在/了 错位'),
    (r'了了了', '三个连续"了"'),
    (r'的的的', '三个连续"的"'),

    # ===== 错别字常见对 =====
    (r'在再做', '在/再 错用(应为"再")'),
    (r'作坐[一-龥]{0,2}', '作/坐 错用可能性'),
]

# 不应误报的正常用法(子串)
SAFE_CONTEXTS = [
    '了解', '料理', '知了', '明了', '必了', '完了', '成了', '算了',
    '为了', '除了', '等于', '属于',
]


def is_safe(text, start, end):
    """检查是否在安全词范围内"""
    for safe in SAFE_CONTEXTS:
        idx = text.find(safe)
        if idx == -1:
            continue
        # 如果匹配在安全词范围内
        if start >= idx - 2 and end <= idx + len(safe) + 2:
            return True
    return False


def scan_text(text, file_path, para_num, field):
    issues = []
    if not text:
        return issues

    for pat, desc in PATTERNS:
        for m in re.finditer(pat, text):
            if is_safe(text, m.start(), m.end()):
                continue
            start = max(0, m.start() - 15)
            end = min(len(text), m.end() + 15)
            ctx = text[start:end].replace('\n', ' ')
            issues.append({
                'file': file_path,
                'para': para_num,
                'field': field,
                'pattern': desc,
                'matched': m.group(0),
                'context': ctx,
            })
    return issues


def scan_file(file_path):
    try:
        data = json.load(open(file_path, encoding='utf-8'))
    except Exception as e:
        return [{'file': file_path, 'error': f'JSON 解析失败: {e}'}]

    issues = []
    paragraphs = data.get('paragraphs', [])
    for i, p in enumerate(paragraphs):
        para_num = p.get('num', f'#{i+1}')
        for field in ('cn',):
            text = p.get(field, '')
            issues.extend(scan_text(text, file_path, para_num, field))
    return issues


def main():
    roots = ['data/3500', 'data/renjiao']
    files = []
    for root in roots:
        if not os.path.isdir(root):
            continue
        for dirpath, _, fnames in os.walk(root):
            for fn in fnames:
                if fn.endswith('.json') and fn != 'books.json' and fn != 'book.json' and not fn.endswith('index.json'):
                    files.append(os.path.join(dirpath, fn))

    print(f'扫描 {len(files)} 个文件...\n')
    all_issues = []
    for f in sorted(files):
        all_issues.extend(scan_file(f))

    by_file = {}
    for iss in all_issues:
        if 'error' in iss:
            print(f'[ERROR] {iss["file"]}: {iss["error"]}')
            continue
        by_file.setdefault(iss['file'], []).append(iss)

    if not by_file:
        print('未发现可疑错字 ✓')
        return

    print(f'共发现 {sum(len(v) for v in by_file.values())} 处可疑:\n')
    for f, items in sorted(by_file.items()):
        print(f'=== {f} ===')
        for it in items:
            print(f'  段 {it["para"]} [{it["field"]}] {it["pattern"]}')
            print(f'    命中: {it["matched"]!r}')
            print(f'    上下文: ...{it["context"]}...')
        print()

    with open('typo_report.txt', 'w', encoding='utf-8') as f:
        f.write(f'共 {len(all_issues)} 处可疑错字:\n\n')
        for fpath, items in by_file.items():
            f.write(f'=== {fpath} ===\n')
            for it in items:
                f.write(f'  段 {it["para"]} [{it["field"]}] {it["pattern"]}\n')
                f.write(f'    命中: {it["matched"]}\n')
                f.write(f'    上下文: ...{it["context"]}...\n')
            f.write('\n')
    print('详细报告: typo_report.txt')


if __name__ == '__main__':
    main()
