import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CartManager, CartOperationResult } from '@/modules/core/CartManager';
import type { StoreProfileModule, ModuleStatus, MenuItem, MenuOptionGroup } from '@/modules/store_profile';

// 테스트용 옵션 그룹 데이터
const createSetChoiceOptionGroup = (): MenuOptionGroup => ({
  id: 'set_choice',
  name: '세트 선택',
  required: true,
  multiSelect: false,
  items: [
    { id: 'single', name: '단품', price: 0, available: true },
    { id: 'set', name: '세트', price: 2500, available: true },
  ],
});

const createDrinkOptionGroup = (): MenuOptionGroup => ({
  id: 'drink',
  name: '음료 선택',
  required: true,
  multiSelect: false,
  dependsOn: { groupId: 'set_choice', optionIds: ['set'] },
  items: [
    { id: 'cola', name: '콜라', price: 0, available: true },
    { id: 'sprite', name: '사이다', price: 0, available: true },
  ],
});

const createSizeOptionGroup = (): MenuOptionGroup => ({
  id: 'size',
  name: '사이즈',
  required: true,
  multiSelect: false,
  items: [
    { id: 'medium', name: '미디엄', price: 0, available: true },
    { id: 'large', name: '라지', price: 500, available: true },
  ],
});

// Mock StoreProfileModule
const createMockStoreProfile = (status: ModuleStatus, items: MenuItem[] = []) => ({
  status,
  getMenuItemByName: vi.fn((name: string) => items.find(i => i.name === name)),
  getMenuItems: vi.fn(() => items),
} as unknown as StoreProfileModule);

// 기본 테스트 메뉴 아이템
const createTestMenuItems = (): MenuItem[] => [
  {
    id: 'bulgogi_burger',
    name: '불고기 버거',
    price: 4000,
    available: true,
    optionGroups: [createSetChoiceOptionGroup(), createDrinkOptionGroup()],
  },
  {
    id: 'cola_single',
    name: '콜라',
    price: 1500,
    available: true,
    optionGroups: [createSizeOptionGroup()],
  },
  {
    id: 'fries_single',
    name: '감자튀김',
    price: 2000,
    available: true,
    optionGroups: undefined, // 옵션 없음
  },
  {
    id: 'soldout_burger',
    name: '품절 버거',
    price: 5000,
    available: false,
    optionGroups: undefined,
  },
];

describe('CartManager', () => {
  let cartManager: CartManager;
  let mockProfile: ReturnType<typeof createMockStoreProfile>;
  let testItems: MenuItem[];

  beforeEach(() => {
    testItems = createTestMenuItems();
    mockProfile = createMockStoreProfile('ready', testItems);
    cartManager = new CartManager(mockProfile);
  });

  // ============ CREATE 테스트 ============
  describe('addToCart()', () => {
    it('should add item to cart and return cartItemId', () => {
      const result = cartManager.addToCart('불고기 버거', 1);

      expect(result.success).toBe(true);
      expect(result.cartItemId).toBeDefined();
      expect(result.message).toContain('불고기 버거');

      const cart = cartManager.getCart();
      expect(cart).toHaveLength(1);
      expect(cart[0].menuName).toBe('불고기 버거');
      expect(cart[0].basePrice).toBe(4000);
    });

    it('should return pending options for item with required options', () => {
      const result = cartManager.addToCart('불고기 버거', 1);

      expect(result.success).toBe(true);
      expect(result.pendingOptions).toBeDefined();
      expect(result.pendingOptions).toHaveLength(1); // 세트 선택만 (음료는 의존성 때문에 아직 안 나옴)
      expect(result.pendingOptions![0].id).toBe('set_choice');
    });

    it('should not return pending options for item without options', () => {
      const result = cartManager.addToCart('감자튀김', 1);

      expect(result.success).toBe(true);
      expect(result.pendingOptions).toBeUndefined();
    });

    it('should fail when menu not found', () => {
      const result = cartManager.addToCart('없는 메뉴', 1);

      expect(result.success).toBe(false);
      expect(result.message).toContain('찾을 수 없습니다');
    });

    it('should fail when menu is sold out', () => {
      const result = cartManager.addToCart('품절 버거', 1);

      expect(result.success).toBe(false);
      expect(result.message).toContain('품절');
    });

    it('should fail when StoreProfile is not ready', () => {
      const uninitializedProfile = createMockStoreProfile('uninitialized');
      const manager = new CartManager(uninitializedProfile);

      const result = manager.addToCart('불고기 버거', 1);

      expect(result.success).toBe(false);
      expect(result.message).toContain('준비되지 않았습니다');
    });
  });

  describe('selectOption()', () => {
    it('should select option for cart item', () => {
      const addResult = cartManager.addToCart('불고기 버거', 1);
      const cartItemId = addResult.cartItemId!;

      const result = cartManager.selectOption(cartItemId, 'set_choice', 'single');

      expect(result.success).toBe(true);
      expect(result.message).toContain('단품');

      const cartItem = cartManager.getCartItem(cartItemId);
      expect(cartItem?.options).toHaveLength(1);
      expect(cartItem?.options[0].groupId).toBe('set_choice');
      expect(cartItem?.options[0].selectedItems[0].id).toBe('single');
    });

    it('should return pending dependent options after selecting trigger option', () => {
      const addResult = cartManager.addToCart('불고기 버거', 1);
      const cartItemId = addResult.cartItemId!;

      // 세트 선택 → 음료 옵션이 pending으로 나와야 함
      const result = cartManager.selectOption(cartItemId, 'set_choice', 'set');

      expect(result.success).toBe(true);
      expect(result.pendingOptions).toBeDefined();
      expect(result.pendingOptions).toHaveLength(1);
      expect(result.pendingOptions![0].id).toBe('drink');
    });

    it('should not return pending dependent options when trigger option is not selected', () => {
      const addResult = cartManager.addToCart('불고기 버거', 1);
      const cartItemId = addResult.cartItemId!;

      // 단품 선택 → 음료 옵션이 pending으로 안 나와야 함
      const result = cartManager.selectOption(cartItemId, 'set_choice', 'single');

      expect(result.success).toBe(true);
      expect(result.pendingOptions).toBeUndefined();
    });

    it('should fail selecting dependent option before trigger option', () => {
      const addResult = cartManager.addToCart('불고기 버거', 1);
      const cartItemId = addResult.cartItemId!;

      // 세트 선택 안 하고 바로 음료 선택 시도
      const result = cartManager.selectOption(cartItemId, 'drink', 'cola');

      expect(result.success).toBe(false);
      expect(result.message).toContain('먼저');
    });

    it('should allow selecting dependent option after trigger option', () => {
      const addResult = cartManager.addToCart('불고기 버거', 1);
      const cartItemId = addResult.cartItemId!;

      cartManager.selectOption(cartItemId, 'set_choice', 'set');
      const result = cartManager.selectOption(cartItemId, 'drink', 'cola');

      expect(result.success).toBe(true);
      expect(result.message).toContain('콜라');
    });

    it('should replace option in single-select mode', () => {
      const addResult = cartManager.addToCart('불고기 버거', 1);
      const cartItemId = addResult.cartItemId!;

      cartManager.selectOption(cartItemId, 'set_choice', 'single');
      cartManager.selectOption(cartItemId, 'set_choice', 'set'); // 교체

      const cartItem = cartManager.getCartItem(cartItemId);
      expect(cartItem?.options).toHaveLength(1);
      expect(cartItem?.options[0].selectedItems[0].id).toBe('set');
    });

    it('should fail for invalid cartItemId', () => {
      const result = cartManager.selectOption('invalid-id', 'set_choice', 'single');

      expect(result.success).toBe(false);
      expect(result.message).toContain('찾을 수 없습니다');
    });

    it('should fail for invalid optionId', () => {
      const addResult = cartManager.addToCart('불고기 버거', 1);
      const cartItemId = addResult.cartItemId!;

      const result = cartManager.selectOption(cartItemId, 'set_choice', 'invalid');

      expect(result.success).toBe(false);
      expect(result.message).toContain('찾을 수 없습니다');
    });

    it('should clear dependent options when trigger option changes', () => {
      const addResult = cartManager.addToCart('불고기 버거', 1);
      const cartItemId = addResult.cartItemId!;

      // 세트 선택 → 음료 선택
      cartManager.selectOption(cartItemId, 'set_choice', 'set');
      cartManager.selectOption(cartItemId, 'drink', 'cola');

      // 음료가 선택되어 있는지 확인
      let cartItem = cartManager.getCartItem(cartItemId);
      expect(cartItem?.options).toHaveLength(2);

      // 세트 → 단품으로 변경 → 음료 선택이 자동 삭제되어야 함
      cartManager.selectOption(cartItemId, 'set_choice', 'single');

      cartItem = cartManager.getCartItem(cartItemId);
      expect(cartItem?.options).toHaveLength(1);
      expect(cartItem?.options[0].groupId).toBe('set_choice');
      expect(cartItem?.options.find(o => o.groupId === 'drink')).toBeUndefined();
    });
  });

  // ============ READ 테스트 ============
  describe('getCartItem()', () => {
    it('should return cart item by id', () => {
      const addResult = cartManager.addToCart('불고기 버거', 1);
      const cartItemId = addResult.cartItemId!;

      const item = cartManager.getCartItem(cartItemId);

      expect(item).toBeDefined();
      expect(item?.menuName).toBe('불고기 버거');
    });

    it('should return undefined for invalid id', () => {
      const item = cartManager.getCartItem('invalid-id');

      expect(item).toBeUndefined();
    });
  });

  describe('getCart()', () => {
    it('should return all cart items', () => {
      cartManager.addToCart('불고기 버거', 1);
      cartManager.addToCart('콜라', 2);

      const cart = cartManager.getCart();

      expect(cart).toHaveLength(2);
    });

    it('should return empty array when cart is empty', () => {
      const cart = cartManager.getCart();

      expect(cart).toHaveLength(0);
    });
  });

  describe('getTotal()', () => {
    it('should calculate total with base prices', () => {
      cartManager.addToCart('불고기 버거', 2); // 4000 x 2 = 8000
      cartManager.addToCart('감자튀김', 1); // 2000 x 1 = 2000

      expect(cartManager.getTotal()).toBe(10000);
    });

    it('should include option prices in total', () => {
      const addResult = cartManager.addToCart('불고기 버거', 1); // 4000
      cartManager.selectOption(addResult.cartItemId!, 'set_choice', 'set'); // +2500

      expect(cartManager.getTotal()).toBe(6500);
    });

    it('should multiply options by quantity', () => {
      const addResult = cartManager.addToCart('콜라', 2); // 1500 x 2
      cartManager.selectOption(addResult.cartItemId!, 'size', 'large'); // +500 x 2

      expect(cartManager.getTotal()).toBe(4000); // (1500 + 500) x 2
    });
  });

  describe('getCartSummary()', () => {
    it('should return formatted cart summary', () => {
      const addResult = cartManager.addToCart('불고기 버거', 1);
      cartManager.selectOption(addResult.cartItemId!, 'set_choice', 'set');
      cartManager.selectOption(addResult.cartItemId!, 'drink', 'cola');

      const summary = cartManager.getCartSummary();

      expect(summary.items).toHaveLength(1);
      expect(summary.items[0].menuName).toBe('불고기 버거');
      expect(summary.items[0].options).toContain('세트');
      expect(summary.items[0].options).toContain('콜라');
      expect(summary.totalPrice).toBe(6500);
    });
  });

  describe('getPendingRequiredOptions()', () => {
    it('should return required options not yet selected', () => {
      const addResult = cartManager.addToCart('불고기 버거', 1);
      const cartItemId = addResult.cartItemId!;

      const pending = cartManager.getPendingRequiredOptions(cartItemId);

      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe('set_choice');
    });

    it('should not include dependent options until trigger is selected', () => {
      const addResult = cartManager.addToCart('불고기 버거', 1);
      const cartItemId = addResult.cartItemId!;

      // 아직 세트 선택 안 함 → drink 옵션이 pending에 없어야 함
      const pending = cartManager.getPendingRequiredOptions(cartItemId);

      expect(pending.find(g => g.id === 'drink')).toBeUndefined();
    });

    it('should include dependent options after trigger is selected', () => {
      const addResult = cartManager.addToCart('불고기 버거', 1);
      const cartItemId = addResult.cartItemId!;

      cartManager.selectOption(cartItemId, 'set_choice', 'set');

      const pending = cartManager.getPendingRequiredOptions(cartItemId);

      expect(pending.find(g => g.id === 'drink')).toBeDefined();
    });

    it('should return empty array when all required options are selected', () => {
      const addResult = cartManager.addToCart('불고기 버거', 1);
      const cartItemId = addResult.cartItemId!;

      cartManager.selectOption(cartItemId, 'set_choice', 'single'); // 단품이면 음료 필요 없음

      const pending = cartManager.getPendingRequiredOptions(cartItemId);

      expect(pending).toHaveLength(0);
    });
  });

  // ============ UPDATE 테스트 ============
  describe('updateQuantity()', () => {
    it('should update quantity', () => {
      const addResult = cartManager.addToCart('불고기 버거', 1);
      const cartItemId = addResult.cartItemId!;

      const result = cartManager.updateQuantity(cartItemId, 3);

      expect(result.success).toBe(true);

      const item = cartManager.getCartItem(cartItemId);
      expect(item?.quantity).toBe(3);
    });

    it('should remove item when quantity is 0', () => {
      const addResult = cartManager.addToCart('불고기 버거', 1);
      const cartItemId = addResult.cartItemId!;

      const result = cartManager.updateQuantity(cartItemId, 0);

      expect(result.success).toBe(true);
      expect(cartManager.getCartItem(cartItemId)).toBeUndefined();
    });

    it('should fail for invalid cartItemId', () => {
      const result = cartManager.updateQuantity('invalid-id', 2);

      expect(result.success).toBe(false);
    });
  });

  describe('updateOption()', () => {
    it('should replace options for a group', () => {
      const addResult = cartManager.addToCart('불고기 버거', 1);
      const cartItemId = addResult.cartItemId!;

      cartManager.selectOption(cartItemId, 'set_choice', 'single');

      const result = cartManager.updateOption(cartItemId, 'set_choice', ['set']);

      expect(result.success).toBe(true);

      const item = cartManager.getCartItem(cartItemId);
      expect(item?.options[0].selectedItems[0].id).toBe('set');
    });
  });

  // ============ DELETE 테스트 ============
  describe('removeCartItem()', () => {
    it('should remove item from cart', () => {
      const addResult = cartManager.addToCart('불고기 버거', 1);
      const cartItemId = addResult.cartItemId!;

      const result = cartManager.removeCartItem(cartItemId);

      expect(result.success).toBe(true);
      expect(cartManager.getCart()).toHaveLength(0);
    });

    it('should fail for invalid cartItemId', () => {
      const result = cartManager.removeCartItem('invalid-id');

      expect(result.success).toBe(false);
    });
  });

  describe('removeOptionFromCartItem()', () => {
    it('should remove option group from item', () => {
      const addResult = cartManager.addToCart('불고기 버거', 1);
      const cartItemId = addResult.cartItemId!;

      cartManager.selectOption(cartItemId, 'set_choice', 'set');

      const result = cartManager.removeOptionFromCartItem(cartItemId, 'set_choice');

      expect(result.success).toBe(true);

      const item = cartManager.getCartItem(cartItemId);
      expect(item?.options).toHaveLength(0);
    });

    it('should fail when option is not selected', () => {
      const addResult = cartManager.addToCart('불고기 버거', 1);
      const cartItemId = addResult.cartItemId!;

      const result = cartManager.removeOptionFromCartItem(cartItemId, 'set_choice');

      expect(result.success).toBe(false);
    });
  });

  describe('clearCart()', () => {
    it('should clear all items', () => {
      cartManager.addToCart('불고기 버거', 1);
      cartManager.addToCart('콜라', 1);

      cartManager.clearCart();

      expect(cartManager.getCart()).toHaveLength(0);
      expect(cartManager.getTotal()).toBe(0);
    });
  });
});
