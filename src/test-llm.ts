/**
 * KioSpeak LLM Test - Realtime Kiosk
 */

import { CartManager } from './modules/core/CartManager';
import { GeminiRealtimeClient } from './modules/llm/Realtime';
import { AudioRecorder } from './modules/audio/AudioRecorder';
import { StoreProfileModule } from './modules/store_profile';
import { AgeGroup } from './shared/types';

async function startKiosk(ageGroup?: AgeGroup) {
  // Initialize StoreProfileModule
  const storeProfile = new StoreProfileModule();
  await storeProfile.initialize();

  const cartManager = new CartManager(storeProfile);
  const geminiClient = new GeminiRealtimeClient(cartManager, storeProfile);
  const audioRecorder = new AudioRecorder();

  // Setup Logging
  geminiClient.on('log', (msg: string) => {
    const logs = document.getElementById('logs');
    const logContainer = document.getElementById('log-container');
    if (logs) {
      const div = document.createElement('div');
      div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
      div.style.marginBottom = '0.5rem';
      div.style.borderBottom = '1px solid #eee';
      logs.appendChild(div);
      if (logContainer) logContainer.scrollTop = logContainer.scrollHeight;
    }
  });

  // 1. 연결 시작
  geminiClient.connect('audio', ageGroup);

  // 2. 오디오 레코더 설정 및 시작
  audioRecorder.on('audio_data', (base64Audio) => {
    geminiClient.sendAudioChunk(base64Audio);
  });

  audioRecorder.on('speech_start', () => {
    console.log('User started speaking...');
    const logs = document.getElementById('logs');
    const logContainer = document.getElementById('log-container');
    if (logs) {
      const div = document.createElement('div');
      div.textContent = `[${new Date().toLocaleTimeString()}] 🎤 User started speaking...`;
      div.style.color = '#0066cc';
      div.style.marginBottom = '0.5rem';
      logs.appendChild(div);
      if (logContainer) logContainer.scrollTop = logContainer.scrollHeight;
    }
  });

  audioRecorder.on('speech_end', () => {
    console.log('User stopped speaking.');
    const logs = document.getElementById('logs');
    const logContainer = document.getElementById('log-container');
    if (logs) {
      const div = document.createElement('div');
      div.textContent = `[${new Date().toLocaleTimeString()}] 🤐 User stopped speaking.`;
      div.style.color = '#666';
      div.style.marginBottom = '0.5rem';
      div.style.borderBottom = '1px solid #eee';
      logs.appendChild(div);
      if (logContainer) logContainer.scrollTop = logContainer.scrollHeight;
    }
  });

  try {
    await audioRecorder.start();
    console.log('Microphone connected and listening.');
  } catch (error) {
    console.error('Failed to start microphone:', error);
    throw error;
  }

  // Return instances for external control
  return { geminiClient, audioRecorder, cartManager };
}

async function main() {
  console.log('🎤 KioSpeak LLM Test Starting...');

  const app = document.getElementById('app');
  if (!app) {
    throw new Error('App container not found');
  }

  // Store instances globally within main scope
  let kioskInstances: { geminiClient: GeminiRealtimeClient; audioRecorder: AudioRecorder; cartManager: CartManager } | null = null;

  // Initial UI Rendering
  app.innerHTML = `
    <div style="padding: 2rem; max-width: 800px; margin: 0 auto; text-align: center;">
      <h1 style="margin-bottom: 1rem;">KioSpeak - LLM Test</h1>
      <div id="status-area" style="margin: 2rem 0; padding: 1rem; background: #fff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <p style="color: #666; margin-bottom: 1rem;">Click Start to begin the kiosk experience</p>
        <button id="start-btn" style="
          background: #0066cc;
          color: white;
          border: none;
          padding: 1rem 2rem;
          font-size: 1.2rem;
          border-radius: 4px;
          cursor: pointer;
          transition: background 0.2s;
        ">Start Kiosk</button>
        
        <div style="margin-top: 1rem;">
          <label for="age-group-select" style="margin-right: 0.5rem; color: #666;">Simulate Age Group:</label>
          <select id="age-group-select" style="padding: 0.5rem; border-radius: 4px; border: 1px solid #ccc;">
            <option value="">Default (None)</option>
            <option value="CHILD">CHILD (Slow)</option>
            <option value="TEENAGER">TEENAGER</option>
            <option value="YOUNG_ADULT">YOUNG_ADULT</option>
            <option value="ADULT">ADULT</option>
            <option value="MIDDLE_AGED">MIDDLE_AGED (Slow)</option>
            <option value="SENIOR">SENIOR (Slow)</option>
          </select>
        </div>
        <button id="stop-btn" style="
          background: #cc0000;
          color: white;
          border: none;
          padding: 1rem 2rem;
          font-size: 1.2rem;
          border-radius: 4px;
          cursor: pointer;
          transition: background 0.2s;
          margin-left: 1rem;
          display: none;
        ">Stop Kiosk</button>
      </div>
      
      <div id="log-container" style="
        text-align: left;
        background: #f0f0f0;
        padding: 1rem;
        border-radius: 8px;
        height: 300px;
        overflow-y: auto;
        font-family: monospace;
        margin-bottom: 1rem;
        display: none;
      ">
        <div style="color: #888; border-bottom: 1px solid #ddd; padding-bottom: 0.5rem; margin-bottom: 0.5rem;">System Logs</div>
        <div id="logs"></div>
      </div>

      <div id="error-area" style="color: red; display: none;"></div>
      <p style="margin-top: 2rem;">
        <a href="/" style="color: #0066cc;">← Back to Home</a>
      </p>
    </div>
  `;

  const startBtn = document.getElementById('start-btn');
  const statusArea = document.getElementById('status-area');
  const errorArea = document.getElementById('error-area');
  const logContainer = document.getElementById('log-container');
  const logs = document.getElementById('logs');

  const addLog = (msg: string) => {
    if (logs) {
      const div = document.createElement('div');
      div.style.marginBottom = '0.5rem';
      div.style.borderBottom = '1px solid #eee';
      div.style.paddingBottom = '0.25rem';
      div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
      logs.appendChild(div);
      if (logContainer) logContainer.scrollTop = logContainer.scrollHeight;
    }
  };

  startBtn?.addEventListener('click', async () => {
    try {
      if (startBtn) (startBtn as HTMLButtonElement).disabled = true;
      if (startBtn) startBtn.textContent = 'Initializing...';

      const ageGroupSelect = document.getElementById('age-group-select') as HTMLSelectElement;
      const selectedAgeGroup = ageGroupSelect ? ageGroupSelect.value as AgeGroup : undefined;

      addLog(`Starting with Age Group: ${selectedAgeGroup || 'Default'}`);
      kioskInstances = await startKiosk(selectedAgeGroup);

      if (statusArea) {
        statusArea.innerHTML = `
          <div style="color: green; font-weight: bold;">
            <p>System Active</p>
            <p style="font-size: 0.9rem; color: #666; margin-top: 0.5rem;">Listening for orders...</p>
          </div>
          <button id="stop-btn" style="
            background: #cc0000;
            color: white;
            border: none;
            padding: 1rem 2rem;
            font-size: 1.2rem;
            border-radius: 4px;
            cursor: pointer;
            transition: background 0.2s;
            margin-top: 1rem;
          ">Stop Kiosk</button>
        `;

        // Re-attach stop button listener
        const newStopBtn = document.getElementById('stop-btn');
        newStopBtn?.addEventListener('click', stopKiosk);
      }
      if (logContainer) logContainer.style.display = 'block';
      addLog("System started. Microphone active.");

    } catch (error) {
      console.error('Failed to start:', error);
      if (startBtn) (startBtn as HTMLButtonElement).disabled = false;
      if (startBtn) startBtn.textContent = 'Retry Start';
      if (errorArea) {
        errorArea.style.display = 'block';
        errorArea.textContent = `Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  });

  const stopKiosk = () => {
    if (kioskInstances) {
      addLog("Stopping system...");
      kioskInstances.geminiClient.disconnect();
      kioskInstances.audioRecorder.stop();
      kioskInstances = null;

      if (statusArea) {
        statusArea.innerHTML = `
          <p style="color: #666; margin-bottom: 1rem;">System stopped. Click Start to begin again.</p>
          <button id="start-btn" style="
            background: #0066cc;
            color: white;
            border: none;
            padding: 1rem 2rem;
            font-size: 1.2rem;
            border-radius: 4px;
            cursor: pointer;
            transition: background 0.2s;
          ">Start Kiosk</button>
        `;

        // Re-attach start button listener
        const newStartBtn = document.getElementById('start-btn');
        newStartBtn?.addEventListener('click', async () => {
          // Reload page for clean restart
          window.location.reload();
        });
      }
      addLog("✅ System stopped successfully.");
    }
  };
}

main().catch(console.error);
