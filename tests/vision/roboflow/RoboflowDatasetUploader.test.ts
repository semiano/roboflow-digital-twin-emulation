import { afterEach, describe, expect, it, vi } from 'vitest';
import { visionConfig } from '@/config/vision.config';
import { RoboflowDatasetUploader } from '@/vision/roboflow/RoboflowDatasetUploader';

const CONFIG = visionConfig.activeLearning;

const ok = () => ({ ok: true, status: 200 }) as unknown as Response;

const candidate = (confidence: number, simulationTime: number) => ({
  base64: 'aGVsbG8=',
  predictedClass: 'MISSING_CAP',
  confidence,
  simulationTime,
});

const uploader = () => new RoboflowDatasetUploader('test-key', 'bottle-inspection', true);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RoboflowDatasetUploader', () => {
  it('uploads a low-confidence frame to the configured Roboflow project', async () => {
    const fetchStub = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal('fetch', fetchStub);

    await expect(uploader().consider(candidate(0.42, 100))).resolves.toBe(true);

    const [url, init] = fetchStub.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/dataset/bottle-inspection/upload');
    expect(url).toContain(`batch=${encodeURIComponent(CONFIG.batchName)}`);
    expect(url).toContain('tag=MISSING_CAP');
    expect(init.body).toBe('aGVsbG8=');
  });

  it('leaves confident frames alone — they are not worth a labeller\u2019s time', async () => {
    const fetchStub = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal('fetch', fetchStub);

    await expect(uploader().consider(candidate(0.99, 100))).resolves.toBe(false);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('rate-limits automatic uploads so a soak cannot flood the dataset', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok()));
    const subject = uploader();

    await subject.consider(candidate(0.4, 100));
    await expect(
      subject.consider(candidate(0.4, 100 + CONFIG.minimumIntervalSeconds - 0.1)),
    ).resolves.toBe(false);
    await expect(
      subject.consider(candidate(0.4, 100 + CONFIG.minimumIntervalSeconds)),
    ).resolves.toBe(true);
  });

  it('does nothing at all while disabled', async () => {
    const fetchStub = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal('fetch', fetchStub);
    const subject = new RoboflowDatasetUploader('test-key', 'bottle-inspection', false);

    await expect(subject.consider(candidate(0.1, 100))).resolves.toBe(false);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('records a failed upload without throwing into the inference path', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const subject = uploader();

    await expect(subject.upload(candidate(0.2, 1))).resolves.toBe(false);
    expect(subject.stats().failed).toBe(1);
    expect(subject.stats().lastError).toContain('Failed to fetch');
  });

  it('reports itself unconfigured rather than posting to a nonexistent project', async () => {
    const fetchStub = vi.fn();
    vi.stubGlobal('fetch', fetchStub);
    const subject = new RoboflowDatasetUploader('test-key', '', true);

    await expect(subject.upload(candidate(0.2, 1))).resolves.toBe(false);
    expect(subject.stats().configured).toBe(false);
    expect(fetchStub).not.toHaveBeenCalled();
  });
});
