import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoboflowTrainingClient } from '@/dataset/RoboflowTrainingClient';

const jsonResponse = (value: unknown): Response =>
  new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('RoboflowTrainingClient', () => {
  it('uploads a ZIP to the signed URL and waits for processing to complete', async () => {
    const fetchStub = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({
        taskId: 'task-1',
        signedUrl: 'https://storage.googleapis.com/roboflow-upload/dataset.zip?signature=abc',
      }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ status: 'completed', result: { uploaded: 12 } }));
    vi.stubGlobal('fetch', fetchStub);

    await expect(
      new RoboflowTrainingClient('/rf-api', 0).uploadDatasetZip(
        new Blob(['zip']),
        'factory-lab',
        'bottle-inspection',
        'synthetic-100',
      ),
    ).resolves.toEqual({ uploaded: 12 });

    expect(fetchStub.mock.calls[0]?.[0]).toBe('/rf-api/factory-lab/bottle-inspection/upload/zip');
    expect(fetchStub.mock.calls[1]?.[0]).toBe('/rf-upload/roboflow-upload/dataset.zip?signature=abc');
    expect(fetchStub.mock.calls[2]?.[0]).toBe('/rf-api/factory-lab/upload/zip/task-1');
  });

  it('generates a version and starts the requested model training', async () => {
    const fetchStub = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ version: 4 }))
      .mockResolvedValueOnce(jsonResponse({ ready: true }))
      .mockResolvedValueOnce(jsonResponse({ status: 'training_started' }));
    vi.stubGlobal('fetch', fetchStub);
    const client = new RoboflowTrainingClient();

    await expect(client.generateVersion('factory-lab', 'bottle-inspection')).resolves.toBe(4);
    await client.startTraining('factory-lab', 'bottle-inspection', 4, 'rfdetr-nano');

    expect(fetchStub.mock.calls[1]?.[0]).toBe('/rf-api/factory-lab/bottle-inspection/4/coco?nocache=true');
    expect(fetchStub.mock.calls[2]?.[0]).toBe('/rf-api/factory-lab/bottle-inspection/4/train');
    expect(JSON.parse(String(fetchStub.mock.calls[2]?.[1]?.body))).toEqual({ model_type: 'rfdetr-nano' });
  });
});