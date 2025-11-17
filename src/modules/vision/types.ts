/**
 * Vision module types and interfaces
 */

import { AgeGroup } from '@/shared/types';

/**
 * Face detection result with bounding box
 */
export interface FaceDetection {
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
}

/**
 * Age estimation result
 */
export interface AgeEstimation {
  estimatedAge: number;
  ageGroup: AgeGroup;
  confidence: number;
}

/**
 * Complete face analysis result
 */
export interface FaceAnalysisResult {
  detected: boolean;
  detection?: FaceDetection;
  age?: AgeEstimation;
  timestamp: number;
}

/**
 * Vision module configuration
 */
export interface VisionConfig {
  modelPath: string;
  minConfidence: number;
  enableAgeDetection: boolean;
}

/**
 * Input source for vision analysis
 */
export type VisionInput =
  | HTMLImageElement
  | HTMLVideoElement
  | HTMLCanvasElement
  | ImageData;

/**
 * Person detection event data
 */
export interface PersonDetectedEvent {
  detected: boolean;
  age?: AgeEstimation;
  detection?: FaceDetection;
  timestamp: number;
}

/**
 * Monitoring callbacks
 */
export interface MonitoringCallbacks {
  onPersonDetected?: (event: PersonDetectedEvent) => void;
  onPersonLost?: () => void;
  onFrame?: (result: FaceAnalysisResult) => void;
}
