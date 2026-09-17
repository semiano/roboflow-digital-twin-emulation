import { describe, expect, it } from 'vitest';
import { defectClassNames } from '@/config/vision.config';
import { DEFECT_TYPES, type DefectType } from '@/models/DefectType';
import { createRng } from '@/utils/rng';
import { MockVisionProvider, type FrameOracle } from '@/vision/MockVisionProvider';
import type { VisionInput } from '@/vision/VisionTypes';

const frame: VisionInput = {
  camera: undefined,
  stream: undefined,
  width: 512,
  height: 512,
  capturedAtSeconds: 1.5,
  frameNumber: 3,
};

async function build(oracle: FrameOracle, seed = 42): Promise<MockVisionProvider> {
  const provider = new MockVisionProvider(createRng(seed), oracle);
  await provider.connect();
  return provider;
}

async function sample(
  provider: MockVisionProvider,
  count: number,
): Promise<Array<Awaited<ReturnType<MockVisionProvider['inspect']>>>> {
  const results = [];
  for (let i = 0; i < count; i += 1) results.push(await provider.inspect(frame));
  return results;
}

describe('MockVisionProvider', () => {
  it('reports every defect class correctly when perfectly accurate', async () => {
    for (const defect of DEFECT_TYPES) {
      const provider = await build(() => defect);
      provider.configure({
        accuracy: 1,
        falsePositiveProbability: 0,
        falseNegativeProbability: 0,
      });

      const prediction = await provider.inspect(frame);

      expect(prediction.inspectionResult).toBe(defect === 'NONE' ? 'PASS' : 'FAIL');
      expect(prediction.defectCode ?? 'NONE').toBe(defect);
    }
  });

  it('converges on the configured false reject rate for good units', async () => {
    const provider = await build(() => 'NONE');
    provider.configure({ falsePositiveProbability: 0.2, falseNegativeProbability: 0.5 });

    const predictions = await sample(provider, 4000);
    const failed = predictions.filter((p) => p.inspectionResult === 'FAIL').length;

    // Escape rate must not leak into good units.
    expect(failed / predictions.length).toBeGreaterThan(0.17);
    expect(failed / predictions.length).toBeLessThan(0.23);
  });

  it('converges on the configured escape rate for defective units', async () => {
    const provider = await build(() => 'MISSING_CAP');
    provider.configure({ falseNegativeProbability: 0.15, falsePositiveProbability: 0.5 });

    const predictions = await sample(provider, 4000);
    const passed = predictions.filter((p) => p.inspectionResult === 'PASS').length;

    expect(passed / predictions.length).toBeGreaterThan(0.12);
    expect(passed / predictions.length).toBeLessThan(0.18);
  });

  it('spends accuracy on the defect class, not on the pass/fail call', async () => {
    const provider = await build(() => 'UNDERFILL');
    provider.configure({ accuracy: 0.5, falseNegativeProbability: 0, falsePositiveProbability: 0 });

    const predictions = await sample(provider, 2000);
    const correctClass = predictions.filter((p) => p.defectCode === 'UNDERFILL').length;

    expect(predictions.every((p) => p.inspectionResult === 'FAIL')).toBe(true);
    expect(correctClass / predictions.length).toBeGreaterThan(0.45);
    expect(correctClass / predictions.length).toBeLessThan(0.55);
  });

  it('returns UNKNOWN for an empty frame rather than a free pass', async () => {
    const provider = await build(() => undefined);
    const prediction = await provider.inspect(frame);

    expect(prediction.inspectionResult).toBe('UNKNOWN');
    expect(prediction.detections).toEqual([]);
  });

  it('rejects the call once disconnected', async () => {
    const provider = await build(() => 'NONE');
    await provider.disconnect();

    expect(provider.isConnected()).toBe(false);
    await expect(provider.inspect(frame)).rejects.toThrow(/disconnected/);
  });

  it('reports the configured latency and keeps RANDOM inside its range', async () => {
    const provider = await build(() => 'NONE');

    provider.configure({ latencyMode: 250 });
    expect((await provider.inspect(frame)).inferenceLatencyMs).toBe(250);

    provider.configure({ latencyMode: 'RANDOM' });
    for (const prediction of await sample(provider, 200)) {
      expect(prediction.inferenceLatencyMs).toBeGreaterThanOrEqual(20);
      expect(prediction.inferenceLatencyMs).toBeLessThanOrEqual(400);
    }
  });

  it('emits Roboflow-style detection boxes in camera pixels', async () => {
    const provider = await build(() => 'MISSING_CAP');
    provider.configure({ accuracy: 1, falseNegativeProbability: 0 });

    const { detections } = await provider.inspect(frame);
    const defect = detections.find((d) => d.className === defectClassNames.MISSING_CAP);

    expect(detections[0]?.className).toBe(defectClassNames.NONE);
    expect(defect).toBeDefined();
    expect(defect!.x).toBeGreaterThan(0);
    expect(defect!.x).toBeLessThan(frame.width);
    expect(defect!.height).toBeGreaterThan(0);
  });

  it('is reproducible from a seed', async () => {
    const oracle: FrameOracle = () => 'NONE';
    const a = await build(oracle, 99);
    const b = await build(oracle, 99);

    a.configure({ falsePositiveProbability: 0.3 });
    b.configure({ falsePositiveProbability: 0.3 });

    const left = (await sample(a, 200)).map((p) => `${p.inspectionResult}:${p.confidence}`);
    const right = (await sample(b, 200)).map((p) => `${p.inspectionResult}:${p.confidence}`);

    expect(left).toEqual(right);
  });

  it('never learns which unit it is looking at', async () => {
    let seen: DefectType | undefined;
    const provider = await build(() => {
      seen = 'MISSING_LABEL';
      return seen;
    });

    const prediction = await provider.inspect(frame);

    // C2: the input is pixels plus frame metadata, and the prediction that
    // comes back carries no identity either. Correlation happens in the gateway.
    expect(Object.keys(frame).sort()).toEqual([
      'camera',
      'capturedAtSeconds',
      'frameNumber',
      'height',
      'stream',
      'width',
    ]);
    expect(JSON.stringify(prediction)).not.toContain('UNIT-');
  });
});
