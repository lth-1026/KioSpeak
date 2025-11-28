import type { PaymentRequest, PaymentResult } from './types';

/**
 * Payment Service Interface
 * 실제 PG 연동 시 이 인터페이스를 구현하여 교체 가능
 */
export interface PaymentService {
  requestPayment(request: PaymentRequest): Promise<PaymentResult>;
}
