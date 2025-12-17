import { v4 as uuidv4 } from 'uuid';
import type {
  StoreProfile,
  StoreInfo,
  MenuCategory,
  MenuItem,
  MenuOptionGroup,
  MenuOptions,
  Promotion,
  Settings,
  StoreProfileConfig,
  MenuItemQuery,
  PromotionQuery,
  HistoryEntry,
  ProfileCommit,
  JsonDiff,
  VoiceAssistantSettings,
  PaymentSettings,
  DisplaySettings,
} from './types';
import { StoreProfileRepository } from './StoreProfileRepository';
import { HistoryManager } from './HistoryManager';
import { DiffEngine } from './DiffEngine';
import { ProfileValidator } from './validators/ProfileValidator';

export type ModuleStatus = 'uninitialized' | 'initializing' | 'ready' | 'error';

export class StoreProfileModule {
  readonly name = 'StoreProfileModule';

  private _status: ModuleStatus = 'uninitialized';
  private repository: StoreProfileRepository;
  private historyManager: HistoryManager;
  private validator: ProfileValidator;

  private currentProfile: StoreProfile | null = null;
  private stagedChanges: Partial<StoreProfile> | null = null;
  private workingProfile: StoreProfile | null = null;

  constructor(config?: StoreProfileConfig) {
    this.repository = new StoreProfileRepository(config);
    this.historyManager = new HistoryManager(this.repository);
    this.validator = new ProfileValidator();
  }

  // ============ Module Lifecycle ============

  get status(): ModuleStatus {
    return this._status;
  }

  async initialize(): Promise<void> {
    if (this._status === 'ready') return;

    this._status = 'initializing';

    try {
      await this.repository.initialize();

      let profile: StoreProfile | null = null;

      // DEV 모드에서는 항상 JSON 파일에서 로드 (캐시 무시)
      const isDev = import.meta.env.DEV;

      if (isDev) {
        console.log('[StoreProfile] DEV mode: loading profile from JSON file');
        profile = await this.repository.loadProfile();
      } else {
        // Production: Try to load stored profile first
        profile = await this.repository.getStoredProfile();

        // If no stored profile, try to reconstruct from IndexedDB commit history
        if (!profile) {
          try {
            profile = await this.repository.reconstructProfileFromCommits();
          } catch (error) {
            // Reconstruction failed (corrupted history, etc.) - continue to fallback
            console.warn('Failed to reconstruct profile from commits:', error);
            profile = null;
          }
        }

        // If still no profile, fall back to fetching from file
        if (!profile) {
          profile = await this.repository.loadProfile();
        }
      }

      if (!this.validator.validate(profile)) {
        throw new Error(
          `Invalid profile: ${this.validator.getErrorMessages().join(', ')}`
        );
      }

      this.currentProfile = profile;
      this.workingProfile = DiffEngine.cloneProfile(profile);

      // Create initial commit if no history exists
      const hasHistory = await this.historyManager.hasHistory();
      if (!hasHistory) {
        await this.historyManager.createCommit(
          this.currentProfile,
          null,
          'Initial profile'
        );
      }

      this._status = 'ready';
    } catch (error) {
      this._status = 'error';
      throw error;
    }
  }

  async destroy(): Promise<void> {
    await this.repository.destroy();
    this.currentProfile = null;
    this.workingProfile = null;
    this.stagedChanges = null;
    this._status = 'uninitialized';
  }

  // ============ Profile Operations (Git-like) ============

  async loadCurrentProfile(): Promise<StoreProfile> {
    this.ensureReady();
    return DiffEngine.cloneProfile(this.currentProfile!);
  }

  stageChanges(changes: Partial<StoreProfile>): void {
    this.ensureReady();

    if (!this.validator.validatePartial(changes)) {
      throw new Error(
        `Invalid changes: ${this.validator.getErrorMessages().join(', ')}`
      );
    }

    this.stagedChanges = this.stagedChanges
      ? this.mergeChanges(this.stagedChanges, changes)
      : changes;

    // Apply changes to working profile
    this.workingProfile = this.applyChanges(
      DiffEngine.cloneProfile(this.currentProfile!),
      this.stagedChanges
    );
  }

  getStagedChanges(): Partial<StoreProfile> | null {
    return this.stagedChanges ? { ...this.stagedChanges } : null;
  }

  discardChanges(): void {
    this.ensureReady();
    this.stagedChanges = null;
    this.workingProfile = DiffEngine.cloneProfile(this.currentProfile!);
  }

  async commitChanges(
    message: string,
    author?: string
  ): Promise<ProfileCommit> {
    this.ensureReady();

    if (!this.stagedChanges || !this.workingProfile) {
      throw new Error('No staged changes to commit');
    }

    // Update timestamps
    this.workingProfile.updatedAt = new Date().toISOString();

    const commit = await this.historyManager.createCommit(
      this.workingProfile,
      this.currentProfile!,
      message,
      author
    );

    // Update current profile
    this.currentProfile = DiffEngine.cloneProfile(this.workingProfile);
    await this.repository.saveProfile(this.currentProfile);

    // Clear staged changes
    this.stagedChanges = null;

    return commit;
  }

  async rollback(commitId: string, author?: string): Promise<void> {
    this.ensureReady();

    await this.historyManager.rollback(
      commitId,
      this.currentProfile!,
      author
    );

    // Load the rolled-back profile
    const rolledBackProfile =
      await this.historyManager.getProfileAtCommit(commitId);
    this.currentProfile = rolledBackProfile;
    this.workingProfile = DiffEngine.cloneProfile(rolledBackProfile);
    this.stagedChanges = null;

    await this.repository.saveProfile(this.currentProfile);
  }

  async getHistory(
    limit?: number,
    offset?: number
  ): Promise<HistoryEntry[]> {
    this.ensureReady();
    return this.historyManager.getHistory(limit, offset);
  }

  async getCommit(commitId: string): Promise<ProfileCommit | null> {
    this.ensureReady();
    return this.historyManager.getCommit(commitId);
  }

  async getDiff(
    fromCommitId: string,
    toCommitId: string
  ): Promise<JsonDiff> {
    this.ensureReady();
    return this.historyManager.getDiff(fromCommitId, toCommitId);
  }

  async getProfileAtCommit(commitId: string): Promise<StoreProfile> {
    this.ensureReady();
    return this.historyManager.getProfileAtCommit(commitId);
  }

  // ============ Store Info Operations ============

  getStoreInfo(): StoreInfo {
    this.ensureReady();
    return { ...this.getWorkingProfile().store };
  }

  updateStoreInfo(info: Partial<StoreInfo>): void {
    this.stageChanges({
      store: { ...this.getWorkingProfile().store, ...info },
    });
  }

  isStoreOpen(): boolean {
    this.ensureReady();
    const store = this.getWorkingProfile().store;
    if (!store.businessHours) return true;

    const now = new Date();
    const dayNames = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ] as const;
    const dayName = dayNames[now.getDay()];
    const hours = store.businessHours[dayName];

    if (!hours || hours.closed) return false;

    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    return currentTime >= hours.open && currentTime <= hours.close;
  }

  // ============ Menu Operations ============

  getMenuItems(query?: MenuItemQuery): MenuItem[] {
    this.ensureReady();
    const menu = this.getWorkingProfile().menu;
    let items: MenuItem[] = [];

    for (const category of menu.categories) {
      if (query?.categoryId && category.id !== query.categoryId) continue;

      const categoryItems = category.items.map((item) =>
        this.resolveItem(item, category)
      );

      items = items.concat(categoryItems);
    }

    // Apply filters
    if (query?.available !== undefined) {
      items = items.filter((item) => item.available === query.available);
    }
    if (query?.hasOptions !== undefined) {
      items = items.filter((item) =>
        query.hasOptions
          ? item.optionGroups && item.optionGroups.length > 0
          : !item.optionGroups || item.optionGroups.length === 0
      );
    }
    if (query?.tags?.length) {
      items = items.filter((item) =>
        query.tags!.some((tag) => item.tags?.includes(tag))
      );
    }
    if (query?.priceRange) {
      const { min, max } = query.priceRange;
      items = items.filter((item) => {
        if (min !== undefined && item.price < min) return false;
        if (max !== undefined && item.price > max) return false;
        return true;
      });
    }

    return items;
  }

  getMenuItem(itemId: string): MenuItem | undefined {
    this.ensureReady();
    for (const category of this.getWorkingProfile().menu.categories) {
      const item = category.items.find((i) => i.id === itemId);
      if (item) {
        return this.resolveItem(item, category);
      }
    }
    return undefined;
  }

  getCategories(): MenuCategory[] {
    this.ensureReady();
    return this.getWorkingProfile().menu.categories.map((c) => ({
      ...c,
      items: c.items.map((item) => this.resolveItem(item, c)),
    }));
  }

  getCategory(categoryId: string): MenuCategory | undefined {
    this.ensureReady();
    const category = this.getWorkingProfile().menu.categories.find(
      (c) => c.id === categoryId
    );
    if (!category) return undefined;

    return {
      ...category,
      items: category.items.map((item) => this.resolveItem(item, category)),
    };
  }

  /**
   * @deprecated 하위 호환성을 위해 유지. 새 코드에서는 MenuItem.optionGroups 사용
   */
  getMenuOptions(): MenuOptions | undefined {
    this.ensureReady();
    const options = this.getWorkingProfile().menu.options;
    if (!options) return undefined;
    return {
      setChoices: [...options.setChoices],
      drinks: [...options.drinks],
      sides: [...options.sides],
      customOptions: options.customOptions ? [...options.customOptions] : undefined,
    };
  }

  /**
   * 메뉴 이름으로 메뉴 아이템 조회
   */
  getMenuItemByName(name: string): MenuItem | undefined {
    this.ensureReady();
    for (const category of this.getWorkingProfile().menu.categories) {
      const item = category.items.find((i) => i.name === name);
      if (item) {
        return this.resolveItem(item, category);
      }
    }
    return undefined;
  }

  /**
   * 메뉴 아이템의 옵션 그룹 조회
   */
  getMenuItemOptions(itemId: string): MenuOptionGroup[] | undefined {
    const item = this.getMenuItem(itemId); // getMenuItem already returns merged options
    return item?.optionGroups ? [...item.optionGroups] : undefined;
  }

  addMenuItem(
    categoryId: string,
    item: Omit<MenuItem, 'id'>
  ): string {
    this.ensureReady();
    const menu = this.getWorkingProfile().menu;
    const categoryIndex = menu.categories.findIndex(
      (c) => c.id === categoryId
    );

    if (categoryIndex === -1) {
      throw new Error(`Category not found: ${categoryId}`);
    }

    const category = menu.categories[categoryIndex];
    this.validateUniqueItemName(category, item.name);

    const newItem: MenuItem = {
      ...item,
      id: uuidv4(),
    };

    const newCategories = [...menu.categories];
    newCategories[categoryIndex] = {
      ...newCategories[categoryIndex],
      items: [...newCategories[categoryIndex].items, newItem],
    };

    this.stageChanges({
      menu: { ...menu, categories: newCategories },
    });

    return newItem.id;
  }

  updateMenuItem(itemId: string, updates: Partial<MenuItem>): void {
    this.ensureReady();
    const menu = this.getWorkingProfile().menu;

    let found = false;
    const newCategories = menu.categories.map((category) => {
      const itemIndex = category.items.findIndex((i) => i.id === itemId);
      if (itemIndex === -1) return category;

      found = true;

      // If name is being updated, check for duplicates
      if (updates.name) {
        this.validateUniqueItemName(category, updates.name, itemId);
      }

      const newItems = [...category.items];
      newItems[itemIndex] = { ...newItems[itemIndex], ...updates };
      return { ...category, items: newItems };
    });

    if (!found) {
      throw new Error(`Item not found: ${itemId}`);
    }

    this.stageChanges({
      menu: { ...menu, categories: newCategories },
    });
  }

  removeMenuItem(itemId: string): void {
    this.ensureReady();
    const menu = this.getWorkingProfile().menu;

    let found = false;
    const newCategories = menu.categories.map((category) => {
      const itemIndex = category.items.findIndex((i) => i.id === itemId);
      if (itemIndex === -1) return category;

      found = true;
      const newItems = category.items.filter((i) => i.id !== itemId);
      return { ...category, items: newItems };
    });

    if (!found) {
      throw new Error(`Item not found: ${itemId}`);
    }

    this.stageChanges({
      menu: { ...menu, categories: newCategories },
    });
  }

  setItemAvailability(itemId: string, available: boolean): void {
    this.updateMenuItem(itemId, { available });
  }

  addCategory(category: Omit<MenuCategory, 'id' | 'items'>): string {
    this.ensureReady();
    const menu = this.getWorkingProfile().menu;

    const newCategory: MenuCategory = {
      ...category,
      id: uuidv4(),
      items: [],
    };

    this.stageChanges({
      menu: {
        ...menu,
        categories: [...menu.categories, newCategory],
      },
    });

    return newCategory.id;
  }

  updateCategory(
    categoryId: string,
    updates: Partial<Omit<MenuCategory, 'id' | 'items'>>
  ): void {
    this.ensureReady();
    const menu = this.getWorkingProfile().menu;

    const categoryIndex = menu.categories.findIndex(
      (c) => c.id === categoryId
    );
    if (categoryIndex === -1) {
      throw new Error(`Category not found: ${categoryId}`);
    }

    const newCategories = [...menu.categories];
    newCategories[categoryIndex] = {
      ...newCategories[categoryIndex],
      ...updates,
    };

    this.stageChanges({
      menu: { ...menu, categories: newCategories },
    });
  }

  removeCategory(categoryId: string): void {
    this.ensureReady();
    const menu = this.getWorkingProfile().menu;

    const categoryIndex = menu.categories.findIndex(
      (c) => c.id === categoryId
    );
    if (categoryIndex === -1) {
      throw new Error(`Category not found: ${categoryId}`);
    }

    const newCategories = menu.categories.filter((c) => c.id !== categoryId);

    this.stageChanges({
      menu: { ...menu, categories: newCategories },
    });
  }

  // ============ Promotion Operations ============

  getPromotions(query?: PromotionQuery): Promotion[] {
    this.ensureReady();
    let promotions = [...this.getWorkingProfile().promotions];

    if (query?.active !== undefined) {
      promotions = promotions.filter((p) => p.active === query.active);
    }
    if (query?.type) {
      promotions = promotions.filter((p) => p.type === query.type);
    }
    if (query?.currentlyValid) {
      const now = new Date();
      promotions = promotions.filter((p) => {
        if (!p.active) return false;
        if (p.startDate && new Date(p.startDate) > now) return false;
        if (p.endDate && new Date(p.endDate) < now) return false;
        return true;
      });
    }

    return promotions;
  }

  getActivePromotions(): Promotion[] {
    return this.getPromotions({ active: true, currentlyValid: true });
  }

  getApplicablePromotions(itemIds: string[]): Promotion[] {
    const activePromotions = this.getActivePromotions();

    return activePromotions.filter((promo) => {
      if (!promo.conditions) return true;

      const { applicableItems, applicableCategories } = promo.conditions;

      if (applicableItems?.length) {
        return itemIds.some((id) => applicableItems.includes(id));
      }

      if (applicableCategories?.length) {
        for (const itemId of itemIds) {
          const item = this.getMenuItem(itemId);
          if (!item) continue;

          for (const category of this.getCategories()) {
            if (
              category.items.some((i) => i.id === itemId) &&
              applicableCategories.includes(category.id)
            ) {
              return true;
            }
          }
        }
      }

      return true;
    });
  }

  addPromotion(promotion: Omit<Promotion, 'id'>): string {
    this.ensureReady();
    const promotions = this.getWorkingProfile().promotions;

    const newPromotion: Promotion = {
      ...promotion,
      id: uuidv4(),
    };

    this.stageChanges({
      promotions: [...promotions, newPromotion],
    });

    return newPromotion.id;
  }

  updatePromotion(promotionId: string, updates: Partial<Promotion>): void {
    this.ensureReady();
    const promotions = this.getWorkingProfile().promotions;

    const promoIndex = promotions.findIndex((p) => p.id === promotionId);
    if (promoIndex === -1) {
      throw new Error(`Promotion not found: ${promotionId}`);
    }

    const newPromotions = [...promotions];
    newPromotions[promoIndex] = { ...newPromotions[promoIndex], ...updates };

    this.stageChanges({ promotions: newPromotions });
  }

  removePromotion(promotionId: string): void {
    this.ensureReady();
    const promotions = this.getWorkingProfile().promotions;

    const promoIndex = promotions.findIndex((p) => p.id === promotionId);
    if (promoIndex === -1) {
      throw new Error(`Promotion not found: ${promotionId}`);
    }

    this.stageChanges({
      promotions: promotions.filter((p) => p.id !== promotionId),
    });
  }

  setPromotionActive(promotionId: string, active: boolean): void {
    this.updatePromotion(promotionId, { active });
  }

  // ============ Settings Operations ============

  getSettings(): Settings {
    this.ensureReady();
    return { ...this.getWorkingProfile().settings };
  }

  updateSettings(settings: Partial<Settings>): void {
    this.stageChanges({
      settings: { ...this.getWorkingProfile().settings, ...settings },
    });
  }

  getVoiceAssistantSettings(): VoiceAssistantSettings | undefined {
    return this.getSettings().voiceAssistant;
  }

  getPaymentSettings(): PaymentSettings | undefined {
    return this.getSettings().payment;
  }
  getDisplaySettings(): DisplaySettings | undefined {
    return this.getSettings().display;
  }

  // ============ Helper Methods ============
  private validateUniqueItemName(category: MenuCategory, name: string, excludeId?: string): void {
    const hasDuplicate = category.items.some(i => i.name === name && i.id !== excludeId);
    if (hasDuplicate) {
      throw new Error(`Menu item with name "${name}" already exists in category "${category.name}"`);
    }
  }

  // ============ Export/Import ============

  exportProfile(): string {
    this.ensureReady();
    return JSON.stringify(this.getWorkingProfile(), null, 2);
  }

  importProfile(json: string): void {
    this.ensureReady();
    const profile = JSON.parse(json) as StoreProfile;

    if (!this.validator.validate(profile)) {
      throw new Error(
        `Invalid profile: ${this.validator.getErrorMessages().join(', ')}`
      );
    }

    // Stage all fields as changes
    this.stagedChanges = profile;
    this.workingProfile = DiffEngine.cloneProfile(profile);
  }

  /**
   * Get menu data formatted for LLM system prompt
   * @param options.committedOnly - If true, use only committed profile (ignore staged changes)
   */
  getMenuForLLM(options?: { committedOnly?: boolean }): object {
    this.ensureReady();
    const profile = options?.committedOnly
      ? this.currentProfile!
      : this.getWorkingProfile();

    // 새 구조: 아이템별 optionGroups 포함 (Effective Option Groups)
    return {
      categories: profile.menu.categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        items: cat.items
          .filter((item) => item.available)
          .map((item) => {
            const effectiveGroups = this.resolveCommonOptionGroups(item, cat);
            return {
              id: item.id,
              name: item.name,
              price: item.price,
              optionGroups: effectiveGroups
                ?.map((group) => ({
                  id: group.id,
                  name: group.name,
                  required: group.required,
                  multiSelect: group.multiSelect,
                  dependsOn: group.dependsOn,
                  items: group.items
                    .filter((opt) => opt.available)
                    .map((opt) => ({
                      id: opt.id,
                      name: opt.name,
                      price: opt.price,
                    })),
                })) || null,
            };
          }),
      })),
    };
  }

  // ============ Private Helpers ============

  private ensureReady(): void {
    if (this._status !== 'ready') {
      throw new Error(`Module not ready. Current status: ${this._status}`);
    }
  }

  private getWorkingProfile(): StoreProfile {
    return this.workingProfile!;
  }

  /**
   * Resolve common option groups from category and merge with item-specific groups
   */
  private resolveCommonOptionGroups(
    item: MenuItem,
    category: MenuCategory
  ): MenuOptionGroup[] {
    const commonGroups = category.commonOptionGroups || [];
    const itemGroups = item.optionGroups || [];

    // If no common groups, return item groups (or empty)
    if (commonGroups.length === 0) {
      return itemGroups;
    }

    // Start with common groups
    const result: MenuOptionGroup[] = [...commonGroups];

    // Merge item groups
    for (const itemGroup of itemGroups) {
      const existingIndex = result.findIndex((g) => g.id === itemGroup.id);
      if (existingIndex !== -1) {
        // Override/Replace
        result[existingIndex] = itemGroup;
      } else {
        // Append
        result.push(itemGroup);
      }
    }

    return result;
  }

  /**
   * Resolve a single item with its option groups
   */
  private resolveItem(item: MenuItem, category: MenuCategory): MenuItem {
    return {
      ...item,
      optionGroups: this.resolveCommonOptionGroups(item, category),
    };
  }

  private mergeChanges(
    existing: Partial<StoreProfile>,
    incoming: Partial<StoreProfile>
  ): Partial<StoreProfile> {
    const merged = { ...existing };

    for (const [key, value] of Object.entries(incoming)) {
      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
      ) {
        merged[key as keyof StoreProfile] = {
          ...(existing[key as keyof StoreProfile] as object),
          ...value,
        } as any;
      } else {
        merged[key as keyof StoreProfile] = value as any;
      }
    }

    return merged;
  }

  private applyChanges(
    profile: StoreProfile,
    changes: Partial<StoreProfile>
  ): StoreProfile {
    const result = { ...profile };

    for (const [key, value] of Object.entries(changes)) {
      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
      ) {
        result[key as keyof StoreProfile] = {
          ...(profile[key as keyof StoreProfile] as object),
          ...value,
        } as any;
      } else {
        result[key as keyof StoreProfile] = value as any;
      }
    }

    return result;
  }
}
