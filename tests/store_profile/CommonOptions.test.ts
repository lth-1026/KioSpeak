import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { StoreProfileModule } from '@/modules/store_profile/StoreProfileModule';
import type { StoreProfile } from '@/modules/store_profile/types';

// Mock profile with commonOptionGroups
const mockProfile: StoreProfile = {
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
        id: 'cat-common',
        name: 'Common Category',
        displayOrder: 1,
        commonOptionGroups: [
          {
            id: 'common-group', // Will be inherited
            name: 'Common Group',
            required: true,
            multiSelect: false,
            items: [{ id: 'opt1', name: 'Opt 1', price: 0, available: true }]
          },
          {
            id: 'override-group', // Will be overridden by 'item-override'
            name: 'Override Group (Common)',
            required: true,
            multiSelect: false,
            items: [{ id: 'opt2', name: 'Opt 2', price: 0, available: true }]
          }
        ],
        items: [
          {
            id: 'item-inherit',
            name: 'Item Inherit',
            price: 1000,
            available: true,
            // optionGroups undefined or empty -> inherits all common
          },
          {
            id: 'item-override',
            name: 'Item Override',
            price: 2000,
            available: true,
            optionGroups: [
              {
                id: 'override-group', // Same ID as common group
                name: 'Override Group (Item)',
                required: true,
                multiSelect: false,
                items: [{ id: 'opt2-item', name: 'Opt 2 Item', price: 100, available: true }]
              }
            ]
          },
          {
            id: 'item-append',
            name: 'Item Append',
            price: 3000,
            available: true,
            optionGroups: [
              {
                id: 'new-group', // New ID -> Appended
                name: 'New Group',
                required: true,
                multiSelect: false,
                items: [{ id: 'opt3', name: 'Opt 3', price: 500, available: true }]
              }
            ]
          }
        ],
      },
      {
        id: 'cat-no-common',
        name: 'No Common Category',
        displayOrder: 2,
        // No commonOptionGroups
        items: [
          {
            id: 'item-simple',
            name: 'Simple Item',
            price: 1000,
            available: true,
            optionGroups: [
              {
                id: 'simple-group',
                name: 'Simple Group',
                required: true,
                multiSelect: false,
                items: []
              }
            ]
          }
        ]
      }
    ],
    options: {
      setChoices: [],
      drinks: [],
      sides: []
    }
  },
  promotions: [],
  settings: {
    language: 'ko',
  },
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

let testCounter = 0;
const getUniqueProfilePath = () => `/profile/test-effective-${++testCounter}-${Date.now()}.json`;

const createFetchMock = () => {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(JSON.parse(JSON.stringify(mockProfile))),
  });
};

describe('StoreProfileModule - Effective Option Groups', () => {
  let module: StoreProfileModule;

  beforeEach(async () => {
    // Basic mocks for node environment
    global.fetch = createFetchMock();

    // Clear storage slightly differently for memory mode or just rely on unique path
    module = new StoreProfileModule({ profilePath: getUniqueProfilePath() });
    await module.initialize();
  });

  afterEach(async () => {
    if (module.status === 'ready') {
      await module.destroy();
    }
    vi.restoreAllMocks();
  });

  it('should inherit common options if item has none', () => {
    const item = module.getMenuItem('item-inherit');
    expect(item).toBeDefined();
    expect(item?.optionGroups).toBeDefined();
    expect(item?.optionGroups?.length).toBe(2);
    expect(item?.optionGroups?.[0].id).toBe('common-group');
    expect(item?.optionGroups?.[1].id).toBe('override-group');
  });

  it('should override common options if item has group with same ID', () => {
    const item = module.getMenuItem('item-override');
    expect(item).toBeDefined();
    expect(item?.optionGroups).toBeDefined();
    expect(item?.optionGroups?.length).toBe(2);

    // First one should be common-group (inherited)
    expect(item?.optionGroups?.[0].id).toBe('common-group');

    // Second one should be override-group (from item)
    const overrideGroup = item?.optionGroups?.[1];
    expect(overrideGroup?.id).toBe('override-group');
    expect(overrideGroup?.name).toBe('Override Group (Item)');
    expect(overrideGroup?.items[0].name).toBe('Opt 2 Item');
  });

  it('should append new options from item', () => {
    const item = module.getMenuItem('item-append');
    expect(item).toBeDefined();
    expect(item?.optionGroups).toBeDefined();
    expect(item?.optionGroups?.length).toBe(3); // 2 common + 1 new

    expect(item?.optionGroups?.[0].id).toBe('common-group');
    expect(item?.optionGroups?.[1].id).toBe('override-group');
    expect(item?.optionGroups?.[2].id).toBe('new-group');
  });

  it('should work correctly when no common options exist', () => {
    const item = module.getMenuItem('item-simple');
    expect(item).toBeDefined();
    expect(item?.optionGroups?.length).toBe(1);
    expect(item?.optionGroups?.[0].id).toBe('simple-group');
  });

  it('getMenuForLLM should return effective options', () => {
    const llmMenu = module.getMenuForLLM() as any;
    const cat = llmMenu.categories.find((c: any) => c.id === 'cat-common');
    const itemOverride = cat.items.find((i: any) => i.id === 'item-override');

    expect(itemOverride.optionGroups.length).toBe(2);
    expect(itemOverride.optionGroups[1].name).toBe('Override Group (Item)');
  });
});
