// ============ Store Info Types ============
export interface BusinessHours {
  open: string; // "09:00"
  close: string; // "22:00"
  closed?: boolean;
}

export interface WeeklyHours {
  monday: BusinessHours;
  tuesday: BusinessHours;
  wednesday: BusinessHours;
  thursday: BusinessHours;
  friday: BusinessHours;
  saturday: BusinessHours;
  sunday: BusinessHours;
}

export interface StoreInfo {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  businessHours?: WeeklyHours;
  timezone?: string;
  currency: string;
  taxRate?: number;
  logoUrl?: string;
}

// ============ Menu Types ============
export interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  hasSet: boolean;
  setPrice?: number;
  calories?: number;
  allergens?: string[];
  available: boolean;
  tags?: string[];
}

export interface MenuCategory {
  id: string;
  name: string;
  displayOrder: number;
  imageUrl?: string;
  items: MenuItem[];
}

export interface OptionItem {
  id: string;
  name: string;
  price: number;
  available: boolean;
}

export interface CustomOptionGroup {
  id: string;
  name: string;
  required: boolean;
  multiSelect: boolean;
  maxSelections?: number;
  options: OptionItem[];
}

export interface MenuOptions {
  setChoices: OptionItem[];
  drinks: OptionItem[];
  sides: OptionItem[];
  customOptions?: CustomOptionGroup[];
}

export interface Menu {
  categories: MenuCategory[];
  options: MenuOptions;
}

// ============ Promotion Types ============
export type PromotionType =
  | 'discount_percent'
  | 'discount_fixed'
  | 'bundle'
  | 'bogo';

export interface TimeRange {
  start: string; // "09:00"
  end: string; // "22:00"
}

export interface PromotionConditions {
  minOrderAmount?: number;
  applicableItems?: string[];
  applicableCategories?: string[];
  dayOfWeek?: number[]; // 0 = Sunday, 6 = Saturday
  timeRange?: TimeRange;
}

export interface Promotion {
  id: string;
  name: string;
  description?: string;
  type: PromotionType;
  value: number;
  conditions?: PromotionConditions;
  startDate?: string; // ISO 8601
  endDate?: string; // ISO 8601
  active: boolean;
}

// ============ Settings Types ============
export interface VoiceAssistantSettings {
  enabled: boolean;
  greeting: string;
  persona: string;
}

export interface PaymentSettings {
  acceptedMethods: string[];
  tipEnabled: boolean;
}

export interface DisplaySettings {
  theme: 'light' | 'dark' | 'custom';
  fontSize: 'small' | 'medium' | 'large';
  idleTimeout: number; // in seconds
}

export interface AgeRestrictionSettings {
  enabled: boolean;
  restrictedItems: string[];
  minAge: number;
}

export interface Settings {
  language: string;
  voiceAssistant?: VoiceAssistantSettings;
  payment?: PaymentSettings;
  display?: DisplaySettings;
  ageRestrictions?: AgeRestrictionSettings;
}

// ============ Profile Types ============
export interface StoreProfile {
  profileId: string;
  version: string;
  store: StoreInfo;
  menu: Menu;
  promotions: Promotion[];
  settings: Settings;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

// ============ Version Control Types ============
export type DiffOperationType =
  | 'add'
  | 'remove'
  | 'replace'
  | 'move'
  | 'copy'
  | 'test';

export interface DiffOperation {
  op: DiffOperationType;
  path: string; // JSON Pointer (RFC 6901)
  value?: unknown; // For add/replace/test
  from?: string; // For move/copy
}

export interface JsonDiff {
  operations: DiffOperation[];
}

export interface ProfileCommit {
  commitId: string;
  timestamp: string; // ISO 8601
  message: string;
  author?: string;
  parentCommitId: string | null;
  snapshot?: StoreProfile; // Only for initial commit
  diff?: JsonDiff; // For subsequent commits
}

export interface HistoryEntry {
  commitId: string;
  timestamp: string;
  message: string;
  author?: string;
}

// ============ Query Types ============
export interface MenuItemQuery {
  categoryId?: string;
  available?: boolean;
  hasSet?: boolean;
  tags?: string[];
  priceRange?: { min?: number; max?: number };
}

export interface PromotionQuery {
  active?: boolean;
  type?: PromotionType;
  currentlyValid?: boolean; // Checks date range and time
}

// ============ Module Config Types ============
export interface StoreProfileConfig {
  profilePath?: string;
  autoSave?: boolean;
  autoSaveInterval?: number;
  maxHistoryEntries?: number;
}
