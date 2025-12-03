import { describe, it, expect } from 'vitest';
import {
  ProfileValidator,
  validateProfile,
  validatePartialProfile,
  getValidationErrors,
} from '@/modules/store_profile/validators/ProfileValidator';
import type { StoreProfile } from '@/modules/store_profile/types';

// Valid profile fixture
const validProfile: StoreProfile = {
  profileId: 'test-profile-001',
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
};

describe('ProfileValidator', () => {
  describe('validate()', () => {
    it('should validate a valid profile', () => {
      const validator = new ProfileValidator();
      expect(validator.validate(validProfile)).toBe(true);
      expect(validator.getErrors()).toHaveLength(0);
    });

    it('should reject non-object input', () => {
      const validator = new ProfileValidator();
      expect(validator.validate(null)).toBe(false);
      expect(validator.validate(undefined)).toBe(false);
      expect(validator.validate('string')).toBe(false);
      expect(validator.validate(123)).toBe(false);
      expect(validator.validate([])).toBe(false);
    });

    it('should require profileId', () => {
      const validator = new ProfileValidator();
      const { profileId, ...rest } = validProfile;
      expect(validator.validate(rest)).toBe(false);
      expect(validator.getErrorMessages()).toContain(
        'profileId: Required field is missing'
      );
    });

    it('should require version', () => {
      const validator = new ProfileValidator();
      const { version, ...rest } = validProfile;
      expect(validator.validate(rest)).toBe(false);
      expect(validator.getErrorMessages()).toContain(
        'version: Required field is missing'
      );
    });

    it('should require store object', () => {
      const validator = new ProfileValidator();
      const invalid = { ...validProfile, store: 'not an object' };
      expect(validator.validate(invalid)).toBe(false);
      expect(validator.getErrorMessages()).toContain(
        'store: Store must be an object'
      );
    });

    it('should require store.id and store.name', () => {
      const validator = new ProfileValidator();
      const invalid = {
        ...validProfile,
        store: { currency: 'KRW' },
      };
      expect(validator.validate(invalid)).toBe(false);
      const errors = validator.getErrorMessages();
      expect(errors).toContain('store.id: Required field is missing');
      expect(errors).toContain('store.name: Required field is missing');
    });

    it('should require menu.categories to be an array', () => {
      const validator = new ProfileValidator();
      const invalid = {
        ...validProfile,
        menu: { ...validProfile.menu, categories: 'not array' },
      };
      expect(validator.validate(invalid)).toBe(false);
      expect(validator.getErrorMessages()).toContain(
        'menu.categories: Categories must be an array'
      );
    });

    it('should accept menu without options (options is deprecated)', () => {
      const validator = new ProfileValidator();
      const valid = {
        ...validProfile,
        menu: { categories: [] },
      };
      expect(validator.validate(valid)).toBe(true);
    });

    it('should validate menu items', () => {
      const validator = new ProfileValidator();
      const invalid = {
        ...validProfile,
        menu: {
          ...validProfile.menu,
          categories: [
            {
              id: 'cat-1',
              name: 'Category',
              displayOrder: 1,
              items: [{ name: 'No ID Item', price: 1000 }], // missing id
            },
          ],
        },
      };
      expect(validator.validate(invalid)).toBe(false);
      expect(validator.getErrorMessages()).toContain(
        'menu.categories[0].items[0].id: Required field is missing'
      );
    });

    it('should validate option items', () => {
      const validator = new ProfileValidator();
      const invalid = {
        ...validProfile,
        menu: {
          ...validProfile.menu,
          options: {
            setChoices: [{ name: 'Missing ID' }], // missing id
            drinks: [],
            sides: [],
          },
        },
      };
      expect(validator.validate(invalid)).toBe(false);
      expect(validator.getErrorMessages()).toContain(
        'menu.options.setChoices[0].id: Required field is missing'
      );
    });

    it('should validate promotions array', () => {
      const validator = new ProfileValidator();
      const invalid = {
        ...validProfile,
        promotions: 'not array',
      };
      expect(validator.validate(invalid)).toBe(false);
      expect(validator.getErrorMessages()).toContain(
        'promotions: Promotions must be an array'
      );
    });

    it('should validate promotion type', () => {
      const validator = new ProfileValidator();
      const invalid = {
        ...validProfile,
        promotions: [
          {
            id: 'promo-1',
            name: 'Test Promo',
            type: 'invalid_type',
            value: 10,
            active: true,
          },
        ],
      };
      expect(validator.validate(invalid)).toBe(false);
      expect(validator.getErrorMessages()).toContain(
        'promotions[0].type: Must be one of: discount_percent, discount_fixed, bundle, bogo'
      );
    });

    it('should validate settings.language', () => {
      const validator = new ProfileValidator();
      const invalid = {
        ...validProfile,
        settings: {},
      };
      expect(validator.validate(invalid)).toBe(false);
      expect(validator.getErrorMessages()).toContain(
        'settings.language: Required field is missing'
      );
    });

    it('should validate business hours format', () => {
      const validator = new ProfileValidator();
      const invalid = {
        ...validProfile,
        store: {
          ...validProfile.store,
          businessHours: {
            monday: { open: 'invalid', close: '22:00' },
          },
        },
      };
      expect(validator.validate(invalid)).toBe(false);
      expect(validator.getErrorMessages()).toContain(
        'store.businessHours.monday.open: Must be in HH:MM format'
      );
    });

    it('should validate display theme', () => {
      const validator = new ProfileValidator();
      const invalid = {
        ...validProfile,
        settings: {
          ...validProfile.settings,
          display: { theme: 'invalid', fontSize: 'medium', idleTimeout: 60 },
        },
      };
      expect(validator.validate(invalid)).toBe(false);
      expect(validator.getErrorMessages()).toContain(
        'settings.display.theme: Must be one of: light, dark, custom'
      );
    });

    // customOptions validation tests
    it('should validate customOptions as array', () => {
      const validator = new ProfileValidator();
      const invalid = {
        ...validProfile,
        menu: {
          ...validProfile.menu,
          options: {
            ...validProfile.menu.options,
            customOptions: 'not an array',
          },
        },
      };
      expect(validator.validate(invalid)).toBe(false);
      expect(validator.getErrorMessages()).toContain(
        'menu.options.customOptions: Must be an array'
      );
    });

    it('should validate customOptions group structure', () => {
      const validator = new ProfileValidator();
      const invalid = {
        ...validProfile,
        menu: {
          ...validProfile.menu,
          options: {
            ...validProfile.menu.options,
            customOptions: [
              {
                // missing id and name
                required: true,
                multiSelect: false,
                options: [],
              },
            ],
          },
        },
      };
      expect(validator.validate(invalid)).toBe(false);
      const errors = validator.getErrorMessages();
      expect(errors).toContain(
        'menu.options.customOptions[0].id: Required field is missing'
      );
      expect(errors).toContain(
        'menu.options.customOptions[0].name: Required field is missing'
      );
    });

    it('should validate customOptions group options array', () => {
      const validator = new ProfileValidator();
      const invalid = {
        ...validProfile,
        menu: {
          ...validProfile.menu,
          options: {
            ...validProfile.menu.options,
            customOptions: [
              {
                id: 'sauce',
                name: 'Sauce',
                required: false,
                multiSelect: true,
                options: 'not an array',
              },
            ],
          },
        },
      };
      expect(validator.validate(invalid)).toBe(false);
      expect(validator.getErrorMessages()).toContain(
        'menu.options.customOptions[0].options: Must be an array'
      );
    });

    it('should validate valid customOptions', () => {
      const validator = new ProfileValidator();
      const valid = {
        ...validProfile,
        menu: {
          ...validProfile.menu,
          options: {
            ...validProfile.menu.options,
            customOptions: [
              {
                id: 'sauce',
                name: 'Sauce',
                required: false,
                multiSelect: true,
                maxSelections: 3,
                options: [
                  { id: 'ketchup', name: 'Ketchup', price: 0, available: true },
                  { id: 'mustard', name: 'Mustard', price: 0, available: true },
                ],
              },
            ],
          },
        },
      };
      expect(validator.validate(valid)).toBe(true);
    });

    // ageRestrictions validation tests
    it('should validate ageRestrictions as object', () => {
      const validator = new ProfileValidator();
      const invalid = {
        ...validProfile,
        settings: {
          ...validProfile.settings,
          ageRestrictions: 'not an object',
        },
      };
      expect(validator.validate(invalid)).toBe(false);
      expect(validator.getErrorMessages()).toContain(
        'settings.ageRestrictions: Age restriction settings must be an object'
      );
    });

    it('should validate ageRestrictions.enabled as boolean', () => {
      const validator = new ProfileValidator();
      const invalid = {
        ...validProfile,
        settings: {
          ...validProfile.settings,
          ageRestrictions: {
            enabled: 'yes',
            restrictedItems: [],
            minAge: 19,
          },
        },
      };
      expect(validator.validate(invalid)).toBe(false);
      expect(validator.getErrorMessages()).toContain(
        'settings.ageRestrictions.enabled: Must be a boolean'
      );
    });

    it('should validate ageRestrictions.restrictedItems as array', () => {
      const validator = new ProfileValidator();
      const invalid = {
        ...validProfile,
        settings: {
          ...validProfile.settings,
          ageRestrictions: {
            enabled: true,
            restrictedItems: 'not an array',
            minAge: 19,
          },
        },
      };
      expect(validator.validate(invalid)).toBe(false);
      expect(validator.getErrorMessages()).toContain(
        'settings.ageRestrictions.restrictedItems: Must be an array'
      );
    });

    it('should validate ageRestrictions.minAge as number', () => {
      const validator = new ProfileValidator();
      const invalid = {
        ...validProfile,
        settings: {
          ...validProfile.settings,
          ageRestrictions: {
            enabled: true,
            restrictedItems: [],
            minAge: '19',
          },
        },
      };
      expect(validator.validate(invalid)).toBe(false);
      expect(validator.getErrorMessages()).toContain(
        'settings.ageRestrictions.minAge: Must be a number'
      );
    });

    it('should validate valid ageRestrictions', () => {
      const validator = new ProfileValidator();
      const valid = {
        ...validProfile,
        settings: {
          ...validProfile.settings,
          ageRestrictions: {
            enabled: true,
            restrictedItems: ['beer', 'wine'],
            minAge: 19,
          },
        },
      };
      expect(validator.validate(valid)).toBe(true);
    });
  });

  describe('validatePartial()', () => {
    it('should validate empty partial', () => {
      const validator = new ProfileValidator();
      expect(validator.validatePartial({})).toBe(true);
    });

    it('should validate partial with only some fields', () => {
      const validator = new ProfileValidator();
      expect(
        validator.validatePartial({
          version: '2.0.0',
          settings: { language: 'en' },
        })
      ).toBe(true);
    });

    it('should reject invalid partial fields', () => {
      const validator = new ProfileValidator();
      expect(validator.validatePartial({ version: 123 })).toBe(false);
      expect(validator.getErrorMessages()).toContain('version: Must be a string');
    });

    it('should validate partial store info', () => {
      const validator = new ProfileValidator();
      expect(
        validator.validatePartial({
          store: { name: 'Updated Name' },
        })
      ).toBe(true);
    });

    it('should validate partial menu', () => {
      const validator = new ProfileValidator();
      expect(
        validator.validatePartial({
          menu: {
            categories: [
              {
                id: 'new-cat',
                name: 'New Category',
                displayOrder: 1,
                items: [],
              },
            ],
          },
        })
      ).toBe(true);
    });

    it('should validate partial customOptions', () => {
      const validator = new ProfileValidator();
      expect(
        validator.validatePartial({
          menu: {
            options: {
              customOptions: [
                {
                  id: 'sauce',
                  name: 'Sauce',
                  required: false,
                  multiSelect: true,
                  options: [],
                },
              ],
            },
          },
        })
      ).toBe(true);
    });

    it('should reject invalid partial customOptions', () => {
      const validator = new ProfileValidator();
      expect(
        validator.validatePartial({
          menu: {
            options: {
              customOptions: 'invalid',
            },
          },
        })
      ).toBe(false);
      expect(validator.getErrorMessages()).toContain(
        'menu.options.customOptions: Must be an array'
      );
    });

    it('should validate partial ageRestrictions', () => {
      const validator = new ProfileValidator();
      expect(
        validator.validatePartial({
          settings: {
            ageRestrictions: {
              enabled: true,
              restrictedItems: ['item-1'],
              minAge: 19,
            },
          },
        })
      ).toBe(true);
    });

    it('should reject invalid partial ageRestrictions', () => {
      const validator = new ProfileValidator();
      expect(
        validator.validatePartial({
          settings: {
            ageRestrictions: {
              enabled: 'yes',
            },
          },
        })
      ).toBe(false);
      expect(validator.getErrorMessages()).toContain(
        'settings.ageRestrictions.enabled: Must be a boolean'
      );
    });
  });

  describe('static helpers', () => {
    it('validateProfile() should work', () => {
      expect(validateProfile(validProfile)).toBe(true);
      expect(validateProfile({})).toBe(false);
    });

    it('validatePartialProfile() should work', () => {
      expect(validatePartialProfile({ version: '2.0.0' })).toBe(true);
      expect(validatePartialProfile({ version: 123 })).toBe(false);
    });

    it('getValidationErrors() should return error messages', () => {
      const errors = getValidationErrors({});
      expect(errors.length).toBeGreaterThan(0);
      expect(errors).toContain('profileId: Required field is missing');
    });
  });
});

describe('current.json validation', () => {
  it('should validate the default profile', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');

    const profilePath = path.resolve(
      process.cwd(),
      'public/profile/current.json'
    );
    const content = await fs.readFile(profilePath, 'utf-8');
    const profile = JSON.parse(content);

    const validator = new ProfileValidator();
    const isValid = validator.validate(profile);

    if (!isValid) {
      console.log('Validation errors:', validator.getErrorMessages());
    }

    expect(isValid).toBe(true);
  });
});
