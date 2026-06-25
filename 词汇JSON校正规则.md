# spapro 词汇 JSON 校正规则

本文档用于校正 `spapro/data/p01.json` 至 `p80.json` 中的词汇数据。目标是保证词条准确、结构一致，并让正文 `{...}` 中的表层形式能够稳定命中 `vocab[].word` 或 `vocab[].forms[].surface`。

## 1. 核心原则

### 1.1 准确性优先

不要为了减少 unmatched 或追求自动化而乱改。能确定的直接修，拿不准的列出来让人工确认。

### 1.2 词条使用原型

一般情况下：

- `word` 使用词典原型。
- `lemma` 与 `word` 保持一致。
- 正文中出现的变形放入 `forms`。

例如：

```json
{
  "word": "child",
  "lemma": "child",
  "forms": [
    {
      "surface": "children",
      "tag": "plural"
    }
  ]
}
```

不要把 `word` 写成 `children`。

### 1.3 不机械还原特殊词

有些词虽然历史上是复数，但现代英语中已高度词汇化，应按学习词典习惯处理。

例如 `data`：

```json
{
  "word": "data",
  "lemma": "data",
  "ctx": "数据，资料",
  "forms": [
    {
      "surface": "datum",
      "tag": "variant"
    }
  ],
  "defs": [
    {
      "pos": "n.",
      "meaning": "数据，资料（单数 datum）"
    }
  ]
}
```

不要机械地改成 `datum`，除非教材明确要求拉丁单数原型。

## 2. vocab 结构规范

每个词条推荐结构如下：

```json
{
  "word": "base",
  "lemma": "base",
  "kind": "word",
  "type": "core",
  "ctx": "上下文简明中文释义",
  "forms": [
    {
      "surface": "surface_form",
      "tag": "plural"
    }
  ],
  "phonetic": "[...]",
  "memory": [],
  "defs": [
    {
      "pos": "n.",
      "meaning": "中文释义"
    }
  ]
}
```

字段要求：

- `word`：词条原型，尽量不用变形形式。
- `lemma`：通常与 `word` 一致。
- `kind`：只能使用 `word`、`phrase`、`proper_noun`、`abbrev`。
- `type`：只能使用 `core` 或 `outline`。
- `ctx`：正文单词下方显示的简明中文释义，不放复杂语法说明。
- `forms`：正文中可能出现的表层形式。
- `defs`：完整释义，可保留语法说明。

禁止出现旧字段：

- 顶层 `extras`
- 顶层 `words`

## 3. forms tag 规范

推荐使用以下 `tag`：

| tag | 用途 |
| --- | --- |
| `plural` | 名词复数 |
| `past` | 动词过去式 |
| `past_participle` | 过去分词 |
| `ing` | 现在分词 / 动名词 |
| `third_person` | 第三人称单数 |
| `comparative` | 比较级 |
| `superlative` | 最高级 |
| `variant` | 其他变体 |
| `abbrev` | 缩写 |
| `alias` | 别名 / 等同写法 |

如果无法准确判断，可用 `variant`，但不要误标。

## 4. 名词复数规则

### 4.1 普通名词

使用单数原型作 `word` / `lemma`，复数放入 `forms`。

```json
{
  "word": "model",
  "lemma": "model",
  "forms": [
    {
      "surface": "models",
      "tag": "plural"
    }
  ]
}
```

### 4.2 不规则复数

不规则复数必须放入 `forms`。

| 原型 | forms |
| --- | --- |
| child | children |
| foot | feet |
| tooth | teeth |
| mouse | mice |
| person | people |
| man | men |
| woman | women |
| crisis | crises |
| analysis | analyses |
| phenomenon | phenomena |
| criterion | criteria |
| basis | bases |
| medium | media / mediums |
| penny | pence / pennies |

示例：

```json
{
  "word": "analysis",
  "lemma": "analysis",
  "ctx": "分析",
  "forms": [
    {
      "surface": "analyses",
      "tag": "plural"
    }
  ],
  "defs": [
    {
      "pos": "n.",
      "meaning": "（pl.analyses）分析；分析报告，分析结果"
    }
  ]
}
```

### 4.3 只有复数常用的词

像 `trousers`、`shorts`、`glasses` 这类通常以复数形式使用的词，不要强行还原成不自然的单数词条。

推荐：

```json
{
  "word": "trousers",
  "lemma": "trousers",
  "ctx": "裤子，长裤",
  "forms": [],
  "defs": [
    {
      "pos": "n.",
      "meaning": "[pl.]裤子，长裤"
    }
  ]
}
```

类似词：

- trousers
- shorts
- glasses（眼镜）
- congratulations（祝贺）
- savings（储蓄金，存款）

### 4.4 单复同形

单复同形词保持原型，`forms` 可为空，释义中说明单复同形即可。

```json
{
  "word": "deer",
  "lemma": "deer",
  "ctx": "鹿",
  "forms": [],
  "defs": [
    {
      "pos": "n.",
      "meaning": "鹿（单复数同形）"
    }
  ]
}
```

### 4.5 `[pl.]` 不是普通复数时要谨慎

有些 `[pl.]` 表示某个复数义项，不一定要加入 `forms`。

例如：

```text
foundation 基础；基金会；创建；[pl.] 地基
```

只有当正文中实际出现 `{foundations}` 时，才需要补：

```json
{
  "surface": "foundations",
  "tag": "plural"
}
```

## 5. 动词变形规则

正文中出现的过去式、过去分词、现在分词、第三人称单数，应放入 `forms`。

示例：

```json
{
  "word": "write",
  "lemma": "write",
  "forms": [
    {
      "surface": "wrote",
      "tag": "past"
    },
    {
      "surface": "written",
      "tag": "past_participle"
    },
    {
      "surface": "writing",
      "tag": "ing"
    }
  ]
}
```

常见不规则动词：

| 原型 | forms |
| --- | --- |
| be | am / is / are / was / were / been / being |
| go | went / gone / going |
| do | did / done / doing / does |
| have | had / having / has |
| make | made / making / makes |
| take | took / taken / taking / takes |
| write | wrote / written / writing / writes |
| rise | rose / risen / rising / rises |
| become | became / becoming / becomes |
| begin | began / begun / beginning / begins |
| buy | bought / buying / buys |
| catch | caught / catching / catches |
| wake | woke / woken / waking / wakes |

如果 `surface` 与 `word` 完全相同，可以不重复加入。

## 6. 比较级与最高级

正文出现比较级或最高级时，放入 `forms`。

```json
{
  "word": "brave",
  "forms": [
    {
      "surface": "braver",
      "tag": "comparative"
    },
    {
      "surface": "bravest",
      "tag": "superlative"
    }
  ]
}
```

```json
{
  "word": "cheap",
  "forms": [
    {
      "surface": "cheaper",
      "tag": "comparative"
    }
  ]
}
```

## 7. 缩写、别名、英美拼写

### 7.1 缩写

如果词条是完整形式，缩写放入 `forms`。

```json
{
  "word": "dormitory",
  "forms": [
    {
      "surface": "dorm",
      "tag": "abbrev"
    }
  ]
}
```

```json
{
  "word": "examination",
  "forms": [
    {
      "surface": "exam",
      "tag": "abbrev"
    }
  ]
}
```

如果学习目标就是缩写本身，例如 `AI`、`IQ`、`PE`，可以保留缩写作为 `word`，并在 `defs.meaning` 中说明完整形式。

### 7.2 等号说明

释义中出现 `（=lab）`、`（=telephone）`、`（=railway）`、`（=afterwards）` 等，应判断是否加入 `forms`。

示例：

```json
{
  "word": "laboratory",
  "forms": [
    {
      "surface": "lab",
      "tag": "abbrev"
    }
  ]
}
```

### 7.3 英美拼写

英美拼写差异放入 `forms`，tag 用 `variant`。

```json
{
  "word": "gray",
  "forms": [
    {
      "surface": "grey",
      "tag": "variant"
    }
  ]
}
```

## 8. ctx 规则

### 8.1 ctx 只放简明中文释义

推荐：

```json
"ctx": "便士"
```

不推荐：

```json
"ctx": "（复数形式pence或p"
```

### 8.2 ctx 不放复杂语法说明

不推荐：

```json
"ctx": "（pl.phenomena）现象"
```

推荐：

```json
"ctx": "现象"
```

完整说明保留在 `defs.meaning`（仅当 `forms` 尚未补全时）：

```json
"meaning": "（pl.phenomena）现象"
```

如果 `forms` 已补全 `phenomena`，则 `meaning` 中也应去掉变形说明：

```json
"meaning": "现象"
```

### 8.3 修复明显截断的 ctx

如果发现以下情况，必须人工修正：

```json
"ctx": "（"
```

```json
"ctx": "（复数形式pence或p"
```

示例修正：

```json
"ctx": "千米，公里"
```

```json
"ctx": "便士"
```

## 9. defs 规则

### 9.1 defs.meaning 不再重复变形说明

如果变形信息已经在 `forms` 中完整列出，`defs.meaning` 中不再重复写变形形式。

不推荐：

```json
"meaning": "（built, built, building）建造；创建；逐渐增强"
```

推荐：

```json
"meaning": "建造；创建；逐渐增强"
```

如果变形形式比较特殊且 `forms` 中已包含，`meaning` 中也不需要再写。变形信息统一由 `forms` 承载，`meaning` 只放释义本身。

但对于复数等语法说明（如 `（pl.phenomena）现象`），如果 `forms` 中尚未列出，可暂时保留在 `meaning` 中，待补全 `forms` 后再移除。

### 9.2 不要把一个释义错误拆成多条

错误：

```json
"defs": [
  {
    "pos": "n.",
    "meaning": "（"
  },
  {
    "pos": "abbr.",
    "meaning": "km）千米，公里"
  }
]
```

应修为：

```json
"defs": [
  {
    "pos": "n.",
    "meaning": "（缩写 km）千米，公里"
  }
]
```

## 10. 正文 `{...}` 标注规则

### 10.1 `{...}` 应包住可查词 token

推荐：

```text
{constant} {global} {communication}
```

不推荐：

```text
{constant global communication}
```

除非 vocab 中确实存在短语词条：

```json
{
  "word": "constant global communication",
  "kind": "phrase"
}
```

### 10.2 多词短语处理

如果 `{...}` 内是多词短语，先判断。

如果短语内每个词都在 vocab 中，应拆开：

```text
{international} {symbol}
```

不要写：

```text
{international symbol}
```

如果这是固定搭配、短语动词、专有名词，可以保留为 `phrase` 或 `proper_noun`。

```json
{
  "word": "pocket money",
  "kind": "phrase",
  "ctx": "零花钱"
}
```

```json
{
  "word": "Rocky Mountains",
  "kind": "proper_noun",
  "ctx": "落基山脉"
}
```

### 10.3 标点不要放进花括号

错误：

```text
{marriage,}
{merrier.}
```

正确：

```text
{marriage},
{merrier}.
```

### 10.4 大小写

正文句首大写可以通过前端 normalize 处理，但数据层最好保持清楚。

例如 vocab 是 `today`，正文是 `{Today}`，可选择加入：

```json
{
  "surface": "Today",
  "tag": "variant"
}
```

如果前端已支持大小写归一化，也可以不加。

## 11. 专项处理示例

### 11.1 penny

```json
{
  "word": "penny",
  "lemma": "penny",
  "ctx": "便士",
  "forms": [
    {
      "surface": "pence",
      "tag": "plural"
    },
    {
      "surface": "pennies",
      "tag": "plural"
    }
  ],
  "defs": [
    {
      "pos": "n.",
      "meaning": "（复数形式pence或pennies）便士"
    }
  ]
}
```

### 11.2 medium / media

如果词条是 `media` 且释义为 `medium 的复数形式`，应改为：

```json
{
  "word": "medium",
  "lemma": "medium",
  "forms": [
    {
      "surface": "media",
      "tag": "plural"
    }
  ]
}
```

如果该词条同时讲「媒介 / 方法」，也可加入：

```json
{
  "surface": "mediums",
  "tag": "plural"
}
```

注意：

- `media` 更常用于「大众传媒、媒介」。
- `mediums` 更常用于「灵媒」或普通可数复数，是否加入要看释义语境。

### 11.3 data

现代英语学习词典通常直接收录 `data`，不要机械改为 `datum`。

推荐：

```json
{
  "word": "data",
  "lemma": "data",
  "ctx": "数据，资料",
  "forms": [
    {
      "surface": "datum",
      "tag": "variant"
    }
  ],
  "defs": [
    {
      "pos": "n.",
      "meaning": "数据，资料（单数 datum）"
    }
  ]
}
```

## 12. 不要盲目修的情况

### 12.1 `[pl.]` 只是复数义项

例如：

```text
humanity [pl.] 人文学科
```

不要简单把 `humanities` 加入 `forms`，除非正文实际出现。

### 12.2 词性不同导致词条不同

例如：

```text
short adj. 短的
shorts n. 短裤
```

`shorts` 不应作为 `short` 的普通复数形式，而应作为独立词条。

### 12.3 固定复数名词

如 `trousers`、`shorts`、`glasses`、`savings`，通常作为独立词条，不要还原成 `trouser`、`short`、`glass`、`saving`，除非语境确实是普通名词复数。

## 13. 校验规则

### 13.1 JSON 可解析

每次修改后运行：

```bash
node -e "const fs=require('fs'); JSON.parse(fs.readFileSync('data/pXX.json','utf8')); console.log('ok')"
```

### 13.2 字段结构校验

每个 vocab 条目检查：

- 不应有顶层 `extras`。
- 不应有顶层 `words`。
- `kind` 必须是 `word`、`phrase`、`proper_noun`、`abbrev`。
- `type` 必须是 `core` 或 `outline`。
- `forms` 必须是数组。

### 13.3 正文标注命中校验

正文 `{...}` 的命中逻辑：

1. 先匹配 `vocab[].word`。
2. 再匹配 `vocab[].forms[].surface`。

如果仍未命中，判断：

1. 是否应拆分 `{...}`；
2. 是否应补 `forms`；
3. 是否应新增 `phrase` / `proper_noun` 词条；
4. 是否应移除不合理花括号。

## 14. 推荐处理流程

1. 逐篇处理，不要盲目全量自动替换。
2. 每批处理 5 至 10 个确定性高的问题。
3. 对不确定项停下来询问。
4. 修改后立即校验 JSON。
5. 修改正文 `{...}` 时，同时检查 vocab 是否能命中。
6. 不要为了减少 unmatched 而乱加词条，准确性优先。

## 15. 当前项目已确认的处理方向

已确认方向如下：

| 条目 | 处理 |
| --- | --- |
| `penny` | `word = penny`，`forms = pence / pennies`，`ctx = 便士` |
| `medium / media` | 原型用 `medium`，`forms` 放 `media`，必要时补 `mediums` |
| `data` | 保留 `word = data`，`datum` 作为说明或 `variant` |
| `phenomenon` | `forms = phenomena` |
| `criterion` | `forms = criteria` |
| `analysis` | `forms = analyses` |
| `mouse` | `forms = mice` |
| `crisis` | `forms = crises` |
| `basis` | `forms = bases` |
| `child` | `forms = children` |
| `foot` | `forms = feet` |

## 16. 给执行者的最终原则

不要只看形式，要结合正文、释义和词典习惯判断。能确定的直接修，拿不准的列出来问，不要为了自动化牺牲准确性。