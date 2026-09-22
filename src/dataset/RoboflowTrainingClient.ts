export type DatasetUploadStatus = 'preparing' | 'uploading' | 'processing';

interface ZipUploadStart {
  taskId: string;
  signedUrl: string;
}

interface AsyncTask {
  status: string;
  progress?: { current?: number; total?: number };
  result?: unknown;
  error?: unknown;
}

const responseError = async (response: Response): Promise<Error> => {
  const body = await response.text();
  return new Error(`Roboflow API ${response.status}: ${body || response.statusText}`);
};

const proxiedUploadUrl = (signedUrl: string): string => {
  const uploadUrl = new URL(signedUrl);
  if (uploadUrl.origin !== 'https://storage.googleapis.com') {
    throw new Error(`Roboflow returned an unsupported upload host: ${uploadUrl.host}`);
  }
  return `/rf-upload${uploadUrl.pathname}${uploadUrl.search}`;
};

const exportFormatFor = (modelType: string): string =>
  modelType.includes('rfdetr') || modelType.includes('rf-detr') ? 'coco' : 'yolov5pytorch';

export class RoboflowTrainingClient {
  constructor(
    private readonly apiBase = '/rf-api',
    private readonly pollDelayMs = 3000,
  ) {}

  async uploadDatasetZip(
    archive: Blob,
    workspace: string,
    project: string,
    batchName: string,
    onStatus?: (status: DatasetUploadStatus, detail?: string) => void,
  ): Promise<unknown> {
    onStatus?.('preparing');
    const startResponse = await fetch(
      `${this.apiBase}/${encodeURIComponent(workspace)}/${encodeURIComponent(project)}/upload/zip`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchName }),
      },
    );
    if (!startResponse.ok) throw await responseError(startResponse);
    const start = (await startResponse.json()) as ZipUploadStart;
    if (!start.taskId || !start.signedUrl) throw new Error('Roboflow did not return a ZIP upload target');

    onStatus?.('uploading');
    const uploadResponse = await fetch(proxiedUploadUrl(start.signedUrl), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/zip' },
      body: archive,
    });
    if (!uploadResponse.ok) throw await responseError(uploadResponse);

    onStatus?.('processing');
    const statusUrl = `${this.apiBase}/${encodeURIComponent(workspace)}/upload/zip/${encodeURIComponent(start.taskId)}`;
    let delayMs = this.pollDelayMs;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const statusResponse = await fetch(statusUrl);
      if (statusResponse.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, Math.max(delayMs, 10000)));
        delayMs = Math.min(Math.max(delayMs, 1000) * 2, 30000);
        continue;
      }
      if (!statusResponse.ok) throw await responseError(statusResponse);
      const task = (await statusResponse.json()) as AsyncTask;
      const progress = task.progress;
      if (progress?.total) onStatus?.('processing', `${progress.current ?? 0}/${progress.total}`);
      if (task.status === 'completed') return task.result;
      if (task.status === 'failed' || task.status === 'cancelled') {
        throw new Error(`Roboflow dataset processing ${task.status}: ${JSON.stringify(task.error ?? task.result)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs = Math.min(Math.max(delayMs, 1000) * 1.5, 10000);
    }
    throw new Error('Roboflow dataset processing timed out');
  }

  async generateVersion(workspace: string, project: string): Promise<number> {
    const response = await fetch(
      `${this.apiBase}/${encodeURIComponent(workspace)}/${encodeURIComponent(project)}/generate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preprocessing: {
            'auto-orient': true,
            resize: { width: 512, height: 512, format: 'Stretch to' },
          },
          augmentation: {},
        }),
      },
    );
    if (!response.ok) throw await responseError(response);
    const result = (await response.json()) as Record<string, unknown>;
    const version = result['version'] ?? result['versionNumber'] ?? result['id'];
    const parsed = typeof version === 'number' ? version : Number(version);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new Error(`Roboflow did not return a dataset version: ${JSON.stringify(result)}`);
    }
    return parsed;
  }

  async startTraining(
    workspace: string,
    project: string,
    version: number,
    modelType: string,
    onStatus?: (detail: string) => void,
  ): Promise<void> {
    const format = exportFormatFor(modelType);
    const exportUrl = `${this.apiBase}/${encodeURIComponent(workspace)}/${encodeURIComponent(project)}/${version}/${format}?nocache=true`;
    onStatus?.(`Preparing ${format} export`);
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const exportResponse = await fetch(exportUrl);
      if (exportResponse.status === 200) break;
      if (exportResponse.status !== 202) throw await responseError(exportResponse);
      const result = (await exportResponse.json()) as { progress?: number };
      const percent = Math.round((result.progress ?? 0) * 100);
      onStatus?.(`Preparing ${format} export${percent > 0 ? ` ${percent}%` : ''}`);
      await new Promise((resolve) => setTimeout(resolve, Math.max(this.pollDelayMs, 1000)));
      if (attempt === 119) throw new Error(`Roboflow ${format} export timed out`);
    }

    onStatus?.('Submitting training');
    const response = await fetch(
      `${this.apiBase}/${encodeURIComponent(workspace)}/${encodeURIComponent(project)}/${version}/train`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_type: modelType }),
      },
    );
    if (!response.ok) throw await responseError(response);
  }
}