/**
 * Vision Module - Main interface for face detection and age estimation
 */

import { IModule, ModuleStatus } from '@/shared/types';
import { AgeDetector } from './AgeDetector';
import { FaceAnalysisResult, VisionConfig, VisionInput } from './types';

/**
 * VisionModule provides face detection and age estimation capabilities
 */
export class VisionModule implements IModule {
  readonly name = 'VisionModule';
  private _status: ModuleStatus = ModuleStatus.UNINITIALIZED;
  private detector: AgeDetector;

  constructor(config?: Partial<VisionConfig>) {
    this.detector = new AgeDetector(config);
  }

  get status(): ModuleStatus {
    return this._status;
  }

  /**
   * Initialize the vision module and load models
   */
  async initialize(): Promise<void> {
    if (this._status === ModuleStatus.READY) {
      console.warn('[VisionModule] Already initialized');
      return;
    }

    try {
      this._status = ModuleStatus.INITIALIZING;
      console.log('[VisionModule] Initializing...');

      await this.detector.loadModels();

      this._status = ModuleStatus.READY;
      console.log('[VisionModule] Ready');
    } catch (error) {
      this._status = ModuleStatus.ERROR;
      console.error('[VisionModule] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Analyze a single frame/image for face and age detection
   * @param input - Image, video frame, or canvas element
   * @returns Face analysis result including age estimation
   */
  async analyzeFrame(input: VisionInput): Promise<FaceAnalysisResult> {
    if (this._status !== ModuleStatus.READY) {
      throw new Error('VisionModule not ready. Call initialize() first.');
    }

    return this.detector.detectAge(input);
  }

  /**
   * Check if the module is ready to use
   */
  isReady(): boolean {
    return this._status === ModuleStatus.READY && this.detector.isReady();
  }

  /**
   * Cleanup and destroy the module
   */
  async destroy(): Promise<void> {
    this._status = ModuleStatus.UNINITIALIZED;
    console.log('[VisionModule] Destroyed');
  }
}
