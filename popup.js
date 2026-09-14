// popup.js — Popup 面板逻辑
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
    settings: 'Settings',
    initStatus: '🎧 Initializing...',
    waitingStatus: '🎧 Waiting for screen share...',
    errorTimeout: '❌ Timeout, please retry',
    errorTab: '❌ Cannot get tab',
    statusRecording: '🎧 Recognizing...',
    original: 'Original',
    translated: 'Translated',
    vpnRequired: 'VPN required for translation',
    vpnHint: 'Tip: Right-click after translation → Translate'
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
    settings: '设置',
    initStatus: '🎧 正在初始化...',
    waitingStatus: '🎧 请允许屏幕共享...',
    errorTimeout: '❌ 超时，请重试',
    errorTab: '❌ 无法获取标签页',
    statusRecording: '🎧 正在识别...',
    original: '原文',
    translated: '译文',
    vpnRequired: '需要代理模式才能翻译',
    vpnHint: '推荐: 翻译后右键 → 翻译成中文'
  }
};

// 当前语言
var currentLang = 'en';

document.addEventListener('DOMContentLoaded', function() {
  console.log('[Popup] ========== DOMContentLoaded ==========');

  // 加载保存的语言设置
  loadLanguageSettings();
  
  // 应用界面语言
  applyLanguage(currentLang);

  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    console.log('[Popup] tabs.query:', tabs);
    if (tabs && tabs[0]) {
      currentTabId = tabs[0].id;
      var tab = tabs[0];
      document.getElementById('tab-info').innerHTML =
        '<div class="tab-title">' + (tab.title || '当前标签页') + '</div>' +
        '<div class="tab-url">' + (tab.url || '').substring(0, 50) + '...</div>';
      console.log('[Popup] currentTabId:', currentTabId);
    }
  });

  document.getElementById('settingsBtn').addEventListener('click', function(e) {
    e.stopPropagation();
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs && tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: 'OPEN_SETTINGS' });
    });
  });

  document.getElementById('translateBtn').addEventListener('click', function(e) {
    e.stopPropagation();
    console.log('[Popup] ========== translateBtn clicked ==========');
    startTranslation();
  });

  document.getElementById('clearBtn').addEventListener('click', function(e) {
    e.stopPropagation();
    console.log('[Popup] 清屏按钮 clicked');
    clearHistory();
  });

  document.getElementById('stopBtn').addEventListener('click', function(e) {
    e.stopPropagation();
    console.log('[Popup] stopBtn clicked');
    stopTranslation();
  });

  document.getElementById('restartBtn').addEventListener('click', function(e) {
    e.stopPropagation();
    console.log('[Popup] restartBtn clicked');
    startTranslation();
  });

  // 语言切换按钮
  document.getElementById('langToggleBtn').addEventListener('click', function() {
    switchLanguage('en');
  });

  document.getElementById('langToggleZn').addEventListener('click', function() {
    switchLanguage('zh');
  });

  // 语言选择器变化
  document.getElementById('sourceLangSelect').addEventListener('change', function() {
    saveLanguageSettings();
  });

  document.getElementById('targetLangSelect').addEventListener('change', function() {
    saveLanguageSettings();
  });

  console.log('[Popup] ========== DOM ready ==========');
});

// 切换界面语言
function switchLanguage(lang) {
  currentLang = lang;
  
  // 更新按钮状态
  document.getElementById('langToggleBtn').classList.toggle('active', lang === 'en');
  document.getElementById('langToggleZn').classList.toggle('active', lang === 'zh');
  
  // 应用翻译
  applyLanguage(lang);
  
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
      document.getElementById('langToggleBtn').classList.toggle('active', currentLang === 'en');
      document.getElementById('langToggleZn').classList.toggle('active', currentLang === 'zh');
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

// 获取当前语言设置
function getLanguageSettings() {
  return new Promise(function(resolve) {
    chrome.storage.sync.get(['sourceLang', 'targetLang'], function(items) {
      resolve({
        sourceLang: items.sourceLang || 'auto',
        targetLang: items.targetLang || 'zh'
      });
    });
  });
}

function startTranslation() {
  console.log('[Popup] >>> startTranslation() called');
  if (isTranslating) return;
  isTranslating = true;

  if (statusTimeout) clearTimeout(statusTimeout);
  startKeepAlive();

  document.getElementById('translate-section').style.display = 'none';
  document.getElementById('result-section').style.display = 'block';
  document.getElementById('status').textContent = i18n[currentLang]?.initStatus || '🎧 正在初始化...';
  document.querySelector('.hint').textContent = i18n[currentLang]?.waitingStatus || '请允许屏幕共享';

  console.log('[Popup] >>> KEEP_ALIVE');
  chrome.runtime.sendMessage({ type: 'KEEP_ALIVE' }, function() {});

  statusTimeout = setTimeout(function() {
    console.error('[Popup] >>> 超时');
    document.getElementById('status').textContent = i18n[currentLang]?.errorTimeout || '❌ 超时，请重试';
    stopTranslation();
  }, 30000);

  var tabId = currentTabId;
  console.log('[Popup] >>> tabId:', tabId);

  if (!tabId) {
    console.error('[Popup] >>> tabId 为空');
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
    console.log('[Popup] >>> START_RECORDING 响应:', response);

    if (statusTimeout) clearTimeout(statusTimeout);

    if (chrome.runtime.lastError) {
      console.error('[Popup] >>> 发送失败:', chrome.runtime.lastError.message);
      document.getElementById('status').textContent = '❌ ' + chrome.runtime.lastError.message;
      isTranslating = false;
      resetUI();
      return;
    }
    if (!response || !response.ok) {
      console.error('[Popup] >>> 启动失败:', response);
      document.getElementById('status').textContent = '❌ ' + (response && response.error || '启动失败');
      isTranslating = false;
      resetUI();
      return;
    }
    console.log('[Popup] >>> ✅ 已发送，等待 offscreen...');
    document.getElementById('status').textContent = i18n[currentLang]?.waitingStatus || '🎧 请允许屏幕共享...';
  });
}

function resetUI() {
  document.getElementById('translate-section').style.display = 'block';
  document.getElementById('result-section').style.display = 'none';
  document.getElementById('status').textContent = i18n[currentLang]?.initStatus || '准备就绪';
}

function stopTranslation() {
  console.log('[Popup] >>> stopTranslation()');
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
  
  translationHistory.unshift(item);  // 新记录在前
  
  renderHistory();
}

// 清空历史
function clearHistory() {
  translationHistory = [];
  renderHistory();
  console.log('[Popup] 历史已清空');
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
  console.log('[Popup] >>> 收到消息:', message.type);
  
  if (message.type === 'TRANSLATE_RESULT') {
    console.log('[Popup] >>> 翻译结果:', message.translated);
    var original = message.text || '';
    var translated = message.translated || '';
    var isChinese = message.isChinese || /[\u4e00-\u9fa5]/.test(original);
    var translationFailed = message.translationFailed || false;
    
    // 添加历史记录
    addTranslationHistory(original, translated, translationFailed);
    
    // 更新当前显示（安全检查）
    var originalLabel = document.getElementById('original-label');
    var translatedLabel = document.getElementById('translated-label');
    var t = i18n[currentLang] || i18n['en'];
    if (originalLabel) originalLabel.textContent = isChinese ? t.original : t.translated;
    if (translatedLabel) translatedLabel.textContent = isChinese ? t.translated : t.original;
  }
  
  if (message.type === 'RECOGNITION_ERROR') {
    console.log('[Popup] >>> 识别错误:', message.error);
    document.getElementById('status').textContent = '❌ ' + message.error;
  }
});
