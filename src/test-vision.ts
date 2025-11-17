/**
 * Vision Module Test - Standalone test for face detection and age estimation
 */

import { VisionModule } from '@/modules/vision';

async function main() {
  console.log('🧪 Vision Module Test Starting...');

  const app = document.getElementById('app');
  if (!app) {
    throw new Error('App container not found');
  }

  // Create UI
  app.innerHTML = `
    <div style="padding: 2rem; max-width: 800px; margin: 0 auto;">
      <h1 style="margin-bottom: 1rem;">Vision Module Test</h1>

      <div style="margin-bottom: 1rem;">
        <video id="webcam" autoplay playsinline style="width: 100%; max-width: 640px; border: 2px solid #ccc; border-radius: 8px;"></video>
      </div>

      <div style="margin-bottom: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
        <button id="startCameraBtn" style="padding: 0.5rem 1rem; font-size: 1rem; cursor: pointer;">Start Camera</button>
        <div style="width: 100%; height: 1px; background: #ddd; margin: 0.5rem 0;"></div>
        <button id="analyzeBtn" style="padding: 0.5rem 1rem; font-size: 1rem; cursor: pointer; background: #4CAF50; color: white; border: none; border-radius: 4px;" disabled>📸 Analyze Frame (Manual)</button>
        <div style="width: 100%; height: 1px; background: #ddd; margin: 0.5rem 0;"></div>
        <button id="startMonitoringBtn" style="padding: 0.5rem 1rem; font-size: 1rem; cursor: pointer; background: #2196F3; color: white; border: none; border-radius: 4px;" disabled>▶️ Start Auto-Detection</button>
        <button id="stopMonitoringBtn" style="padding: 0.5rem 1rem; font-size: 1rem; cursor: pointer; background: #f44336; color: white; border: none; border-radius: 4px;" disabled>⏸️ Stop Auto-Detection</button>
      </div>

      <div id="status" style="padding: 1rem; background: #f0f0f0; border-radius: 8px; margin-bottom: 1rem;">
        <strong>Status:</strong> <span id="statusText">Initializing...</span>
      </div>

      <div id="result" style="padding: 1rem; background: #e8f4f8; border-radius: 8px; display: none;">
        <h3>Detection Result:</h3>
        <pre id="resultText" style="white-space: pre-wrap; font-family: monospace; font-size: 0.9rem;"></pre>
      </div>
    </div>
  `;

  const video = document.getElementById('webcam') as HTMLVideoElement;
  const startCameraBtn = document.getElementById('startCameraBtn') as HTMLButtonElement;
  const analyzeBtn = document.getElementById('analyzeBtn') as HTMLButtonElement;
  const startMonitoringBtn = document.getElementById('startMonitoringBtn') as HTMLButtonElement;
  const stopMonitoringBtn = document.getElementById('stopMonitoringBtn') as HTMLButtonElement;
  const statusText = document.getElementById('statusText') as HTMLSpanElement;
  const resultDiv = document.getElementById('result') as HTMLDivElement;
  const resultText = document.getElementById('resultText') as HTMLPreElement;

  // Initialize Vision Module
  const visionModule = new VisionModule({
    modelPath: '/models',
    minConfidence: 0.5,
  });

  try {
    statusText.textContent = 'Loading face detection models...';
    await visionModule.initialize();
    statusText.textContent = 'Ready! Click "Start Camera" to begin.';
  } catch (error) {
    statusText.textContent = `Error: ${error}`;
    console.error('Failed to initialize:', error);
    return;
  }

  // Start camera
  startCameraBtn.addEventListener('click', async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
      });
      video.srcObject = stream;
      startCameraBtn.disabled = true;
      analyzeBtn.disabled = false;
      startMonitoringBtn.disabled = false;
      statusText.textContent = 'Camera started. Choose a mode: Manual or Auto-Detection.';
    } catch (error) {
      statusText.textContent = `Camera error: ${error}`;
      console.error('Camera error:', error);
    }
  });

  // Manual analyze
  analyzeBtn.addEventListener('click', async () => {
    try {
      analyzeBtn.disabled = true;
      statusText.textContent = 'Analyzing current frame...';

      const result = await visionModule.analyzeFrame(video);

      resultDiv.style.display = 'block';
      resultText.textContent = JSON.stringify(result, null, 2);

      if (result.detected && result.age) {
        statusText.textContent = `✅ Detected: ${result.age.ageGroup} (Age: ~${result.age.estimatedAge})`;
      } else {
        statusText.textContent = '❌ No face detected or confidence too low';
      }
    } catch (error) {
      statusText.textContent = `Analysis error: ${error}`;
      console.error('Analysis error:', error);
    } finally {
      analyzeBtn.disabled = false;
    }
  });

  // Start monitoring
  startMonitoringBtn.addEventListener('click', () => {
    statusText.textContent = '🔄 Auto-Detection active... Waiting for person...';
    startMonitoringBtn.disabled = true;
    stopMonitoringBtn.disabled = false;
    analyzeBtn.disabled = true; // Disable manual mode during monitoring

    visionModule.startMonitoring(video, {
      onPersonDetected: (event) => {
        console.log('👤 Person detected!', event);
        resultDiv.style.display = 'block';
        resultText.textContent = JSON.stringify(event, null, 2);

        if (event.age) {
          statusText.textContent = `🎉 Person detected! Age Group: ${event.age.ageGroup} (~${event.age.estimatedAge} years old)`;
        } else {
          statusText.textContent = '🎉 Person detected!';
        }
      },

      onPersonLost: () => {
        console.log('👋 Person lost');
        statusText.textContent = '🔄 Auto-Detection active... Waiting for person...';
      },

      onFrame: (result) => {
        // Optional: update UI every frame
        if (!result.detected) {
          resultDiv.style.display = 'none';
        }
      },
    });
  });

  // Stop monitoring
  stopMonitoringBtn.addEventListener('click', () => {
    visionModule.stopMonitoring();
    startMonitoringBtn.disabled = false;
    stopMonitoringBtn.disabled = true;
    analyzeBtn.disabled = false; // Re-enable manual mode
    statusText.textContent = '⏸️ Auto-Detection stopped. Choose a mode.';
    resultDiv.style.display = 'none';
  });
}

main().catch(console.error);
