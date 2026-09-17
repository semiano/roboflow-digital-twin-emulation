import { describe, expect, it } from 'vitest';
import { ProviderVisionGateway } from '@/vision/ProviderVisionGateway';
import type { VisionProvider } from '@/vision/VisionProvider';
import type { VisionInput, VisionPrediction } from '@/vision/VisionTypes';

const capture = (capturedAtSeconds: number): VisionInput => ({
  camera: undefined,
  stream: undefined,
  width: 512,
  height: 512,
  capturedAtSeconds,
  frameNumber: 0,
});

class FakeProvider implements VisionProvider {
  readonly name = 'FAKE';
  connected = true;
  readonly inputs: VisionInput[] = [];

  constructor(
    private readonly respond: (input: VisionInput) => Promise<VisionPrediction>,
  ) {}

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  inspect(input: VisionInput): Promise<VisionPrediction> {
    this.inputs.push(input);
    return this.respond(input);
  }
}

const passAfter = (latencyMs: number) => async (input: VisionInput): Promise<VisionPrediction> => ({
  timestamp: input.capturedAtSeconds,
  detections: [],
  inspectionResult: 'PASS',
  confidence: 0.9,
  inferenceLatencyMs: latencyMs,
});

const flush = (): Promise<void> => Promise.resolve();

describe('ProviderVisionGateway', () => {
  it('withholds a settled prediction until simulated time passes the latency', async () => {
    const gateway = new ProviderVisionGateway(new FakeProvider(passAfter(200)), capture);
    gateway.request({ inspectionId: 'INS-1', unitId: 'UNIT-1', simulationTime: 10 });
    await flush();

    expect(gateway.poll(10.1)).toEqual([]);

    const [outcome] = gateway.poll(10.2);
    expect(outcome?.unitId).toBe('UNIT-1');
    expect(outcome?.result).toBe('PASS');
    expect(outcome?.inferenceLatencyMs).toBe(200);
    expect(gateway.pendingCount).toBe(0);
  });

  it('correlates unit identity itself and hands the provider pixels only', async () => {
    const provider = new FakeProvider(passAfter(0));
    const gateway = new ProviderVisionGateway(provider, capture);

    gateway.request({ inspectionId: 'INS-7', unitId: 'UNIT-42', simulationTime: 4 });
    await flush();

    expect(JSON.stringify(provider.inputs[0])).not.toContain('UNIT-42');
    expect(gateway.poll(4)[0]?.unitId).toBe('UNIT-42');
  });

  it('turns a failed inference into an immediate UNKNOWN, never a silent pass', async () => {
    const provider = new FakeProvider(() => Promise.reject(new Error('inference server down')));
    const gateway = new ProviderVisionGateway(provider, capture);

    gateway.request({ inspectionId: 'INS-2', unitId: 'UNIT-2', simulationTime: 3 });
    await flush();

    const [outcome] = gateway.poll(3);
    expect(outcome?.result).toBe('UNKNOWN');
    expect(outcome?.confidence).toBe(0);
  });

  it('drops a prediction that settles after the PLC gave up', async () => {
    let resolvePrediction: ((prediction: VisionPrediction) => void) | undefined;
    const provider = new FakeProvider(
      () =>
        new Promise<VisionPrediction>((resolve) => {
          resolvePrediction = resolve;
        }),
    );
    const gateway = new ProviderVisionGateway(provider, capture);

    gateway.request({ inspectionId: 'INS-3', unitId: 'UNIT-3', simulationTime: 0 });
    gateway.cancel('INS-3');

    resolvePrediction?.({
      timestamp: 0,
      detections: [],
      inspectionResult: 'FAIL',
      confidence: 0.9,
      inferenceLatencyMs: 0,
    });
    await flush();

    expect(gateway.poll(100)).toEqual([]);
  });

  it('accepts no requests while the provider is disconnected', async () => {
    const provider = new FakeProvider(passAfter(0));
    await provider.disconnect();
    const gateway = new ProviderVisionGateway(provider, capture);

    gateway.request({ inspectionId: 'INS-4', unitId: 'UNIT-4', simulationTime: 0 });
    await flush();

    expect(gateway.isReady()).toBe(false);
    expect(provider.inputs).toEqual([]);
    expect(gateway.poll(100)).toEqual([]);
  });
});
