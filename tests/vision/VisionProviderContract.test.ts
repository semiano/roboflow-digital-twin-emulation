import { afterEach, describe, vi } from 'vitest';
import { createRng } from '@/utils/rng';
import { MockVisionProvider } from '@/vision/MockVisionProvider';
import { RoboflowProvider } from '@/vision/roboflow/RoboflowProvider';
import { describeVisionProviderContract } from '../support/visionProviderContract';

/**
 * plan.md §5 — one behavioural suite, every implementation. If the PLC cannot
 * tell the two apart, neither should the tests.
 */

describe('VisionProvider contract: MockVisionProvider', () => {
  describeVisionProviderContract(
    () => new MockVisionProvider(createRng(7), () => 'MISSING_CAP'),
  );
});

describe('VisionProvider contract: RoboflowProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describeVisionProviderContract(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          outputs: [
            {
              predictions: {
                image: { width: 512, height: 512 },
                predictions: [
                  { class: 'missing_cap', confidence: 0.93, x: 256, y: 130, width: 74, height: 64 },
                ],
              },
            },
          ],
        }),
      } as unknown as Response),
    );

    const provider = new RoboflowProvider();
    provider.client.configure({
      runtime: 'SERVERLESS',
      transport: 'WORKFLOW',
      apiKey: 'test-key',
      workspace: 'acme',
      workflowId: 'inspect-bottles',
    });
    return provider;
  });
});
