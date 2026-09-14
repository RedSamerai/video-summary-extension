// offscreen.js — Offscreen Document
// 只做音频捕获，把数据发给 background 进行转录

let isTranslating = false;
let currentTabId = null;
let bgPort = null;
let audioContext = null;
let scriptProcessor = null;
let audioBuffers = [];
let isRecording = false;
let mediaStream = null;

// ==================== 连接到 Background ====================

function connectToBackground() {
  console.log('[Offscreen] 尝试连接 background...');
  bgPort = chrome.runtime.connect({ name: 'offscreen' });
  
  bgPort.onMessage.addListener(function(msg) {
    console.log('[Offscreen] 收到消息:', msg.type);
    
    if (msg.type === 'START_RECORDING') {
      console.log('[Offscreen] 开始录制, tabId:', msg.tabId);
      currentTabId = msg.tabId;
      startRecording(null, msg.tabId);
    }
    
    if (msg.type === 'STOP_RECORDING') {
      console.log('[Offscreen] 停止录制');
      stopRecording();
    }
  });
  
  bgPort.onDisconnect.addListener(function() {
    console.log('[Offscreen] background 断开连接，尝试重连...');
    bgPort = null;
    setTimeout(connectToBackground, 3000);
  });
  
  console.log('[Offscreen] 已连接到 background');
}

connectToBackground();

// ==================== 开始录制 ====================

async function startRecording(streamId, tabId) {
  console.log('[Offscreen] 开始录制流程, tabId:', tabId);
  currentTabId = tabId;
  audioBuffers = [];
  
  try {
    console.log('[Offscreen] 调用 getDisplayMedia...');
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: 1, height: 1 },
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true
      }
    });
    
    console.log('[Offscreen] getDisplayMedia 成功, tracks:', stream.getTracks().length);
    console.log('[Offscreen] 音频轨道:', stream.getAudioTracks().map(t => t.label));
    mediaStream = stream;
    
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) {
      throw new Error('没有获取到音频轨道');
    }
    
    audioTrack.addEventListener('ended', function() {
      console.log('[Offscreen] 用户停止共享');
      stopRecording();
    });
    
    startAudioCapture(stream, audioTrack, tabId);
    
  } catch (e) {
    console.error('[Offscreen] 获取音频失败:', e);
    if (bgPort) {
      bgPort.postMessage({ 
        type: 'RECOGNITION_ERROR', 
        error: '无法获取音频: ' + e.message 
      });
    }
    // 通知 background 停止
    if (bgPort) {
      bgPort.postMessage({ type: 'STOP_RECORDING' });
    }
  }
}

// ==================== 音频捕获 ====================

function startAudioCapture(stream, audioTrack, tabId) {
  // 获取音频采样率
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const sampleRate = audioContext.sampleRate;
  console.log('[Offscreen] AudioContext sample rate:', sampleRate);
  
  const source = audioContext.createMediaStreamSource(stream);
  
  const bufferSize = 4096;
  scriptProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);
  
  let chunkBuffer = [];
  
  scriptProcessor.onaudioprocess = function(e) {
    if (!isRecording) return;
    
    const input = e.inputBuffer.getChannelData(0);
    chunkBuffer.push(...input);
    audioBuffers.push(new Float32Array(input));
    
    // 保留最近 30 秒
    const maxSamples = 30 * sampleRate;
    while (chunkBuffer.length > maxSamples) {
      const first = chunkBuffer.splice(0, chunkBuffer.length - maxSamples);
      audioBuffers.shift();
    }
  };
  
  source.connect(scriptProcessor);
  scriptProcessor.connect(audioContext.destination);
  
  isRecording = true;
  console.log('[Offscreen] 音频捕获已启动, sampleRate:', sampleRate);
  
  if (bgPort) {
    bgPort.postMessage({ type: 'RECORDING_STARTED' });
  }
  
  // 每 5 秒发送一次音频数据给 background 转录
  startPeriodicTransmission(chunkBuffer, sampleRate);
}

// ==================== 定期发送音频 ====================

function startPeriodicTransmission(chunkBuffer, sampleRate) {
  const interval = setInterval(function() {
    if (!isRecording || chunkBuffer.length < sampleRate * 3) return;
    
    // 发送最近 10 秒音频
    const audioChunk = new Float32Array(chunkBuffer.slice(-sampleRate * 10));
    
    console.log('[Offscreen] 发送音频: 长度=' + audioChunk.length + ', sampleRate=' + sampleRate);
    
    if (bgPort) {
      // 使用 base64 编码传递音频数据（Service Worker 不支持 ArrayBuffer transfer）
      const bytes = new Uint8Array(audioChunk.buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      
      bgPort.postMessage({
        type: 'AUDIO_DATA',
        audioData: base64,
        length: audioChunk.length,
        sampleRate: sampleRate
      });
    }
    
    // 清空缓冲
    chunkBuffer.length = 0;
  }, 5000);
  
  window._transmissionInterval = interval;
}

// ==================== 停止录制 ====================

function stopRecording() {
  console.log('[Offscreen] 停止录制');
  isRecording = false;
  
  if (window._transmissionInterval) {
    clearInterval(window._transmissionInterval);
    window._transmissionInterval = null;
  }
  
  if (scriptProcessor) {
    scriptProcessor.disconnect();
    scriptProcessor = null;
  }
  
  if (audioContext) {
    audioContext.close().then(function() {
      audioContext = null;
    });
  }
  
  if (mediaStream) {
    mediaStream.getTracks().forEach(function(track) {
      console.log('[Offscreen] 停止轨道:', track.kind, track.label);
      track.stop();
    });
    mediaStream = null;
  }
  
  audioBuffers = [];
  currentTabId = null;
}
