
import { StoreProfileModule } from '../store_profile';
import type {
  StoreProfile,
  MenuCategory,
  MenuItem,
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
    return this.module.addMenuItem(categoryId, item);
  }

  public updateMenuItem(itemId: string, updates: Partial<MenuItem>): void {
    this.module.updateMenuItem(itemId, updates);
  }

  public removeMenuItem(itemId: string): void {
    this.module.removeMenuItem(itemId);
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
