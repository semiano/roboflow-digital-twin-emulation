import type { DefectType } from '@/models/DefectType';
import type { ProductGroundTruth } from '@/models/GroundTruth';
import type { YoloAnnotation } from './AnnotationGenerator';

export type DatasetSplit = 'train' | 'valid' | 'test';
export type DatasetCameraPose = 'A' | 'B' | 'C' | 'D';

export interface DatasetRenderRequest {
  truth: ProductGroundTruth;
  seed: number;
  cameraPose: DatasetCameraPose;
}

export interface DatasetRenderResult {
  imageDataUrl: string;
  annotation: YoloAnnotation;
}

export interface DatasetSample extends DatasetRenderResult {
  id: string;
  defectType: DefectType;
  split: DatasetSplit;
  seed: number;
  cameraPose: DatasetCameraPose;
}

export interface DatasetGenerationProgress {
  completed: number;
  total: number;
  currentClass: DefectType;
}