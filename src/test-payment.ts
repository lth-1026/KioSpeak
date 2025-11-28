/**
 * KioSpeak Payment Test - MockPaymentService Tester
 */

import { MockPaymentService } from './modules/payment';
import type { MockMode, PaymentMethod, PaymentResult } from './modules/payment';

interface PaymentLog {
  timestamp: string;
  method: PaymentMethod;
  amount: number;
  result: PaymentResult;
}

let paymentService: MockPaymentService;
let paymentLogs: PaymentLog[] = [];

function createPaymentService(): MockPaymentService {
  const modeRadios = document.getElementsByName('mode') as NodeListOf<HTMLInputElement>;
  const selectedMode = Array.from(modeRadios).find(r => r.checked)?.value as MockMode || 'alwaysSuccess';

  const failureRateInput = document.getElementById('failure-rate') as HTMLInputElement;
  const delayInput = document.getElementById('delay') as HTMLInputElement;

  const failureRate = parseFloat(failureRateInput?.value || '0.2');
  const delayMs = parseInt(delayInput?.value || '500', 10);

  return new MockPaymentService({
    mode: selectedMode,
    failureRate,
    delayMs,
  });
}

function updateFailureRateVisibility() {
  const modeRadios = document.getElementsByName('mode') as NodeListOf<HTMLInputElement>;
  const selectedMode = Array.from(modeRadios).find(r => r.checked)?.value;
  const failureRateContainer = document.getElementById('failure-rate-container');

  if (failureRateContainer) {
    failureRateContainer.style.display = selectedMode === 'randomFailure' ? 'block' : 'none';
  }
}

function addLog(log: PaymentLog) {
  paymentLogs.unshift(log);
  renderLogs();
}

function renderLogs() {
  const logsContainer = document.getElementById('logs');
  if (!logsContainer) return;

  logsContainer.innerHTML = paymentLogs.map(log => `
    <div style="
      padding: 0.75rem;
      margin-bottom: 0.5rem;
      background: ${log.result.success ? '#e8f5e9' : '#ffebee'};
      border-radius: 4px;
      border-left: 4px solid ${log.result.success ? '#4caf50' : '#f44336'};
    ">
      <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
        <span style="font-weight: bold; color: ${log.result.success ? '#2e7d32' : '#c62828'};">
          ${log.result.success ? '✓ 성공' : '✗ 실패'}
        </span>
        <span style="color: #666; font-size: 0.85rem;">${log.timestamp}</span>
      </div>
      <div style="font-size: 0.9rem; color: #333;">
        <div><strong>결제 수단:</strong> ${log.method === 'CARD' ? '💳 카드' : '📱 모바일'}</div>
        <div><strong>금액:</strong> ${log.amount.toLocaleString()}원</div>
        ${log.result.success
          ? `<div><strong>거래번호:</strong> <code style="background: #fff; padding: 2px 6px; border-radius: 3px;">${log.result.transactionId}</code></div>
             <div><strong>결제시각:</strong> ${new Date(log.result.paidAt).toLocaleString()}</div>`
          : `<div><strong>실패 사유:</strong> ${log.result.failureReason}</div>`
        }
      </div>
    </div>
  `).join('');
}

async function processPayment(method: PaymentMethod) {
  const resultArea = document.getElementById('result-area');
  const payButton = document.querySelector(`button[data-method="${method}"]`) as HTMLButtonElement;

  if (payButton) {
    payButton.disabled = true;
    payButton.textContent = '처리 중...';
  }

  // Create new service with current settings
  paymentService = createPaymentService();

  const amountInput = document.getElementById('amount') as HTMLInputElement;
  const amount = parseInt(amountInput?.value || '15000', 10);

  try {
    const result = await paymentService.requestPayment({
      orderId: `order_${Date.now()}`,
      orderName: '테스트 주문',
      amount,
      method,
    });

    // Add to logs
    addLog({
      timestamp: new Date().toLocaleTimeString(),
      method,
      amount,
      result,
    });

    // Show result
    if (resultArea) {
      resultArea.innerHTML = `
        <div style="
          padding: 1.5rem;
          background: ${result.success ? '#e8f5e9' : '#ffebee'};
          border-radius: 8px;
          text-align: center;
        ">
          <div style="font-size: 3rem; margin-bottom: 0.5rem;">
            ${result.success ? '✅' : '❌'}
          </div>
          <div style="font-size: 1.5rem; font-weight: bold; color: ${result.success ? '#2e7d32' : '#c62828'};">
            ${result.success ? '결제 성공' : '결제 실패'}
          </div>
          ${result.success
            ? `<div style="margin-top: 1rem; color: #666;">
                 거래번호: ${result.transactionId}
               </div>`
            : `<div style="margin-top: 1rem; color: #c62828;">
                 사유: ${result.failureReason}
               </div>`
          }
        </div>
      `;
    }
  } catch (error) {
    if (resultArea) {
      resultArea.innerHTML = `
        <div style="padding: 1rem; background: #ffebee; border-radius: 8px; color: #c62828;">
          오류 발생: ${error instanceof Error ? error.message : String(error)}
        </div>
      `;
    }
  } finally {
    if (payButton) {
      payButton.disabled = false;
      payButton.textContent = method === 'CARD' ? '💳 카드 결제' : '📱 모바일 결제';
    }
  }
}

function main() {
  const app = document.getElementById('app');
  if (!app) {
    throw new Error('App container not found');
  }

  app.innerHTML = `
    <div style="padding: 2rem; max-width: 900px; margin: 0 auto;">
      <h1 style="margin-bottom: 0.5rem; text-align: center;">KioSpeak - Payment Test</h1>
      <p style="text-align: center; color: #666; margin-bottom: 2rem;">MockPaymentService 테스트 페이지</p>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
        <!-- Settings Panel -->
        <div style="background: #fff; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h2 style="margin-bottom: 1rem; font-size: 1.2rem;">⚙️ 설정</h2>

          <!-- Mode Selection -->
          <div style="margin-bottom: 1.5rem;">
            <label style="display: block; font-weight: bold; margin-bottom: 0.5rem;">모드 선택</label>
            <div style="display: flex; gap: 1rem;">
              <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                <input type="radio" name="mode" value="alwaysSuccess" checked>
                <span>항상 성공</span>
              </label>
              <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                <input type="radio" name="mode" value="randomFailure">
                <span>랜덤 실패</span>
              </label>
            </div>
          </div>

          <!-- Failure Rate (conditional) -->
          <div id="failure-rate-container" style="margin-bottom: 1.5rem; display: none;">
            <label style="display: block; font-weight: bold; margin-bottom: 0.5rem;">
              실패율: <span id="failure-rate-value">20%</span>
            </label>
            <input type="range" id="failure-rate" min="0" max="1" step="0.1" value="0.2"
              style="width: 100%;">
          </div>

          <!-- Delay -->
          <div style="margin-bottom: 1.5rem;">
            <label style="display: block; font-weight: bold; margin-bottom: 0.5rem;">응답 딜레이 (ms)</label>
            <input type="number" id="delay" value="500" min="0" max="5000" step="100"
              style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px;">
          </div>

          <!-- Amount -->
          <div style="margin-bottom: 1.5rem;">
            <label style="display: block; font-weight: bold; margin-bottom: 0.5rem;">결제 금액 (원)</label>
            <input type="number" id="amount" value="15000" min="1000" step="1000"
              style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px;">
          </div>

          <!-- Payment Buttons -->
          <div style="display: flex; gap: 1rem;">
            <button data-method="CARD" style="
              flex: 1;
              padding: 1rem;
              font-size: 1.1rem;
              background: #1976d2;
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              transition: background 0.2s;
            ">💳 카드 결제</button>
            <button data-method="MOBILE" style="
              flex: 1;
              padding: 1rem;
              font-size: 1.1rem;
              background: #7b1fa2;
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              transition: background 0.2s;
            ">📱 모바일 결제</button>
          </div>
        </div>

        <!-- Result Panel -->
        <div style="background: #fff; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h2 style="margin-bottom: 1rem; font-size: 1.2rem;">📋 결과</h2>
          <div id="result-area" style="
            min-height: 150px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #999;
            background: #f5f5f5;
            border-radius: 8px;
          ">
            결제 버튼을 클릭하세요
          </div>
        </div>
      </div>

      <!-- History Panel -->
      <div style="margin-top: 2rem; background: #fff; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h2 style="font-size: 1.2rem;">📜 결제 히스토리</h2>
          <button id="clear-logs" style="
            padding: 0.5rem 1rem;
            background: #f5f5f5;
            border: 1px solid #ddd;
            border-radius: 4px;
            cursor: pointer;
          ">초기화</button>
        </div>
        <div id="logs" style="max-height: 300px; overflow-y: auto;">
          <div style="text-align: center; color: #999; padding: 2rem;">
            아직 결제 기록이 없습니다
          </div>
        </div>
      </div>

      <p style="margin-top: 2rem; text-align: center;">
        <a href="/" style="color: #0066cc;">← Back to Home</a>
      </p>
    </div>
  `;

  // Event Listeners
  const modeRadios = document.getElementsByName('mode');
  modeRadios.forEach(radio => {
    radio.addEventListener('change', updateFailureRateVisibility);
  });

  const failureRateInput = document.getElementById('failure-rate');
  const failureRateValue = document.getElementById('failure-rate-value');
  failureRateInput?.addEventListener('input', (e) => {
    const value = (e.target as HTMLInputElement).value;
    if (failureRateValue) {
      failureRateValue.textContent = `${Math.round(parseFloat(value) * 100)}%`;
    }
  });

  const cardButton = document.querySelector('button[data-method="CARD"]');
  const mobileButton = document.querySelector('button[data-method="MOBILE"]');

  cardButton?.addEventListener('click', () => processPayment('CARD'));
  mobileButton?.addEventListener('click', () => processPayment('MOBILE'));

  const clearLogsButton = document.getElementById('clear-logs');
  clearLogsButton?.addEventListener('click', () => {
    paymentLogs = [];
    const logsContainer = document.getElementById('logs');
    if (logsContainer) {
      logsContainer.innerHTML = `
        <div style="text-align: center; color: #999; padding: 2rem;">
          아직 결제 기록이 없습니다
        </div>
      `;
    }
  });

  // Hover effects
  const buttons = document.querySelectorAll('button[data-method]');
  buttons.forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      (btn as HTMLElement).style.opacity = '0.9';
    });
    btn.addEventListener('mouseleave', () => {
      (btn as HTMLElement).style.opacity = '1';
    });
  });
}

main();
