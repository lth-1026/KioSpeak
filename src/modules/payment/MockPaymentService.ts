import type { PaymentService } from './PaymentService';
import type {
  PaymentRequest,
  PaymentResult,
  MockPaymentConfig,
} from './types';

const DEFAULT_FAILURE_REASONS = [
  '카드 잔액 부족',
  '카드 유효기간 만료',
  '결제 한도 초과',
  '네트워크 오류',
  '카드사 승인 거부',
];

/**
 * Mock Payment Service for development and testing
 * Supports two modes:
 * - alwaysSuccess: Always returns successful payment
 * - randomFailure: Randomly fails based on failureRate
 */
export class MockPaymentService implements PaymentService {
  private config: Required<MockPaymentConfig>;

  constructor(config: MockPaymentConfig = { mode: 'alwaysSuccess' }) {
    this.config = {
      mode: config.mode,
      failureRate: config.failureRate ?? 0.2,
      delayMs: config.delayMs ?? 1000,
    };
  }

  async requestPayment(request: PaymentRequest): Promise<PaymentResult> {
    // 1. Simulate processing delay
    await this.delay(this.config.delayMs);

    // 2. Determine success/failure
    const shouldFail =
      this.config.mode === 'randomFailure' &&
      Math.random() < this.config.failureRate;

    // 3. Return result
    if (shouldFail) {
      return {
        success: false,
        transactionId: '',
        paidAt: '',
        orderId: request.orderId,
        amount: request.amount,
        method: request.method,
        failureReason: this.getRandomFailureReason(),
      };
    }

    return {
      success: true,
      transactionId: this.generateTransactionId(),
      paidAt: new Date().toISOString(),
      orderId: request.orderId,
      amount: request.amount,
      method: request.method,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private generateTransactionId(): string {
    return `txn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private getRandomFailureReason(): string {
    const index = Math.floor(Math.random() * DEFAULT_FAILURE_REASONS.length);
    return DEFAULT_FAILURE_REASONS[index];
  }
}
