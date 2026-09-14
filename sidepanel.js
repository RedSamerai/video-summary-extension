// sidepanel.js — 侧边栏逻辑
// 支持翻译历史记录、语言选择和多语言切换

var isTranslating = false;
var currentTabId = null;
var keepAliveTimer = null;
var statusTimeout = null;
var translationHistory = [];  // 翻译历史记录

// 多语言字典
var i18n = {
  en: {
    title: '🎬 Video Translate & Summary',
    sourceLang: 'Source Language:',
    targetLang: 'Target Language:',
    startTranslate: 'Start Translation',
    hint: 'Click to capture audio from current tab for speech recognition',
    noHistory: 'No translation history',
    clear: 'Clear',
    stop: 'Stop',
    restart: 'Restart',
    initStatus: '🎧 Initializing...',
    waitingStatus: '🎧 Waiting for screen share...',
    errorTimeout: '❌ Timeout, please retry',
    errorTab: '❌ Cannot get tab',
    statusRecording: '🎧 Recognizing...',
    original: 'Original',
    translated: 'Translated',
    vpnRequired: 'VPN required for translation',
    browserTranslateHint: 'Tip: Right-click in bubble → Translate to Chinese',
    summaryTitle: '📝 Web Summary',
    getSummary: 'Get Page Summary',
    summaryHint: 'Use built-in AI to generate summary (no VPN needed)',
    summaryLoading: 'Generating summary...',
    summaryError: 'Failed to generate summary'
  },
  zh: {
    title: '🎬 视频翻译与摘要',
    sourceLang: '原文语言:',
    targetLang: '翻译目标:',
    startTranslate: '开始翻译',
    hint: '点击按钮捕获当前标签页音频进行语音识别翻译',
    noHistory: '暂无翻译记录',
    clear: '清屏',
    stop: '停止',
    restart: '重新翻译',
    initStatus: '🎧 正在初始化...',
    waitingStatus: '🎧 请允许屏幕共享...',
    errorTimeout: '❌ 超时，请重试',
    errorTab: '❌ 无法获取标签页',
    statusRecording: '🎧 正在识别...',
    original: '原文',
    translated: '译文',
    vpnRequired: '需要代理模式才能翻译',
    browserTranslateHint: '提示: 在气泡中右键 → 翻译成中文',
    summaryTitle: '📝 网页摘要',
    getSummary: '获取当前页摘要',
    summaryHint: '使用浏览器内置 AI 生成摘要（无需代理）',
    summaryLoading: '正在生成摘要...',
    summaryError: '生成摘要失败'
  }
};

// 当前语言
var currentLang = 'en';

document.addEventListener('DOMContentLoaded', function() {
  console.log('[SidePanel] ========== DOMContentLoaded ==========');

  // Tab 切换
  document.getElementById('tabTranslate').addEventListener('click', function() {
    switchTab('translate');
  });
  document.getElementById('tabSummary').addEventListener('click', function() {
    switchTab('summary');
  });

  // 加载保存的语言设置
  loadLanguageSettings();
  
  // 应用界面语言
  applyLanguage(currentLang);

  // 获取当前标签页信息
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    console.log('[SidePanel] tabs.query:', tabs);
    if (tabs && tabs[0]) {
      currentTabId = tabs[0].id;
      var tab = tabs[0];
      document.getElementById('tab-info').innerHTML =
        '<div class="tab-title">' + (tab.title || '当前标签页') + '</div>' +
        '<div class="tab-url">' + (tab.url || '').substring(0, 60) + '...</div>';
      document.getElementById('tab-info-summary').innerHTML =
        '<div class="tab-title">' + (tab.title || '当前标签页') + '</div>' +
        '<div class="tab-url">' + (tab.url || '').substring(0, 60) + '...</div>';
      console.log('[SidePanel] currentTabId:', currentTabId);
    }
  });

  document.getElementById('translateBtn').addEventListener('click', function(e) {
    e.stopPropagation();
    console.log('[SidePanel] ========== translateBtn clicked ==========');
    startTranslation();
  });

  document.getElementById('clearBtn').addEventListener('click', function(e) {
    e.stopPropagation();
    console.log('[SidePanel] 清屏按钮 clicked');
    clearHistory();
  });

  document.getElementById('stopBtn').addEventListener('click', function(e) {
    e.stopPropagation();
    console.log('[SidePanel] stopBtn clicked');
    stopTranslation();
  });

  document.getElementById('restartBtn').addEventListener('click', function(e) {
    e.stopPropagation();
    console.log('[SidePanel] restartBtn clicked');
    startTranslation();
  });

  // 语言切换按钮 - 视频翻译
  document.getElementById('langToggleBtnTranslate').addEventListener('click', function() {
    switchLanguage('en');
  });

  document.getElementById('langToggleZnTranslate').addEventListener('click', function() {
    switchLanguage('zh');
  });

  // 语言切换按钮 - 网页摘要
  document.getElementById('langToggleBtnSummary').addEventListener('click', function() {
    switchLanguage('en');
  });

  document.getElementById('langToggleZnSummary').addEventListener('click', function() {
    switchLanguage('zh');
  });

  // 语言选择器变化
  document.getElementById('sourceLangSelect').addEventListener('change', function() {
    saveLanguageSettings();
  });

  document.getElementById('targetLangSelect').addEventListener('change', function() {
    saveLanguageSettings();
  });

  console.log('[SidePanel] ========== DOM ready ==========');
});

// Tab 切换
function switchTab(tabName) {
  var translateContent = document.getElementById('translate-content');
  var summaryContent = document.getElementById('summary-content');
  var tabTranslate = document.getElementById('tabTranslate');
  var tabSummary = document.getElementById('tabSummary');
  
  if (tabName === 'translate') {
    translateContent.style.display = 'block';
    summaryContent.style.display = 'none';
    tabTranslate.classList.add('active');
    tabSummary.classList.remove('active');
  } else {
    translateContent.style.display = 'none';
    summaryContent.style.display = 'block';
    tabTranslate.classList.remove('active');
    tabSummary.classList.add('active');
  }
}

// 监听语言切换
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.type === 'CHANGE_INTERFACE_LANG') {
    console.log('[SidePanel] 收到语言切换:', message.lang);
    switchLanguage(message.lang);
  }
});

// 切换界面语言
function switchLanguage(lang) {
  currentLang = lang;

  // 更新所有语言切换按钮状态
  if (document.getElementById('langToggleBtnTranslate')) {
    document.getElementById('langToggleBtnTranslate').classList.toggle('active', currentLang === 'en');
    document.getElementById('langToggleZnTranslate').classList.toggle('active', currentLang === 'zh');
  }
  if (document.getElementById('langToggleBtnSummary')) {
    document.getElementById('langToggleBtnSummary').classList.toggle('active', currentLang === 'en');
    document.getElementById('langToggleZnSummary').classList.toggle('active', currentLang === 'zh');
  }

  // 应用翻译
  applyLanguage(currentLang);

  // 保存设置
  saveLanguageSettings();

  // 更新历史记录显示
  renderHistory();
}

// 应用界面语言
function applyLanguage(lang) {
  var t = i18n[lang] || i18n['en'];
  
  // 更新所有 data-i18n 元素
  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    var key = el.getAttribute('data-i18n');
    if (t[key]) {
      el.textContent = t[key];
    }
  });
  
  // 更新动态文本
  var statusEl = document.getElementById('status');
  if (statusEl) {
    if (!isTranslating) {
      statusEl.textContent = t.initStatus || '🎧 正在初始化...';
    } else {
      statusEl.textContent = t.statusRecording || '🎧 正在识别...';
    }
  }
}

// 加载语言设置
function loadLanguageSettings() {
  chrome.storage.sync.get(['interfaceLang', 'sourceLang', 'targetLang'], function(items) {
    if (items.interfaceLang) {
      currentLang = items.interfaceLang;
      document.getElementById('langToggleBtnTranslate').classList.toggle('active', currentLang === 'en');
      document.getElementById('langToggleZnTranslate').classList.toggle('active', currentLang === 'zh');
      document.getElementById('langToggleBtnSummary').classList.toggle('active', currentLang === 'en');
      document.getElementById('langToggleZnSummary').classList.toggle('active', currentLang === 'zh');
    }
    
    if (items.sourceLang) {
      document.getElementById('sourceLangSelect').value = items.sourceLang;
    }
    if (items.targetLang) {
      document.getElementById('targetLangSelect').value = items.targetLang;
    }
    
    applyLanguage(currentLang);
  });
}

// 保存语言设置
function saveLanguageSettings() {
  var settings = {
    interfaceLang: currentLang,
    sourceLang: document.getElementById('sourceLangSelect').value,
    targetLang: document.getElementById('targetLangSelect').value
  };
  chrome.storage.sync.set(settings);
}

function startTranslation() {
  console.log('[SidePanel] >>> startTranslation() called');
  if (isTranslating) return;
  isTranslating = true;

  if (statusTimeout) clearTimeout(statusTimeout);
  startKeepAlive();

  document.getElementById('translate-section').style.display = 'none';
  document.getElementById('result-section').style.display = 'block';
  document.getElementById('status').textContent = i18n[currentLang]?.initStatus || '🎧 正在初始化...';

  console.log('[SidePanel] >>> KEEP_ALIVE');
  chrome.runtime.sendMessage({ type: 'KEEP_ALIVE' }, function() {});

  statusTimeout = setTimeout(function() {
    console.error('[SidePanel] >>> 超时');
    document.getElementById('status').textContent = i18n[currentLang]?.errorTimeout || '❌ 超时，请重试';
    stopTranslation();
  }, 30000);

  var tabId = currentTabId;
  console.log('[SidePanel] >>> tabId:', tabId);

  if (!tabId) {
    console.error('[SidePanel] >>> tabId 为空');
    document.getElementById('status').textContent = i18n[currentLang]?.errorTab || '❌ 无法获取标签页';
    isTranslating = false;
    resetUI();
    return;
  }

  document.getElementById('status').textContent = i18n[currentLang]?.waitingStatus || '🔍 请求屏幕共享...';

  // 发送请求给 background
  chrome.runtime.sendMessage({
    type: 'START_RECORDING',
    tabId: tabId
  }, function(response) {
    console.log('[SidePanel] >>> START_RECORDING 响应:', response);

    if (statusTimeout) clearTimeout(statusTimeout);

    if (chrome.runtime.lastError) {
      console.error('[SidePanel] >>> 发送失败:', chrome.runtime.lastError.message);
      document.getElementById('status').textContent = '❌ ' + chrome.runtime.lastError.message;
      isTranslating = false;
      resetUI();
      return;
    }
    if (!response || !response.ok) {
      console.error('[SidePanel] >>> 启动失败:', response);
      document.getElementById('status').textContent = '❌ ' + (response && response.error || '启动失败');
      isTranslating = false;
      resetUI();
      return;
    }
    console.log('[SidePanel] >>> ✅ 已发送，等待 offscreen...');
    document.getElementById('status').textContent = i18n[currentLang]?.waitingStatus || '🎧 请允许屏幕共享...';
  });
}

function resetUI() {
  document.getElementById('translate-section').style.display = 'block';
  document.getElementById('result-section').style.display = 'none';
  document.getElementById('status').textContent = i18n[currentLang]?.initStatus || '准备就绪';
}

function stopTranslation() {
  console.log('[SidePanel] >>> stopTranslation()');
  isTranslating = false;
  stopKeepAlive();
  if (statusTimeout) clearTimeout(statusTimeout);

  if (currentTabId) {
    chrome.runtime.sendMessage({ type: 'STOP_RECORDING', tabId: currentTabId }, function() {});
  }

  resetUI();
}

function startKeepAlive() {
  stopKeepAlive();
  keepAliveTimer = setInterval(function() {
    chrome.runtime.sendMessage({ type: 'KEEP_ALIVE' }, function() {});
  }, 8000);
}

function stopKeepAlive() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

// 添加翻译记录到历史
function addTranslationHistory(original, translated, translationFailed) {
  var hasChinese = /[\u4e00-\u9fa5]/.test(original);
  var item = {
    time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    original: original,
    translated: translated,
    isChinese: hasChinese,
    translationFailed: translationFailed || false
  };
  
  translationHistory.unshift(item);
  renderHistory();
}

// 清空历史
function clearHistory() {
  translationHistory = [];
  renderHistory();
  console.log('[SidePanel] 历史已清空');
}

// 渲染历史列表
function renderHistory() {
  var container = document.getElementById('history-list');
  if (!container) return;
  
  var t = i18n[currentLang] || i18n['en'];
  
  if (translationHistory.length === 0) {
    container.innerHTML = '<div class="history-empty">' + t.noHistory + '</div>';
    return;
  }
  
  var html = '';
  for (var i = 0; i < translationHistory.length; i++) {
    var item = translationHistory[i];
    var originalLabel = item.isChinese ? t.original : t.translated;
    var translatedLabel = item.isChinese ? t.translated : t.original;
    
    html += '<div class="history-item">';
    html += '<div class="history-time">' + item.time + '</div>';
    html += '<div class="history-label">' + originalLabel + ':</div>';
    html += '<div class="history-text original">' + escapeHtml(item.original) + '</div>';
    html += '<div class="history-label" style="margin-top:4px">' + translatedLabel + ':</div>';
    if (item.translationFailed) {
      html += '<div class="history-text translated" style="color: #f59e0b;">⚠️ ' + t.vpnRequired;
      html += '<br><span style="font-size:11px;color:#94a3b8">' + t.vpnHint + '</span></div>';
    } else {
      html += '<div class="history-text translated">' + escapeHtml(item.translated) + '</div>';
    }
    html += '</div>';
  }
  
  container.innerHTML = html;
}

// HTML 转义
function escapeHtml(text) {
  var div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  console.log('[SidePanel] >>> 收到消息:', message.type);
  
  if (message.type === 'TRANSLATE_RESULT') {
    console.log('[SidePanel] >>> 翻译结果:', message.translated);
    var original = message.text || '';
    var translated = message.translated || '';
    var isChinese = message.isChinese || /[\u4e00-\u9fa5]/.test(original);
    var translationFailed = message.translationFailed || false;
    
    // 添加历史记录
    addTranslationHistory(original, translated, translationFailed);
  }
  
  if (message.type === 'RECOGNITION_ERROR') {
    console.log('[SidePanel] >>> 识别错误:', message.error);
    document.getElementById('status').textContent = '❌ ' + message.error;
  }
});

// 摘要功能
document.getElementById('summarizeBtn').addEventListener('click', function() {
  console.log('[SidePanel] 点击获取摘要');
  summarizePage();
});

async function summarizePage() {
  if (!currentTabId) {
    console.error('[SidePanel] 没有当前标签页');
    return;
  }
  
  var t = i18n[currentLang] || i18n.zh;
  var statusEl = document.getElementById('summary-status');
  var loadingEl = document.getElementById('summary-loading');
  var resultEl = document.getElementById('summary-result');
  var resultSection = document.getElementById('summary-result-section');
  
  // 显示加载状态
  resultSection.style.display = 'block';
  loadingEl.style.display = 'block';
  resultEl.innerHTML = '';
  statusEl.textContent = t.summaryLoading;
  
  try {
    // 检查 Summarizer API 是否可用
    if (!('Summarizer' in self)) {
      throw new Error('浏览器不支持 Summarizer API');
    }
    
    // 使用 scripting 权限获取页面文字
    var results = await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
      func: function() {
        // 尝试使用 Readability 提取文章主体
        if (typeof Readability !== 'undefined') {
          var article = new Readability(document).parse();
          return article ? article.textContent : document.body.innerText;
        }
        return document.body.innerText;
      }
    });
    
    var pageText = results[0]?.result || '';
    console.log('[SidePanel] 获取页面文字，长度:', pageText.length);
    
    // 截取前 3000 字符
    pageText = pageText.substring(0, 3000);
    
    if (!pageText || pageText.trim().length < 100) {
      throw new Error('页面内容太少，无法生成摘要');
    }
    
    // 创建 Summarizer
    console.log('[SidePanel] 创建 Summarizer...');
    var summarizer = await Summarizer.create({
      type: 'key-points',
      length: 'medium',
      format: 'markdown',
      language: currentLang === 'zh' ? 'zh' : 'en'
    });
    
    // 生成摘要
    console.log('[SidePanel] 生成摘要...');
    var summary = await summarizer.summarize(pageText);
    
    console.log('[SidePanel] 摘要结果:', typeof summary, summary ? summary.substring(0, 100) : 'null');
    
    // 解析并显示摘要
    displaySummary(summary);
    
    statusEl.textContent = '✅ 摘要生成完成';
    
  } catch (e) {
    console.error('[SidePanel] 摘要生成失败:', e);
    statusEl.textContent = '❌ ' + (e.message || t.summaryError);
    resultEl.innerHTML = '<div style="color:#f59e0b;padding:10px;">' + escapeHtml(e.message || t.summaryError) + '</div>';
  } finally {
    loadingEl.style.display = 'none';
  }
}

function displaySummary(summary) {
  var resultEl = document.getElementById('summary-result');

  if (!summary) {
    resultEl.innerHTML = '<div style="color:#94a3b8;padding:10px;">无摘要内容</div>';
    return;
  }

  // 如果是字符串，尝试解析
  var summaryData = summary;
  if (typeof summary === 'string') {
    try {
      summaryData = JSON.parse(summary);
    } catch (e) {
      // 保持字符串格式
    }
  }

  var html = '';

  // 如果有 title 字段
  if (summaryData.title) {
    html += '<div class="summary-title">' + escapeHtml(summaryData.title) + '</div>';
  }

  // 如果有 points 字段（要点列表）
  if (summaryData.points && Array.isArray(summaryData.points)) {
    html += '<div class="summary-points">';
    html += '<h4>要点:</h4>';
    html += '<ul>';
    summaryData.points.forEach(function(point) {
      html += '<li>' + escapeHtml(point) + '</li>';
    });
    html += '</ul>';
    html += '</div>';
  }

  // 如果有 summary 字段（总结）
  if (summaryData.summary) {
    html += '<div class="summary-summary">';
    html += '<h4>总结:</h4>';
    html += '<p id="summary-original-text">' + escapeHtml(summaryData.summary) + '</p>';
    html += '</div>';
  }

  // 如果没有结构化数据，直接显示文本
  if (!html) {
    html = '<div id="summary-original-text" style="padding:10px;line-height:1.6;white-space:pre-wrap;">' + escapeHtml(summary) + '</div>';
  }

  resultEl.innerHTML = html;

  // 发送摘要到气泡进行翻译
  sendSummaryToBubble(summary);

  // 同时在 Side Panel 显示翻译
  translateAndDisplaySummary(summary);
}

// 翻译摘要并在 Side Panel 显示
function translateAndDisplaySummary(summary) {
  var originalEl = document.getElementById('summary-original-text');
  if (!originalEl) return;

  // 检测摘要语言
  var hasChinese = /[\u4e00-\u9fa5]/.test(summary);
  var targetLang = hasChinese ? 'en' : 'zh';
  var t = i18n[currentLang] || i18n.zh;

  console.log('[SidePanel] 翻译摘要, 目标语言:', targetLang);

  // 发送翻译请求给 background
  chrome.runtime.sendMessage({
    type: 'TRANSLATE_TEXT',
    text: summary,
    targetLang: targetLang
  }, function(response) {
    if (chrome.runtime.lastError) {
      console.error('[SidePanel] 翻译失败:', chrome.runtime.lastError.message);
      return;
    }

    var translated = response ? response.translated : '';
    var failed = response ? response.failed : true;

    console.log('[SidePanel] 翻译结果:', translated ? translated.substring(0, 50) + '...' : 'null', 'failed:', failed);

    // 获取原文元素并创建译文容器
    var container = originalEl.parentElement;
    if (!container) return;

    // 移除旧的译文（如果存在）
    var oldTranslated = container.querySelector('.summary-translated');
    if (oldTranslated) oldTranslated.remove();

    var translatedDiv = document.createElement('div');
    translatedDiv.className = 'summary-translated';
    translatedDiv.style.cssText = 'margin-top:12px;padding:10px;background:rgba(79,70,229,0.2);border-radius:6px;border-left:3px solid #4F46E5;';

    if (failed || !translated) {
      translatedDiv.innerHTML = '<div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">译文:</div>' +
        '<div style="font-size:13px;color:#f59e0b;margin-bottom:8px;">⚠️ ' + t.vpnRequired + '</div>' +
        '<div style="font-size:11px;color:#94a3b8;">💡 ' + t.browserTranslateHint + '</div>';
    } else {
      translatedDiv.innerHTML = '<div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">译文:</div>' +
        '<div style="font-size:13px;color:#fff;line-height:1.6;">' + escapeHtml(translated) + '</div>';
    }

    container.appendChild(translatedDiv);
  });
}

// 发送摘要到气泡进行翻译
function sendSummaryToBubble(summary) {
  if (!summary) {
    console.warn('[SidePanel] 摘要为空，跳过翻译');
    return;
  }

  // 检测摘要语言
  var hasChinese = /[\u4e00-\u9fa5]/.test(summary);
  var targetLang = hasChinese ? 'en' : 'zh';

  console.log('[SidePanel] 发送摘要翻译, 目标语言:', targetLang, '长度:', summary.length, 'tabId:', currentTabId);

  // 直接发送（旧的简单路径）
  if (currentTabId) {
    chrome.tabs.sendMessage(currentTabId, {
      type: 'SUMMARY_TRANSLATE',
      text: summary,
      targetLang: targetLang
    }, function(resp) {
      if (chrome.runtime.lastError) {
        console.error('[SidePanel] 发送失败:', chrome.runtime.lastError.message);
      } else {
        console.log('[SidePanel] 已发送');
      }
    });
  }
}
