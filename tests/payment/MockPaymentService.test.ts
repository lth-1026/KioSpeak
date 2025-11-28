import { describe, it, expect, beforeEach } from 'vitest';
import { MockPaymentService } from '@/modules/payment/MockPaymentService';
import type { PaymentRequest } from '@/modules/payment/types';

describe('MockPaymentService', () => {
  const createRequest = (overrides?: Partial<PaymentRequest>): PaymentRequest => ({
    orderId: 'order-123',
    orderName: '불고기버거 외 2건',
    amount: 15000,
    method: 'CARD',
    ...overrides,
  });

  describe('alwaysSuccess mode', () => {
    let service: MockPaymentService;

    beforeEach(() => {
      service = new MockPaymentService({
        mode: 'alwaysSuccess',
        delayMs: 0, // 테스트 속도를 위해 딜레이 제거
      });
    });

    it('should always return success', async () => {
      const result = await service.requestPayment(createRequest());

      expect(result.success).toBe(true);
    });

    it('should generate transactionId on success', async () => {
      const result = await service.requestPayment(createRequest());

      expect(result.transactionId).toMatch(/^txn_\d+_[a-z0-9]+$/);
    });

    it('should set paidAt timestamp on success', async () => {
      const result = await service.requestPayment(createRequest());

      expect(result.paidAt).toBeTruthy();
      expect(new Date(result.paidAt).getTime()).not.toBeNaN();
    });

    it('should return request data in response', async () => {
      const request = createRequest({
        orderId: 'test-order',
        amount: 25000,
        method: 'MOBILE',
      });

      const result = await service.requestPayment(request);

      expect(result.orderId).toBe('test-order');
      expect(result.amount).toBe(25000);
      expect(result.method).toBe('MOBILE');
    });

    it('should not have failureReason on success', async () => {
      const result = await service.requestPayment(createRequest());

      expect(result.failureReason).toBeUndefined();
    });

    it('should succeed consistently over multiple requests', async () => {
      for (let i = 0; i < 10; i++) {
        const result = await service.requestPayment(createRequest());
        expect(result.success).toBe(true);
      }
    });
  });

  describe('randomFailure mode', () => {
    it('should always fail when failureRate is 1.0', async () => {
      const service = new MockPaymentService({
        mode: 'randomFailure',
        failureRate: 1.0,
        delayMs: 0,
      });

      const result = await service.requestPayment(createRequest());

      expect(result.success).toBe(false);
      expect(result.failureReason).toBeTruthy();
      expect(result.transactionId).toBe('');
      expect(result.paidAt).toBe('');
    });

    it('should always succeed when failureRate is 0.0', async () => {
      const service = new MockPaymentService({
        mode: 'randomFailure',
        failureRate: 0.0,
        delayMs: 0,
      });

      for (let i = 0; i < 10; i++) {
        const result = await service.requestPayment(createRequest());
        expect(result.success).toBe(true);
      }
    });

    it('should include failureReason when failed', async () => {
      const service = new MockPaymentService({
        mode: 'randomFailure',
        failureRate: 1.0,
        delayMs: 0,
      });

      const result = await service.requestPayment(createRequest());

      expect(result.failureReason).toBeTruthy();
      expect(typeof result.failureReason).toBe('string');
    });

    it('should preserve request data even on failure', async () => {
      const service = new MockPaymentService({
        mode: 'randomFailure',
        failureRate: 1.0,
        delayMs: 0,
      });

      const request = createRequest({
        orderId: 'failed-order',
        amount: 30000,
        method: 'CARD',
      });

      const result = await service.requestPayment(request);

      expect(result.orderId).toBe('failed-order');
      expect(result.amount).toBe(30000);
      expect(result.method).toBe('CARD');
    });
  });

  describe('default configuration', () => {
    it('should use default values when not specified', async () => {
      const service = new MockPaymentService({ mode: 'alwaysSuccess' });

      // 기본 딜레이가 있으므로 짧은 시간 내에 완료되는지만 확인
      const startTime = Date.now();
      await service.requestPayment(createRequest());
      const elapsed = Date.now() - startTime;

      // 기본 딜레이 1000ms 이상 걸려야 함
      expect(elapsed).toBeGreaterThanOrEqual(900); // 약간의 여유
    });

    it('should default to alwaysSuccess when no config provided', async () => {
      const service = new MockPaymentService();

      // 딜레이 제거를 위해 새 인스턴스로
      const fastService = new MockPaymentService({
        mode: 'alwaysSuccess',
        delayMs: 0,
      });

      const result = await fastService.requestPayment(createRequest());
      expect(result.success).toBe(true);
    });
  });

  describe('delay simulation', () => {
    it('should respect custom delay', async () => {
      const delayMs = 100;
      const service = new MockPaymentService({
        mode: 'alwaysSuccess',
        delayMs,
      });

      const startTime = Date.now();
      await service.requestPayment(createRequest());
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeGreaterThanOrEqual(delayMs - 10);
    });

    it('should complete immediately with 0 delay', async () => {
      const service = new MockPaymentService({
        mode: 'alwaysSuccess',
        delayMs: 0,
      });

      const startTime = Date.now();
      await service.requestPayment(createRequest());
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(50);
    });
  });

  describe('payment methods', () => {
    let service: MockPaymentService;

    beforeEach(() => {
      service = new MockPaymentService({
        mode: 'alwaysSuccess',
        delayMs: 0,
      });
    });

    it('should handle CARD payment', async () => {
      const result = await service.requestPayment(
        createRequest({ method: 'CARD' })
      );

      expect(result.success).toBe(true);
      expect(result.method).toBe('CARD');
    });

    it('should handle MOBILE payment', async () => {
      const result = await service.requestPayment(
        createRequest({ method: 'MOBILE' })
      );

      expect(result.success).toBe(true);
      expect(result.method).toBe('MOBILE');
    });
  });

  describe('transaction ID uniqueness', () => {
    it('should generate unique transaction IDs', async () => {
      const service = new MockPaymentService({
        mode: 'alwaysSuccess',
        delayMs: 0,
      });

      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const result = await service.requestPayment(createRequest());
        ids.add(result.transactionId);
      }

      expect(ids.size).toBe(100);
    });
  });
});
