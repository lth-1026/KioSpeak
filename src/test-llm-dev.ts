/**
 * KioSpeak LLM Dev Test - 통합 테스트 페이지
 * 음성/텍스트 모드 전환 가능, Tool Call 과정 실시간 확인
 */

import { CartManager } from './modules/core/CartManager';
import { GeminiRealtimeClient, ConnectionMode } from './modules/llm/Realtime';
import { AudioRecorder } from './modules/audio/AudioRecorder';
import { StoreProfileModule } from './modules/store_profile';

// ============================================
// 타입 정의
// ============================================

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

interface ToolCallLog {
  timestamp: Date;
  name: string;
  args: Record<string, unknown>;
  result: string;
}

interface PaymentResult {
  success: boolean;
  transactionId?: string;
  reason?: string;
}

// ============================================
// 상태 관리
// ============================================

let geminiClient: GeminiRealtimeClient | null = null;
let cartManager: CartManager | null = null;
let storeProfile: StoreProfileModule | null = null;
let audioRecorder: AudioRecorder | null = null;

let currentMode: ConnectionMode = 'text';
let chatHistory: ChatMessage[] = [];
let toolCallLogs: ToolCallLog[] = [];
let lastPaymentResult: PaymentResult | null = null;
let isConnected = false;
let isRecording = false;

// Transcription 누적용
let currentStreamingText: string = '';
let streamingMessageIndex: number = -1;

// ============================================
// 초기화 함수
// ============================================

async function initializeModules(): Promise<void> {
  // 1. StoreProfileModule 초기화
  storeProfile = new StoreProfileModule();
  await storeProfile.initialize();
  addSystemMessage('Store profile loaded');

  // 2. CartManager 초기화
  cartManager = new CartManager(storeProfile);
  addSystemMessage('Cart manager ready');

  // 3. AudioRecorder 초기화 (음성 모드용)
  audioRecorder = new AudioRecorder();
}

async function connectGemini(): Promise<void> {
  if (!cartManager || !storeProfile) {
    throw new Error('Modules not initialized');
  }

  // 기존 연결 해제
  if (geminiClient) {
    geminiClient.disconnect();
    geminiClient.removeAllListeners();
  }

  // 새 클라이언트 생성
  geminiClient = new GeminiRealtimeClient(cartManager, storeProfile);
  setupGeminiEventListeners();

  // 연결 (현재 모드로)
  await geminiClient.connect(currentMode);
  isConnected = true;

  // 음성 모드면 오디오 레코더 연결
  if (currentMode === 'audio' && audioRecorder) {
    setupAudioRecorder();
  }

  updateUI();
}

function setupGeminiEventListeners(): void {
  if (!geminiClient) return;

  // 시스템 로그
  geminiClient.on('log', (msg: string) => {
    console.log(`[Log] ${msg}`);
  });

  // 사용자 메시지 (텍스트 모드에서 sendTextMessage 호출 시)
  geminiClient.on('user_message', (text: string) => {
    addChatMessage('user', text);
    updateUI();
  });

  // 어시스턴트 텍스트 응답 (단어 단위로 옴 → 누적)
  geminiClient.on('text_response', (text: string) => {
    currentStreamingText += text;
    updateStreamingMessage(currentStreamingText);
  });

  // 턴 완료 시 메시지 확정
  geminiClient.on('turn_complete', () => {
    if (currentStreamingText) {
      finalizeStreamingMessage();
    }
  });

  // Tool Call
  geminiClient.on('tool_call', (data: { name: string; args: Record<string, unknown>; result: string }) => {
    toolCallLogs.push({
      timestamp: new Date(),
      name: data.name,
      args: data.args,
      result: data.result,
    });
    updateUI();
  });

  // 결제 결과
  geminiClient.on('payment', (result: PaymentResult) => {
    lastPaymentResult = result;
    updateUI();
  });
}

function setupAudioRecorder(): void {
  if (!audioRecorder || !geminiClient) return;

  audioRecorder.removeAllListeners();

  audioRecorder.on('audio_data', (base64Audio: string) => {
    geminiClient?.sendAudioChunk(base64Audio);
  });

  audioRecorder.on('speech_start', () => {
    console.log('User started speaking...');
    addSystemMessage('🎤 Speaking...');
    updateUI();
  });

  audioRecorder.on('speech_end', () => {
    console.log('User stopped speaking.');
  });
}

// ============================================
// 채팅 관리
// ============================================

function addChatMessage(role: 'user' | 'assistant', content: string): void {
  chatHistory.push({
    role,
    content,
    timestamp: new Date(),
  });
}

function addSystemMessage(content: string): void {
  chatHistory.push({
    role: 'system',
    content,
    timestamp: new Date(),
  });
}

// Streaming 메시지 업데이트 (실시간)
function updateStreamingMessage(text: string): void {
  if (streamingMessageIndex === -1) {
    // 새 streaming 메시지 생성
    streamingMessageIndex = chatHistory.length;
    chatHistory.push({
      role: 'assistant',
      content: text,
      timestamp: new Date(),
    });
  } else {
    // 기존 메시지 내용 업데이트
    chatHistory[streamingMessageIndex].content = text;
  }
  updateUI();
}

// Streaming 메시지 확정
function finalizeStreamingMessage(): void {
  // 이미 chatHistory에 있으므로 인덱스만 리셋
  streamingMessageIndex = -1;
  currentStreamingText = '';
  updateUI();
}

// ============================================
// 메시지 전송
// ============================================

function handleSendMessage(): void {
  const input = document.getElementById('message-input') as HTMLInputElement;
  const text = input.value.trim();

  if (!text) return;
  if (!geminiClient || !isConnected) {
    alert('먼저 연결하세요.');
    return;
  }

  // 텍스트 입력 시 현재 재생 중인 오디오 중단 (barge-in)
  geminiClient.stopAudio();

  // 미완성 streaming 메시지 버림
  if (currentStreamingText) {
    currentStreamingText = '';
    streamingMessageIndex = -1;
  }

  geminiClient.sendTextMessage(text);
  input.value = '';
}

// ============================================
// 음성 녹음 제어
// ============================================

async function startRecording(): Promise<void> {
  if (!audioRecorder || currentMode !== 'audio') return;

  try {
    await audioRecorder.start();
    isRecording = true;
    addSystemMessage('🎤 Microphone active');
    updateUI();
  } catch (error) {
    console.error('Failed to start recording:', error);
    addSystemMessage(`❌ Microphone error: ${error instanceof Error ? error.message : String(error)}`);
    updateUI();
  }
}

function stopRecording(): void {
  if (!audioRecorder) return;

  audioRecorder.stop();
  isRecording = false;
  addSystemMessage('🔇 Microphone stopped');
  updateUI();
}

// ============================================
// 연결 관리
// ============================================

async function handleConnect(): Promise<void> {
  try {
    updateConnectionStatus('connecting');

    if (!storeProfile) {
      await initializeModules();
    }

    await connectGemini();
    updateConnectionStatus('connected');
    addSystemMessage(`Connected (${currentMode} mode)`);

    // 음성 모드면 자동으로 녹음 시작
    if (currentMode === 'audio') {
      await startRecording();
    }

    updateUI();
  } catch (error) {
    console.error('Connection failed:', error);
    updateConnectionStatus('error');
    addSystemMessage(`❌ Connection error: ${error instanceof Error ? error.message : String(error)}`);
    updateUI();
  }
}

function handleDisconnect(): void {
  if (audioRecorder && isRecording) {
    stopRecording();
  }

  if (geminiClient) {
    geminiClient.disconnect();
    geminiClient.removeAllListeners();
    geminiClient = null;
    isConnected = false;
    updateConnectionStatus('disconnected');
    addSystemMessage('Disconnected');
    updateUI();
  }
}

async function handleModeChange(newMode: ConnectionMode): Promise<void> {
  if (newMode === currentMode) return;

  const wasConnected = isConnected;

  // 연결 중이면 끊기
  if (isConnected) {
    handleDisconnect();
  }

  currentMode = newMode;
  addSystemMessage(`Mode changed to ${newMode}`);
  updateUI();

  // 연결 중이었으면 새 모드로 재연결
  if (wasConnected) {
    await handleConnect();
  }
}

function updateConnectionStatus(status: 'disconnected' | 'connecting' | 'connected' | 'error'): void {
  const statusEl = document.getElementById('connection-status');
  const connectBtn = document.getElementById('connect-btn') as HTMLButtonElement;
  const disconnectBtn = document.getElementById('disconnect-btn') as HTMLButtonElement;
  const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
  const input = document.getElementById('message-input') as HTMLInputElement;
  const recordBtn = document.getElementById('record-btn') as HTMLButtonElement;

  if (!statusEl) return;

  const statusConfig = {
    disconnected: { text: '연결 끊김', color: '#999', emoji: '⚪' },
    connecting: { text: '연결 중...', color: '#ff9800', emoji: '🟡' },
    connected: { text: '연결됨', color: '#4caf50', emoji: '🟢' },
    error: { text: '오류', color: '#f44336', emoji: '🔴' },
  };

  const config = statusConfig[status];
  statusEl.innerHTML = `${config.emoji} ${config.text}`;
  statusEl.style.color = config.color;

  if (connectBtn) connectBtn.disabled = status === 'connecting' || status === 'connected';
  if (disconnectBtn) disconnectBtn.disabled = status !== 'connected';
  if (sendBtn) sendBtn.disabled = status !== 'connected' || currentMode !== 'text';
  if (input) input.disabled = status !== 'connected' || currentMode !== 'text';
  if (recordBtn) recordBtn.disabled = status !== 'connected' || currentMode !== 'audio';
}

// ============================================
// UI 렌더링
// ============================================

function updateUI(): void {
  renderChatHistory();
  renderCartPanel();
  renderToolCallLogs();
  renderPaymentResult();
  updateModeUI();
}

function updateModeUI(): void {
  const textModeBtn = document.getElementById('text-mode-btn');
  const audioModeBtn = document.getElementById('audio-mode-btn');
  const textInputArea = document.getElementById('text-input-area');
  const audioInputArea = document.getElementById('audio-input-area');

  if (textModeBtn && audioModeBtn) {
    textModeBtn.className = currentMode === 'text' ? 'mode-btn active' : 'mode-btn';
    audioModeBtn.className = currentMode === 'audio' ? 'mode-btn active' : 'mode-btn';
  }

  if (textInputArea) {
    textInputArea.style.display = currentMode === 'text' ? 'flex' : 'none';
  }
  if (audioInputArea) {
    audioInputArea.style.display = currentMode === 'audio' ? 'flex' : 'none';
  }

  // 녹음 버튼 상태
  const recordBtn = document.getElementById('record-btn') as HTMLButtonElement;
  const stopRecordBtn = document.getElementById('stop-record-btn') as HTMLButtonElement;
  if (recordBtn && stopRecordBtn) {
    recordBtn.style.display = isRecording ? 'none' : 'inline-block';
    stopRecordBtn.style.display = isRecording ? 'inline-block' : 'none';
  }
}

function renderMainUI(): void {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <style>
      .mode-btn {
        padding: 0.5rem 1rem;
        border: 2px solid #ddd;
        background: #fff;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.9rem;
        transition: all 0.2s;
      }
      .mode-btn:hover {
        border-color: #1976d2;
      }
      .mode-btn.active {
        background: #1976d2;
        color: white;
        border-color: #1976d2;
      }
      .panel {
        background: #fff;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      .panel-header {
        padding: 0.75rem 1rem;
        border-bottom: 1px solid #eee;
        font-weight: bold;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .btn-primary {
        padding: 0.5rem 1.5rem;
        background: #4caf50;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 1rem;
      }
      .btn-primary:disabled {
        background: #ccc;
        cursor: not-allowed;
      }
      .btn-danger {
        padding: 0.5rem 1.5rem;
        background: #f44336;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 1rem;
      }
      .btn-danger:disabled {
        background: #ccc;
        cursor: not-allowed;
      }
      .btn-blue {
        padding: 0.75rem 1.5rem;
        background: #1976d2;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 1rem;
      }
      .btn-blue:disabled {
        background: #ccc;
        cursor: not-allowed;
      }
    </style>

    <div style="padding: 1rem; max-width: 1200px; margin: 0 auto;">
      <!-- Header -->
      <div style="text-align: center; margin-bottom: 1rem;">
        <h1 style="margin-bottom: 0.5rem;">KioSpeak - LLM Dev Test</h1>
        <p style="color: #666; margin-bottom: 0.75rem;">음성/텍스트 모드 전환 가능한 통합 테스트</p>

        <!-- Mode Selector -->
        <div style="display: flex; justify-content: center; gap: 0.5rem; margin-bottom: 0.75rem;">
          <button id="text-mode-btn" class="mode-btn active">💬 텍스트</button>
          <button id="audio-mode-btn" class="mode-btn">🎤 음성</button>
        </div>

        <div id="connection-status" style="font-weight: bold; margin-bottom: 0.5rem;">
          ⚪ 연결 끊김
        </div>

        <!-- Connection Buttons -->
        <div style="display: flex; justify-content: center; gap: 0.5rem;">
          <button id="connect-btn" class="btn-primary">연결</button>
          <button id="disconnect-btn" class="btn-danger" disabled>연결 해제</button>
        </div>
      </div>

      <!-- Main Content Grid -->
      <div style="display: grid; grid-template-columns: 1fr 320px; gap: 1rem;">
        <!-- Left: Chat Area -->
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          <!-- Chat History -->
          <div class="panel" style="flex: 1; display: flex; flex-direction: column;">
            <div class="panel-header">
              💬 대화
              <span style="font-size: 0.8rem; color: #666;">${chatHistory.length}개 메시지</span>
            </div>
            <div id="chat-history" style="
              flex: 1;
              padding: 1rem;
              overflow-y: auto;
              height: 350px;
            "></div>
          </div>

          <!-- Text Input Area -->
          <div id="text-input-area" class="panel" style="padding: 1rem; display: flex; gap: 0.5rem;">
            <input
              type="text"
              id="message-input"
              placeholder="메시지를 입력하세요... (예: 불고기 버거 주세요)"
              disabled
              style="
                flex: 1;
                padding: 0.75rem 1rem;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 1rem;
              "
            />
            <button id="send-btn" class="btn-blue" disabled>전송</button>
          </div>

          <!-- Audio Input Area -->
          <div id="audio-input-area" class="panel" style="padding: 1rem; display: none; gap: 0.5rem; align-items: center; justify-content: center;">
            <button id="record-btn" class="btn-primary" disabled style="padding: 1rem 2rem;">
              🎤 녹음 시작
            </button>
            <button id="stop-record-btn" class="btn-danger" style="padding: 1rem 2rem; display: none;">
              ⏹️ 녹음 중지
            </button>
            <span id="recording-status" style="margin-left: 1rem; color: #666;"></span>
          </div>
        </div>

        <!-- Right: Info Panels -->
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          <!-- Cart Panel -->
          <div id="cart-panel" class="panel"></div>

          <!-- Tool Call Logs -->
          <div class="panel">
            <div class="panel-header">
              🛠️ Tool Calls
              <span style="font-size: 0.8rem; color: #666;">${toolCallLogs.length}개</span>
            </div>
            <div id="tool-logs" style="
              padding: 0.75rem;
              max-height: 180px;
              overflow-y: auto;
            "></div>
          </div>

          <!-- Payment Result -->
          <div id="payment-result" class="panel"></div>
        </div>
      </div>

      <!-- Footer -->
      <p style="margin-top: 1.5rem; text-align: center; font-size: 0.9rem;">
        <a href="/" style="color: #0066cc;">← Home</a>
        <span style="margin: 0 0.75rem; color: #ccc;">|</span>
        <a href="/test-llm.html" style="color: #0066cc;">기존 음성 테스트</a>
        <span style="margin: 0 0.75rem; color: #ccc;">|</span>
        <a href="/test-payment.html" style="color: #0066cc;">결제 테스트</a>
      </p>
    </div>
  `;

  // 이벤트 리스너 설정
  document.getElementById('connect-btn')?.addEventListener('click', handleConnect);
  document.getElementById('disconnect-btn')?.addEventListener('click', handleDisconnect);
  document.getElementById('send-btn')?.addEventListener('click', handleSendMessage);
  document.getElementById('message-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSendMessage();
  });

  // 모드 전환 버튼
  document.getElementById('text-mode-btn')?.addEventListener('click', () => handleModeChange('text'));
  document.getElementById('audio-mode-btn')?.addEventListener('click', () => handleModeChange('audio'));

  // 녹음 버튼
  document.getElementById('record-btn')?.addEventListener('click', startRecording);
  document.getElementById('stop-record-btn')?.addEventListener('click', stopRecording);

  // 초기 UI 상태
  renderCartPanel();
  renderToolCallLogs();
  renderPaymentResult();
}

function renderChatHistory(): void {
  const container = document.getElementById('chat-history');
  if (!container) return;

  if (chatHistory.length === 0) {
    container.innerHTML = '<div style="color: #999; text-align: center; padding: 2rem;">대화를 시작하세요</div>';
    return;
  }

  container.innerHTML = chatHistory.map(msg => {
    if (msg.role === 'system') {
      return `
        <div style="text-align: center; margin: 0.5rem 0; color: #999; font-size: 0.8rem;">
          --- ${escapeHtml(msg.content)} ---
        </div>
      `;
    }

    const isUser = msg.role === 'user';
    return `
      <div style="display: flex; justify-content: ${isUser ? 'flex-end' : 'flex-start'}; margin-bottom: 0.75rem;">
        <div style="
          max-width: 85%;
          padding: 0.75rem 1rem;
          background: ${isUser ? '#e3f2fd' : '#f5f5f5'};
          border-radius: 12px;
          ${isUser ? 'border-bottom-right-radius: 4px;' : 'border-bottom-left-radius: 4px;'}
        ">
          <div style="font-size: 0.7rem; color: #666; margin-bottom: 0.25rem;">
            ${isUser ? '👤 You' : '🤖 Kiosk'} - ${formatTime(msg.timestamp)}
          </div>
          <div style="color: #333; white-space: pre-wrap; word-break: break-word;">${escapeHtml(msg.content)}</div>
        </div>
      </div>
    `;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

function renderCartPanel(): void {
  const container = document.getElementById('cart-panel');
  if (!container) return;

  const cart = cartManager?.getCart() || [];
  const total = cartManager?.getTotal() || 0;

  container.innerHTML = `
    <div class="panel-header">
      🛒 장바구니
      <span style="font-size: 0.8rem; color: #666;">${cart.length}개</span>
    </div>
    <div style="padding: 0.75rem;">
      ${cart.length === 0
        ? '<div style="color: #999; text-align: center; padding: 1rem; font-size: 0.9rem;">비어있음</div>'
        : cart.map(item => `
            <div style="padding: 0.5rem 0; border-bottom: 1px solid #eee;">
              <div style="font-weight: bold; font-size: 0.9rem;">${escapeHtml(item.menuName)} x${item.quantity}</div>
              <div style="font-size: 0.8rem; color: #666;">
                ${item.price.toLocaleString()}원
                ${item.options.length > 0 ? `/ ${item.options.join(', ')}` : ''}
              </div>
            </div>
          `).join('')
      }
      <div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 2px solid #333; font-weight: bold; display: flex; justify-content: space-between; font-size: 0.95rem;">
        <span>총액</span>
        <span>${total.toLocaleString()}원</span>
      </div>
    </div>
  `;
}

function renderToolCallLogs(): void {
  const container = document.getElementById('tool-logs');
  if (!container) return;

  if (toolCallLogs.length === 0) {
    container.innerHTML = '<div style="color: #999; text-align: center; font-size: 0.85rem;">아직 Tool Call 없음</div>';
    return;
  }

  container.innerHTML = toolCallLogs.slice(-8).reverse().map(log => `
    <div style="
      padding: 0.5rem;
      margin-bottom: 0.5rem;
      background: #fff3e0;
      border-radius: 4px;
      border-left: 3px solid #ff9800;
      font-size: 0.8rem;
    ">
      <div style="font-weight: bold; color: #e65100;">
        ${log.name}
      </div>
      <div style="color: #666; font-family: monospace; font-size: 0.7rem; word-break: break-all; margin-top: 0.25rem;">
        ${JSON.stringify(log.args)}
      </div>
      <div style="color: #2e7d32; margin-top: 0.25rem; font-size: 0.75rem;">
        → ${escapeHtml(log.result)}
      </div>
    </div>
  `).join('');
}

function renderPaymentResult(): void {
  const container = document.getElementById('payment-result');
  if (!container) return;

  if (!lastPaymentResult) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  container.innerHTML = `
    <div class="panel-header">
      💳 결제 결과
    </div>
    <div style="
      padding: 1rem;
      text-align: center;
      background: ${lastPaymentResult.success ? '#e8f5e9' : '#ffebee'};
      border-radius: 0 0 8px 8px;
    ">
      <div style="font-size: 1.5rem; margin-bottom: 0.25rem;">
        ${lastPaymentResult.success ? '✅' : '❌'}
      </div>
      <div style="font-size: 1rem; font-weight: bold; color: ${lastPaymentResult.success ? '#2e7d32' : '#c62828'};">
        ${lastPaymentResult.success ? '결제 성공' : '결제 실패'}
      </div>
      ${lastPaymentResult.success
        ? `<div style="margin-top: 0.25rem; color: #666; font-size: 0.8rem;">거래번호: ${lastPaymentResult.transactionId}</div>`
        : `<div style="margin-top: 0.25rem; color: #c62828; font-size: 0.8rem;">사유: ${lastPaymentResult.reason}</div>`
      }
    </div>
  `;
}

// ============================================
// 유틸리티 함수
// ============================================

function formatTime(date: Date): string {
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// 메인 함수
// ============================================

function main(): void {
  console.log('🎤 KioSpeak LLM Dev Test Starting...');
  renderMainUI();
}

main();
