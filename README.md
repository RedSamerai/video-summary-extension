# 浏览器小工具 BWidgets

Chrome / Edge 扩展，提供**视频实时翻译**和**网页内容摘要**功能。

- 🎬 **视频实时翻译** — Whisper 本地语音识别 + 翻译，气泡悬浮显示
- 📝 **网页摘要** — Chrome/Edge 内置 AI，零配置一键生成要点
- 🔒 **隐私安全** — 所有处理本地完成，数据不上传
- 🌐 **无需翻墙** — 摘要功能完全离线；翻译在代理可用时自动使用 Google，无代理时提示浏览器内置翻译

## 浏览器要求

- Chrome 138+ 或 Edge 148+
- 需启用 Chrome AI API（部分版本需在 `chrome://flags` 中开启）

## 安装

### 方式一：Chrome Web Store（推荐）
[即将上线]

### 方式二：开发者模式手动加载
1. 下载本仓库 ZIP 并解压
2. 下载 Whisper 模型（见下方「模型下载」）
3. 打开 `chrome://extensions/`，开启「开发者模式」
4. 点击「加载已解压的扩展程序」，选择项目目录
5. 点击工具栏扩展图标 → 在侧边栏打开

## 使用方法

### 视频翻译
1. 打开任意视频页面（YouTube、B站等）
2. 点击页面右上角的 **"+"** 浮动按钮
3. 选择 **「视频翻译」**
4. 允许屏幕共享 / 音频捕获
5. 气泡实时显示原文与译文，可右键使用浏览器内置翻译

### 网页摘要
1. 打开任意网页
2. 点击扩展图标 → 在侧边栏打开
3. 切换到 **「网页摘要」** 标签
4. 点击 **「获取当前页摘要」**
5. 等待片刻，AI 自动生成本文要点

## 模型下载

扩展依赖 Whisper 语音识别模型（约 278MB），首次使用自动从 HuggingFace 下载。

也可手动下载到 `models/whisper-base/` 目录：

```bash
# 使用代理下载（推荐国内用户）
curl -L --proxy http://127.0.0.1:7897 \
  "https://huggingface.co/Xenova/whisper-base/resolve/main/onnx/encoder_model.onnx" \
  -o models/whisper-base/encoder_model.onnx

curl -L --proxy http://127.0.0.1:7897 \
  "https://huggingface.co/Xenova/whisper-base/resolve/main/onnx/decoder_model_merged.onnx" \
  -o models/whisper-base/decoder_model_merged.onnx

# tokenizer 文件（较小，可直接下载）
curl -L --proxy http://127.0.0.1:7897 \
  "https://huggingface.co/Xenova/whisper-base/resolve/main/tokenizer.json" \
  -o models/whisper-base/tokenizer.json

curl -L --proxy http://127.0.0.1:7897 \
  "https://huggingface.co/Xenova/whisper-base/resolve/main/vocab.json" \
  -o models/whisper-base/vocab.json

curl -L --proxy http://127.0.0.1:7897 \
  "https://huggingface.co/Xenova/whisper-base/resolve/main/merges.txt" \
  -o models/whisper-base/merges.txt

curl -L --proxy http://127.0.0.1:7897 \
  "https://huggingface.co/Xenova/whisper-base/resolve/main/config.json" \
  -o models/whisper-base/config.json
```

确保目录结构为：
```
models/
└── whisper-base/
    ├── config.json
    ├── encoder_model.onnx   (79MB)
    ├── decoder_model_merged.onnx  (199MB)
    ├── tokenizer.json
    ├── vocab.json
    └── merges.txt
```

## 技术栈

- **Manifest V3**
- **HuggingFace Transformers.js** — Whisper 本地语音识别
- **Chrome/Edge 内置 AI API** — Summarizer / Translator
- **Mozilla Readability.js** — 网页正文提取
- **Vanilla JS** — 无构建工具，纯原生开发

## 项目结构

```
video-summary-extension/
├── manifest.json          # 扩展配置
├── background.js          # Service Worker（翻译路由）
├── content.js             # 内容脚本（浮动按钮 + 气泡 UI）
├── sidepanel.js           # 侧边栏逻辑
├── sidepanel.html         # 侧边栏页面
├── sidepanel.css          # 侧边栏样式
├── popup.js / popup.html  # Popup 备用入口
├── offscreen.js / offscreen.html  # 音频捕获文档
├── transformers.js        # Transformers.js 运行时
├── readability.js         # 内容提取库
├── assets/icons/          # 扩展图标
├── models/whisper-base/   # Whisper 模型（需单独下载）
└── README.md
```

## License

MIT
