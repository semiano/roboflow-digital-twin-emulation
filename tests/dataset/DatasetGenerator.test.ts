import { describe, expect, it, vi } from 'vitest';
import { DatasetGenerator } from '@/dataset/DatasetGenerator';

describe('DatasetGenerator', () => {
  it('creates a deterministic balanced preview across all six classes', async () => {
    const render = vi.fn(async (request) => ({
      imageDataUrl: `data:image/jpeg;base64,${request.seed}`,
      annotation: {
        classId: 0,
        className: 'bottle' as const,
        xCenter: 0.5,
        yCenter: 0.5,
        width: 0.2,
        height: 0.4,
      },
    }));
    const progress = vi.fn();

    const samples = await new DatasetGenerator(render).generateBalancedPreview(2, 100, progress);

    expect(samples).toHaveLength(12);
    expect(new Set(samples.map((sample) => sample.defectType)).size).toBe(6);
    expect(samples.map((sample) => sample.seed)).toEqual(
      Array.from({ length: 12 }, (_, index) => 100 + index),
    );
    expect(progress).toHaveBeenLastCalledWith({
      completed: 12,
      total: 12,
      currentClass: 'UNDERFILL',
    });
  });

  it('stratifies train, validation, and test splits within every class', async () => {
    const render = vi.fn(async () => ({
      imageDataUrl: 'data:image/jpeg;base64,sample',
      annotation: {
        classId: 0,
        className: 'bottle' as const,
        xCenter: 0.5,
        yCenter: 0.5,
        width: 0.2,
        height: 0.4,
      },
    }));

    const samples = await new DatasetGenerator(render).generateBalancedPreview(10, 100);

    for (const defectType of new Set(samples.map((sample) => sample.defectType))) {
      const classSamples = samples.filter((sample) => sample.defectType === defectType);
      expect(classSamples.filter((sample) => sample.split === 'train')).toHaveLength(7);
      expect(classSamples.filter((sample) => sample.split === 'valid')).toHaveLength(2);
      expect(classSamples.filter((sample) => sample.split === 'test')).toHaveLength(1);
    }
  });

  it('reserves validation and test samples for the default small preview', async () => {
    const render = vi.fn(async () => ({
      imageDataUrl: 'data:image/jpeg;base64,sample',
      annotation: {
        classId: 0,
        className: 'bottle' as const,
        xCenter: 0.5,
        yCenter: 0.5,
        width: 0.2,
        height: 0.4,
      },
    }));

    const samples = await new DatasetGenerator(render).generateBalancedPreview(4, 100);

    for (const defectType of new Set(samples.map((sample) => sample.defectType))) {
      const classSamples = samples.filter((sample) => sample.defectType === defectType);
      expect(classSamples.map((sample) => sample.split)).toEqual(['train', 'train', 'valid', 'test']);
    }
  });
});