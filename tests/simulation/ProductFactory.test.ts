import { beforeEach, describe, expect, it } from 'vitest';
import { defaultRecipe, productGeometry } from '@/config/line.config';
import type { DefectType } from '@/models/DefectType';
import { GroundTruthManager } from '@/simulation/GroundTruthManager';
import { NOMINAL_LABEL_VARIANT, ProductFactory } from '@/simulation/ProductFactory';
import { resetIdCounters } from '@/utils/ids';
import { createRng } from '@/utils/rng';

describe('ProductFactory ground truth', () => {
  let truths: GroundTruthManager;
  let factory: ProductFactory;

  beforeEach(() => {
    resetIdCounters();
    truths = new GroundTruthManager();
    factory = new ProductFactory(truths, createRng(7));
  });

  const truthFor = (defect: DefectType) => {
    const product = factory.spawnProductWithDefect(defect, 0);
    const truth = truths.get(product.unitId);
    expect(truth).toBeDefined();
    return truth!;
  };

  it('marks a good unit as PASS with every attribute nominal', () => {
    const truth = truthFor('NONE');

    expect(truth.defectType).toBe('NONE');
    expect(truth.expectedResult).toBe('PASS');
    expect(truth.capPresent).toBe(true);
    expect(truth.labelPresent).toBe(true);
    expect(truth.labelVariant).toBe(NOMINAL_LABEL_VARIANT);
    expect(Math.abs(truth.labelRotationDegrees)).toBeLessThan(
      productGeometry.crookedLabelRangeDegrees[0],
    );
    expect(truth.fillLevel).toBeGreaterThan(productGeometry.underfillRange[1]);
  });

  it('derives FAIL for every defect class', () => {
    const defects: DefectType[] = [
      'MISSING_CAP',
      'MISSING_LABEL',
      'CROOKED_LABEL',
      'WRONG_LABEL',
      'UNDERFILL',
    ];

    for (const defect of defects) {
      const truth = truthFor(defect);
      expect(truth.expectedResult).toBe('FAIL');
      expect(truth.defectType).toBe(defect);
    }
  });

  it('removes the cap for MISSING_CAP only', () => {
    expect(truthFor('MISSING_CAP').capPresent).toBe(false);
    expect(truthFor('MISSING_LABEL').capPresent).toBe(true);
  });

  it('removes the label for MISSING_LABEL only', () => {
    expect(truthFor('MISSING_LABEL').labelPresent).toBe(false);
    expect(truthFor('MISSING_CAP').labelPresent).toBe(true);
  });

  it('rotates the label beyond the good-unit tolerance for CROOKED_LABEL', () => {
    const [min, max] = productGeometry.crookedLabelRangeDegrees;

    for (let i = 0; i < 25; i += 1) {
      const rotation = Math.abs(truthFor('CROOKED_LABEL').labelRotationDegrees);
      expect(rotation).toBeGreaterThanOrEqual(min);
      expect(rotation).toBeLessThanOrEqual(max);
    }
  });

  it('swaps to a non-nominal label variant for WRONG_LABEL', () => {
    const truth = truthFor('WRONG_LABEL');

    expect(truth.labelPresent).toBe(true);
    expect(truth.labelVariant).not.toBe(NOMINAL_LABEL_VARIANT);
  });

  it('keeps UNDERFILL fill levels inside the configured range and below nominal', () => {
    const [min, max] = productGeometry.underfillRange;

    for (let i = 0; i < 25; i += 1) {
      const fillLevel = truthFor('UNDERFILL').fillLevel;
      expect(fillLevel).toBeGreaterThanOrEqual(min);
      expect(fillLevel).toBeLessThanOrEqual(max);
    }
  });

  it('keeps the underfill range visible above the label', () => {
    // Guards the geometry regression where the label hid the liquid surface.
    const labelTop = productGeometry.labelCenterHeight + productGeometry.labelHeight / 2;
    const lowestFillHeight = productGeometry.underfillRange[0] * (productGeometry.bodyHeight - 0.006);

    expect(lowestFillHeight).toBeGreaterThan(labelTop);
  });

  it('converges on the configured defect distribution', () => {
    const counts: Record<string, number> = {};
    const samples = 20000;

    for (let i = 0; i < samples; i += 1) {
      const product = factory.spawnRandomProduct(0);
      const defect = truths.get(product.unitId)!.defectType;
      counts[defect] = (counts[defect] ?? 0) + 1;
    }

    const defectiveCount = samples - (counts.NONE ?? 0);
    expect(defectiveCount / samples).toBeCloseTo(defaultRecipe.defectProbability, 1);

    for (const [defect, share] of Object.entries(defaultRecipe.defectDistribution)) {
      const observed = (counts[defect] ?? 0) / defectiveCount;
      expect(observed).toBeCloseTo(share, 1);
    }
  });

  it('returns copies so callers cannot mutate simulator truth', () => {
    const product = factory.spawnProductWithDefect('MISSING_CAP', 0);
    const truth = truths.get(product.unitId)!;

    truth.capPresent = true;

    expect(truths.get(product.unitId)!.capPresent).toBe(false);
  });
});
