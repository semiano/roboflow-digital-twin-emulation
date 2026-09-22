import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { exportYoloDataset } from '@/dataset/DatasetExporter';
import type { DatasetSample } from '@/dataset/DatasetTypes';

const sample: DatasetSample = {
  id: 'synthetic-00000100',
  defectType: 'MISSING_CAP',
  split: 'valid',
  seed: 100,
  cameraPose: 'B',
  imageDataUrl: 'data:image/jpeg;base64,aGVsbG8=',
  annotation: {
    classId: 1,
    className: 'missing_cap',
    xCenter: 0.5,
    yCenter: 0.4,
    width: 0.2,
    height: 0.3,
  },
};

describe('DatasetExporter', () => {
  it('creates a Roboflow-compatible YOLO archive with matching image and label paths', async () => {
    const archive = unzipSync(new Uint8Array(await exportYoloDataset([sample]).arrayBuffer()));

    expect(Object.keys(archive).sort()).toEqual([
      'data.yaml',
      'dataset.json',
      'valid/images/synthetic-00000100.jpg',
      'valid/labels/synthetic-00000100.txt',
    ]);
    expect(strFromU8(archive['data.yaml']!)).toContain("names: ['bottle', 'missing_cap'");
    expect(strFromU8(archive['valid/labels/synthetic-00000100.txt']!)).toBe(
      '1 0.500000 0.400000 0.200000 0.300000\n',
    );
    expect(strFromU8(archive['valid/images/synthetic-00000100.jpg']!)).toBe('hello');
  });
});