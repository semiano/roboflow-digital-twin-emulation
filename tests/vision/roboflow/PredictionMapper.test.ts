import { describe, expect, it } from 'vitest';
import { visionConfig } from '@/config/vision.config';
import { mapClassName, mapRoboflowResult } from '@/vision/roboflow/PredictionMapper';
import type { RoboflowDetection, RoboflowInferenceResult } from '@/vision/roboflow/RoboflowTypes';

const detection = (className: string, confidence: number): RoboflowDetection => ({
  class: className,
  confidence,
  x: 256,
  y: 300,
  width: 100,
  height: 200,
});

const result = (detections: RoboflowDetection[]): RoboflowInferenceResult => ({
  detections,
  image: { width: 512, height: 512 },
  visualizationBase64: undefined,
  serverTimeMs: 40,
  inferenceId: 'inf-1',
  outputNames: ['predictions'],
});

const map = (detections: RoboflowDetection[]) =>
  mapRoboflowResult(result(detections), 12.5, 60).prediction;

describe('mapClassName', () => {
  it('accepts the hyphen, underscore and spaced forms a Roboflow project may use', () => {
    expect(mapClassName('missing_cap')).toBe('MISSING_CAP');
    expect(mapClassName('missing-cap')).toBe('MISSING_CAP');
    expect(mapClassName(' Missing Cap ')).toBe('MISSING_CAP');
  });

  it('returns undefined for a class the config does not know', () => {
    expect(mapClassName('forklift')).toBeUndefined();
  });
});

describe('mapRoboflowResult', () => {
  it('passes a unit whose only confident detection is the bottle itself', () => {
    const prediction = map([detection('bottle', 0.97)]);

    expect(prediction.inspectionResult).toBe('PASS');
    expect(prediction.confidence).toBeCloseTo(0.97);
    expect(prediction.defectCode).toBeUndefined();
  });

  it('fails the unit and names the most severe defect when several are detected', () => {
    const prediction = map([
      detection('bottle', 0.98),
      detection('crooked_label', 0.88),
      detection('missing_cap', 0.71),
    ]);

    expect(prediction.inspectionResult).toBe('FAIL');
    // MISSING_CAP outranks CROOKED_LABEL even though it scored lower.
    expect(prediction.defectCode).toBe('MISSING_CAP');
    expect(prediction.confidence).toBeCloseTo(0.71);
  });

  it('ignores a defect box below the detection confidence floor', () => {
    const floor = visionConfig.minimumDetectionConfidence;
    const prediction = map([detection('bottle', 0.95), detection('underfill', floor - 0.01)]);

    expect(prediction.inspectionResult).toBe('PASS');
  });

  it('reports UNKNOWN for an empty frame rather than passing product', () => {
    const prediction = map([]);

    expect(prediction.inspectionResult).toBe('UNKNOWN');
    expect(prediction.confidence).toBe(0);
  });

  it('reports UNKNOWN when nothing recognisable was detected', () => {
    const prediction = map([detection('forklift', 0.99)]);

    expect(prediction.inspectionResult).toBe('UNKNOWN');
  });

  it('collects unmapped classes for operator feedback but still reports their boxes', () => {
    const mapped = mapRoboflowResult(
      result([detection('bottle', 0.95), detection('forklift', 0.8)]),
      1,
      10,
    );

    expect(mapped.unmappedClasses).toEqual(['forklift']);
    // The overlay should still draw what the model saw, mapped or not.
    expect(mapped.prediction.detections).toHaveLength(2);
  });

  it('carries source dimensions and the inference id through for the overlay and historian', () => {
    const prediction = map([detection('bottle', 0.9)]);

    expect(prediction.sourceWidth).toBe(512);
    expect(prediction.sourceHeight).toBe(512);
    expect(prediction.inferenceId).toBe('inf-1');
    expect(prediction.inferenceLatencyMs).toBe(60);
    expect(prediction.timestamp).toBe(12.5);
  });
});
