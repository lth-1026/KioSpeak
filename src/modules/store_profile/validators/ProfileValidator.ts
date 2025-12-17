import type { StoreProfile } from '../types';

export interface ValidationError {
  path: string;
  message: string;
}

export class ProfileValidator {
  private errors: ValidationError[] = [];

  validate(profile: unknown): profile is StoreProfile {
    this.errors = [];

    if (!this.isObject(profile)) {
      this.addError('', 'Profile must be an object');
      return false;
    }

    const p = profile as Record<string, unknown>;

    // Required fields
    this.validateRequiredString(p, 'profileId');
    this.validateRequiredString(p, 'version');
    this.validateRequiredString(p, 'createdAt');
    this.validateRequiredString(p, 'updatedAt');

    // Store info
    if (!this.isObject(p.store)) {
      this.addError('store', 'Store must be an object');
    } else {
      this.validateStoreInfo(p.store as Record<string, unknown>);
    }

    // Menu
    if (!this.isObject(p.menu)) {
      this.addError('menu', 'Menu must be an object');
    } else {
      this.validateMenu(p.menu as Record<string, unknown>);
    }

    // Promotions
    if (!Array.isArray(p.promotions)) {
      this.addError('promotions', 'Promotions must be an array');
    } else {
      this.validatePromotions(p.promotions);
    }

    // Settings
    if (!this.isObject(p.settings)) {
      this.addError('settings', 'Settings must be an object');
    } else {
      this.validateSettings(p.settings as Record<string, unknown>);
    }

    return this.errors.length === 0;
  }

  validatePartial(partial: unknown): partial is Partial<StoreProfile> {
    this.errors = [];

    if (!this.isObject(partial)) {
      this.addError('', 'Partial profile must be an object');
      return false;
    }

    const p = partial as Record<string, unknown>;

    // Validate only present fields
    if (p.profileId !== undefined) {
      this.validateString(p.profileId, 'profileId');
    }
    if (p.version !== undefined) {
      this.validateString(p.version, 'version');
    }
    if (p.store !== undefined) {
      if (!this.isObject(p.store)) {
        this.addError('store', 'Store must be an object');
      } else {
        this.validateStoreInfoPartial(p.store as Record<string, unknown>);
      }
    }
    if (p.menu !== undefined) {
      if (!this.isObject(p.menu)) {
        this.addError('menu', 'Menu must be an object');
      } else {
        this.validateMenuPartial(p.menu as Record<string, unknown>);
      }
    }
    if (p.promotions !== undefined) {
      if (!Array.isArray(p.promotions)) {
        this.addError('promotions', 'Promotions must be an array');
      } else {
        this.validatePromotions(p.promotions);
      }
    }
    if (p.settings !== undefined) {
      if (!this.isObject(p.settings)) {
        this.addError('settings', 'Settings must be an object');
      } else {
        this.validateSettingsPartial(p.settings as Record<string, unknown>);
      }
    }

    return this.errors.length === 0;
  }

  getErrors(): ValidationError[] {
    return [...this.errors];
  }

  getErrorMessages(): string[] {
    return this.errors.map((e) => (e.path ? `${e.path}: ${e.message}` : e.message));
  }

  // ============ Store Info Validation ============
  private validateStoreInfo(store: Record<string, unknown>): void {
    this.validateRequiredString(store, 'id', 'store');
    this.validateRequiredString(store, 'name', 'store');
    this.validateRequiredString(store, 'currency', 'store');

    if (store.address !== undefined) {
      this.validateString(store.address, 'store.address');
    }
    if (store.phone !== undefined) {
      this.validateString(store.phone, 'store.phone');
    }
    if (store.timezone !== undefined) {
      this.validateString(store.timezone, 'store.timezone');
    }
    if (store.taxRate !== undefined) {
      this.validateNumber(store.taxRate, 'store.taxRate');
    }
    if (store.businessHours !== undefined) {
      this.validateWeeklyHours(store.businessHours, 'store.businessHours');
    }
  }

  private validateStoreInfoPartial(store: Record<string, unknown>): void {
    if (store.id !== undefined) {
      this.validateString(store.id, 'store.id');
    }
    if (store.name !== undefined) {
      this.validateString(store.name, 'store.name');
    }
    if (store.currency !== undefined) {
      this.validateString(store.currency, 'store.currency');
    }
    if (store.address !== undefined) {
      this.validateString(store.address, 'store.address');
    }
    if (store.phone !== undefined) {
      this.validateString(store.phone, 'store.phone');
    }
    if (store.taxRate !== undefined) {
      this.validateNumber(store.taxRate, 'store.taxRate');
    }
  }

  private validateWeeklyHours(hours: unknown, path: string): void {
    if (!this.isObject(hours)) {
      this.addError(path, 'Business hours must be an object');
      return;
    }

    const days = [
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ];
    const h = hours as Record<string, unknown>;

    for (const day of days) {
      if (h[day] !== undefined) {
        this.validateBusinessHours(h[day], `${path}.${day}`);
      }
    }
  }

  private validateBusinessHours(hours: unknown, path: string): void {
    if (!this.isObject(hours)) {
      this.addError(path, 'Hours must be an object');
      return;
    }

    const h = hours as Record<string, unknown>;
    if (h.open !== undefined) {
      this.validateTimeString(h.open, `${path}.open`);
    }
    if (h.close !== undefined) {
      this.validateTimeString(h.close, `${path}.close`);
    }
    if (h.closed !== undefined && typeof h.closed !== 'boolean') {
      this.addError(`${path}.closed`, 'Must be a boolean');
    }
  }

  // ============ Menu Validation ============
  private validateMenu(menu: Record<string, unknown>): void {
    if (!Array.isArray(menu.categories)) {
      this.addError('menu.categories', 'Categories must be an array');
    } else {
      menu.categories.forEach((cat, i) => {
        this.validateCategory(cat, `menu.categories[${i}]`);
      });
    }

    // menu.options is optional (deprecated - use MenuItem.optionGroups instead)
    if (menu.options !== undefined) {
      if (!this.isObject(menu.options)) {
        this.addError('menu.options', 'Options must be an object');
      } else {
        this.validateMenuOptions(
          menu.options as Record<string, unknown>,
          'menu.options'
        );
      }
    }
  }

  private validateMenuPartial(menu: Record<string, unknown>): void {
    if (menu.categories !== undefined) {
      if (!Array.isArray(menu.categories)) {
        this.addError('menu.categories', 'Categories must be an array');
      } else {
        menu.categories.forEach((cat, i) => {
          this.validateCategory(cat, `menu.categories[${i}]`);
        });
      }
    }

    if (menu.options !== undefined) {
      if (!this.isObject(menu.options)) {
        this.addError('menu.options', 'Options must be an object');
      } else {
        this.validateMenuOptionsPartial(
          menu.options as Record<string, unknown>,
          'menu.options'
        );
      }
    }
  }

  private validateCategory(category: unknown, path: string): void {
    if (!this.isObject(category)) {
      this.addError(path, 'Category must be an object');
      return;
    }

    const c = category as Record<string, unknown>;
    this.validateRequiredString(c, 'id', path);
    this.validateRequiredString(c, 'name', path);

    if (c.displayOrder !== undefined) {
      this.validateNumber(c.displayOrder, `${path}.displayOrder`);
    }

    if (!Array.isArray(c.items)) {
      this.addError(`${path}.items`, 'Items must be an array');
    } else {
      const commonGroups = (c.commonOptionGroups as any[]) || [];
      c.items.forEach((item, i) => {
        this.validateMenuItem(item, `${path}.items[${i}]`, commonGroups);
      });
    }
  }

  private validateMenuItem(item: unknown, path: string, commonGroups: any[] = []): void {
    if (!this.isObject(item)) {
      this.addError(path, 'Item must be an object');
      return;
    }

    const m = item as Record<string, unknown>;
    this.validateRequiredString(m, 'id', path);
    this.validateRequiredString(m, 'name', path);
    this.validateRequiredNumber(m, 'price', path);

    if (m.hasSet !== undefined && typeof m.hasSet !== 'boolean') {
      this.addError(`${path}.hasSet`, 'Must be a boolean');
    }
    if (m.available !== undefined && typeof m.available !== 'boolean') {
      this.addError(`${path}.available`, 'Must be a boolean');
    }
    if (m.setPrice !== undefined) {
      this.validateNumber(m.setPrice, `${path}.setPrice`);
    }
    if (m.calories !== undefined) {
      this.validateNumber(m.calories, `${path}.calories`);
    }
    if (m.allergens !== undefined && !Array.isArray(m.allergens)) {
      this.addError(`${path}.allergens`, 'Must be an array');
    }
    if (m.tags !== undefined && !Array.isArray(m.tags)) {
      this.addError(`${path}.tags`, 'Must be an array');
    }

    // Validate excludeOptions
    if (m.excludeOptions !== undefined) {
      if (!Array.isArray(m.excludeOptions)) {
        this.addError(`${path}.excludeOptions`, 'Must be an array');
      } else {
        // Validate each item is a string and valid reference
        m.excludeOptions.forEach((opt: unknown, i: number) => {
          if (typeof opt !== 'string') {
            this.addError(`${path}.excludeOptions[${i}]`, 'Must be a string');
          } else {
            // Check if 'opt' is valid relative to option groups
            // Merge item-specific optionGroups for completeness (if exists)
            const itemGroups = (m.optionGroups as any[]) || [];
            const allGroups = [...commonGroups, ...itemGroups];
            this.validateExcludeOptionReference(opt, allGroups, `${path}.excludeOptions[${i}]`);
          }
        });
      }
    }
  }

  private validateExcludeOptionReference(opt: string, groups: any[], path: string) {
    // 1. Check if it matches a Group ID
    if (groups.some(g => g.id === opt)) return;

    // 2. Check if it matches groupId.optionId
    if (opt.includes('.')) {
      const [gId, oId] = opt.split('.');
      const group = groups.find(g => g.id === gId);
      if (group && group.items && Array.isArray(group.items)) {
        if (group.items.some((item: any) => item.id === oId)) return;
      }
    }

    // 3. Check if it matches a direct Option ID (in any group)
    const foundInItems = groups.some(g => g.items && Array.isArray(g.items) && g.items.some((item: any) => item.id === opt));
    if (foundInItems) return;

    this.addError(path, `Reference "${opt}" not found in option groups`);
  }

  private validateMenuOptions(
    options: Record<string, unknown>,
    path: string
  ): void {
    if (!Array.isArray(options.setChoices)) {
      this.addError(`${path}.setChoices`, 'Must be an array');
    } else {
      options.setChoices.forEach((opt, i) => {
        this.validateOptionItem(opt, `${path}.setChoices[${i}]`);
      });
    }

    if (!Array.isArray(options.drinks)) {
      this.addError(`${path}.drinks`, 'Must be an array');
    } else {
      options.drinks.forEach((opt, i) => {
        this.validateOptionItem(opt, `${path}.drinks[${i}]`);
      });
    }

    if (!Array.isArray(options.sides)) {
      this.addError(`${path}.sides`, 'Must be an array');
    } else {
      options.sides.forEach((opt, i) => {
        this.validateOptionItem(opt, `${path}.sides[${i}]`);
      });
    }

    // Optional customOptions validation
    if (options.customOptions !== undefined) {
      if (!Array.isArray(options.customOptions)) {
        this.addError(`${path}.customOptions`, 'Must be an array');
      } else {
        options.customOptions.forEach((group, i) => {
          this.validateCustomOptionGroup(group, `${path}.customOptions[${i}]`);
        });
      }
    }
  }

  private validateMenuOptionsPartial(
    options: Record<string, unknown>,
    path: string
  ): void {
    if (options.setChoices !== undefined) {
      if (!Array.isArray(options.setChoices)) {
        this.addError(`${path}.setChoices`, 'Must be an array');
      } else {
        options.setChoices.forEach((opt, i) => {
          this.validateOptionItem(opt, `${path}.setChoices[${i}]`);
        });
      }
    }

    if (options.drinks !== undefined) {
      if (!Array.isArray(options.drinks)) {
        this.addError(`${path}.drinks`, 'Must be an array');
      } else {
        options.drinks.forEach((opt, i) => {
          this.validateOptionItem(opt, `${path}.drinks[${i}]`);
        });
      }
    }

    if (options.sides !== undefined) {
      if (!Array.isArray(options.sides)) {
        this.addError(`${path}.sides`, 'Must be an array');
      } else {
        options.sides.forEach((opt, i) => {
          this.validateOptionItem(opt, `${path}.sides[${i}]`);
        });
      }
    }

    if (options.customOptions !== undefined) {
      if (!Array.isArray(options.customOptions)) {
        this.addError(`${path}.customOptions`, 'Must be an array');
      } else {
        options.customOptions.forEach((group, i) => {
          this.validateCustomOptionGroup(group, `${path}.customOptions[${i}]`);
        });
      }
    }
  }

  private validateOptionItem(option: unknown, path: string): void {
    if (!this.isObject(option)) {
      this.addError(path, 'Option must be an object');
      return;
    }

    const o = option as Record<string, unknown>;
    this.validateRequiredString(o, 'id', path);
    this.validateRequiredString(o, 'name', path);

    if (o.price !== undefined) {
      this.validateNumber(o.price, `${path}.price`);
    }
    if (o.available !== undefined && typeof o.available !== 'boolean') {
      this.addError(`${path}.available`, 'Must be a boolean');
    }
  }

  private validateCustomOptionGroup(group: unknown, path: string): void {
    if (!this.isObject(group)) {
      this.addError(path, 'Custom option group must be an object');
      return;
    }

    const g = group as Record<string, unknown>;
    this.validateRequiredString(g, 'id', path);
    this.validateRequiredString(g, 'name', path);

    if (g.required !== undefined && typeof g.required !== 'boolean') {
      this.addError(`${path}.required`, 'Must be a boolean');
    }
    if (g.multiSelect !== undefined && typeof g.multiSelect !== 'boolean') {
      this.addError(`${path}.multiSelect`, 'Must be a boolean');
    }
    if (g.maxSelections !== undefined) {
      this.validateNumber(g.maxSelections, `${path}.maxSelections`);
    }

    if (!Array.isArray(g.options)) {
      this.addError(`${path}.options`, 'Must be an array');
    } else {
      g.options.forEach((opt, i) => {
        this.validateOptionItem(opt, `${path}.options[${i}]`);
      });
    }
  }

  // ============ Promotion Validation ============
  private validatePromotions(promotions: unknown[]): void {
    promotions.forEach((promo, i) => {
      this.validatePromotion(promo, `promotions[${i}]`);
    });
  }

  private validatePromotion(promotion: unknown, path: string): void {
    if (!this.isObject(promotion)) {
      this.addError(path, 'Promotion must be an object');
      return;
    }

    const p = promotion as Record<string, unknown>;
    this.validateRequiredString(p, 'id', path);
    this.validateRequiredString(p, 'name', path);
    this.validateRequiredNumber(p, 'value', path);

    const validTypes = ['discount_percent', 'discount_fixed', 'bundle', 'bogo'];
    if (!validTypes.includes(p.type as string)) {
      this.addError(
        `${path}.type`,
        `Must be one of: ${validTypes.join(', ')}`
      );
    }

    if (p.active !== undefined && typeof p.active !== 'boolean') {
      this.addError(`${path}.active`, 'Must be a boolean');
    }

    if (p.startDate !== undefined) {
      this.validateISODate(p.startDate, `${path}.startDate`);
    }
    if (p.endDate !== undefined) {
      this.validateISODate(p.endDate, `${path}.endDate`);
    }
  }

  // ============ Settings Validation ============
  private validateSettings(settings: Record<string, unknown>): void {
    this.validateRequiredString(settings, 'language', 'settings');

    if (settings.voiceAssistant !== undefined) {
      this.validateVoiceAssistantSettings(
        settings.voiceAssistant,
        'settings.voiceAssistant'
      );
    }
    if (settings.payment !== undefined) {
      this.validatePaymentSettings(settings.payment, 'settings.payment');
    }
    if (settings.display !== undefined) {
      this.validateDisplaySettings(settings.display, 'settings.display');
    }
    if (settings.ageRestrictions !== undefined) {
      this.validateAgeRestrictionSettings(
        settings.ageRestrictions,
        'settings.ageRestrictions'
      );
    }
  }

  private validateSettingsPartial(settings: Record<string, unknown>): void {
    if (settings.language !== undefined) {
      this.validateString(settings.language, 'settings.language');
    }
    if (settings.voiceAssistant !== undefined) {
      this.validateVoiceAssistantSettings(
        settings.voiceAssistant,
        'settings.voiceAssistant'
      );
    }
    if (settings.payment !== undefined) {
      this.validatePaymentSettings(settings.payment, 'settings.payment');
    }
    if (settings.display !== undefined) {
      this.validateDisplaySettings(settings.display, 'settings.display');
    }
    if (settings.ageRestrictions !== undefined) {
      this.validateAgeRestrictionSettings(
        settings.ageRestrictions,
        'settings.ageRestrictions'
      );
    }
  }

  private validateVoiceAssistantSettings(va: unknown, path: string): void {
    if (!this.isObject(va)) {
      this.addError(path, 'Voice assistant settings must be an object');
      return;
    }

    const v = va as Record<string, unknown>;
    if (v.enabled !== undefined && typeof v.enabled !== 'boolean') {
      this.addError(`${path}.enabled`, 'Must be a boolean');
    }
    if (v.greeting !== undefined) {
      this.validateString(v.greeting, `${path}.greeting`);
    }
    if (v.persona !== undefined) {
      this.validateString(v.persona, `${path}.persona`);
    }
  }

  private validatePaymentSettings(payment: unknown, path: string): void {
    if (!this.isObject(payment)) {
      this.addError(path, 'Payment settings must be an object');
      return;
    }

    const p = payment as Record<string, unknown>;
    if (p.acceptedMethods !== undefined && !Array.isArray(p.acceptedMethods)) {
      this.addError(`${path}.acceptedMethods`, 'Must be an array');
    }
    if (p.tipEnabled !== undefined && typeof p.tipEnabled !== 'boolean') {
      this.addError(`${path}.tipEnabled`, 'Must be a boolean');
    }
  }

  private validateDisplaySettings(display: unknown, path: string): void {
    if (!this.isObject(display)) {
      this.addError(path, 'Display settings must be an object');
      return;
    }

    const d = display as Record<string, unknown>;
    const validThemes = ['light', 'dark', 'custom'];
    if (d.theme !== undefined && !validThemes.includes(d.theme as string)) {
      this.addError(`${path}.theme`, `Must be one of: ${validThemes.join(', ')}`);
    }

    const validFontSizes = ['small', 'medium', 'large'];
    if (
      d.fontSize !== undefined &&
      !validFontSizes.includes(d.fontSize as string)
    ) {
      this.addError(
        `${path}.fontSize`,
        `Must be one of: ${validFontSizes.join(', ')}`
      );
    }

    if (d.idleTimeout !== undefined) {
      this.validateNumber(d.idleTimeout, `${path}.idleTimeout`);
    }
  }

  private validateAgeRestrictionSettings(ar: unknown, path: string): void {
    if (!this.isObject(ar)) {
      this.addError(path, 'Age restriction settings must be an object');
      return;
    }

    const a = ar as Record<string, unknown>;
    if (a.enabled !== undefined && typeof a.enabled !== 'boolean') {
      this.addError(`${path}.enabled`, 'Must be a boolean');
    }
    if (a.restrictedItems !== undefined && !Array.isArray(a.restrictedItems)) {
      this.addError(`${path}.restrictedItems`, 'Must be an array');
    }
    if (a.minAge !== undefined) {
      this.validateNumber(a.minAge, `${path}.minAge`);
    }
  }

  // ============ Helper Methods ============
  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private addError(path: string, message: string): void {
    this.errors.push({ path, message });
  }

  private validateRequiredString(
    obj: Record<string, unknown>,
    field: string,
    prefix = ''
  ): void {
    const path = prefix ? `${prefix}.${field}` : field;
    if (obj[field] === undefined) {
      this.addError(path, 'Required field is missing');
    } else if (typeof obj[field] !== 'string') {
      this.addError(path, 'Must be a string');
    }
  }

  private validateRequiredNumber(
    obj: Record<string, unknown>,
    field: string,
    prefix = ''
  ): void {
    const path = prefix ? `${prefix}.${field}` : field;
    if (obj[field] === undefined) {
      this.addError(path, 'Required field is missing');
    } else if (typeof obj[field] !== 'number') {
      this.addError(path, 'Must be a number');
    }
  }

  private validateString(value: unknown, path: string): void {
    if (typeof value !== 'string') {
      this.addError(path, 'Must be a string');
    }
  }

  private validateNumber(value: unknown, path: string): void {
    if (typeof value !== 'number') {
      this.addError(path, 'Must be a number');
    }
  }

  private validateTimeString(value: unknown, path: string): void {
    if (typeof value !== 'string') {
      this.addError(path, 'Must be a string');
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(value)) {
      this.addError(path, 'Must be in HH:MM format');
    }
  }

  private validateISODate(value: unknown, path: string): void {
    if (typeof value !== 'string') {
      this.addError(path, 'Must be a string');
      return;
    }
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      this.addError(path, 'Must be a valid ISO 8601 date');
    }
  }
}

// Static convenience methods
export function validateProfile(profile: unknown): profile is StoreProfile {
  const validator = new ProfileValidator();
  return validator.validate(profile);
}

export function validatePartialProfile(
  partial: unknown
): partial is Partial<StoreProfile> {
  const validator = new ProfileValidator();
  return validator.validatePartial(partial);
}

export function getValidationErrors(profile: unknown): string[] {
  const validator = new ProfileValidator();
  validator.validate(profile);
  return validator.getErrorMessages();
}
