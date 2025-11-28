import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { StoreProfileModule } from '@/modules/store_profile/StoreProfileModule';
import type { StoreProfile, MenuItem } from '@/modules/store_profile/types';

// Mock fetch for loading profile
const mockProfile: StoreProfile = {
  profileId: 'test-profile',
  version: '1.0.0',
  store: {
    id: 'store-001',
    name: 'Test Store',
    address: '서울시 강남구',
    phone: '02-1234-5678',
    currency: 'KRW',
    taxRate: 10,
    businessHours: {
      monday: { open: '09:00', close: '22:00' },
      tuesday: { open: '09:00', close: '22:00' },
      wednesday: { open: '09:00', close: '22:00' },
      thursday: { open: '09:00', close: '22:00' },
      friday: { open: '09:00', close: '23:00' },
      saturday: { open: '10:00', close: '23:00' },
      sunday: { open: '10:00', close: '21:00' },
    },
  },
  menu: {
    categories: [
      {
        id: 'burger',
        name: '버거',
        displayOrder: 1,
        items: [
          {
            id: 'bulgogi-burger',
            name: '불고기 버거',
            price: 4000,
            hasSet: true,
            setPrice: 5500,
            available: true,
          },
          {
            id: 'cheese-burger',
            name: '치즈 버거',
            price: 4500,
            hasSet: true,
            setPrice: 6000,
            available: true,
          },
        ],
      },
      {
        id: 'side',
        name: '사이드',
        displayOrder: 2,
        items: [
          {
            id: 'fries',
            name: '감자튀김',
            price: 2000,
            hasSet: false,
            available: true,
          },
        ],
      },
    ],
    options: {
      setChoices: [
        { id: 'set', name: '세트', price: 0, available: true },
        { id: 'single', name: '단품', price: 0, available: true },
      ],
      drinks: [
        { id: 'cola', name: '콜라', price: 0, available: true },
        { id: 'cider', name: '사이다', price: 0, available: true },
      ],
      sides: [
        { id: 'fries', name: '감자튀김', price: 0, available: true },
        { id: 'cheese-stick', name: '치즈스틱', price: 500, available: true },
      ],
    },
  },
  promotions: [
    {
      id: 'promo-1',
      name: '런치 할인',
      type: 'discount_percent',
      value: 10,
      active: true,
      conditions: {
        timeRange: { start: '11:00', end: '14:00' },
      },
    },
  ],
  settings: {
    language: 'ko',
    voiceAssistant: {
      enabled: true,
      greeting: '안녕하세요!',
      persona: '친절한 직원',
    },
    display: {
      theme: 'light',
      fontSize: 'medium',
      idleTimeout: 60,
    },
  },
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

// Generate unique path for each test
let testCounter = 0;
const getUniqueProfilePath = () => `/profile/test-${++testCounter}-${Date.now()}.json`;

// Helper to clear all storage
const clearAllStorage = async () => {
  // Clear IndexedDB
  const databases = await indexedDB.databases();
  for (const db of databases) {
    if (db.name) {
      indexedDB.deleteDatabase(db.name);
    }
  }

  // Clear localStorage
  const keys = Object.keys(localStorage);
  keys.forEach((key) => localStorage.removeItem(key));
};

// Helper to create a fresh mock for fetch
const createFetchMock = () => {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(JSON.parse(JSON.stringify(mockProfile))),
  });
};

describe('StoreProfileModule', () => {
  let module: StoreProfileModule;

  beforeEach(async () => {
    await clearAllStorage();
    global.fetch = createFetchMock();
    // Use unique path for each test to avoid localStorage collision
    module = new StoreProfileModule({ profilePath: getUniqueProfilePath() });
  });

  afterEach(async () => {
    if (module.status === 'ready') {
      await module.destroy();
    }
    vi.restoreAllMocks();
  });

  describe('lifecycle', () => {
    it('should initialize successfully', async () => {
      expect(module.status).toBe('uninitialized');

      await module.initialize();

      expect(module.status).toBe('ready');
    });

    it('should load profile on initialize', async () => {
      await module.initialize();

      const profile = await module.loadCurrentProfile();
      expect(profile.profileId).toBe('test-profile');
    });

    it('should destroy cleanly', async () => {
      await module.initialize();
      await module.destroy();

      expect(module.status).toBe('uninitialized');
    });

    it('should throw when accessing before initialization', () => {
      expect(() => module.getStoreInfo()).toThrow('Module not ready');
    });
  });

  describe('profile operations', () => {
    beforeEach(async () => {
      await module.initialize();
    });

    it('should load current profile', async () => {
      const profile = await module.loadCurrentProfile();
      expect(profile.store.name).toBe('Test Store');
    });

    it('should stage changes', () => {
      module.stageChanges({ version: '2.0.0' });

      const staged = module.getStagedChanges();
      expect(staged?.version).toBe('2.0.0');
    });

    it('should discard changes', () => {
      module.stageChanges({ version: '2.0.0' });
      module.discardChanges();

      const staged = module.getStagedChanges();
      expect(staged).toBeNull();
    });

    it('should commit changes', async () => {
      module.updateStoreInfo({ name: 'New Store Name' });

      const commit = await module.commitChanges('Update store name', 'tester');

      expect(commit.message).toBe('Update store name');
      expect(commit.author).toBe('tester');

      const profile = await module.loadCurrentProfile();
      expect(profile.store.name).toBe('New Store Name');
    });

    it('should track history', async () => {
      module.updateStoreInfo({ name: 'Name 1' });
      await module.commitChanges('First change');

      // Wait for timestamp difference
      await new Promise((r) => setTimeout(r, 10));

      module.updateStoreInfo({ name: 'Name 2' });
      await module.commitChanges('Second change');

      const history = await module.getHistory();
      expect(history.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('store info', () => {
    beforeEach(async () => {
      await module.initialize();
    });

    it('should get store info', () => {
      const info = module.getStoreInfo();
      expect(info.name).toBe('Test Store');
      expect(info.currency).toBe('KRW');
    });

    it('should update store info', () => {
      module.updateStoreInfo({ name: 'Updated Store' });

      const info = module.getStoreInfo();
      expect(info.name).toBe('Updated Store');
    });
  });

  describe('menu operations', () => {
    beforeEach(async () => {
      await module.initialize();
    });

    it('should get all menu items', () => {
      const items = module.getMenuItems();
      expect(items.length).toBe(3); // 2 burgers + 1 side
    });

    it('should filter items by category', () => {
      const burgers = module.getMenuItems({ categoryId: 'burger' });
      expect(burgers.length).toBe(2);
      expect(burgers[0].name).toBe('불고기 버거');
    });

    it('should filter items by availability', () => {
      const available = module.getMenuItems({ available: true });
      expect(available.length).toBe(3);
    });

    it('should filter items by hasSet', () => {
      const withSet = module.getMenuItems({ hasSet: true });
      expect(withSet.length).toBe(2);
    });

    it('should filter items by price range', () => {
      const affordable = module.getMenuItems({
        priceRange: { min: 2000, max: 4000 },
      });
      expect(affordable.length).toBe(2); // bulgogi burger and fries
    });

    it('should get single item by id', () => {
      const item = module.getMenuItem('bulgogi-burger');
      expect(item?.name).toBe('불고기 버거');
      expect(item?.price).toBe(4000);
    });

    it('should return undefined for non-existent item', () => {
      const item = module.getMenuItem('non-existent');
      expect(item).toBeUndefined();
    });

    it('should get categories', () => {
      const categories = module.getCategories();
      expect(categories.length).toBe(2);
      expect(categories[0].name).toBe('버거');
    });

    it('should get single category', () => {
      const category = module.getCategory('burger');
      expect(category?.items.length).toBe(2);
    });

    it('should get menu options', () => {
      const options = module.getMenuOptions();
      expect(options.drinks.length).toBe(2);
      expect(options.sides.length).toBe(2);
    });

    it('should add menu item', () => {
      const newItemId = module.addMenuItem('burger', {
        name: '스페셜 버거',
        price: 7000,
        hasSet: true,
        available: true,
      });

      expect(newItemId).toBeDefined();

      const item = module.getMenuItem(newItemId);
      expect(item?.name).toBe('스페셜 버거');
    });

    it('should throw when adding to non-existent category', () => {
      expect(() =>
        module.addMenuItem('non-existent', {
          name: 'Test',
          price: 1000,
          hasSet: false,
          available: true,
        })
      ).toThrow('Category not found');
    });

    it('should update menu item', () => {
      module.updateMenuItem('bulgogi-burger', { price: 4500 });

      const item = module.getMenuItem('bulgogi-burger');
      expect(item?.price).toBe(4500);
    });

    it('should throw when updating non-existent item', () => {
      expect(() =>
        module.updateMenuItem('non-existent', { price: 1000 })
      ).toThrow('Item not found');
    });

    it('should remove menu item', () => {
      module.removeMenuItem('bulgogi-burger');

      const item = module.getMenuItem('bulgogi-burger');
      expect(item).toBeUndefined();
    });

    it('should set item availability', () => {
      module.setItemAvailability('bulgogi-burger', false);

      const item = module.getMenuItem('bulgogi-burger');
      expect(item?.available).toBe(false);
    });

    it('should add category', () => {
      const categoryId = module.addCategory({
        name: '음료',
        displayOrder: 3,
      });

      const category = module.getCategory(categoryId);
      expect(category?.name).toBe('음료');
      expect(category?.items).toEqual([]);
    });

    it('should update category', () => {
      module.updateCategory('burger', { name: '프리미엄 버거' });

      const category = module.getCategory('burger');
      expect(category?.name).toBe('프리미엄 버거');
    });

    it('should remove category', () => {
      module.removeCategory('side');

      const categories = module.getCategories();
      expect(categories.length).toBe(1);
    });
  });

  describe('promotion operations', () => {
    beforeEach(async () => {
      await module.initialize();
    });

    it('should get all promotions', () => {
      const promotions = module.getPromotions();
      expect(promotions.length).toBe(1);
    });

    it('should filter active promotions', () => {
      const active = module.getPromotions({ active: true });
      expect(active.length).toBe(1);
    });

    it('should filter by promotion type', () => {
      const discounts = module.getPromotions({ type: 'discount_percent' });
      expect(discounts.length).toBe(1);
    });

    it('should add promotion', () => {
      const promoId = module.addPromotion({
        name: '주말 특가',
        type: 'discount_fixed',
        value: 1000,
        active: true,
      });

      const promotions = module.getPromotions();
      expect(promotions.length).toBe(2);
      expect(promotions.find((p) => p.id === promoId)?.name).toBe('주말 특가');
    });

    it('should update promotion', () => {
      module.updatePromotion('promo-1', { value: 20 });

      const promotions = module.getPromotions();
      expect(promotions[0].value).toBe(20);
    });

    it('should remove promotion', () => {
      module.removePromotion('promo-1');

      const promotions = module.getPromotions();
      expect(promotions.length).toBe(0);
    });

    it('should toggle promotion active status', () => {
      module.setPromotionActive('promo-1', false);

      const promotions = module.getPromotions({ active: false });
      expect(promotions.length).toBe(1);
    });
  });

  describe('settings operations', () => {
    beforeEach(async () => {
      await module.initialize();
    });

    it('should get settings', () => {
      const settings = module.getSettings();
      expect(settings.language).toBe('ko');
    });

    it('should update settings', () => {
      module.updateSettings({ language: 'en' });

      const settings = module.getSettings();
      expect(settings.language).toBe('en');
    });

    it('should get voice assistant settings', () => {
      const va = module.getVoiceAssistantSettings();
      expect(va?.enabled).toBe(true);
      expect(va?.greeting).toBe('안녕하세요!');
    });

    it('should get display settings', () => {
      const display = module.getDisplaySettings();
      expect(display?.theme).toBe('light');
    });
  });

  describe('export/import', () => {
    beforeEach(async () => {
      await module.initialize();
    });

    it('should export profile as JSON', () => {
      const json = module.exportProfile();
      const parsed = JSON.parse(json);

      expect(parsed.profileId).toBe('test-profile');
      expect(parsed.store.name).toBe('Test Store');
    });

    it('should import profile from JSON', () => {
      const newProfile = { ...mockProfile, version: '2.0.0' };
      const json = JSON.stringify(newProfile);

      module.importProfile(json);

      const staged = module.getStagedChanges();
      expect(staged).toBeDefined();
    });

    it('should throw on invalid import', () => {
      expect(() => module.importProfile('{}')).toThrow('Invalid profile');
    });
  });

  describe('getMenuForLLM()', () => {
    beforeEach(async () => {
      await module.initialize();
    });

    it('should return LLM-compatible format', () => {
      const llmMenu = module.getMenuForLLM() as any;

      expect(llmMenu.categories).toBeDefined();
      expect(llmMenu.options).toBeDefined();
      expect(llmMenu.options.set_choices).toContain('세트');
      expect(llmMenu.options.drinks).toContain('콜라');
    });

    it('should use snake_case for compatibility', () => {
      const llmMenu = module.getMenuForLLM() as any;

      expect(llmMenu.categories[0].items[0].has_set).toBe(true);
      expect(llmMenu.options.set_choices).toBeDefined();
    });

    it('should filter unavailable items', async () => {
      module.setItemAvailability('bulgogi-burger', false);

      const llmMenu = module.getMenuForLLM() as any;
      const burgerCategory = llmMenu.categories.find(
        (c: any) => c.id === 'burger'
      );

      expect(
        burgerCategory.items.find((i: any) => i.id === 'bulgogi-burger')
      ).toBeUndefined();
    });

    it('should use working profile by default', async () => {
      // Stage a change (not committed)
      module.setItemAvailability('bulgogi-burger', false);

      // Default should use working profile (with staged changes)
      const llmMenu = module.getMenuForLLM() as any;
      const burgerCategory = llmMenu.categories.find(
        (c: any) => c.id === 'burger'
      );

      expect(
        burgerCategory.items.find((i: any) => i.id === 'bulgogi-burger')
      ).toBeUndefined();
    });

    it('should use committed profile with committedOnly option', async () => {
      // Stage a change (not committed)
      module.setItemAvailability('bulgogi-burger', false);

      // With committedOnly, should use committed profile (before staging)
      const llmMenu = module.getMenuForLLM({ committedOnly: true }) as any;
      const burgerCategory = llmMenu.categories.find(
        (c: any) => c.id === 'burger'
      );

      // Item should still be available in committed profile
      expect(
        burgerCategory.items.find((i: any) => i.id === 'bulgogi-burger')
      ).toBeDefined();
    });

    it('should reflect committed changes with committedOnly after commit', async () => {
      // Stage and commit a change
      module.setItemAvailability('bulgogi-burger', false);
      await module.commitChanges('Disable bulgogi burger');

      // Now committedOnly should reflect the committed change
      const llmMenu = module.getMenuForLLM({ committedOnly: true }) as any;
      const burgerCategory = llmMenu.categories.find(
        (c: any) => c.id === 'burger'
      );

      expect(
        burgerCategory.items.find((i: any) => i.id === 'bulgogi-burger')
      ).toBeUndefined();
    });
  });

  describe('rollback', () => {
    beforeEach(async () => {
      await module.initialize();
    });

    it('should rollback to previous state', async () => {
      // Make first change
      module.updateStoreInfo({ name: 'First Name' });
      const commit1 = await module.commitChanges('First change');

      await new Promise((r) => setTimeout(r, 10));

      // Make second change
      module.updateStoreInfo({ name: 'Second Name' });
      await module.commitChanges('Second change');

      // Verify current state
      let info = module.getStoreInfo();
      expect(info.name).toBe('Second Name');

      // Rollback
      await module.rollback(commit1.commitId);

      // Verify rolled back state
      info = module.getStoreInfo();
      expect(info.name).toBe('First Name');
    });
  });
});
