import { StoreProfileModule } from './modules/store_profile/StoreProfileModule';
import { CartManager } from './modules/core/CartManager';
import { KioskUI } from './ui/KioskUI';
import { VisionModule } from './modules/vision';
import { GeminiRealtimeClient } from './modules/llm/Realtime';
import { AudioRecorder } from './modules/audio/AudioRecorder';
import { AgeGroup } from './shared/types';
import './ui/kiosk.css';

async function main() {
  console.log('🍔 KioSpeak Kiosk initializing...');

  // 1. Initialize Modules
  const storeProfile = new StoreProfileModule();
  const cartManager = new CartManager(storeProfile);

  // LLM & Vision Modules
  const visionModule = new VisionModule({ modelPath: '/models', minConfidence: 0.5 });
  const geminiClient = new GeminiRealtimeClient(cartManager, storeProfile);
  const audioRecorder = new AudioRecorder();

  // 2. Initialize UI
  const ui = new KioskUI('app', storeProfile, cartManager);

  // 3. Expose to window for inline event handlers
  (window as any).kioskUI = ui;

  // 4. Create Log Overlay & Helpers
  createLogOverlay();
  const addLog = (msg: string, type: 'info' | 'user' | 'ai' = 'info') => {
    const container = document.getElementById('kiosk-log-content');
    if (!container) return;

    const div = document.createElement('div');
    div.style.marginBottom = '4px';
    div.style.fontSize = '12px';
    div.style.padding = '4px 8px';
    div.style.borderRadius = '4px';
    div.style.maxWidth = '100%';
    div.style.wordBreak = 'break-word';

    if (type === 'user') {
      div.style.color = '#fff';
      div.style.backgroundColor = 'rgba(33, 150, 243, 0.8)'; // Blue
      div.style.alignSelf = 'flex-end';
      div.textContent = `👤 ${msg}`;
    } else if (type === 'ai') {
      div.style.color = '#fff';
      div.style.backgroundColor = 'rgba(76, 175, 80, 0.8)'; // Green
      div.style.alignSelf = 'flex-start';
      div.textContent = `🤖 ${msg}`;
    } else {
      div.style.color = '#333';
      div.style.backgroundColor = 'rgba(238, 238, 238, 0.8)'; // Gray
      div.style.alignSelf = 'center';
      div.textContent = `ℹ️ ${msg}`;
    }

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  };

  try {
    await ui.init();
    console.log('✅ Kiosk Ready');

    // 5. Setup "Click to Start" for Browser Permissions
    showStartOverlay(async () => {
      addLog('System starting...', 'info');

      try {
        // Init Vision
        await visionModule.initialize();
        setupHiddenVideo(visionModule, (age, _) => {
          // On Face Detected
          handleFaceDetection(age);
        }, () => {
          // On Face Lost
          handleFaceLost();
        });

        addLog('Vision System Active. Waiting for user...', 'info');

      } catch (err) {
        console.error(err);
        addLog(`Error: ${(err as Error).message}`, 'info');
      }
    });

  } catch (e) {
    console.error('Failed to initialize kiosk:', e);
    document.body.innerHTML = `<div style="padding:2rem; color:red">Error: ${(e as Error).message}</div>`;
  }

  // ============ Logic for Integration ============

  let isKioskRunning = false;
  let autoStartTimer: number | null = null;

  // Setup Gemini & Audio Events
  geminiClient.on('user_message', (text) => addLog(text, 'user'));
  geminiClient.on('text_response', (text) => addLog(text, 'ai'));
  geminiClient.on('log', (msg) => addLog(msg, 'info'));

  geminiClient.on('tool_call', (data) => {
    addLog(`Function: ${data.name}`, 'info');

    // 음성으로 장바구니 담기 시: 필수 옵션이 남았을 때만 모달 띄우기
    if (data.name === 'addToCart' && data.result?.success && data.result?.cartItemId) {
      const cartItemId = data.result.cartItemId;
      const pending = cartManager.getPendingRequiredOptions(cartItemId);

      if (pending.length > 0) {
        ui.reconfigureItem(cartItemId);
      }
    }

    // 음성으로 옵션 선택 시:
    if (data.name === 'selectOption' && data.result?.success && data.result?.cartItemId) {
      const cartItemId = data.result.cartItemId;
      const pending = cartManager.getPendingRequiredOptions(cartItemId);

      if (pending.length > 0) {
        // 필수 옵션이 남았거나 새로 생겼으면(예: 세트로 변경) 모달 띄우기
        ui.reconfigureItem(cartItemId);
      } else {
        // 모든 필수 옵션이 충족되면 모달 닫기
        ui.closeModal(false);
      }
    }
  });

  audioRecorder.on('audio_data', (base64) => {
    if (isKioskRunning) geminiClient.sendAudioChunk(base64);
  });

  audioRecorder.on('speech_start', () => {
    // Optional: Visual indicator that user is speaking
  });

  async function startKiosk(ageGroup: AgeGroup) {
    if (isKioskRunning) return;
    isKioskRunning = true;

    addLog(`Face Detected (${ageGroup}). Starting LLM...`, 'info');
    visionModule.stopMonitoring(); // Pause vision to save resource or avoid noise

    try {
      await geminiClient.connect('audio', ageGroup);
      await audioRecorder.start();
      addLog('LLM Connected. Say "Hello"!', 'info');
    } catch (e) {
      addLog(`LLM Connection Failed: ${(e as Error).message}`, 'info');
      isKioskRunning = false;
      // Resume vision?
      startMonitoringLogic();
    }
  }

  let visionStartFn: (() => void) | null = null;
  function startMonitoringLogic() {
    if (visionStartFn) visionStartFn();
  }

  function handleFaceDetection(age: any) {
    if (isKioskRunning) return;

    if (!autoStartTimer) {
      addLog(`Face detected! Auto-starting in 1.5s...`, 'info');
      autoStartTimer = window.setTimeout(() => {
        startKiosk(age.ageGroup);
        autoStartTimer = null;
      }, 1500);
    }
  }

  function handleFaceLost() {
    if (isKioskRunning) return; // If running, we don't care if face lost (session active)

    if (autoStartTimer) {
      clearTimeout(autoStartTimer);
      autoStartTimer = null;
      addLog('Face lost. Auto-start cancelled.', 'info');
    }
  }

  // ============ UI Helpers ============

  function createLogOverlay() {
    const container = document.createElement('div');
    container.id = 'kiosk-log-container';
    container.style.position = 'fixed';
    container.style.bottom = '20px';
    container.style.right = '20px';
    container.style.width = '300px';
    container.style.height = '200px';
    container.style.background = 'rgba(255, 255, 255, 0.9)';
    container.style.border = '1px solid #ccc';
    container.style.borderRadius = '8px';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.zIndex = '9999';
    container.style.boxShadow = '0 4px 10px rgba(0,0,0,0.1)';
    container.style.fontFamily = 'monospace';

    const header = document.createElement('div');
    header.innerText = 'System Logs (Drag me)';
    header.style.background = '#eee';
    header.style.padding = '8px';
    header.style.cursor = 'move';
    header.style.fontWeight = 'bold';
    header.style.fontSize = '12px';
    header.style.color = '#666';
    header.style.borderTopLeftRadius = '8px';
    header.style.borderTopRightRadius = '8px';
    header.style.borderBottom = '1px solid #ddd';
    header.style.userSelect = 'none'; // Prevent text selection while dragging

    const content = document.createElement('div');
    content.id = 'kiosk-log-content';
    content.style.flex = '1';
    content.style.overflowY = 'auto';
    content.style.padding = '10px';

    container.appendChild(header);
    container.appendChild(content);
    document.body.appendChild(container);

    // Make Draggable
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    header.addEventListener('mousedown', (e) => {
      isDragging = true;
      offsetX = e.clientX - container.offsetLeft;
      offsetY = e.clientY - container.offsetTop;
      container.style.opacity = '0.7';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      e.preventDefault();
      // Calculate new position
      const x = e.clientX - offsetX;
      const y = e.clientY - offsetY;

      // Remove bottom/right positioning to allow full movement via top/left
      container.style.bottom = 'auto';
      container.style.right = 'auto';
      container.style.left = `${x}px`;
      container.style.top = `${y}px`;
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
      container.style.opacity = '1';
    });
  }

  function showStartOverlay(onStart: () => void) {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.background = 'rgba(0,0,0,0.8)';
    overlay.style.display = 'flex';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.zIndex = '10000';

    const btn = document.createElement('button');
    btn.innerText = 'Start Kiosk System';
    btn.style.padding = '20px 40px';
    btn.style.fontSize = '24px';
    btn.style.background = '#ff5722';
    btn.style.color = 'white';
    btn.style.border = 'none';
    btn.style.borderRadius = '12px';
    btn.style.cursor = 'pointer';

    btn.onclick = () => {
      overlay.remove();
      onStart();
    };

    overlay.appendChild(btn);
    document.body.appendChild(overlay);
  }

  async function setupHiddenVideo(
    vision: VisionModule,
    onDetected: (age: any, conf: number) => void,
    onLost: () => void
  ) {
    const video = document.createElement('video');
    video.style.display = 'none';
    video.autoplay = true;
    video.playsInline = true;
    document.body.appendChild(video);

    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
    video.srcObject = stream;

    await new Promise<void>((resolve) => {
      if (video.readyState >= 2) resolve();
      else video.onloadeddata = () => resolve();
    });

    visionStartFn = () => {
      vision.startMonitoring(video, {
        onPersonDetected: (evt) => {
          if (evt.age) onDetected(evt.age, evt.detection?.confidence || 0);
        },
        onPersonLost: onLost,
        onFrame: () => { }
      });
    };

    visionStartFn();
  }
}

main();
