
import { StoreProfileModule } from '../store_profile';
import type {
  StoreProfile,
  MenuCategory,
  MenuItem,
  MenuOptionGroup,
  HistoryEntry
} from '../store_profile/types';

export class StoreProfileManager {
  private static instance: StoreProfileManager;
  private module: StoreProfileModule;

  private constructor() {
    this.module = new StoreProfileModule();
  }

  public static getInstance(): StoreProfileManager {
    if (!StoreProfileManager.instance) {
      StoreProfileManager.instance = new StoreProfileManager();
    }
    return StoreProfileManager.instance;
  }

  public async initialize(): Promise<void> {
    if (this.module.status !== 'ready') {
      await this.module.initialize();
    }
  }

  // ============ Read Operations ============
  public getStoreInfo() {
    return this.module.getStoreInfo();
  }

  public getCategories(): MenuCategory[] {
    return this.module.getCategories();
  }

  public getCategory(categoryId: string): MenuCategory | undefined {
    return this.module.getCategory(categoryId);
  }

  public getMenuItem(itemId: string): MenuItem | undefined {
    return this.module.getMenuItem(itemId);
  }

  public getRawMenuItem(itemId: string): MenuItem | undefined {
    return this.module.getRawMenuItem(itemId);
  }


  // ============ Write Operations (Staging) ============
  public addCategory(category: Omit<MenuCategory, 'id' | 'items'>): string {
    return this.module.addCategory(category);
  }

  public updateCategory(categoryId: string, updates: Partial<Omit<MenuCategory, 'id' | 'items'>>): void {
    this.module.updateCategory(categoryId, updates);
  }

  public removeCategory(categoryId: string): void {
    this.module.removeCategory(categoryId);
  }

  public addMenuItem(categoryId: string, item: Omit<MenuItem, 'id'>): string {
    const categories = this.module.getCategories();
    const category = categories.find((c) => c.id === categoryId);
    if (!category) {
      throw new Error(`Category not found: ${categoryId}`);
    }

    this.validateUniqueItemName(category, item.name);
    this.validateUniqueOptionNames(item.optionGroups);

    return this.module.addMenuItem(categoryId, item);
  }

  public updateMenuItem(itemId: string, updates: Partial<MenuItem>): void {
    if (updates.name || updates.optionGroups) {
      const categories = this.module.getCategories();
      let foundCategory: MenuCategory | undefined;

      for (const cat of categories) {
        const item = cat.items.find((i) => i.id === itemId);
        if (item) {
          foundCategory = cat;
          break;
        }
      }

      if (foundCategory) {
        if (updates.name) {
          this.validateUniqueItemName(foundCategory, updates.name, itemId);
        }
        if (updates.optionGroups) {
          this.validateUniqueOptionNames(updates.optionGroups);
        }
      }
    }

    this.module.updateMenuItem(itemId, updates);
  }

  public removeMenuItem(itemId: string): void {
    this.module.removeMenuItem(itemId);
  }

  // ============ Validation Helpers ============
  private validateUniqueItemName(
    category: MenuCategory,
    name: string,
    excludeId?: string
  ): void {
    const hasDuplicate = category.items.some(
      (i) => i.name === name && i.id !== excludeId
    );
    if (hasDuplicate) {
      throw new Error(
        `Menu item with name "${name}" already exists in category "${category.name}"`
      );
    }
  }

  private validateUniqueOptionNames(
    optionGroups: MenuOptionGroup[] | undefined
  ): void {
    if (!optionGroups) return;

    // 1. Validate Option Group names are unique
    const groupNames = new Set<string>();
    for (const group of optionGroups) {
      if (groupNames.has(group.name)) {
        throw new Error(`Duplicate option group name: "${group.name}"`);
      }
      groupNames.add(group.name);

      // 2. Validate Option Item names are unique within the group
      const itemNames = new Set<string>();
      for (const item of group.items) {
        if (itemNames.has(item.name)) {
          throw new Error(
            `Duplicate option item name "${item.name}" in group "${group.name}"`
          );
        }
        itemNames.add(item.name);
      }
    }
  }

  // ============ Commit / History Operations ============
  public getStagedChanges(): Partial<StoreProfile> | null {
    return this.module.getStagedChanges();
  }

  public async commitChanges(message: string, author?: string): Promise<void> {
    await this.module.commitChanges(message, author);
  }

  public async getHistory(limit?: number): Promise<HistoryEntry[]> {
    return this.module.getHistory(limit);
  }

  public async rollback(commitId: string, author?: string): Promise<void> {
    await this.module.rollback(commitId, author);
  }

  public importProfile(json: string): void {
    this.module.importProfile(json);
  }

  public exportProfile(): string {
    return this.module.exportProfile();
  }
}
