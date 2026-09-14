/**
 * Phase 3 - 视频翻译（无字幕方案）
 * 使用 Web Speech API + tabCapture 实时识别并翻译
 */

// ─── 全局状态 ──────────────────────────────────────────────────
let container = null;
let button = null;
let isLocked = false;
let isDragging = false;
let startX = 0, startY = 0;
let startLeft = 0, startTop = 0;
let menuEl = null;
let settingsPanel = null;
let translatePanel = null;

// 翻译状态
var isTranslating = false;
var currentText = '';
var subtitleEl = null;
var translationHistory = [];  // 气泡内的翻译历史
var recognition = null;
var audioCtx = null;
var mediaStream = null;
var sourceNode = null;

// 界面语言
var interfaceLang = 'zh';

// 气泡样式设置
var bubbleSettings = {
  opacity: 0.8,
  fontSize: 14
};

// 多语言字典
var i18n = {
  en: {
    openSidePanel: 'Open Side Panel',
    startTranslate: 'Start Translation',
    settings: 'Settings',
    hintOpenPanel: 'Click extension icon → Three dots → Open in sidebar',
    hintOpenPanelEdge: 'Click extension icon → Open in sidebar',
    waitingForPanel: 'Please open side panel first',
    vpnRequired: 'VPN required for translation',
    vpnHint: 'Tip: Copy text and translate manually, or right-click to use browser translate',
    browserTranslateHint: 'Tip: Right-click in bubble → Translate to Chinese',
    translating: 'Translating...',
    noHistory: 'No translation history',
    expandHistory: 'Click to expand history',
    collapseHistory: 'Click to collapse'
  },
  zh: {
    openSidePanel: '打开侧边栏',
    startTranslate: '开始翻译',
    settings: '设置',
    hintOpenPanel: '点击扩展图标 → 三个点 → 在侧边栏中打开',
    hintOpenPanelEdge: '点击扩展图标 → 在侧边栏中打开',
    waitingForPanel: '请先打开侧边栏',
    vpnRequired: '需要代理模式才能翻译',
    vpnHint: '提示: 复制文字后手动翻译，或右键使用浏览器翻译功能',
    browserTranslateHint: '提示: 在气泡中右键 → 翻译成中文',
    translating: '正在翻译...',
    noHistory: '暂无翻译记录',
    expandHistory: '点击展开历史',
    collapseHistory: '点击折叠'
  }
};

// 气泡 CSS 样式（避免重复定义）
var BUBBLE_CSS =
  '#vs-live-subtitle{position:fixed;z-index:100000;text-align:left;pointer-events:auto;max-width:500px;min-width:200px;padding:10px;background:rgba(0,0,0,0.9);border-radius:12px;cursor:move;box-shadow:0 4px 20px rgba(0,0,0,0.3);max-height:400px;overflow-y:auto}' +
  '#vs-live-subtitle.vs-expanded{max-height:60vh}' +
  '#vs-live-subtitle::-webkit-scrollbar{width:6px}' +
  '#vs-live-subtitle::-webkit-scrollbar-track{background:rgba(255,255,255,0.1);border-radius:3px}' +
  '#vs-live-subtitle::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.3);border-radius:3px}' +
  '.vs-copy-btn{background:rgba(255,255,255,0.2);border:none;color:white;padding:2px 6px;border-radius:4px;cursor:pointer;font-size:12px;margin-left:8px;transition:all 0.2s}' +
  '.vs-copy-btn:hover{background:rgba(255,255,255,0.3)}' +
  '.vs-bubble-hint{color:#94a3b8;font-size:13px;text-align:center;padding:20px}' +
  '.vs-expand-hint,.vs-collapse-hint{color:#64748b;font-size:11px;text-align:center;padding:8px;border-top:1px solid rgba(255,255,255,0.1);margin-top:8px;cursor:pointer}' +
  '.vs-expand-hint:hover,.vs-collapse-hint:hover{color:#94a3b8}' +
  '.vs-history-item{padding:8px;margin-bottom:8px;background:rgba(255,255,255,0.05);border-radius:6px}' +
  '.vs-history-time{font-size:10px;color:#64748b;margin-bottom:4px}' +
  '.vs-history-label{font-size:11px;color:#94a3b8;margin-bottom:2px}' +
  '.vs-history-text{font-size:13px;line-height:1.4;word-break:break-word}' +
  '.vs-history-text.original{color:#cbd5e1}' +
  '.vs-history-text.translated{color:#fff;font-weight:500}' +
  '.vs-live-zh{background:rgba(79,70,229,0.9);color:#fff;font-size:16px;' +
  'padding:8px 12px;border-radius:8px;line-height:1.6;white-space:pre-wrap;margin-bottom:8px}' +
  '.vs-live-en{background:rgba(255,255,255,0.15);color:#e2e8f0;font-size:14px;' +
  'padding:6px 12px;border-radius:6px;line-height:1.5;white-space:pre-wrap}';

// 检测浏览器类型
function detectBrowser() {
  var ua = navigator.userAgent;
  if (ua.indexOf('Edg') > -1) return 'edge';
  if (ua.indexOf('Chrome') > -1) return 'chrome';
  if (ua.indexOf('Firefox') > -1) return 'firefox';
  return 'other';
}

var browserType = detectBrowser();

// ─── 工具函数 ──────────────────────────────────────────────────
function isAlive() {
  try { return !!chrome.runtime.id; } catch (e) { return false; }
}

function safe(fn) {
  if (!isAlive()) return;
  try { fn(); } catch (e) {}
}

// 拖动功能
function makeDraggable(el) {
  var isDragging = false;
  var startX, startY, startLeft, startTop;
  
  el.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = el.offsetLeft;
    startTop = el.offsetTop;
    el.style.cursor = 'grabbing';
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', function(e) {
    if (!isDragging) return;
    var dx = e.clientX - startX;
    var dy = e.clientY - startY;
    el.style.left = (startLeft + dx) + 'px';
    el.style.top = (startTop + dy) + 'px';
  });
  
  document.addEventListener('mouseup', function() {
    if (isDragging) {
      isDragging = false;
      el.style.cursor = 'move';
    }
  });
}

// ─── 页面类型检测 ──────────────────────────────────────────────
function detectPageType() {
  var h = window.location.hostname;
  if (/youtube\.com/.test(h)) return 'youtube';
  if (/bilibili\.com/.test(h)) return 'bilibili';
  return '';
}

var pageType = '';

// ─── 音频捕获 + 识别 ────────────────────────────────────────────
async function startTranslation() {
  console.log('[VS] startTranslation called, isTranslating:', isTranslating);
  if (isTranslating) return;
  isTranslating = true;
  button.innerHTML = '...';
  button.style.background = '#DC2626';
  console.log('[VS] 按钮已设为 ...');

  // 创建字幕显示层
  if (!subtitleEl) {
    subtitleEl = document.createElement('div');
    subtitleEl.id = 'vs-live-subtitle';
    subtitleEl.draggable = true;

    // 创建样式
    var styleEl = document.createElement('style');
    styleEl.textContent = BUBBLE_CSS;
    document.head.appendChild(styleEl);

    // 初始位置：按钮右下方，避开popup
    var btnRect = button.getBoundingClientRect();
    var popupWidth = 320;
    var viewportWidth = window.innerWidth;
    
    // 如果按钮在右侧，气泡显示在左侧；否则显示在右侧
    var bubbleLeft = (btnRect.right + popupWidth + 20) < viewportWidth 
      ? (btnRect.right + 10) 
      : (btnRect.left - popupWidth - 10);
    
    subtitleEl.style.left = Math.max(10, Math.min(bubbleLeft, viewportWidth - popupWidth - 10)) + 'px';
    subtitleEl.style.top = Math.min(btnRect.bottom + 10, viewportWidth - 100) + 'px';

    // 添加拖动功能
    makeDraggable(subtitleEl);

    document.body.appendChild(subtitleEl);
    console.log('[VS] 字幕层已创建并挂载到 body');
  } else {
    console.log('[VS] 字幕层已存在，跳过创建');
  }

  // 请求 background.js 捕获系统音频
  try {
    console.log('[VS] 请求通过 background 捕获音频...');
    showSubtitle('请选择标签页以共享音频...');

    // 先在点击事件中尝试直接获取系统音频（需要用户手势）
    let streamId = null;
    try {
      console.log('[VS] 尝试 getDisplayMedia...');
      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: false
      });
      console.log('[VS] getDisplayMedia 成功');
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        streamId = audioTrack.id;
        console.log('[VS] 获取到 streamId:', streamId);
      }
      // 停止轨道（我们只需要 ID）
      stream.getTracks().forEach(function(t) { t.stop(); });
    } catch (dmErr) {
      console.log('[VS] getDisplayMedia 失败:', dmErr.message);
      // 继续尝试其他方式
    }

    // 获取当前标签页 ID
    const tabId = await new Promise(function(resolve, reject) {
      chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TAB' }, function(response) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response?.tabId) {
          resolve(response.tabId);
        } else {
          reject(new Error('无法获取标签页 ID'));
        }
      });
    });

    console.log('[VS] 获取到 tabId:', tabId);

    // 先建立长连接保持 Service Worker 活跃
    var port = chrome.runtime.connect({ name: 'vs-keepalive' });
    port.onDisconnect.addListener(function() {
      console.log('[VS] 连接已断开');
    });
    // 定期发送心跳保持 SW 活跃
    var heartbeat = setInterval(function() {
      port.postMessage({ type: 'KEEP_ALIVE' });
    }, 20000);

    // 发送消息给 background.js 开始录制
    console.log('[VS] 发送消息到 background...');
    chrome.runtime.sendMessage({
      type: 'START_TRANSLATION',
      tabId: tabId,
      streamId: streamId
    }, function(response) {
      if (chrome.runtime.lastError) {
        console.log('[VS] 消息发送失败:', chrome.runtime.lastError.message);
        showSubtitle('无法连接到后台脚本: ' + chrome.runtime.lastError.message);
        isTranslating = false;
        stopTranslation();
        clearInterval(heartbeat);
        return;
      }
      console.log('[VS] 收到响应:', JSON.stringify(response));
      if (!response?.ok) {
        showSubtitle('翻译启动失败: ' + (response?.error || '未知错误'));
        isTranslating = false;
        stopTranslation();
      } else {
        showSubtitle('正在识别... 播放视频说话或播放含语音的内容');
        console.log('[VS] 翻译已启动');
      }
    });
  } catch (e) {
    console.log('[VS] 请求失败:', e.message);
    showSubtitle('无法启动翻译: ' + e.message);
    isTranslating = false;
    stopTranslation();
  }
}

function cleanup() {
  stopTranslation();
}

function stopTranslation() {
  isTranslating = false;
  // 发送消息给 background 停止翻译
  try {
    chrome.runtime.sendMessage({ type: 'STOP_TRANSLATION' });
  } catch (e) {
    console.log('[VS] 发送停止消息失败:', e.message);
  }
  // 恢复按钮状态
  button.innerHTML = '+';
  button.style.background = '#4F46E5';
  // 关闭字幕层
  if (subtitleEl) {
    subtitleEl.remove();
    subtitleEl = null;
  }
  translationHistory = [];
}

// 应用气泡样式设置
function applyBubbleSettings() {
  if (!subtitleEl) return;
  
  subtitleEl.style.opacity = bubbleSettings.opacity;
  subtitleEl.style.fontSize = bubbleSettings.fontSize + 'px';
  
  // 更新所有文本元素的字体大小
  var items = subtitleEl.querySelectorAll('.vs-history-text, .vs-bubble-hint, .vs-expand-hint, .vs-collapse-hint');
  items.forEach(function(el) {
    el.style.fontSize = (bubbleSettings.fontSize - 1) + 'px';
  });
}

// 加载气泡样式设置
function loadBubbleSettings() {
  chrome.storage.sync.get(['subtitleOpacity', 'fontSize'], function(data) {
    if (data.subtitleOpacity !== undefined) {
      bubbleSettings.opacity = data.subtitleOpacity;
    }
    if (data.fontSize !== undefined) {
      bubbleSettings.fontSize = data.fontSize;
    }
    // 如果气泡已存在，立即应用
    if (subtitleEl) {
      applyBubbleSettings();
    }
  });
}

// 切换气泡展开/折叠
function toggleBubbleExpand() {
  if (!subtitleEl) return;
  
  if (subtitleEl.classList.contains('vs-expanded')) {
    subtitleEl.classList.remove('vs-expanded');
    updateBubbleContent();
  } else {
    subtitleEl.classList.add('vs-expanded');
    updateBubbleContent();
  }
}

// 更新气泡内容
function updateBubbleContent() {
  if (!subtitleEl) return;
  
  var html = '';
  var t = i18n[interfaceLang] || i18n.zh;
  
  if (translationHistory.length === 0) {
    html = '<div class="vs-bubble-hint">' + t.translating + '</div>';
  } else {
    var itemsToShow = subtitleEl.classList.contains('vs-expanded') 
      ? translationHistory 
      : [translationHistory[0]];
    
    for (var i = 0; i < itemsToShow.length; i++) {
      var item = itemsToShow[i];
      html += '<div class="vs-history-item">';
      html += '<div class="vs-history-time">' + item.time + '</div>';
      html += '<div class="vs-history-label">原文:</div>';
      html += '<div class="vs-history-text original">' + escapeHtml(item.original) + ' <button class="vs-copy-btn" onclick="copyToClipboard(\'' + escapeHtml(item.original) + '\', \'en\')">📋</button></div>';
      html += '<div class="vs-history-label" style="margin-top:4px">译文:</div>';
      if (item.failed) {
        html += '<div class="vs-history-text translated" style="color:#f59e0b;">⚠️ ' + t.vpnRequired + '</div>';
        html += '<div class="vs-history-text translated" style="font-size:11px;color:#94a3b8;margin-top:2px;">💡 ' + t.browserTranslateHint + '</div>';
      } else {
        html += '<div class="vs-history-text translated">' + escapeHtml(item.translated) + ' <button class="vs-copy-btn" onclick="copyToClipboard(\'' + escapeHtml(item.translated) + '\', \'zh\')">📋</button></div>';
      }
      html += '</div>';
    }
    
    if (subtitleEl.classList.contains('vs-expanded') && translationHistory.length > 1) {
      html += '<div class="vs-collapse-hint">' + t.collapseHistory + '</div>';
    } else if (!subtitleEl.classList.contains('vs-expanded') && translationHistory.length > 1) {
      html += '<div class="vs-expand-hint">' + t.expandHistory + '</div>';
    }
  }
  
  subtitleEl.innerHTML = html;
  
  // 重新应用样式设置（因为innerHTML会清除内联样式）
  applyBubbleSettings();
}

function showSubtitle(enText, zhText, isFinal) {
  console.log('[VS] showSubtitle called:', { enText, zhText, isFinal, hasEl: !!subtitleEl });
  if (!subtitleEl) {
    console.log('[VS] showSubtitle: subtitleEl 不存在，尝试重新创建');
    // 尝试重新创建
    subtitleEl = document.createElement('div');
    subtitleEl.id = 'vs-live-subtitle';
    subtitleEl.draggable = true;
    var styleEl = document.createElement('style');
    styleEl.textContent = BUBBLE_CSS;
    document.head.appendChild(styleEl);

    // 初始位置：按钮右下方，避开popup
    var btnRect = button.getBoundingClientRect();
    var popupWidth = 320;
    var viewportWidth = window.innerWidth;
    
    var bubbleLeft = (btnRect.right + popupWidth + 20) < viewportWidth 
      ? (btnRect.right + 10) 
      : (btnRect.left - popupWidth - 10);
    
    subtitleEl.style.left = Math.max(10, Math.min(bubbleLeft, viewportWidth - popupWidth - 10)) + 'px';
    subtitleEl.style.top = Math.min(btnRect.bottom + 10, viewportWidth - 100) + 'px';

    // 添加拖动功能
    makeDraggable(subtitleEl);
    
    // 点击展开历史
    subtitleEl.addEventListener('click', function(e) {
      // 如果点击的是复制按钮，不展开历史
      if (e.target.classList.contains('vs-copy-btn')) return;
      toggleBubbleExpand();
    });
    
    document.body.appendChild(subtitleEl);
    console.log('[VS] showSubtitle: 重新创建字幕层');
  }

  var html = '';
  if (enText) {
    html += '<div class="vs-live-en">' + escapeHtml(enText) + '</div>';
  }
  if (zhText && zhText !== enText) {
    html += '<div class="vs-live-zh">' + escapeHtml(zhText) + '</div>';
  }
  subtitleEl.innerHTML = html;

  // 详细调试日志
  var rect = subtitleEl.getBoundingClientRect();
  var cs = getComputedStyle(subtitleEl);
  console.log('[VS] showSubtitle 后:', {
    hasEl: !!subtitleEl,
    innerHTML_len: subtitleEl.innerHTML.length,
    visible: document.body.contains(subtitleEl),
    rect: {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      right: Math.round(rect.right),
      bottom: Math.round(rect.bottom),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    },
    computedStyle: {
      display: cs.display,
      visibility: cs.visibility,
      opacity: cs.opacity,
      position: cs.position,
      zIndex: cs.zIndex,
      transform: cs.transform,
      fontSize: cs.fontSize,
      color: cs.color
    }
  });
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── 菜单面板 ──────────────────────────────────────────────────
function createMenuPanel() {
  if (menuEl) { hideMenu(); return; }

  var t = i18n[interfaceLang] || i18n.zh;
  
  menuEl = document.createElement('div');
  menuEl.id = 'vs-menu';
  menuEl.innerHTML =
      '<div class="vs-mi" data-a="lang"><span class="vs-ic">' + (interfaceLang === 'zh' ? '🇬🇧' : '🇨🇳') + '</span><span class="vs-lb">' + (interfaceLang === 'zh' ? 'Switch to English' : '切换到中文') + '</span></div>' +
      '<div class="vs-mi" data-a="video"><span class="vs-ic">&#127916;</span><span class="vs-lb">' + t.startTranslate + '</span></div>' +
      '<div class="vs-mi" data-a="summary"><span class="vs-ic">&#128196;</span><span class="vs-lb">网页摘要</span></div>' +
      '<div class="vs-dv"></div>' +
      '<div class="vs-mi" data-a="settings"><span class="vs-ic">&#9881;</span><span class="vs-lb">' + t.settings + '</span></div>';

  var style = document.createElement('style');
  style.textContent =
    '#vs-menu{position:fixed;z-index:100000;border-radius:8px;background:#fff;' +
    'box-shadow:0 4px 16px rgba(0,0,0,0.15);overflow:hidden;min-width:170px}' +
    '.vs-mi{display:flex;align-items:center;gap:10px;padding:9px 14px;height:40px;' +
    'cursor:pointer;font-size:14px;color:#1f2937;transition:background .1s;user-select:none}' +
    '.vs-mi:hover{background:#EEF2FF}' +
    '.vs-ic{font-size:16px;width:20px;text-align:center;flex-shrink:0}' +
    '.vs-lb{flex:1}' +
    '.vs-dv{height:1px;background:#E5E7EB;margin:4px 14px}';
  menuEl.appendChild(style);

  var r = container.getBoundingClientRect();
  menuEl.style.left = Math.round(r.right) + 'px';
  menuEl.style.top = Math.round(r.bottom) + 'px';
  document.body.appendChild(menuEl);

  menuEl.querySelectorAll('.vs-mi').forEach(function(item) {
    item.addEventListener('click', function() {
      hideMenu();
      if (item.dataset.a === 'settings') createSettingsPanel();
      else if (item.dataset.a === 'lang') {
        // 切换语言
        interfaceLang = interfaceLang === 'zh' ? 'en' : 'zh';
        updateLanguage();
        createMenuPanel(); // 重新创建菜单
        // 通知侧边栏切换语言
        chrome.runtime.sendMessage({ type: 'CHANGE_INTERFACE_LANG', lang: interfaceLang });
      }
      else if (item.dataset.a === 'video') {
        // 显示操作指引（根据浏览器）
        var t = i18n[interfaceLang] || i18n.zh;
        var hint = browserType === 'edge' ? t.hintOpenPanelEdge : t.hintOpenPanel;
        showSubtitle('🎙️ ' + hint);
      }
      else if (item.dataset.a === 'summary') {
        // 网页摘要（待实现）
        var t = i18n[interfaceLang] || i18n.zh;
        showSubtitle(t.waitingForPanel || '网页摘要功能开发中...');
        console.log('[VS] 网页摘要（待实现）');
      }
    });
  });

  var closeFn = function(e) {
    if (e.target === button || container.contains(e.target)) return;
    if (menuEl && !menuEl.contains(e.target)) hideMenu();
    document.removeEventListener('click', closeFn);
    document.removeEventListener('keydown', escFn);
  };
  var escFn = function(e) {
    if (e.key === 'Escape') { hideMenu(); document.removeEventListener('keydown', escFn); }
  };
  document.addEventListener('click', closeFn);
  document.addEventListener('keydown', escFn);
}

function hideMenu() {
  if (menuEl) { menuEl.remove(); menuEl = null; }
}

// ─── 翻译控制面板 ────────────────────────────────────────────────
function createTranslatePanel() {
  if (translatePanel) { hideTranslatePanel(); return; }

  translatePanel = document.createElement('div');
  translatePanel.id = 'vs-translate-panel';
  translatePanel.innerHTML =
    '<div class="vs-pb"></div>' +
    '<div class="vs-pi">' +
      '<div class="vs-ph"><h3>实时翻译</h3><button class="vs-pc">&times;</button></div>' +
      '<div class="vs-pb2">' +
        '<div class="vs-status" id="vs-status">准备就绪</div>' +
        '<div class="vs-recognized" id="vs-recognized" style="display:none">' +
          '<div class="vs-label">识别中...</div>' +
          '<div class="vs-text" id="vs-recog-text"></div>' +
        '</div>' +
        '<div class="vs-actions">' +
          '<button id="vs-start-btn" class="vs-btn vs-btn-primary">开始翻译</button>' +
          '<button id="vs-stop-btn" class="vs-btn" style="display:none">停止翻译</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  var s = document.createElement('style');
  s.textContent =
    '#vs-translate-panel{position:fixed;top:0;right:0;width:320px;height:100%;z-index:100001;display:flex}' +
    '.vs-pb{flex:1;background:rgba(0,0,0,0.3)}' +
    '.vs-pi{width:320px;background:#fff;display:flex;flex-direction:column;animation:vsSI .2s ease}' +
    '@keyframes vsSI{from{transform:translateX(100%)}to{transform:translateX(0)}}' +
    '.vs-ph{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #e5e7eb}' +
    '.vs-ph h3{margin:0;font-size:16px;font-weight:600;color:#1f2937}' +
    '.vs-pc{width:28px;height:28px;border:none;background:#f3f4f6;border-radius:6px;font-size:18px;color:#6b7280;cursor:pointer;display:flex;align-items:center;justify-content:center}' +
    '.vs-pc:hover{background:#e5e7eb;color:#1f2937}' +
    '.vs-pb2{flex:1;padding:20px;overflow-y:auto}' +
    '.vs-status{font-size:14px;color:#6b7280;text-align:center;padding:12px 0}' +
    '.vs-recognized{padding:12px;background:#f8fafc;border-radius:8px;margin-bottom:16px}' +
    '.vs-label{font-size:12px;color:#94a3b8;margin-bottom:4px}' +
    '.vs-text{font-size:14px;color:#374151;line-height:1.5;white-space:pre-wrap}' +
    '.vs-actions{display:flex;gap:8px}' +
    '.vs-btn{flex:1;padding:10px;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:all .15s}' +
    '.vs-btn-primary{background:#4F46E5;color:white}' +
    '.vs-btn-primary:hover{background:#4338CA}' +
    '.vs-btn:not(.vs-btn-primary){background:#f3f4f6;color:#374151}' +
    '.vs-btn:not(.vs-btn-primary):hover{background:#e5e7eb}';
  translatePanel.appendChild(s);
  document.body.appendChild(translatePanel);

  // 按钮事件
  translatePanel.querySelector('#vs-start-btn').addEventListener('click', function() {
    console.log('[VS] 开始翻译');
    document.getElementById('vs-status').textContent = '正在请求权限...';
    startTranslation();
  });

  translatePanel.querySelector('#vs-stop-btn').addEventListener('click', function() {
    console.log('[VS] 停止翻译');
    stopTranslation();
  });

  translatePanel.querySelector('.vs-pc').addEventListener('click', hideTranslatePanel);
  translatePanel.querySelector('.vs-pb').addEventListener('click', hideTranslatePanel);

  var sk = function(e) {
    if (e.key === 'Escape') hideTranslatePanel();
  };
  document.addEventListener('keydown', sk);
  translatePanel._esc = sk;
}

function hideTranslatePanel() {
  if (!translatePanel) return;
  translatePanel.querySelector('.vs-pi').style.animation = 'none';
  translatePanel.style.opacity = '0';
  translatePanel.style.transition = 'opacity .15s';
  setTimeout(function() {
    if (translatePanel) {
      translatePanel.remove();
      translatePanel = null;
    }
    if (translatePanel && translatePanel._esc) {
      document.removeEventListener('keydown', translatePanel._esc);
    }
  }, 150);
}

// ─── 设置面板 ──────────────────────────────────────────────────
function createSettingsPanel() {
  console.log('[VS] createSettingsPanel called');
  if (settingsPanel) { 
    console.log('[VS] settingsPanel already exists, closing');
    closeSettingsPanel(); 
    return; 
  }

  console.log('[VS] Calling chrome.storage.sync.get...');
  
  safe(function () {
    chrome.storage.sync.get(['lockedPosition', 'subtitleOpacity', 'fontSize'], function (data) {
      console.log('[VS] Storage data:', data);
      var locked = !!data.lockedPosition;
      var opacity = data.subtitleOpacity !== undefined ? data.subtitleOpacity : 0.8;
      var fontSize = data.fontSize !== undefined ? data.fontSize : 14;

      var panel = document.createElement('div');
      panel.id = 'vs-settings-panel';
      panel.innerHTML =
        '<div class="vs-pb"></div>' +
        '<div class="vs-pi">' +
          '<div class="vs-ph"><h3>设置</h3><button class="vs-pc">&times;</button></div>' +
          '<div class="vs-pb2">' +
            '<div class="vs-sr"><label>字幕透明度</label>' +
              '<div class="vs-rw"><input type="range" id="vs-op" min="0.3" max="1" step="0.1" value="' + opacity + '">' +
              '<span id="vs-op-val">' + opacity + '</span></div></div>' +
            '<div class="vs-sr"><label>字体大小</label>' +
              '<select id="vs-fs">' +
                '<option value="12"' + (fontSize===12?' selected':'') + '>12px</option>' +
                '<option value="14"' + (fontSize===14?' selected':'') + '>14px</option>' +
                '<option value="16"' + (fontSize===16?' selected':'') + '>16px</option>' +
                '<option value="18"' + (fontSize===18?' selected':'') + '>18px</option>' +
                '<option value="20"' + (fontSize===20?' selected':'') + '>20px</option>' +
              '</select></div>' +
            '<div class="vs-sr"><label><input type="checkbox" id="vs-lock" ' + (locked?'checked':'') + '>锁定位置</label></div>' +
          '</div></div>';

      var s = document.createElement('style');
      s.textContent =
        '#vs-settings-panel{position:fixed;top:0;right:0;width:320px;height:100%;z-index:100001;display:flex}' +
        '.vs-pb{flex:1;background:rgba(0,0,0,0.3)}' +
        '.vs-pi{width:320px;background:#fff;display:flex;flex-direction:column;animation:vsSI .2s ease}' +
        '@keyframes vsSI{from{transform:translateX(100%)}to{transform:translateX(0)}}' +
        '.vs-ph{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #e5e7eb}' +
        '.vs-ph h3{margin:0;font-size:16px;font-weight:600;color:#1f2937}' +
        '.vs-pc{width:28px;height:28px;border:none;background:#f3f4f6;border-radius:6px;font-size:18px;color:#6b7280;cursor:pointer;display:flex;align-items:center;justify-content:center}' +
        '.vs-pc:hover{background:#e5e7eb;color:#1f2937}' +
        '.vs-pb2{flex:1;padding:20px;overflow-y:auto}' +
        '.vs-sr{display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid #f3f4f6}' +
        '.vs-sr:last-child{border-bottom:none}' +
        '.vs-sr label{font-size:14px;color:#374151;cursor:pointer;display:flex;align-items:center;gap:8px}' +
        '.vs-sr input[type=checkbox]{width:16px;height:16px;accent-color:#4F46E5;cursor:pointer;flex-shrink:0}' +
        '.vs-rw{display:flex;align-items:center;gap:10px;width:160px}' +
        '.vs-rw input[type=range]{flex:1;accent-color:#4F46E5}' +
        '#vs-op-val{font-size:13px;color:#6b7280;min-width:28px;text-align:right}' +
        '.vs-sr select{padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;background:#fff;cursor:pointer}';
      panel.appendChild(s);
      document.body.appendChild(panel);
      settingsPanel = panel;

      panel.querySelector('#vs-lock').addEventListener('change', function () {
        isLocked = this.checked;
        safe(function () { chrome.storage.sync.set({ lockedPosition: this.checked }); });
      });
      // 透明度
      panel.querySelector('#vs-op').addEventListener('input', function () {
        panel.querySelector('#vs-op-val').textContent = this.value;
        var val = parseFloat(this.value);
        bubbleSettings.opacity = val;
        safe(function () { chrome.storage.sync.set({ subtitleOpacity: val }); });
        // 立即应用到气泡
        applyBubbleSettings();
      });
      // 字体大小
      panel.querySelector('#vs-fs').addEventListener('change', function () {
        var val = parseInt(this.value);
        bubbleSettings.fontSize = val;
        safe(function () { chrome.storage.sync.set({ fontSize: val }); });
        // 立即应用到气泡
        applyBubbleSettings();
      });
      panel.querySelector('.vs-pc').addEventListener('click', closeSettingsPanel);
      panel.querySelector('.vs-pb').addEventListener('click', closeSettingsPanel);
      var sk = function (e) { if (e.key === 'Escape') closeSettingsPanel(); };
      document.addEventListener('keydown', sk);
      panel._esc = sk;
    });
  });
}

function closeSettingsPanel() {
  if (!settingsPanel) return;
  settingsPanel.querySelector('.vs-pi').style.animation = 'none';
  settingsPanel.style.opacity = '0';
  settingsPanel.style.transition = 'opacity .15s';
  setTimeout(function () {
    if (settingsPanel) { settingsPanel.remove(); settingsPanel = null; }
    if (settingsPanel && settingsPanel._esc) {
      document.removeEventListener('keydown', settingsPanel._esc);
    }
  }, 150);
}

// ─── 拖动 & 点击 ───────────────────────────────────────────────
function onDown(e) {
  console.log('[VS] onDown:', { button: e.button, isLocked, isTranslating, hasButton: !!button });
  if (e.button !== 0) { console.log('[VS] 非左键，忽略'); return; }
  e.preventDefault();

  // 记录起始位置
  startX = e.clientX;
  startY = e.clientY;
  startLeft = container.offsetLeft;
  startTop = container.offsetTop;

  if (isTranslating) {
    // 翻译中：允许拖动，松开时判断是点击还是拖动
    console.log('[VS] 翻译中，开始拖动');
    isDragging = true;
    button.style.cursor = 'grabbing';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return;
  }

  if (isLocked) {
    console.log('[VS] 锁定状态，打开菜单');
    if (menuEl) hideMenu();
    else createMenuPanel();
    return;
  }

  console.log('[VS] 开始拖动');
  isDragging = true;
  if (menuEl) hideMenu();
  button.style.cursor = 'grabbing';

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function onMove(e) {
  if (!isDragging) return;
  var nl = Math.max(0, Math.min(startLeft + (e.clientX - startX), window.innerWidth - 40));
  var nt = Math.max(0, Math.min(startTop + (e.clientY - startY), window.innerHeight - 40));
  container.style.left = nl + 'px';
  container.style.top = nt + 'px';
  // 字幕层跟随按钮（固定在按钮右侧）
  if (subtitleEl) {
    subtitleEl.style.left = (nl + 50) + 'px';
    subtitleEl.style.top = nt + 'px';
  }
}

function onUp(e) {
  document.removeEventListener('mousemove', onMove);
  document.removeEventListener('mouseup', onUp);
  isDragging = false;
  button.style.cursor = 'grab';

  var dx = e.clientX - startX;
  var dy = e.clientY - startY;
  var moved = Math.abs(dx) > 5 || Math.abs(dy) > 5;

  if (isTranslating) {
    // 翻译中松开：如果是点击（没拖动），停止翻译
    if (!moved) {
      console.log('[VS] 翻译中点击，停止翻译');
      stopTranslation();
    }
    savePos();
    return;
  }

  if (!moved) {
    createMenuPanel();
  }
  savePos();
}

// ─── 初始化 ────────────────────────────────────────────────────
(function () {
  function run() {
    if (!isAlive()) return;

    safe(function () {
      chrome.storage.sync.get(['lockedPosition'], function (data) {
        if (!chrome.runtime.lastError) isLocked = !!data.lockedPosition;
      });
    });

    container = document.createElement('div');
    container.id = 'vs-extension-container';
    container.style.cssText = 'position:fixed;width:40px;height:40px;z-index:99999;cursor:move;user-select:none;';

    button = document.createElement('button');
    button.id = 'vs-button';
    button.innerHTML = '+';
    button.style.cssText =
      'width:100%;height:100%;border-radius:50%;background:#4F46E5;color:white;' +
      'font-size:28px;font-weight:bold;border:none;cursor:grab;' +
      'display:flex!important;align-items:center!important;justify-content:center!important;' +
      'box-sizing:border-box;line-height:1;' +
      'box-shadow:0 2px 8px rgba(0,0,0,0.15);transition:transform .15s,box-shadow .15s;';

    button.addEventListener('mouseenter', function () {
      button.style.transform = 'scale(1.1)';
      button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.25)';
    });
    button.addEventListener('mouseleave', function () {
      button.style.transform = '';
      button.style.boxShadow = '';
    });

    button.addEventListener('mousedown', onDown);

    container.appendChild(button);
    document.body.appendChild(container);

    safe(function () {
      chrome.storage.sync.get('buttonPosition', function (data) {
        if (chrome.runtime.lastError) return;
        if (data.buttonPosition) {
          container.style.left = data.buttonPosition.x + 'px';
          container.style.top = data.buttonPosition.y + 'px';
          container.style.right = 'auto';
          container.style.transform = 'none';
        } else {
          container.style.right = '20px';
          container.style.top = '50%';
          container.style.left = 'auto';
          container.style.transform = 'translateY(-50%)';
        }
      });
    });

    // 加载气泡样式设置
    loadBubbleSettings();
    
    // 检测页面类型
    pageType = detectPageType();
    if (pageType) {
      console.log('[VS] 检测到视频页面:', pageType);
    }
    // 根据页面类型刷新按钮状态
    refreshButtonState();
  }

  // 刷新按钮状态函数
  function refreshButtonState() {
    // 按钮状态完全由用户操作决定，与页面类型无关
    if (isTranslating) {
      button.innerHTML = '译';
      button.style.background = '#7C3AED';
    } else {
      button.innerHTML = '+';
      button.style.background = '#4F46E5';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();

// ─── 消息处理 ──────────────────────────────────────────────────
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  console.log('[Content] received:', message.type);

  if (message.type === 'OPEN_SETTINGS') {
    createSettingsPanel();
  }

  if (message.type === 'OPEN_TRANSLATE') {
    console.log('[Content] 打开翻译面板');
    createTranslatePanel();
  }

  if (message.type === 'TRANSLATION_STARTED') {
    console.log('[Content] 翻译已开始');
    button.innerHTML = '译';
    button.style.background = '#7C3AED';
    showSubtitle('正在识别... 播放视频说话或播放含语音的内容');
  }

  // 打开侧边栏
  if (message.type === 'OPEN_SIDE_PANEL') {
    var windowId = message.windowId || (chrome.windows && chrome.windows.WINDOW_ID_CURRENT);
    if (windowId) {
      chrome.sidePanel.open({ windowId: windowId }).catch(function(err) {
        console.log('[Content] 打开侧边栏失败:', err);
      });
    } else {
      chrome.windows.getCurrent(function(win) {
        if (win && win.id) {
          chrome.sidePanel.open({ windowId: win.id });
        }
      });
    }
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'RECOGNITION_ERROR') {
    console.log('[Content] 识别错误:', message.error);
    var t = i18n[interfaceLang] || i18n.zh;
    showSubtitle('❌ ' + (message.error || '识别失败'));
  }

  // 翻译结果（来自 background.js）
  if (message.type === 'TRANSLATE_RESULT') {
    console.log('[Content] 翻译结果:', message.translated ? message.translated.substring(0, 50) + '...' : 'null');
    var original = message.text || '';
    var translated = message.translated || '';
    var translationFailed = message.translationFailed || false;

    translationHistory.unshift({
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      original: original,
      translated: translated,
      failed: translationFailed
    });
    if (translationHistory.length > 50) translationHistory.pop();

    updateBubbleContent();
  }

  // 开始/停止翻译
  if (message.type === 'START_TRANSLATION') {
    showSubtitle('🎙️ 翻译已启动，请播放视频...');
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'STOP_TRANSLATION') {
    showSubtitle('已停止');
    chrome.runtime.sendMessage({ type: 'STOP_RECORDING' }, function() {});
    sendResponse({ ok: true });
    return false;
  }

  // 摘要翻译（异步，需要 return true 保持连接）
  if (message.type === 'SUMMARY_TRANSLATE') {
    console.log('[Content] 收到摘要翻译请求:', message.text ? message.text.substring(0, 30) + '...' : 'null');
    console.log('[Content] targetLang:', message.targetLang);
    translateTextForBubble(message.text, message.targetLang);
    return true; // 异步操作，保持连接
  }
});

// 翻译文本并显示在气泡中
function translateTextForBubble(text, targetLang) {
  if (!text) {
    console.error('[Content] translateTextForBubble: text is empty');
    return;
  }

  var original = text;

  console.log('[Content] 翻译摘要, targetLang:', targetLang);
  console.log('[Content] 原文:', text.substring(0, 50) + '...');

  // 发送翻译请求给 background，由 background 发送 TRANSLATE_RESULT 回 content.js
  chrome.runtime.sendMessage({
    type: 'TRANSLATE_TEXT',
    text: text,
    targetLang: targetLang
  });
}

// 复制到剪贴板
function copyToClipboard(text, type) {
  navigator.clipboard.writeText(text).then(function() {
    console.log('[VS] 已复制' + (type === 'en' ? '原文' : '译文') + '到剪贴板');
    var tip = document.createElement('div');
    tip.textContent = type === 'en' ? '原文已复制' : '译文已复制';
    tip.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#4F46E5;color:white;padding:8px 16px;border-radius:8px;z-index:100001;font-size:14px;animation:vsFadeIn 0.3s ease';
    document.head.appendChild(tip);
    setTimeout(function() { tip.remove(); }, 2000);
  }).catch(function(err) {
    console.error('[VS] 复制失败:', err);
  });
}

// ─── Save Position ─────────────────────────────────────────────
function savePos() {
  safe(function () {
    chrome.storage.sync.set({
      buttonPosition: { x: container.offsetLeft, y: container.offsetTop }
    }, function () {
      if (!chrome.runtime.lastError) console.log('[VS] position saved');
    });
  });
}
