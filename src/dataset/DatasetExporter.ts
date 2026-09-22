import { strToU8, zipSync } from 'fflate';
import { datasetClasses, datasetConfig } from '@/config/dataset.config';
import { serializeYoloAnnotation } from './AnnotationGenerator';
import type { DatasetSample } from './DatasetTypes';

const imageBytes = (dataUrl: string): Uint8Array => {
  const match = /^data:image\/[a-z+.-]+;base64,(.+)$/i.exec(dataUrl);
  if (!match?.[1]) throw new Error('Dataset sample does not contain a base64 image');
  return Uint8Array.from(atob(match[1]), (character) => character.charCodeAt(0));
};

const dataYaml = [
  'path: .',
  'train: train/images',
  'val: valid/images',
  'test: test/images',
  `nc: ${datasetClasses.length}`,
  `names: [${datasetClasses.map((name) => `'${name}'`).join(', ')}]`,
  '',
].join('\n');

export const createDatasetManifest = (samples: readonly DatasetSample[]): string =>
  JSON.stringify(
    {
      format: 'YOLO',
      classes: datasetClasses,
      imageCount: samples.length,
      imageSize: [datasetConfig.imageWidth, datasetConfig.imageHeight],
      seeds: [...new Set(samples.map((sample) => sample.seed))],
      cameraPoses: [...new Set(samples.map((sample) => sample.cameraPose))],
      samples: samples.map(({ imageDataUrl: _imageDataUrl, ...sample }) => ({
        ...sample,
        yolo: serializeYoloAnnotation(sample.annotation),
      })),
    },
    null,
    2,
  );

export const exportYoloDataset = (samples: readonly DatasetSample[]): Blob => {
  if (samples.length === 0) throw new Error('Generate dataset samples before exporting');

  const files: Record<string, Uint8Array> = {
    'data.yaml': strToU8(dataYaml),
    'dataset.json': strToU8(createDatasetManifest(samples)),
  };

  for (const sample of samples) {
    const basename = sample.id.replace(/[^a-z0-9_-]/gi, '-');
    files[`${sample.split}/images/${basename}.jpg`] = imageBytes(sample.imageDataUrl);
    files[`${sample.split}/labels/${basename}.txt`] = strToU8(
      `${serializeYoloAnnotation(sample.annotation)}\n`,
    );
  }

  const bytes = zipSync(files, { level: 6 });
  return new Blob([bytes], { type: 'application/zip' });
};