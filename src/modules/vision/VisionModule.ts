/**
 * Vision Module - Main interface for face detection and age estimation
 */

import { IModule, ModuleStatus } from '@/shared/types';
import { AgeDetector } from './AgeDetector';
import {
  FaceAnalysisResult,
  VisionConfig,
  VisionInput,
  MonitoringCallbacks,
  PersonDetectedEvent,
} from './types';

/**
 * VisionModule provides face detection and age estimation capabilities
 */
export class VisionModule implements IModule {
  readonly name = 'VisionModule';
  private _status: ModuleStatus = ModuleStatus.UNINITIALIZED;
  private detector: AgeDetector;
  private monitoringActive = false;
  private animationFrameId: number | null = null;
  private lastDetectionState = false;
  private callbacks: MonitoringCallbacks = {};

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
   * Start real-time person detection monitoring
   * @param videoElement - Video element to monitor
   * @param callbacks - Callbacks for detection events
   */
  startMonitoring(
    videoElement: HTMLVideoElement,
    callbacks: MonitoringCallbacks
  ): void {
    if (this._status !== ModuleStatus.READY) {
      throw new Error('VisionModule not ready. Call initialize() first.');
    }

    if (this.monitoringActive) {
      console.warn('[VisionModule] Monitoring already active');
      return;
    }

    this.callbacks = callbacks;
    this.monitoringActive = true;
    this.lastDetectionState = false;

    console.log('[VisionModule] Starting monitoring...');
    this.monitorLoop(videoElement);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (!this.monitoringActive) {
      return;
    }

    this.monitoringActive = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    console.log('[VisionModule] Monitoring stopped');
  }

  /**
   * Internal monitoring loop
   */
  private async monitorLoop(videoElement: HTMLVideoElement): Promise<void> {
    if (!this.monitoringActive) {
      return;
    }

    try {
      const result = await this.detector.detectAge(videoElement);

      // Call onFrame callback if provided
      if (this.callbacks.onFrame) {
        this.callbacks.onFrame(result);
      }

      // Detect state change
      if (result.detected && !this.lastDetectionState) {
        // Person just detected
        const event: PersonDetectedEvent = {
          detected: true,
          age: result.age,
          detection: result.detection,
          timestamp: result.timestamp,
        };

        if (this.callbacks.onPersonDetected) {
          this.callbacks.onPersonDetected(event);
        }

        this.lastDetectionState = true;
      } else if (!result.detected && this.lastDetectionState) {
        // Person lost
        if (this.callbacks.onPersonLost) {
          this.callbacks.onPersonLost();
        }

        this.lastDetectionState = false;
      }
    } catch (error) {
      console.error('[VisionModule] Monitoring error:', error);
    }

    // Continue loop
    this.animationFrameId = requestAnimationFrame(() =>
      this.monitorLoop(videoElement)
    );
  }

  /**
   * Check if the module is ready to use
   */
  isReady(): boolean {
    return this._status === ModuleStatus.READY && this.detector.isReady();
  }

  /**
   * Check if monitoring is active
   */
  isMonitoring(): boolean {
    return this.monitoringActive;
  }

  /**
   * Cleanup and destroy the module
   */
  async destroy(): Promise<void> {
    this.stopMonitoring();
    this._status = ModuleStatus.UNINITIALIZED;
    console.log('[VisionModule] Destroyed');
  }
}
