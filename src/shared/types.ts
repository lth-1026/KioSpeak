/**
 * Shared types for KioSpeak application
 */

/**
 * Age group classification for customer segmentation
 */
export enum AgeGroup {
  CHILD = 'CHILD',           // 0-12
  TEENAGER = 'TEENAGER',     // 13-19
  YOUNG_ADULT = 'YOUNG_ADULT', // 20-29
  ADULT = 'ADULT',           // 30-49
  MIDDLE_AGED = 'MIDDLE_AGED', // 50-64
  SENIOR = 'SENIOR',         // 65+
}

/**
 * Module initialization status
 */
export enum ModuleStatus {
  UNINITIALIZED = 'UNINITIALIZED',
  INITIALIZING = 'INITIALIZING',
  READY = 'READY',
  ERROR = 'ERROR',
}

/**
 * Base interface for all modules
 */
export interface IModule {
  readonly name: string;
  readonly status: ModuleStatus;
  initialize(): Promise<void>;
  destroy(): Promise<void>;
}
