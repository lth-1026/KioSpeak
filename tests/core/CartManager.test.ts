import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CartManager } from '@/modules/core/CartManager';
import type { StoreProfileModule, ModuleStatus } from '@/modules/store_profile';
import type { MenuItem } from '@/modules/store_profile/types';

// Mock StoreProfileModule
const createMockStoreProfile = (status: ModuleStatus, items: MenuItem[] = []) => ({
  status,
  getMenuItems: vi.fn(() => items),
} as unknown as StoreProfileModule);

describe('CartManager', () => {
  let cartManager: CartManager;

  beforeEach(() => {
    cartManager = new CartManager();
  });

  describe('addToCart()', () => {
    it('should add item to cart without StoreProfile', () => {
      const result = cartManager.addToCart('Test Burger', 2);

      expect(result).toContain('Test Burger');
      expect(result).toContain('2개');

      const cart = cartManager.getCart();
      expect(cart).toHaveLength(1);
      expect(cart[0].menuName).toBe('Test Burger');
      expect(cart[0].quantity).toBe(2);
      expect(cart[0].menuId).toBe('Test Burger'); // fallback to name
      expect(cart[0].price).toBe(0); // no price info
    });

    it('should lookup menu info when StoreProfile is ready', () => {
      const mockItems: MenuItem[] = [
        {
          id: 'burger-001',
          name: 'Test Burger',
          price: 5000,
          hasSet: true,
          available: true,
        },
      ];
      const mockProfile = createMockStoreProfile('ready', mockItems);
      cartManager.setStoreProfile(mockProfile);

      const result = cartManager.addToCart('Test Burger', 1);

      expect(mockProfile.getMenuItems).toHaveBeenCalled();
      expect(result).toContain('Test Burger');

      const cart = cartManager.getCart();
      expect(cart[0].menuId).toBe('burger-001');
      expect(cart[0].price).toBe(5000);
    });

    it('should NOT call getMenuItems when StoreProfile is not ready', () => {
      const mockItems: MenuItem[] = [
        {
          id: 'burger-001',
          name: 'Test Burger',
          price: 5000,
          hasSet: true,
          available: true,
        },
      ];
      const mockProfile = createMockStoreProfile('initializing', mockItems);
      cartManager.setStoreProfile(mockProfile);

      cartManager.addToCart('Test Burger', 1);

      // getMenuItems should NOT be called when not ready
      expect(mockProfile.getMenuItems).not.toHaveBeenCalled();

      const cart = cartManager.getCart();
      expect(cart[0].menuId).toBe('Test Burger'); // fallback
      expect(cart[0].price).toBe(0); // no price info
    });

    it('should NOT call getMenuItems when StoreProfile has error status', () => {
      const mockProfile = createMockStoreProfile('error');
      cartManager.setStoreProfile(mockProfile);

      cartManager.addToCart('Test Burger', 1);

      expect(mockProfile.getMenuItems).not.toHaveBeenCalled();
    });

    it('should NOT call getMenuItems when StoreProfile is uninitialized', () => {
      const mockProfile = createMockStoreProfile('uninitialized');
      cartManager.setStoreProfile(mockProfile);

      cartManager.addToCart('Test Burger', 1);

      expect(mockProfile.getMenuItems).not.toHaveBeenCalled();
    });
  });

  describe('addOptionToItem()', () => {
    it('should add option to existing cart item', () => {
      cartManager.addToCart('Test Burger', 1);
      const result = cartManager.addOptionToItem('Test Burger', 'Extra Cheese');

      expect(result).toContain('Extra Cheese');

      const cart = cartManager.getCart();
      expect(cart[0].options).toContain('Extra Cheese');
    });

    it('should return error message for non-existent item', () => {
      const result = cartManager.addOptionToItem('Non-existent', 'Option');

      expect(result).toContain('찾을 수 없습니다');
    });
  });

  describe('cart operations', () => {
    it('should calculate total correctly', () => {
      const mockItems: MenuItem[] = [
        { id: 'item-1', name: 'Item A', price: 1000, hasSet: false, available: true },
        { id: 'item-2', name: 'Item B', price: 2000, hasSet: false, available: true },
      ];
      const mockProfile = createMockStoreProfile('ready', mockItems);
      cartManager.setStoreProfile(mockProfile);

      cartManager.addToCart('Item A', 2); // 2000
      cartManager.addToCart('Item B', 1); // 2000

      expect(cartManager.getTotal()).toBe(4000);
    });

    it('should clear cart', () => {
      cartManager.addToCart('Item A', 1);
      cartManager.addToCart('Item B', 1);

      cartManager.clearCart();

      expect(cartManager.getCart()).toHaveLength(0);
      expect(cartManager.getTotal()).toBe(0);
    });

    it('should return cart summary as JSON', () => {
      cartManager.addToCart('Test Item', 1);

      const summary = cartManager.getCartSummary();
      const parsed = JSON.parse(summary);

      expect(parsed).toHaveLength(1);
      expect(parsed[0].menuName).toBe('Test Item');
    });
  });
});
