/**
 * Age detection using face-api.js
 */

import * as faceapi from 'face-api.js';
import { AgeGroup } from '@/shared/types';
import {
  AgeEstimation,
  FaceDetection,
  FaceAnalysisResult,
  VisionInput,
  VisionConfig,
} from './types';

/**
 * Converts estimated age to age group
 */
function getAgeGroup(age: number): AgeGroup {
  if (age <= 12) return AgeGroup.CHILD;
  if (age <= 19) return AgeGroup.TEENAGER;
  if (age <= 29) return AgeGroup.YOUNG_ADULT;
  if (age <= 49) return AgeGroup.ADULT;
  if (age <= 64) return AgeGroup.MIDDLE_AGED;
  return AgeGroup.SENIOR;
}

/**
 * AgeDetector class for facial age estimation
 */
export class AgeDetector {
  private modelsLoaded = false;
  private config: VisionConfig;

  constructor(config: Partial<VisionConfig> = {}) {
    this.config = {
      modelPath: config.modelPath || '/models',
      minConfidence: config.minConfidence || 0.5,
      enableAgeDetection: config.enableAgeDetection ?? true,
    };
  }

  /**
   * Load face-api.js models
   */
  async loadModels(): Promise<void> {
    if (this.modelsLoaded) {
      return;
    }

    try {
      // Use absolute URL to ensure correct path resolution
      const modelPath = window.location.origin + this.config.modelPath;
      console.log('[AgeDetector] Loading models from:', modelPath);

      // Load models one by one to identify which one fails
      console.log('[AgeDetector] Loading tinyFaceDetector...');
      await faceapi.nets.tinyFaceDetector.loadFromUri(modelPath);
      console.log('[AgeDetector] ✓ tinyFaceDetector loaded');

      console.log('[AgeDetector] Loading faceLandmark68Net...');
      await faceapi.nets.faceLandmark68Net.loadFromUri(modelPath);
      console.log('[AgeDetector] ✓ faceLandmark68Net loaded');

      console.log('[AgeDetector] Loading ageGenderNet...');
      await faceapi.nets.ageGenderNet.loadFromUri(modelPath);
      console.log('[AgeDetector] ✓ ageGenderNet loaded');

      this.modelsLoaded = true;
      console.log('[AgeDetector] Models loaded successfully');
    } catch (error) {
      console.error('[AgeDetector] Failed to load models:', error);
      throw new Error('Failed to load face detection models');
    }
  }

  /**
   * Detect face and estimate age from input
   */
  async detectAge(input: VisionInput): Promise<FaceAnalysisResult> {
    if (!this.modelsLoaded) {
      throw new Error('Models not loaded. Call loadModels() first.');
    }

    try {
      // Detect face with age and gender
      const detection = await faceapi
        .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withAgeAndGender();

      // No face detected
      if (!detection) {
        return {
          detected: false,
          timestamp: Date.now(),
        };
      }

      // Check confidence threshold
      if (detection.detection.score < this.config.minConfidence) {
        return {
          detected: false,
          timestamp: Date.now(),
        };
      }

      // Extract face detection info
      const faceDetection: FaceDetection = {
        box: {
          x: detection.detection.box.x,
          y: detection.detection.box.y,
          width: detection.detection.box.width,
          height: detection.detection.box.height,
        },
        confidence: detection.detection.score,
      };

      // Extract age estimation
      const ageEstimation: AgeEstimation = {
        estimatedAge: Math.round(detection.age),
        ageGroup: getAgeGroup(detection.age),
        confidence: detection.detection.score,
      };

      return {
        detected: true,
        detection: faceDetection,
        age: ageEstimation,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('[AgeDetector] Detection failed:', error);
      return {
        detected: false,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Check if models are loaded
   */
  isReady(): boolean {
    return this.modelsLoaded;
  }
}
