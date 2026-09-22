import { DEFECT_TYPES, type DefectType } from '@/models/DefectType';
import { createProductGroundTruth } from '@/simulation/ProductFactory';
import { createRng } from '@/utils/rng';
import type {
  DatasetCameraPose,
  DatasetGenerationProgress,
  DatasetRenderRequest,
  DatasetRenderResult,
  DatasetSample,
  DatasetSplit,
} from './DatasetTypes';

export type DatasetRenderer = (request: DatasetRenderRequest) => Promise<DatasetRenderResult>;

const CAMERA_POSES: readonly DatasetCameraPose[] = ['A', 'B', 'C', 'D'];

const splitFor = (indexWithinClass: number, samplesPerClass: number): DatasetSplit => {
  if (samplesPerClass < 3) return indexWithinClass === 0 ? 'train' : 'valid';
  const testCount = Math.max(1, Math.round(samplesPerClass * 0.1));
  const validCount = Math.max(1, Math.round(samplesPerClass * 0.2));
  const testStart = samplesPerClass - testCount;
  const validStart = testStart - validCount;
  if (indexWithinClass >= testStart) return 'test';
  if (indexWithinClass >= validStart) return 'valid';
  return 'train';
};

export class DatasetGenerator {
  constructor(private readonly render: DatasetRenderer) {}

  async generateBalancedPreview(
    samplesPerClass: number,
    baseSeed: number,
    onProgress?: (progress: DatasetGenerationProgress) => void,
  ): Promise<DatasetSample[]> {
    const perClass = Math.max(1, Math.floor(samplesPerClass));
    const total = DEFECT_TYPES.length * perClass;
    const samples: DatasetSample[] = [];

    for (let classIndex = 0; classIndex < DEFECT_TYPES.length; classIndex += 1) {
      const defectType = DEFECT_TYPES[classIndex] as DefectType;
      for (let withinClass = 0; withinClass < perClass; withinClass += 1) {
        const index = classIndex * perClass + withinClass;
        const seed = baseSeed + index;
        const cameraPose = CAMERA_POSES[seed % CAMERA_POSES.length] as DatasetCameraPose;
        const truth = createProductGroundTruth(defectType, createRng(seed));
        const rendered = await this.render({ truth, seed, cameraPose });

        samples.push({
          id: `synthetic-${String(seed).padStart(8, '0')}`,
          defectType,
          split: splitFor(withinClass, perClass),
          seed,
          cameraPose,
          ...rendered,
        });
        onProgress?.({ completed: index + 1, total, currentClass: defectType });
      }
    }

    return samples;
  }
}