import { describe, expect, it } from 'vitest';
import type { ProductGroundTruth } from '@/models/GroundTruth';
import { EvaluationService } from '@/historian/EvaluationService';
import { MetricsEngine } from '@/historian/MetricsEngine';

const truth = (defect: ProductGroundTruth['defectType']): ProductGroundTruth => ({
  defectType: defect,
  capPresent: defect !== 'MISSING_CAP',
  labelPresent: defect !== 'MISSING_LABEL',
  labelRotationDegrees: defect === 'CROOKED_LABEL' ? 12 : 0,
  labelVariant: defect === 'WRONG_LABEL' ? 'WRONG' : 'LBL-500ML-A',
  fillLevel: defect === 'UNDERFILL' ? 0.6 : 0.95,
  expectedResult: defect === 'NONE' ? 'PASS' : 'FAIL',
});

describe('EvaluationService and MetricsEngine', () => {
  it('calculates the four confusion outcomes with manufacturing terminology', () => {
    const evaluation = new EvaluationService();
    const metrics = new MetricsEngine();
    const cases = [
      { unitId: 'tp', expected: truth('MISSING_CAP'), result: 'FAIL' as const, action: 'REJECT' as const },
      { unitId: 'tn', expected: truth('NONE'), result: 'PASS' as const, action: 'ACCEPT' as const },
      { unitId: 'fp', expected: truth('NONE'), result: 'FAIL' as const, action: 'REJECT' as const },
      { unitId: 'fn', expected: truth('UNDERFILL'), result: 'PASS' as const, action: 'ACCEPT' as const },
    ];

    for (const item of cases) {
      evaluation.recordVision({
        type: 'VISION_COMPLETED',
        simulationTime: 1,
        inspectionId: `inspection-${item.unitId}`,
        unitId: item.unitId,
        result: item.result,
        ...(item.result === 'FAIL' ? { defectCode: item.expected.defectType } : {}),
        confidence: 0.9,
        latencyMs: 100,
      });
      metrics.record(evaluation.evaluateAction(item.unitId, item.action, item.expected));
    }

    expect(metrics.snapshot()).toMatchObject({
      totalUnits: 4,
      goodUnits: 2,
      truePositives: 1,
      trueNegatives: 1,
      falseRejects: 1,
      escapes: 1,
      falseRejectRate: 0.5,
      escapeRate: 0.5,
      precision: 0.5,
      recall: 0.5,
      accuracy: 0.5,
      coverage: 1,
      unknownRate: 0,
      meanLatencyMs: 100,
      p95LatencyMs: 100,
    });
  });

  it('does not credit a fail-safe reject as a correct model prediction', () => {
    const evaluation = new EvaluationService();
    const metrics = new MetricsEngine();
    evaluation.recordVisionFailure('unknown-defect');

    const inspected = evaluation.evaluateAction(
      'unknown-defect',
      'REJECT',
      truth('MISSING_LABEL'),
    );
    metrics.record(inspected);

    expect(inspected.productionActionCorrect).toBe(true);
    expect(inspected.evaluation).toBeUndefined();
    expect(metrics.snapshot()).toMatchObject({
      totalUnits: 1,
      unknowns: 1,
      truePositives: 0,
      accuracy: 0,
      coverage: 0,
      unknownRate: 1,
      recall: 0,
    });
  });

  it('includes abstained defects in the recall denominator', () => {
    const evaluation = new EvaluationService();
    const metrics = new MetricsEngine();

    evaluation.recordVision({
      type: 'VISION_COMPLETED',
      simulationTime: 1,
      inspectionId: 'inspection-detected',
      unitId: 'detected',
      result: 'FAIL',
      defectCode: 'MISSING_CAP',
      confidence: 0.9,
      latencyMs: 100,
    });
    metrics.record(evaluation.evaluateAction('detected', 'REJECT', truth('MISSING_CAP')));
    evaluation.recordVisionFailure('abstained');
    metrics.record(evaluation.evaluateAction('abstained', 'REJECT', truth('UNDERFILL')));

    expect(metrics.snapshot()).toMatchObject({ recall: 0.5, coverage: 0.5, unknownRate: 0.5 });
  });
});