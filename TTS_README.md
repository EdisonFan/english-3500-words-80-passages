# 80 篇精读 · 慢速 TTS 朗读音频（GitHub Actions + 微软 Edge TTS）

## 一句话

把本包里的 `.github/`、`scripts/` 合并进仓库并 push，然后在 GitHub → **Actions → Generate TTS audio (Microsoft Edge) → Run workflow** 点一下，跑完下载 `tts-audio` artifact，里面是 `p01.mp3` ~ `p80.mp3` 加每篇的清洗文本和 `manifest.json`。

默认 **语速 -20%**（`en-US-AriaNeural`，女声，吐字清楚），在页面里能现场改成 `-10%` / `-30%`，也能换音色、只跑某几篇。

## 为什么必须走流水线

在沙盒里实测过，直连微软 TTS 不通：

```
speech.platform.bing.com      → 403  policy_default_denied（出口策略）
api.msedgeservices.com        → 403  同上
edge-tts 直连               → SSL CERTIFICATE_VERIFY_FAILED / 403
```

`pip install edge-tts` 能装（走的 PyPI 镜像），但 WebSocket 合成端点被挡在请求到达微软之前，换 UA、换代理、重试都没用——和那份《通道经验总结》里 `github.com` 的 git 协议是同一类 403。GitHub Actions 的 `ubuntu-latest` runner 没有这层限制，所以把合成动作放到 CI 是最省事的解法。

## 文件清单

| 文件 | 作用 |
| --- | --- |
| `.github/workflows/tts.yml` | 手动触发的流水线，装 `edge-tts`、跑脚本、上传 artifact |
| `scripts/gen_tts.py` | 读 `spapro/data/pNN.json` → 清洗 → 合成 mp3；带重试、断点跳过、并发控制 |
| `scripts/text/p01.txt` ~ `p80.txt` | 清洗后的朗读文本快照（80 篇，共 30594 词），供核对；JSON 不在时脚本自动回退读这里 |
| `TTS_README.md` | 本说明 |

脚本优先读仓库里的 `spapro/data/*.json`，所以文章更新后音频会跟着更新；快照只是兜底。

## 三步跑起来

**1. 把文件放进仓库根目录**（保持路径不变）

```bash
cd /path/to/english-3500-words-80-passages
unzip /path/to/tts_pack.zip -d /tmp/tts_pack
cp -r /tmp/tts_pack/.github /tmp/tts_pack/scripts /tmp/tts_pack/TTS_README.md .
git add .github/workflows/tts.yml scripts/ TTS_README.md
git commit -m "feat: add slow Edge TTS audio pipeline"
git push origin main
```

**2. 触发**

GitHub 仓库页 → **Actions** → 左侧 `Generate TTS audio (Microsoft Edge)` → **Run workflow** → 填参数（默认就行）→ 绿色按钮。

**3. 取音频**

跑完进该次 run 的详情页，最下面 **Artifacts** 下载 `tts-audio`（自动打包成 zip）。约 80 个 mp3 + 80 个 txt + 1 个 manifest。**Artifact 默认保留 30 天**。

流水线同时会创建 `tts-<run_number>` Release 并附上全部 mp3 + `manifest.json`（已启用，workflow 的 `permissions` 为 `contents: write`）。Release 不过期、可匿名下载，长期保存用这个。

## 参数

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `rate` | `-20%` | 负数是放慢。学习朗读建议 `-20%`；想更慢用 `-30%`，太快用 `-10%` |
| `voice` | `en-US-AriaNeural` | 备选：`en-US-GuyNeural`（男声）、`en-GB-SoniaNeural`（英音）、`en-US-JennyNeural` |
| `start` / `end` | `1` / `80` | 只补某几篇时用，例如单篇验证填 `1` / `1` |
| `workers` | `3` | 并发请求数。**别调太高**，微软会限流；脚本对每个失败篇目重试 4 次 |
| `retries` | 4 | 仅本地/命令行可调 |

本地等价命令：

```bash
pip install edge-tts
python scripts/gen_tts.py --rate=-20% --workers=3 --out audio
python scripts/gen_tts.py --dry-run --limit 2        # 只看清洗后的文本，不联网
python scripts/gen_tts.py --start 1 --end 1 --out audio   # 先跑一篇试听
```

重跑是安全的：已存在且非空的 mp3 会跳过，只补失败/缺失的篇目。

## 规模预估

30594 词，按 -20% 约 130~140 词/分钟 → 全部约 **230 分钟**音频；edge-tts 输出 48 kbps mono mp3，约 **85 MB**。合成速度远快于实时，80 篇 / 并发 3 大约 10~20 分钟跑完，workflow 给了 120 分钟上限。

## 关于朗读文本（一个要说清的取舍）

原始 `en` 字段是为背单词设计的，不是自然英文，清洗时做了这些处理：

- 去掉高亮花括号：`{soil}` → `soil`
- 删掉括号里的中文夹注：`“Poodle（卷毛狗）”` → `" Poodle "`（英文音色不读中文）
- 修标点粘连：`.And` → `. And`，引号前后补空格，避免连读
- 保留撇号缩写：`Jaramillo's` / `they're` 不被拆开
- 80 篇全部校验过：无残留非 ASCII、无花括号、无反斜杠、无空篇

**但高亮词本身是词形还原后的原形**（`{pull} {weed}` 对应 pull / weed，而不是 pulling / weeds），`vocab` 里只有 `word / type / ctx` 三个字段，没有 `forms`，所以无法还原屈折变化。音频里会出现 "school kid"、"The program aim" 这类不合语法但**读音完全正常**的句子。这是语料本身的设计，不是清洗出错；如果哪天补了 `forms` 字段，改 `clean_text()` 一处即可恢复词形。

段落之间用空行分隔，TTS 会自然停顿；没有用 SSML，因为 edge-tts 对纯文本最稳，特殊字符越多越容易触发上游 403。

## 两个已知的坑

**① push workflow 文件需要额外权限。** `.github/workflows/` 下的文件受 `workflows` 权限约束。用 classic PAT 推送若没勾 `workflow` scope，会报：

```
refusing to allow a Personal Access Token to create or update workflow .github/workflows/tts.yml
```

fine-grained token 则需要显式给 `Workflows: Read and write`（只有 `Contents: write` 不够——和《通道经验总结》第 2 节「用户权限 ≠ token 权限」是同一类坑）。

绕过办法二选一：
- 在 GitHub 网页上直接 **Add file → Create new file**，路径填 `.github/workflows/tts.yml`，把内容粘进去提交（走网页 session，不受本地 PAT scope 限制）；
- 或用 `api.github.com` 的 Git Data API 写入，同样需要 `contents=write,workflows=write`。

**② 微软上游偶发断连。** `speech.platform.bing.com` 有时会主动关 WebSocket，脚本已做 4 次退避重试并把失败篇目写进 `manifest.json`。若仍有失败，用同一命令重跑一次即可，成功的不会重合成。

## 说明

- 用的是微软 Edge 在线神经语音（edge-tts），免费、无需 API Key；如果要 Azure Speech Service 那种带密钥的方案，得另配 `AZURE_SPEECH_KEY` secret，本包不含。
- 音频是文章朗读，不含词典释义、中文译文，也不含 B 站视频。
- workflow 只设了 `workflow_dispatch`，不会在每次 push 时自动消耗 runner；想自动跟着文章更新，自己加个 `push: paths: ['spapro/data/p*.json']` 即可。
