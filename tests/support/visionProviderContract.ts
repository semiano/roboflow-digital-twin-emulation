import { expect, it } from 'vitest';
import type { VisionProvider } from '@/vision/VisionProvider';
import type { VisionInput } from '@/vision/VisionTypes';

export const contractFrame = (frameNumber = 1): VisionInput => ({
  camera: undefined,
  stream: undefined,
  grabFrame: async () => new Blob([new Uint8Array([9, 8, 7])], { type: 'image/jpeg' }),
  width: 512,
  height: 512,
  capturedAtSeconds: frameNumber,
  frameNumber,
});

/**
 * Behaviour every `VisionProvider` must exhibit, whatever is behind it.
 *
 * The point of the abstraction is that the PLC cannot tell a simulated model
 * from a real one, so both implementations are held to the same contract rather
 * than to their own individual tests. A future provider — a browser-side
 * `inferencejs` model, say — is correct when this suite passes.
 */
export function describeVisionProviderContract(
  create: () => Promise<VisionProvider> | VisionProvider,
): void {
  it('starts disconnected and reports its own link state', async () => {
    const provider = await create();
    expect(provider.isConnected()).toBe(false);

    await provider.connect();
    expect(provider.isConnected()).toBe(true);

    await provider.disconnect();
    expect(provider.isConnected()).toBe(false);
  });

  it('identifies itself so a mock result can never pass for a real one', async () => {
    const provider = await create();
    expect(provider.name.length).toBeGreaterThan(0);
  });

  it('refuses to inspect while disconnected', async () => {
    const provider = await create();
    await expect(provider.inspect(contractFrame())).rejects.toThrow();
  });

  it('returns a prediction in the shape spec §16 requires', async () => {
    const provider = await create();
    await provider.connect();

    const prediction = await provider.inspect(contractFrame());

    expect(['PASS', 'FAIL', 'UNKNOWN']).toContain(prediction.inspectionResult);
    expect(prediction.confidence).toBeGreaterThanOrEqual(0);
    expect(prediction.confidence).toBeLessThanOrEqual(1);
    expect(prediction.inferenceLatencyMs ?? 0).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(prediction.detections)).toBe(true);
    expect(prediction.timestamp).toBe(contractFrame().capturedAtSeconds);
  });

  it('never returns a defect code alongside a PASS', async () => {
    const provider = await create();
    await provider.connect();

    const prediction = await provider.inspect(contractFrame());
    if (prediction.inspectionResult === 'PASS') {
      expect(prediction.defectCode).toBeUndefined();
    }
  });
}
