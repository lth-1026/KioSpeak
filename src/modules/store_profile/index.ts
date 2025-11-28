// Main module
export { StoreProfileModule } from './StoreProfileModule';
export type { ModuleStatus } from './StoreProfileModule';

// Types
export type {
  // Store Info
  BusinessHours,
  WeeklyHours,
  StoreInfo,

  // Menu
  MenuItem,
  MenuCategory,
  OptionItem,
  CustomOptionGroup,
  MenuOptions,
  Menu,

  // Promotions
  PromotionType,
  TimeRange,
  PromotionConditions,
  Promotion,

  // Settings
  VoiceAssistantSettings,
  PaymentSettings,
  DisplaySettings,
  AgeRestrictionSettings,
  Settings,

  // Profile
  StoreProfile,

  // Version Control
  DiffOperationType,
  DiffOperation,
  JsonDiff,
  ProfileCommit,
  HistoryEntry,

  // Queries
  MenuItemQuery,
  PromotionQuery,

  // Config
  StoreProfileConfig,
} from './types';

// Utilities
export { DiffEngine } from './DiffEngine';
export { HistoryManager } from './HistoryManager';
export { StoreProfileRepository } from './StoreProfileRepository';

// Validators
export {
  ProfileValidator,
  validateProfile,
  validatePartialProfile,
  getValidationErrors,
} from './validators/ProfileValidator';
