import { describe, it, expect, beforeEach } from 'vitest';
import { ProfileValidator } from './ProfileValidator';
import type { StoreProfile } from '../types';

describe('ProfileValidator - excludeOptions', () => {
  let validator: ProfileValidator;
  let validProfile: StoreProfile;

  beforeEach(() => {
    validator = new ProfileValidator();
    // Create a minimal valid profile structure for testing
    validProfile = {
      profileId: 'test-profile',
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      store: {
        id: 'store-1',
        name: 'Test Store',
        currency: 'KRW'
      },
      menu: {
        categories: [
          {
            id: 'cat-1',
            name: 'Category 1',
            displayOrder: 1,
            commonOptionGroups: [
              {
                id: 'group1',
                name: 'Group 1',
                required: false,
                multiSelect: false,
                items: [
                  { id: 'opt1', name: 'Option 1', price: 0, available: true },
                  { id: 'opt2', name: 'Option 2', price: 0, available: true }
                ]
              }
            ],
            items: [
              {
                id: 'item-1',
                name: 'Item 1',
                price: 1000,
                available: true,
                // Valid excludeOptions references
                excludeOptions: ['opt1', 'group1.opt2']
              }
            ]
          }
        ]
      },
      promotions: [],
      settings: {
        language: 'ko',
        voiceAssistant: { enabled: true, greeting: 'Hi', persona: 'friendly' },
        payment: { acceptedMethods: ['card'], tipEnabled: false },
        display: { theme: 'light', fontSize: 'medium', idleTimeout: 15 },
        ageRestrictions: { enabled: false, restrictedItems: [], minAge: 19 }
      }
    };
  });

  it('should validate a profile with valid excludeOptions string array', () => {
    const isValid = validator.validate(validProfile);
    expect(isValid).toBe(true);
    expect(validator.getErrors()).toHaveLength(0);
  });

  it('should validate valid excludeOptions references', () => {
    const profile = JSON.parse(JSON.stringify(validProfile));
    // Valid references:
    // 'opt1' exists
    // 'group1.opt2' (mock scenario)

    // Let's make sure the structure supports the test
    const category = profile.menu.categories[0];
    category.commonOptionGroups = [
      {
        id: 'common_group',
        name: 'Common Group',
        required: false,
        multiSelect: false,
        items: [
          { id: 'common_opt_1', name: 'Opt 1', price: 0, available: true },
          { id: 'common_opt_2', name: 'Opt 2', price: 0, available: true }
        ]
      }
    ];
    category.items[0].optionGroups = [
      {
        id: 'item_group',
        name: 'Item Group',
        required: false,
        multiSelect: false,
        items: [
          { id: 'item_opt_1', name: 'Item Opt 1', price: 0, available: true }
        ]
      }
    ];

    // Valid: exclude common group ID
    category.items[0].excludeOptions = ['common_group'];
    expect(validator.validate(profile)).toBe(true);

    // Valid: exclude common option ID
    category.items[0].excludeOptions = ['common_opt_1'];
    expect(validator.validate(profile)).toBe(true);

    // Valid: exclude specific common option (groupId.optionId)
    category.items[0].excludeOptions = ['common_group.common_opt_2'];
    expect(validator.validate(profile)).toBe(true);

    // Valid: exclude item group specific option (though redundant, it is valid reference)
    category.items[0].excludeOptions = ['item_opt_1'];
    expect(validator.validate(profile)).toBe(true);
  });

  it('should fail if excludeOptions contains non-existent references', () => {
    const profile = JSON.parse(JSON.stringify(validProfile));
    const category = profile.menu.categories[0];
    category.commonOptionGroups = [{ id: 'g1', name: 'G1', required: false, multiSelect: false, items: [{ id: 'o1', name: 'O1', price: 0, available: true }] }];

    // Invalid: ID does not exist
    category.items[0].excludeOptions = ['non_existent_id'];

    const isValid = validator.validate(profile);
    expect(isValid).toBe(false);
    expect(validator.getErrorMessages()).toContain('menu.categories[0].items[0].excludeOptions[0]: Reference "non_existent_id" not found in option groups');
  });

  it('should fail if excludeOptions is not an array', () => {
    const invalidProfile = JSON.parse(JSON.stringify(validProfile));
    // @ts-ignore - testing invalid type
    invalidProfile.menu.categories[0].items[0].excludeOptions = "not-an-array";

    const isValid = validator.validate(invalidProfile);
    expect(isValid).toBe(false);
    expect(validator.getErrorMessages()).toContain('menu.categories[0].items[0].excludeOptions: Must be an array');
  });

  it('should fail if excludeOptions contains non-string items', () => {
    const invalidProfile = JSON.parse(JSON.stringify(validProfile));
    // @ts-ignore - testing invalid content
    invalidProfile.menu.categories[0].items[0].excludeOptions = ['valid_opt', 123];

    const isValid = validator.validate(invalidProfile);
    expect(isValid).toBe(false);
    expect(validator.getErrorMessages()).toContain('menu.categories[0].items[0].excludeOptions[1]: Must be a string');
  });
});
