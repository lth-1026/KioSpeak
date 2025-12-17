/**
 * Integration Test - Vision + LLM
 * Detect age from camera and start kiosk with personalized voice speed
 */

import { VisionModule } from './modules/vision';
import { GeminiRealtimeClient } from './modules/llm/Realtime';
import { CartManager } from './modules/core/CartManager';
import { StoreProfileModule } from './modules/store_profile';
import { AudioRecorder } from './modules/audio/AudioRecorder';
import { AgeGroup } from './shared/types';

async function main() {
  console.log('🚀 Integration Test Starting...');

  const app = document.getElementById('app');
  if (!app) {
    throw new Error('App container not found');
  }

  // Initial UI Rendering
  app.innerHTML = `
    <div style="padding: 2rem; max-width: 1000px; margin: 0 auto;">
      <h1 style="margin-bottom: 1rem; text-align: center;">KioSpeak Integration Test</h1>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
        <!-- Left Panel: Vision -->
        <div style="background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h2 style="margin-top: 0;">1. Face Detection</h2>
          <div style="margin-bottom: 1rem; position: relative; min-height: 240px; background: #000; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
            <video id="webcam" autoplay playsinline style="width: 100%; border-radius: 8px; display: none;"></video>
            <div id="camera-placeholder" style="color: #666;">Camera inactive</div>
            <div id="detection-overlay" style="
              position: absolute; 
              top: 10px; 
              left: 10px; 
              background: rgba(0,0,0,0.7); 
              color: white; 
              padding: 0.5rem; 
              border-radius: 4px;
              display: none;
            ">
              Initializing...
            </div>
          </div>
          
          <div id="vision-controls">
            <button id="start-camera-btn" style="
              width: 100%;
              padding: 1rem;
              background: #2196F3;
              color: white;
              border: none;
              border-radius: 4px;
              font-size: 1.1rem;
              cursor: pointer;
            ">Start Camera & Auto-Start Kiosk</button>
          </div>

          <div style="margin-top: 1rem; padding: 1rem; background: #fff3e0; border-radius: 4px; border: 1px solid #ffe0b2;">
            <label style="display: block; margin-bottom: 0.5rem; font-weight: bold; color: #e65100;">Manual Override (Optional)</label>
            <div style="display: flex; gap: 0.5rem;">
              <select id="manual-age-group" style="flex: 1; padding: 0.5rem; border-radius: 4px; border: 1px solid #ccc;">
                <option value="">Auto-Detect (Default)</option>
                <option value="CHILD">CHILD (Slow)</option>
                <option value="TEENAGER">TEENAGER</option>
                <option value="YOUNG_ADULT">YOUNG_ADULT</option>
                <option value="ADULT">ADULT</option>
                <option value="MIDDLE_AGED">MIDDLE_AGED (Slow)</option>
                <option value="SENIOR">SENIOR (Slow)</option>
              </select>
            </div>
            <div style="font-size: 0.8rem; color: #666; margin-top: 0.5rem;">
              Select an age group to force a specific voice speed regardless of detection.
            </div>
          </div>
          
          <div id="detection-result" style="margin-top: 1rem; padding: 1rem; background: #f5f5f5; border-radius: 4px; display: none;">
            <div style="font-size: 0.9rem; color: #666;">Detected Age Group:</div>
            <div id="detected-age-group" style="font-size: 1.5rem; font-weight: bold; color: #333;">-</div>
            <div id="detected-details" style="font-size: 0.9rem; color: #888; margin-top: 0.5rem;"></div>
          </div>
        </div>

        <!-- Right Panel: Kiosk -->
        <div style="background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h2 style="margin-top: 0;">2. Kiosk Interaction</h2>
          <div id="kiosk-status" style="
            padding: 1rem; 
            background: #f5f5f5; 
            border-radius: 4px; 
            margin-bottom: 1rem;
            text-align: center;
            color: #666;
          ">
            Waiting for detection...
          </div>
          
          <div id="log-container" style="
            height: 400px;
            overflow-y: auto;
            background: #f9f9f9;
            border: 1px solid #eee;
            border-radius: 4px;
            padding: 1rem;
            font-family: monospace;
            font-size: 0.9rem;
          ">
            <div style="color: #aaa; text-align: center; margin-top: 2rem;">Conversation logs will appear here</div>
          </div>
          
          <button id="stop-kiosk-btn" style="
            width: 100%;
            margin-top: 1rem;
            padding: 1rem;
            background: #f44336;
            color: white;
            border: none;
            border-radius: 4px;
            font-size: 1.1rem;
            cursor: pointer;
            display: none;
          ">Stop Kiosk</button>
        </div>
      </div>
      
      <p style="text-align: center; margin-top: 2rem;">
        <a href="/" style="color: #666; text-decoration: none;">← Back to Home</a>
      </p>
    </div>
  `;

  // Elements
  const video = document.getElementById('webcam') as HTMLVideoElement;
  const cameraPlaceholder = document.getElementById('camera-placeholder') as HTMLDivElement;
  const startCameraBtn = document.getElementById('start-camera-btn') as HTMLButtonElement;
  const detectionOverlay = document.getElementById('detection-overlay') as HTMLDivElement;
  const detectionResult = document.getElementById('detection-result') as HTMLDivElement;
  const detectedAgeGroupEl = document.getElementById('detected-age-group') as HTMLDivElement;
  const detectedDetailsEl = document.getElementById('detected-details') as HTMLDivElement;
  const kioskStatus = document.getElementById('kiosk-status') as HTMLDivElement;
  const logContainer = document.getElementById('log-container') as HTMLDivElement;
  const stopKioskBtn = document.getElementById('stop-kiosk-btn') as HTMLButtonElement;
  const manualAgeGroupSelect = document.getElementById('manual-age-group') as HTMLSelectElement;

  // Modules
  const visionModule = new VisionModule({
    modelPath: '/models',
    minConfidence: 0.5,
  });

  const storeProfile = new StoreProfileModule();
  await storeProfile.initialize();

  const cartManager = new CartManager(storeProfile);
  const geminiClient = new GeminiRealtimeClient(cartManager, storeProfile);
  const audioRecorder = new AudioRecorder();

  let isKioskRunning = false;
  let autoStartTimer: number | null = null;

  // Initialize Vision Module immediately
  try {
    console.log('Initializing Vision Module...');
    await visionModule.initialize();
    console.log('Vision Module Initialized');
  } catch (error) {
    console.error('Failed to initialize Vision Module:', error);
    alert('Failed to initialize Vision Module. Check console for details.');
  }

  // Helper: Add Log
  const addLog = (msg: string, type: 'system' | 'user' | 'ai' = 'system') => {
    const div = document.createElement('div');
    div.style.marginBottom = '0.5rem';
    div.style.paddingBottom = '0.5rem';
    div.style.borderBottom = '1px solid #eee';

    if (type === 'user') {
      div.style.color = '#0066cc';
      div.style.textAlign = 'right';
      div.textContent = `👤 ${msg}`;
    } else if (type === 'ai') {
      div.style.color = '#4CAF50';
      div.style.textAlign = 'left';
      div.textContent = `🤖 ${msg}`;
    } else {
      div.style.color = '#888';
      div.style.textAlign = 'center';
      div.style.fontSize = '0.8rem';
      div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    }

    // Remove placeholder if exists
    if (logContainer.children.length === 1 && logContainer.children[0].textContent?.includes('Conversation logs')) {
      logContainer.innerHTML = '';
    }

    logContainer.appendChild(div);
    logContainer.scrollTop = logContainer.scrollHeight;
  };

  // Setup Gemini Events
  geminiClient.on('log', (_msg) => {
    // Filter out raw logs if needed
  });

  geminiClient.on('user_message', (text) => addLog(text, 'user'));
  geminiClient.on('text_response', (text) => addLog(text, 'ai'));

  // Setup Audio Recorder Events
  audioRecorder.on('audio_data', (base64Audio) => {
    if (isKioskRunning) {
      geminiClient.sendAudioChunk(base64Audio);
    }
  });

  audioRecorder.on('speech_start', () => {
    if (isKioskRunning) {
      addLog('Listening...', 'system');
    }
  });

  async function startKiosk(ageGroup: AgeGroup) {
    if (isKioskRunning) return;

    try {
      isKioskRunning = true;

      // Pause vision monitoring
      visionModule.stopMonitoring();
      detectionOverlay.textContent = 'Vision Paused (Kiosk Active)';
      detectionOverlay.style.color = '#2196F3';
      detectionOverlay.style.display = 'block';

      kioskStatus.innerHTML = `
        <div style="color: green; font-weight: bold;">System Active</div>
        <div style="font-size: 0.9rem; margin-top: 0.5rem;">
          Mode: <span style="font-weight: bold;">${ageGroup}</span>
        </div>
      `;
      stopKioskBtn.style.display = 'block';

      addLog(`System initialized for ${ageGroup}`, 'system');

      // Connect to Gemini
      await geminiClient.connect('audio', ageGroup);
      await audioRecorder.start();

      addLog('Microphone active. Say "Hello" to start.', 'system');

    } catch (error) {
      console.error(error);
      addLog(`Error starting kiosk: ${error}`, 'system');
      isKioskRunning = false;

      // Resume vision if failed
      startMonitoring();
    }
  }

  function startMonitoring() {
    console.log('Starting monitoring...');
    visionModule.startMonitoring(video, {
      onPersonDetected: (event) => {
        console.log('Person Detected:', event);
        if (!isKioskRunning && event.age) {
          updateUI(event.age, event.detection?.confidence || 0);

          // Auto-start kiosk logic
          if (!autoStartTimer) {
            console.log('Auto-starting kiosk in 1.5s...');
            detectionOverlay.textContent = 'Face Detected! Starting Kiosk...';
            detectionOverlay.style.color = '#FFC107';

            autoStartTimer = window.setTimeout(() => {
              const manualOverride = manualAgeGroupSelect.value as AgeGroup;
              const finalAgeGroup = manualOverride || event.age!.ageGroup;
              startKiosk(finalAgeGroup);
              autoStartTimer = null;
            }, 1500); // 1.5 second delay to ensure stability
          }
        }
      },
      onPersonLost: () => {
        console.log('Person Lost');
        if (!isKioskRunning) {
          detectionOverlay.textContent = 'Searching for face...';
          detectionOverlay.style.color = 'white';

          if (autoStartTimer) {
            clearTimeout(autoStartTimer);
            autoStartTimer = null;
            console.log('Auto-start cancelled (person lost)');
          }
        }
      },
      onFrame: (result) => {
        if (result.detected) {
          if (!autoStartTimer && !isKioskRunning) {
            detectionOverlay.textContent = 'Face Detected';
            detectionOverlay.style.color = '#4CAF50';
          }

          // Continuous update
          if (!isKioskRunning && result.age) {
            updateUI(result.age, result.detection?.confidence || 0);
          }
        } else {
          if (!isKioskRunning) {
            detectionOverlay.textContent = 'Searching for face...';
            detectionOverlay.style.color = 'white';
          }
        }
      }
    });
  }

  // Start Camera Handler
  startCameraBtn.addEventListener('click', async () => {
    try {
      startCameraBtn.disabled = true;
      startCameraBtn.textContent = 'Starting Camera...';

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
      });

      video.srcObject = stream;
      video.style.display = 'block';
      cameraPlaceholder.style.display = 'none';

      // Wait for video to be ready
      await new Promise<void>((resolve) => {
        if (video.readyState >= 2) {
          resolve();
        } else {
          video.onloadeddata = () => resolve();
        }
      });

      startCameraBtn.style.display = 'none';
      detectionOverlay.style.display = 'block';
      detectionOverlay.textContent = 'Starting detection...';

      startMonitoring();

    } catch (error) {
      console.error(error);
      alert('Failed to start camera: ' + error);
      startCameraBtn.disabled = false;
      startCameraBtn.textContent = 'Start Camera & Auto-Start Kiosk';
    }
  });

  function updateUI(age: any, confidence: number) {
    detectionResult.style.display = 'block';

    detectedAgeGroupEl.textContent = age.ageGroup;
    detectedDetailsEl.textContent = `Est. Age: ${age.estimatedAge} | Confidence: ${(confidence * 100).toFixed(1)}%`;

    // Highlight slow mode groups
    if (['CHILD', 'MIDDLE_AGED', 'SENIOR'].includes(age.ageGroup)) {
      detectedAgeGroupEl.style.color = '#FF5722';
      if (!detectedDetailsEl.innerHTML.includes('Slow Mode Active')) {
        detectedDetailsEl.innerHTML += ' <br><span style="color:#FF5722; font-weight:bold;">(Slow Mode Active)</span>';
      }
    } else {
      detectedAgeGroupEl.style.color = '#333';
    }
  }

  // Stop Kiosk Handler
  stopKioskBtn.addEventListener('click', () => {
    isKioskRunning = false;
    geminiClient.disconnect();
    audioRecorder.stop();

    stopKioskBtn.style.display = 'none';

    kioskStatus.textContent = 'Kiosk stopped.';
    addLog('System stopped.', 'system');

    // Reload page for clean restart
    if (confirm('Kiosk stopped. Reload page to restart detection?')) {
      window.location.reload();
    }
  });
}

main().catch(console.error);
