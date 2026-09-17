import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RoboflowClient,
  RoboflowHttpError,
  RoboflowTimeoutError,
} from '@/vision/roboflow/RoboflowClient';

const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

const httpError = (status: number, text: string) =>
  ({
    ok: false,
    status,
    text: async () => text,
    json: async () => {
      throw new SyntaxError('not JSON');
    },
  }) as unknown as Response;

const request = { path: '/x', body: 'payload', contentType: 'text/plain' };

const client = (overrides = {}) =>
  new RoboflowClient({
    runtime: 'SERVERLESS',
    transport: 'WORKFLOW',
    apiKey: 'test-key',
    workspace: 'acme',
    workflowId: 'inspect-bottles',
    modelId: 'bottles/3',
    ...overrides,
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RoboflowClient configuration', () => {
  it('names the specific missing setting so a bad demo config is diagnosable', () => {
    expect(client({ workflowId: '' }).missingSettings()).toEqual(['VITE_ROBOFLOW_WORKFLOW_ID']);
    expect(client({ transport: 'MODEL', modelId: '' }).missingSettings()).toEqual([
      'VITE_ROBOFLOW_MODEL_ID',
    ]);
    expect(client().configured).toBe(true);
  });

  it('flags a runtime that has no endpoint URL configured', () => {
    expect(client({ runtime: 'DEDICATED' }).missingSettings()).toContain(
      'DEDICATED endpoint URL',
    );
  });

  it('switches endpoint with the runtime and nothing else', () => {
    const subject = client();
    expect(subject.baseUrl).toBe('https://serverless.roboflow.com');

    subject.configure({ runtime: 'LOCAL' });
    expect(subject.baseUrl).toBe('http://localhost:9001');
  });

  it('does not require a browser-side key under the proxy', () => {
    const subject = client({ runtime: 'PROXY', apiKey: '' });

    expect(subject.proxied).toBe(true);
    expect(subject.missingSettings()).toEqual([]);
    expect(subject.baseUrl).toBe('/rf-infer');
  });
});

describe('RoboflowClient.post', () => {
  it('sends the key as a bearer header rather than in the URL', async () => {
    const fetchStub = vi.fn().mockResolvedValue(ok({ predictions: [] }));
    vi.stubGlobal('fetch', fetchStub);

    await client().post(request);

    const [url, init] = fetchStub.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://serverless.roboflow.com/x');
    expect(url).not.toContain('test-key');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer test-key');
  });

  it('retries a transport failure inside the same deadline', async () => {
    const fetchStub = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(ok({ predictions: [] }));
    vi.stubGlobal('fetch', fetchStub);

    const response = await client().post(request);

    expect(fetchStub).toHaveBeenCalledTimes(2);
    expect(response.body).toEqual({ predictions: [] });
    expect(response.roundTripMs).toBeGreaterThanOrEqual(0);
  });

  it('does not retry an HTTP error — the server already gave its answer', async () => {
    const fetchStub = vi.fn().mockResolvedValue(httpError(403, 'forbidden'));
    vi.stubGlobal('fetch', fetchStub);

    await expect(client().post(request)).rejects.toBeInstanceOf(RoboflowHttpError);
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it('gives up immediately on an abort so a late reply cannot outlive the PLC timeout', async () => {
    const fetchStub = vi
      .fn()
      .mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
    vi.stubGlobal('fetch', fetchStub);

    await expect(client().post(request)).rejects.toBeInstanceOf(RoboflowTimeoutError);
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });
});

describe('RoboflowClient.probe', () => {
  it('treats any HTTP answer as reachable, so it spends no inference credits', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(httpError(404, 'not found')));
    await expect(client().probe()).resolves.toMatchObject({ reachable: true });
  });

  it('identifies the server it reached so cloud and local are distinguishable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(ok({ name: 'Roboflow Inference Server', version: '1.6.0' })),
    );
    await expect(client().probe()).resolves.toEqual({
      reachable: true,
      server: 'Roboflow Inference Server 1.6.0',
    });
  });

  it('treats a transport failure as unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(client().probe()).resolves.toMatchObject({ reachable: false });
  });
});
