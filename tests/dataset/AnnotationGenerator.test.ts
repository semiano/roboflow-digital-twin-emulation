import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { datasetClasses } from '@/config/dataset.config';
import { DEFECT_TYPES } from '@/models/DefectType';
import { mapClassName } from '@/vision/roboflow/PredictionMapper';
import {
  generateProductAnnotation,
  serializeYoloAnnotation,
} from '@/dataset/AnnotationGenerator';

const camera = (): THREE.PerspectiveCamera => {
  const value = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  value.position.set(0, 0, 5);
  value.lookAt(0, 0, 0);
  return value;
};

const product = (): THREE.Mesh => new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1));

describe('generateProductAnnotation', () => {
  it('uses class names that map back to every simulator truth type', () => {
    expect(datasetClasses).toHaveLength(DEFECT_TYPES.length);
    expect(datasetClasses.map(mapClassName)).toEqual(DEFECT_TYPES);
  });

  it('projects the whole product into a normalized box with the matching defect class', () => {
    const annotation = generateProductAnnotation(product(), camera(), 'MISSING_CAP');

    expect(annotation).toBeDefined();
    expect(annotation?.className).toBe('missing_cap');
    expect(annotation?.classId).toBe(datasetClasses.indexOf('missing_cap'));
    expect(annotation?.xCenter).toBeCloseTo(0.5);
    expect(annotation?.yCenter).toBeCloseTo(0.5);
    expect(annotation?.width).toBeGreaterThan(0);
    expect(annotation?.height).toBeGreaterThan(annotation?.width ?? 0);
    for (const value of [
      annotation?.xCenter,
      annotation?.yCenter,
      annotation?.width,
      annotation?.height,
    ]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('does not annotate invisible products or products behind the camera', () => {
    const hidden = product();
    hidden.visible = false;
    expect(generateProductAnnotation(hidden, camera(), 'NONE')).toBeUndefined();

    const behind = product();
    behind.position.z = 10;
    expect(generateProductAnnotation(behind, camera(), 'NONE')).toBeUndefined();
  });

  it('serializes a Roboflow-compatible YOLO detection row', () => {
    const annotation = generateProductAnnotation(product(), camera(), 'UNDERFILL');
    expect(annotation).toBeDefined();

    const row = serializeYoloAnnotation(annotation!);
    expect(row.split(' ')).toHaveLength(5);
    expect(row.startsWith(`${datasetClasses.indexOf('underfill')} `)).toBe(true);
  });
});