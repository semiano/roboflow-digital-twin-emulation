import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { visionConfig } from '@/config/vision.config';
import { RoboflowProvider } from '@/vision/roboflow/RoboflowProvider';
import type { VisionInput } from '@/vision/VisionTypes';

const CONFIG = visionConfig.roboflow;

const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

const workflowBody = (className: string, confidence: number) => ({
  outputs: [
    {
      predictions: {
        image: { width: 512, height: 512 },
        predictions: [
          { class: className, confidence, x: 256, y: 300, width: 100, height: 200 },
        ],
      },
    },
  ],
});

const frame = (frameNumber: number): VisionInput => ({
  camera: undefined,
  stream: undefined,
  grabFrame: async () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' }),
  width: 512,
  height: 512,
  capturedAtSeconds: frameNumber,
  frameNumber,
});

async function connected(fetchStub: ReturnType<typeof vi.fn>): Promise<RoboflowProvider> {
  vi.stubGlobal('fetch', fetchStub);
  const provider = new RoboflowProvider();
  provider.client.configure({
    runtime: 'SERVERLESS',
    transport: 'WORKFLOW',
    apiKey: 'test-key',
    workspace: 'acme',
    workflowId: 'inspect-bottles',
  });
  await provider.connect();
  return provider;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RoboflowProvider', () => {
  it('refuses to connect without credentials instead of failing on the first unit', async () => {
    const provider = new RoboflowProvider();
    provider.client.configure({ apiKey: '', workspace: '', workflowId: '' });

    await expect(provider.connect()).rejects.toThrow(/missing configuration/);
    expect(provider.isConnected()).toBe(false);
    expect(provider.status().missingSettings.length).toBeGreaterThan(0);
  });

  it('reports the endpoint unreachable rather than throwing out of the engine', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const provider = new RoboflowProvider();
    provider.client.configure({ apiKey: 'k', workspace: 'w', workflowId: 'f' });

    await expect(provider.connect()).rejects.toThrow(/unreachable/);
    expect(provider.isConnected()).toBe(false);
  });

  it('turns a workflow response into a PLC-ready verdict', async () => {
    const provider = await connected(
      vi.fn().mockResolvedValue(ok(workflowBody('missing_cap', 0.94))),
    );

    const prediction = await provider.inspect(frame(1));

    expect(prediction.inspectionResult).toBe('FAIL');
    expect(prediction.defectCode).toBe('MISSING_CAP');
    expect(prediction.confidence).toBeCloseTo(0.94);
    expect(provider.status().requestCount).toBe(1);
  });

  it('posts the frame as base64 and never anything identifying the unit', async () => {
    const fetchStub = vi.fn().mockResolvedValue(ok(workflowBody('bottle', 0.98)));
    const provider = await connected(fetchStub);

    await provider.inspect(frame(1));

    const [, init] = fetchStub.mock.calls.at(-1) as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      inputs: Record<string, { type: string; value: string }>;
    };
    const image = body.inputs[CONFIG.workflowImageInput];

    expect(image?.type).toBe('base64');
    expect(image?.value).toBe(btoa('\u0001\u0002\u0003\u0004'));
    expect(Object.keys(body.inputs)).toEqual([CONFIG.workflowImageInput]);
  });

  it('stays connected through a single failure but drops the link after the watchdog count', async () => {
    const fetchStub = vi.fn().mockResolvedValue(ok(workflowBody('bottle', 0.98)));
    const provider = await connected(fetchStub);

    fetchStub.mockRejectedValue(new TypeError('Failed to fetch'));

    for (let i = 0; i < CONFIG.failuresBeforeOffline - 1; i += 1) {
      await expect(provider.inspect(frame(i + 1))).rejects.toThrow();
      expect(provider.isConnected()).toBe(true);
    }

    await expect(provider.inspect(frame(99))).rejects.toThrow();
    expect(provider.isConnected()).toBe(false);
  });

  it('refuses to infer on a frozen feed rather than inspecting the previous unit', async () => {
    const provider = await connected(vi.fn().mockResolvedValue(ok(workflowBody('bottle', 0.98))));

    await provider.inspect(frame(7));

    // One repeat is tolerated: at 20 fps a frame lasts 50 ms, so two units can
    // legitimately land on the same one when the line is running fast.
    for (let repeat = 1; repeat < CONFIG.staleFrameInspections; repeat += 1) {
      await expect(provider.inspect(frame(7))).resolves.toBeDefined();
    }

    await expect(provider.inspect(frame(7))).rejects.toThrow(/frozen/);
  });

  it('switching runtime drops the link so the operator must see it reconnect', async () => {
    const provider = await connected(vi.fn().mockResolvedValue(ok(workflowBody('bottle', 0.9))));

    provider.setRuntime('LOCAL');

    expect(provider.isConnected()).toBe(false);
    expect(provider.status().endpoint).toContain('localhost:9001');
  });
});
