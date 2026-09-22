import type { DefectType } from '@/models/DefectType';
import { simulationConfig } from './simulation.config';
import { defectClassNames } from './vision.config';

export const datasetClassNames = defectClassNames;

export const datasetClasses = [
  'bottle',
  'missing_cap',
  'missing_label',
  'crooked_label',
  'wrong_label',
  'underfill',
] as const;

export const datasetConfig = {
  imageWidth: simulationConfig.inspectionCamera.renderWidth,
  imageHeight: simulationConfig.inspectionCamera.renderHeight,
  jpegQuality: 0.92,
  defaultImageCount: 5000,
  minimumImagesPerClass: 500,
  split: {
    train: 0.7,
    valid: 0.2,
    test: 0.1,
  },
  defectMix: {
    NONE: 0.5,
    MISSING_CAP: 0.1,
    MISSING_LABEL: 0.1,
    CROOKED_LABEL: 0.1,
    WRONG_LABEL: 0.1,
    UNDERFILL: 0.1,
  } satisfies Readonly<Record<DefectType, number>>,
} as const;