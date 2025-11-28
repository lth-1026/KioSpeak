// ============ Payment Method Types ============

export type PaymentMethod = 'CARD' | 'MOBILE';

// ============ Request/Response Types ============

export interface PaymentRequest {
  orderId: string;
  orderName: string;
  amount: number; // KRW 고정
  method: PaymentMethod;
}

export interface PaymentResult {
  success: boolean;
  transactionId: string;
  paidAt: string; // ISO 8601
  orderId: string;
  amount: number;
  method: PaymentMethod;
  failureReason?: string; // 실패 시에만
}

// ============ Mock Configuration Types ============

export type MockMode = 'alwaysSuccess' | 'randomFailure';

export interface MockPaymentConfig {
  mode: MockMode;
  failureRate?: number; // randomFailure 모드 시 (0.0 ~ 1.0), 기본 0.2
  delayMs?: number; // 응답 지연 시간 (ms), 기본 1000
}
