import { describe, it, expect } from 'vitest';
import { DiffEngine } from '@/modules/store_profile/DiffEngine';
import type { StoreProfile } from '@/modules/store_profile/types';

// Base profile for testing
const createBaseProfile = (): StoreProfile => ({
  profileId: 'test-profile',
  version: '1.0.0',
  store: {
    id: 'store-001',
    name: 'Test Store',
    currency: 'KRW',
  },
  menu: {
    categories: [
      {
        id: 'cat-1',
        name: 'Category 1',
        displayOrder: 1,
        items: [
          {
            id: 'item-1',
            name: 'Item 1',
            price: 1000,
            hasSet: false,
            available: true,
          },
        ],
      },
    ],
    options: {
      setChoices: [{ id: 'single', name: '단품', price: 0, available: true }],
      drinks: [{ id: 'cola', name: '콜라', price: 0, available: true }],
      sides: [{ id: 'fries', name: '감자튀김', price: 0, available: true }],
    },
  },
  promotions: [],
  settings: {
    language: 'ko',
  },
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
});

describe('DiffEngine', () => {
  describe('createDiff()', () => {
    it('should create an empty diff for identical profiles', () => {
      const profile = createBaseProfile();
      const diff = DiffEngine.createDiff(profile, profile);
      expect(diff.operations).toHaveLength(0);
      expect(DiffEngine.isEmpty(diff)).toBe(true);
    });

    it('should detect simple value changes', () => {
      const oldProfile = createBaseProfile();
      const newProfile = { ...createBaseProfile(), version: '2.0.0' };

      const diff = DiffEngine.createDiff(oldProfile, newProfile);

      expect(diff.operations).toHaveLength(1);
      expect(diff.operations[0]).toEqual({
        op: 'replace',
        path: '/version',
        value: '2.0.0',
      });
    });

    it('should detect nested value changes', () => {
      const oldProfile = createBaseProfile();
      const newProfile = createBaseProfile();
      newProfile.store.name = 'Updated Store';

      const diff = DiffEngine.createDiff(oldProfile, newProfile);

      expect(diff.operations).toHaveLength(1);
      expect(diff.operations[0]).toEqual({
        op: 'replace',
        path: '/store/name',
        value: 'Updated Store',
      });
    });

    it('should detect array item changes', () => {
      const oldProfile = createBaseProfile();
      const newProfile = createBaseProfile();
      newProfile.menu.categories[0].items[0].price = 2000;

      const diff = DiffEngine.createDiff(oldProfile, newProfile);

      expect(diff.operations.length).toBeGreaterThan(0);
      const priceOp = diff.operations.find(
        (op) => op.path.includes('price') && op.op === 'replace'
      );
      expect(priceOp).toBeDefined();
      expect(priceOp!.value).toBe(2000);
    });

    it('should detect added items', () => {
      const oldProfile = createBaseProfile();
      const newProfile = createBaseProfile();
      newProfile.menu.categories[0].items.push({
        id: 'item-2',
        name: 'Item 2',
        price: 2000,
        hasSet: true,
        available: true,
      });

      const diff = DiffEngine.createDiff(oldProfile, newProfile);

      const addOp = diff.operations.find((op) => op.op === 'add');
      expect(addOp).toBeDefined();
    });

    it('should detect removed items', () => {
      const oldProfile = createBaseProfile();
      const newProfile = createBaseProfile();
      newProfile.menu.categories[0].items = [];

      const diff = DiffEngine.createDiff(oldProfile, newProfile);

      const removeOp = diff.operations.find((op) => op.op === 'remove');
      expect(removeOp).toBeDefined();
    });

    it('should detect multiple changes', () => {
      const oldProfile = createBaseProfile();
      const newProfile = createBaseProfile();
      newProfile.version = '2.0.0';
      newProfile.store.name = 'New Name';
      newProfile.settings.language = 'en';

      const diff = DiffEngine.createDiff(oldProfile, newProfile);

      expect(diff.operations.length).toBe(3);
    });
  });

  describe('applyDiff()', () => {
    it('should apply a diff correctly', () => {
      const oldProfile = createBaseProfile();
      const newProfile = createBaseProfile();
      newProfile.version = '2.0.0';
      newProfile.store.name = 'Updated Store';

      const diff = DiffEngine.createDiff(oldProfile, newProfile);
      const result = DiffEngine.applyDiff(oldProfile, diff);

      expect(result.version).toBe('2.0.0');
      expect(result.store.name).toBe('Updated Store');
    });

    it('should not mutate the original profile', () => {
      const oldProfile = createBaseProfile();
      const originalVersion = oldProfile.version;

      const diff = DiffEngine.createDiff(oldProfile, {
        ...createBaseProfile(),
        version: '2.0.0',
      });
      DiffEngine.applyDiff(oldProfile, diff);

      expect(oldProfile.version).toBe(originalVersion);
    });

    it('should handle complex nested changes', () => {
      const oldProfile = createBaseProfile();
      const newProfile = createBaseProfile();
      newProfile.menu.categories[0].items[0] = {
        ...newProfile.menu.categories[0].items[0],
        price: 5000,
        name: 'Premium Item',
        description: 'A new description',
      };

      const diff = DiffEngine.createDiff(oldProfile, newProfile);
      const result = DiffEngine.applyDiff(oldProfile, diff);

      expect(result.menu.categories[0].items[0].price).toBe(5000);
      expect(result.menu.categories[0].items[0].name).toBe('Premium Item');
      expect(result.menu.categories[0].items[0].description).toBe(
        'A new description'
      );
    });
  });

  describe('reverseDiff()', () => {
    it('should create a reverse diff', () => {
      const oldProfile = createBaseProfile();
      const newProfile = createBaseProfile();
      newProfile.version = '2.0.0';

      const forwardDiff = DiffEngine.createDiff(oldProfile, newProfile);
      const reverseDiff = DiffEngine.reverseDiff(oldProfile, forwardDiff);

      // Apply forward diff, then reverse should get back to original
      const intermediate = DiffEngine.applyDiff(oldProfile, forwardDiff);
      const restored = DiffEngine.applyDiff(intermediate, reverseDiff);

      expect(restored.version).toBe(oldProfile.version);
    });
  });

  describe('validateDiff()', () => {
    it('should return true for valid diff', () => {
      const oldProfile = createBaseProfile();
      const newProfile = createBaseProfile();
      newProfile.version = '2.0.0';

      const diff = DiffEngine.createDiff(oldProfile, newProfile);

      expect(DiffEngine.validateDiff(oldProfile, diff)).toBe(true);
    });

    it('should return false for invalid diff', () => {
      const profile = createBaseProfile();
      const invalidDiff = {
        operations: [
          {
            op: 'replace' as const,
            path: '/nonexistent/path/that/does/not/exist',
            value: 'test',
          },
        ],
      };

      expect(DiffEngine.validateDiff(profile, invalidDiff)).toBe(false);
    });
  });

  describe('getDiffSummary()', () => {
    it('should provide human-readable summary', () => {
      const oldProfile = createBaseProfile();
      const newProfile = createBaseProfile();
      newProfile.version = '2.0.0';
      newProfile.store.name = 'New Store';

      const diff = DiffEngine.createDiff(oldProfile, newProfile);
      const summary = DiffEngine.getDiffSummary(diff);

      expect(summary.length).toBe(2);
      expect(summary.some((s) => s.includes('Changed'))).toBe(true);
    });
  });

  describe('isEmpty()', () => {
    it('should return true for empty diff', () => {
      const diff = { operations: [] };
      expect(DiffEngine.isEmpty(diff)).toBe(true);
    });

    it('should return false for non-empty diff', () => {
      const diff = {
        operations: [{ op: 'add' as const, path: '/test', value: 1 }],
      };
      expect(DiffEngine.isEmpty(diff)).toBe(false);
    });
  });

  describe('mergeDiffs()', () => {
    it('should merge multiple diffs', () => {
      const diff1 = {
        operations: [{ op: 'replace' as const, path: '/version', value: '2.0.0' }],
      };
      const diff2 = {
        operations: [
          { op: 'replace' as const, path: '/store/name', value: 'New' },
        ],
      };

      const merged = DiffEngine.mergeDiffs(diff1, diff2);

      expect(merged.operations).toHaveLength(2);
    });
  });

  describe('filterByPath()', () => {
    it('should filter operations by path prefix', () => {
      const diff = {
        operations: [
          { op: 'replace' as const, path: '/version', value: '2.0.0' },
          { op: 'replace' as const, path: '/store/name', value: 'New' },
          { op: 'replace' as const, path: '/store/address', value: 'Addr' },
          { op: 'replace' as const, path: '/menu/categories/0/name', value: 'Cat' },
        ],
      };

      const storeOnly = DiffEngine.filterByPath(diff, '/store');

      expect(storeOnly.operations).toHaveLength(2);
      expect(storeOnly.operations.every((op) => op.path.startsWith('/store'))).toBe(
        true
      );
    });
  });

  describe('cloneProfile()', () => {
    it('should create a deep copy', () => {
      const original = createBaseProfile();
      const cloned = DiffEngine.cloneProfile(original);

      // Should be equal
      expect(cloned).toEqual(original);

      // But not the same reference
      expect(cloned).not.toBe(original);
      expect(cloned.store).not.toBe(original.store);
      expect(cloned.menu).not.toBe(original.menu);
      expect(cloned.menu.categories).not.toBe(original.menu.categories);

      // Modifying clone should not affect original
      cloned.version = 'modified';
      expect(original.version).toBe('1.0.0');
    });
  });
});
