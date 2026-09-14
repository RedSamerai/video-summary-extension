// background.js — Service Worker (ES Module)
// 使用 Transformers.js + Whisper 进行语音识别

import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0/dist/transformers.js';

// 配置 - 禁用本地模型，强制从 CDN 加载
env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;

let keepAliveInterval = setInterval(function() {}, 25000);
let offscreenPort = null;
let currentTabId = null;
let transcriber = null;
let lastTextHash = '';  // 用文本哈希去重
let isTranscribing = false;  // 标记是否正在转录

chrome.runtime.onInstalled.addListener(function() {
  chrome.storage.sync.set({ lockedPosition: false });
  console.log('[Background] Service Worker 已安装');
});

// 保持 SW 活跃的心跳
function sendKeepAlive() {
  chrome.runtime.sendMessage({ type: 'KEEP_ALIVE' }, function() {});
}

// 预加载 transcriber
function preloadTranscriber() {
  if (transcriber) return Promise.resolve(transcriber);
  
  console.log('[Background] 预加载 Transcriber...');
  return pipeline('automatic-speech-recognition', 'Xenova/whisper-base', {
    dtype: 'fp32',
    device: 'wasm'
  }).then(function(pipeline) {
    transcriber = pipeline;
    console.log('[Background] Transcriber 预加载完成');
    return transcriber;
  }).catch(function(e) {
    console.error('[Background] Transcriber 预加载失败:', e);
    throw e;
  });
}

// 监听来自 offscreen 的连接
chrome.runtime.onConnect.addListener(function(port) {
  console.log('[Background] 新连接:', port.name);
  
  if (port.name === 'offscreen') {
    console.log('[Background] offscreen 已连接');
    offscreenPort = port;
    
    port.onMessage.addListener(async function(msg) {
      console.log('[Background] 收到 offscreen 消息:', msg.type);
      
      if (msg.type === 'AUDIO_DATA') {
        try {
          // 如果 transcriber 未加载，先预加载（异步）
          if (!transcriber) {
            console.log('[Background] Transcriber 未加载，等待预加载...');
            // 发送心跳保持 SW 活跃
            sendKeepAlive();
            
            // 等待 transcriber 加载
            await preloadTranscriber();
          }
          
          // 标记正在转录，发送心跳
          isTranscribing = true;
          sendKeepAlive();
          
          let audioData = msg.audioData;
          const receivedSampleRate = msg.sampleRate || 16000;
          const receivedLength = msg.length || 0;
          
          console.log('[Background] 收到消息: type=' + msg.type);
          console.log('[Background] audioData type=' + typeof audioData + ', length=' + receivedLength);
          
          if (typeof audioData === 'string') {
            const binary = atob(audioData);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            audioData = new Float32Array(bytes.buffer);
            console.log('[Background] 解码后长度: ' + audioData.length);
          }
          
          let maxAmplitude = 0;
          for (let i = 0; i < audioData.length; i++) {
            const abs = Math.abs(audioData[i]);
            if (abs > maxAmplitude) maxAmplitude = abs;
          }
          
          console.log('[Background] 音频幅度:', maxAmplitude.toFixed(4));
          
          if (maxAmplitude < 0.0001) {
            console.log('[Background] 音频幅度过低，跳过识别');
            isTranscribing = false;
            return;
          }
          
          if (receivedSampleRate !== 16000) {
            console.log('[Background] 重采样: ' + receivedSampleRate + ' -> 16000');
            audioData = resampleAudio(audioData, receivedSampleRate, 16000);
          }
          
          if (!transcriber) {
            console.error('[Background] Transcriber 未加载，跳过');
            isTranscribing = false;
            return;
          }
          
          const startTime = performance.now();
          console.log('[Background] 开始转录...');
          
          chrome.storage.sync.get(['sourceLang', 'targetLang'], function(items) {
            var sourceLang = items.sourceLang || 'auto';
            var targetLang = items.targetLang || 'zh';
            
            console.log('[Background] 使用语言: source=' + sourceLang + ', target=' + targetLang);
            
            transcriber(audioData, {
              language: sourceLang === 'auto' ? null : sourceLang,
              task: null,
              return_timestamps: 'long',
              chunk_length_s: 30,
            }).then(async function(result) {
              const duration = ((performance.now() - startTime) / 1000).toFixed(2);
              console.log('[Background] 转录完成，耗时:' + duration + 's');
              console.log('[Background] 识别结果:', JSON.stringify(result).substring(0, 500));
              
              const transcriptText = result.text || (result.chunks ? result.chunks.map(c => c.text).join(' ') : '');
              const textHash = simpleHash(transcriptText);
              
              if (textHash !== lastTextHash) {
                lastTextHash = textHash;
                console.log('[Background] 新内容，开始翻译');
                await processResult(transcriptText.trim(), targetLang);
              } else {
                console.log('[Background] 重复内容，跳过');
              }
              
              isTranscribing = false;
            }).catch(function(e) {
              console.error('[Background] 转录失败:', e);
              isTranscribing = false;
            });
          });
          
        } catch (e) {
          console.error('[Background] 处理音频失败:', e);
          isTranscribing = false;
          if (offscreenPort) {
            offscreenPort.postMessage({ type: 'RECOGNITION_ERROR', error: e.message });
          }
        }
      }
    });
    
    port.onDisconnect.addListener(function() {
      console.log('[Background] offscreen 断开连接');
      offscreenPort = null;
    });
  }
});

// 监听连接请求（保持 SW 活跃）
chrome.runtime.onConnect.addListener(function(port) {
  if (port.name === 'keepalive') {
    port.onMessage.addListener(function(msg) {
      if (msg.type === 'KEEP_ALIVE') {
        console.log('[Background] 收到心跳');
      }
    });
  }
});

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  console.log('[Background] 收到消息:', message.type, sender);

  if (message.type === 'KEEP_ALIVE') {
    sendResponse({ ok: true });
    return false;
  }

  // 摘要翻译（sidepanel → background → content）
  if (message.type === 'SUMMARY_TRANSLATE') {
    console.log('[Background] 收到摘要翻译请求, tabId:', message.tabId);
    translateText(message.text, message.targetLang || 'zh').then(function(translated) {
      var failed = translated === message.text;
      console.log('[Background] 摘要翻译完成, failed:', failed);
      chrome.tabs.sendMessage(message.tabId, {
        type: 'TRANSLATE_RESULT',
        text: message.text,
        translated: translated,
        translationFailed: failed
      }).catch(function(err) {
        console.error('[Background] 发送 TRANSLATE_RESULT 失败:', err);
      });
    }).catch(function(e) {
      console.error('[Background] 摘要翻译失败:', e);
    });
    return true;
  }

  if (message.type === 'GET_ACTIVE_TAB') {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs && tabs[0]) {
        sendResponse({ ok: true, tabId: tabs[0].id });
      } else {
        sendResponse({ ok: false, error: '无法获取标签页' });
      }
    });
    return true;
  }

  // 打开侧边栏
  if (message.type === 'OPEN_SIDE_PANEL') {
    chrome.sidePanel.open({ windowId: message.windowId || chrome.windows.WINDOW_ID_CURRENT });
    sendResponse({ ok: true });
    return false;
  }

  // 文本翻译（供 content script 使用）
  if (message.type === 'TRANSLATE_TEXT') {
    console.log('[Background] 收到翻译请求, text:', message.text ? message.text.substring(0, 50) : 'null');
    translateText(message.text, message.targetLang || 'zh').then(function(translated) {
      var failed = translated === message.text;
      console.log('[Background] 翻译完成, failed:', failed);

      // 发送到 content script（通过 sender.tab 获取 tabId）
      if (sender && sender.tab && sender.tab.id) {
        chrome.tabs.sendMessage(sender.tab.id, {
          type: 'TRANSLATE_RESULT',
          text: message.text,
          translated: translated,
          translationFailed: failed
        }).catch(function(err) {
          console.error('[Background] 发送 TRANSLATE_RESULT 失败:', err);
        });
      }

      // 发送响应给调用者（sidepanel 或其他扩展页面）
      sendResponse({ translated: translated, failed: failed });
    }).catch(function(e) {
      console.error('[Background] 翻译失败:', e);
      sendResponse({ translated: message.text, failed: true });
    });
    return true;
  }

  // 开始录制
  if (message.type === 'START_RECORDING') {
    console.log('[Background] 开始录制, tabId:', message.tabId);
    currentTabId = message.tabId;

    ensureOffscreen(function(err) {
      if (err) {
        console.error('[Background] 准备 offscreen 失败:', err);
        sendResponse({ ok: false, error: err });
        return;
      }
      if (offscreenPort) {
        console.log('[Background] 发送 START_RECORDING 到 offscreen');
        offscreenPort.postMessage({
          type: 'START_RECORDING',
          tabId: currentTabId
        });
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: 'offscreen 未就绪' });
      }
    });
    return true;
  }

  // 停止录制
  if (message.type === 'STOP_RECORDING') {
    console.log('[Background] 停止录制');
    currentTabId = null;
    if (offscreenPort) {
      offscreenPort.postMessage({ type: 'STOP_RECORDING' });
    }
    sendResponse({ ok: true });
    return false;
  }
});

function ensureOffscreen(callback) {
  console.log('[Background] 确保 offscreen document...');
  
  if (offscreenPort) {
    callback(null);
    return;
  }
  
  chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] }, function(contexts) {
    if (contexts && contexts.length > 0) {
      console.log('[Background] offscreen document 已存在，等待连接...');
      var waitCount = 0;
      var checkInterval = setInterval(function() {
        waitCount++;
        if (offscreenPort) {
          clearInterval(checkInterval);
          callback(null);
        } else if (waitCount > 10) {
          clearInterval(checkInterval);
          callback('offscreen 连接超时');
        }
      }, 1000);
      return;
    }
    
    console.log('[Background] 创建 offscreen document...');
    chrome.offscreen.createDocument({
      url: chrome.runtime.getURL('offscreen.html'),
      reasons: [chrome.offscreen.Reason.USER_MEDIA],
      justification: '捕获标签页音频进行语音识别'
    }, function() {
      if (chrome.runtime.lastError) {
        console.error('[Background] 创建 offscreen 失败:', chrome.runtime.lastError.message);
        callback(chrome.runtime.lastError.message);
        return;
      }
      
      var waitCount = 0;
      var checkInterval = setInterval(function() {
        waitCount++;
        if (offscreenPort) {
          clearInterval(checkInterval);
          callback(null);
        } else if (waitCount > 10) {
          clearInterval(checkInterval);
          callback('offscreen 连接超时');
        }
      }, 1000);
    });
  });
}

// 使用 Google Translate API
async function translateText(text, targetLang) {
  if (!text) return '';
  targetLang = targetLang || 'zh';
  
  // 如果目标是中文，先检查是否已经是中文
  if (targetLang === 'zh' && /[\u4e00-\u9fa5]/.test(text)) {
    return text;
  }
  // 如果目标是英文，先检查是否已经是英文
  if (targetLang === 'en' && /^[a-zA-Z\s.,!\'?"\s]+$/.test(text)) {
    return text;
  }
  
  try {
    var enc = encodeURIComponent(text);
    var url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' + targetLang + '&dt=t&q=' + enc;
    var resp = await fetch(url);
    var data = await resp.json();
    return data[0].map(function(s) { return s[0]; }).join('');
  } catch (e) {
    console.warn('[Background] 翻译失败（可能需要代理）:', e.message);
    return '';
  }
}

// 简单的音频重采样
function resampleAudio(audioData, fromSampleRate, toSampleRate) {
  if (fromSampleRate === toSampleRate) return audioData;
  const ratio = fromSampleRate / toSampleRate;
  const newLength = Math.floor(audioData.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcIdx = Math.floor(i * ratio);
    result[i] = audioData[srcIdx];
  }
  return result;
}

// 简单哈希函数（用于去重）
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString();
}

// 处理识别结果
async function processResult(text, targetLang) {
  if (!text) return;
  targetLang = targetLang || 'zh';
  
  // 翻译
  const translated = await translateText(text, targetLang);
  const translationFailed = !translated;
  
  console.log('[Background] 原文:', text);
  console.log('[Background] 翻译:', translationFailed ? '(翻译失败)' : translated);
  
  // 发送结果
  chrome.runtime.sendMessage({
    type: 'TRANSLATE_RESULT',
    text: text,
    translated: translationFailed ? text : translated,
    targetLang: targetLang,
    translationFailed: translationFailed
  });
  
  if (currentTabId && offscreenPort) {
    chrome.tabs.sendMessage(currentTabId, {
      type: 'TRANSLATE_RESULT',
      text: text,
      translated: translationFailed ? text : translated,
      targetLang: targetLang,
      translationFailed: translationFailed
    }).catch(function() {});
  }

  if (offscreenPort) {
    offscreenPort.postMessage({
      type: 'RECOGNITION_RESULT',
      text: text,
      translated: translationFailed ? text : translated,
      translationFailed: translationFailed
    });
  }
}
