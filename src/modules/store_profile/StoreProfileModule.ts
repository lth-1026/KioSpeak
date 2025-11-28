import { v4 as uuidv4 } from 'uuid';
import type {
  StoreProfile,
  StoreInfo,
  Menu,
  MenuCategory,
  MenuItem,
  MenuOptions,
  OptionItem,
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

      // Try to load stored profile first, then fall back to fetching
      let profile = await this.repository.getStoredProfile();

      if (!profile) {
        profile = await this.repository.loadProfile();
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
      items = items.concat(category.items);
    }

    // Apply filters
    if (query?.available !== undefined) {
      items = items.filter((item) => item.available === query.available);
    }
    if (query?.hasSet !== undefined) {
      items = items.filter((item) => item.hasSet === query.hasSet);
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
      if (item) return { ...item };
    }
    return undefined;
  }

  getCategories(): MenuCategory[] {
    this.ensureReady();
    return this.getWorkingProfile().menu.categories.map((c) => ({
      ...c,
      items: [...c.items],
    }));
  }

  getCategory(categoryId: string): MenuCategory | undefined {
    this.ensureReady();
    const category = this.getWorkingProfile().menu.categories.find(
      (c) => c.id === categoryId
    );
    return category ? { ...category, items: [...category.items] } : undefined;
  }

  getMenuOptions(): MenuOptions {
    this.ensureReady();
    const options = this.getWorkingProfile().menu.options;
    return {
      setChoices: [...options.setChoices],
      drinks: [...options.drinks],
      sides: [...options.sides],
      customOptions: options.customOptions ? [...options.customOptions] : undefined,
    };
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
   * (Maintains backward compatibility with Realtime.ts)
   */
  getMenuForLLM(): object {
    this.ensureReady();
    const profile = this.getWorkingProfile();

    // Convert to the original menu.json format for LLM compatibility
    return {
      categories: profile.menu.categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        items: cat.items
          .filter((item) => item.available)
          .map((item) => ({
            id: item.id,
            name: item.name,
            price: item.price,
            has_set: item.hasSet,
          })),
      })),
      options: {
        set_choices: profile.menu.options.setChoices
          .filter((o) => o.available)
          .map((o) => o.name),
        drinks: profile.menu.options.drinks
          .filter((o) => o.available)
          .map((o) => o.name),
        sides: profile.menu.options.sides
          .filter((o) => o.available)
          .map((o) => o.name),
      },
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
