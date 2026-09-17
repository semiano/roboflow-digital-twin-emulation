import {
  visionConfig,
  type RoboflowRuntime,
  type RoboflowTransportId,
} from '@/config/vision.config';
import { realDelay, realNowMs } from '@/core/RealClock';

const CONFIG = visionConfig.roboflow;

export interface RoboflowSettings {
  runtime: RoboflowRuntime;
  transport: RoboflowTransportId;
  apiKey: string;
  workspace: string;
  workflowId: string;
  modelId: string;
}

export interface RoboflowRequest {
  path: string;
  body: BodyInit;
  contentType: string;
}

export interface RoboflowResponse {
  body: unknown;
  /** Measured round trip, including encode-free transport only. */
  roundTripMs: number;
}

/** Distinguishes "the server said no" from "the server never answered". */
export class RoboflowHttpError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`Roboflow responded ${status}: ${detail}`);
    this.name = 'RoboflowHttpError';
  }
}

export class RoboflowTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Roboflow did not respond within ${timeoutMs} ms`);
    this.name = 'RoboflowTimeoutError';
  }
}

const isAbort = (error: unknown): boolean =>
  error instanceof DOMException ? error.name === 'AbortError' || error.name === 'TimeoutError' : false;

/**
 * One HTTP client for every Roboflow runtime.
 *
 * Serverless Cloud, a Dedicated Deployment and a self-hosted Inference server
 * all speak the same API, so switching between them is a base-URL swap and
 * nothing else — the request built by a transport is byte-identical. That is
 * the whole reason runtime is a live control in the HMI rather than a rebuild.
 */
export class RoboflowClient {
  private settings: RoboflowSettings;

  constructor(overrides: Partial<RoboflowSettings> = {}) {
    this.settings = {
      runtime: CONFIG.runtime,
      transport: CONFIG.transport,
      apiKey: CONFIG.apiKey,
      workspace: CONFIG.workspace,
      workflowId: CONFIG.workflowId,
      modelId: CONFIG.modelId,
      ...overrides,
    };
  }

  getSettings(): RoboflowSettings {
    return { ...this.settings };
  }

  configure(settings: Partial<RoboflowSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  get baseUrl(): string {
    return CONFIG.endpoints[this.settings.runtime];
  }

  /**
   * Everything needed to run, without leaking why. The HMI shows the specific
   * missing field so a misconfigured demo is diagnosable at a glance.
   */
  missingSettings(): readonly string[] {
    const missing: string[] = [];
    if (!this.baseUrl) missing.push(`${this.settings.runtime} endpoint URL`);
    // Under the proxy the key lives on the server, so its absence here is correct.
    if (!this.settings.apiKey && !this.proxied) missing.push('VITE_ROBOFLOW_API_KEY');

    if (this.settings.transport === 'WORKFLOW') {
      if (!this.settings.workspace) missing.push('VITE_ROBOFLOW_WORKSPACE');
      if (!this.settings.workflowId) missing.push('VITE_ROBOFLOW_WORKFLOW_ID');
    } else if (!this.settings.modelId) {
      missing.push('VITE_ROBOFLOW_MODEL_ID');
    }

    return missing;
  }

  /** True when an upstream proxy attaches credentials on the app's behalf. */
  get proxied(): boolean {
    return CONFIG.proxiedRuntimes.includes(this.settings.runtime);
  }

  get configured(): boolean {
    return this.missingSettings().length === 0;
  }

  /**
   * Cheap reachability check that spends no inference credits: any HTTP answer,
   * including a 404, proves the endpoint is up. Only a transport-level failure
   * counts as unreachable. `/info` also identifies the server, which is how the
   * HMI can show whether it is talking to Roboflow Cloud or a local container.
   */
  async probe(): Promise<{ reachable: boolean; server: string | undefined }> {
    let response: Response;
    try {
      response = await fetch(this.url('/info'), {
        method: 'GET',
        signal: AbortSignal.timeout(CONFIG.probeTimeoutMs),
      });
    } catch {
      return { reachable: false, server: undefined };
    }

    // Reachability is already settled; a body that is not JSON must not undo it.
    try {
      const info = (await response.json()) as { name?: string; version?: string };
      const server = info.name ? `${info.name} ${info.version ?? ''}`.trim() : undefined;
      return { reachable: true, server };
    } catch {
      return { reachable: true, server: undefined };
    }
  }

  /**
   * Retries share one deadline with the first attempt, so a retry can never
   * push the response past the PLC's inspection timeout. Only transport-level
   * failures are retried — an HTTP error is the server's considered answer and
   * repeating it just wastes the remaining budget.
   */
  async post(request: RoboflowRequest): Promise<RoboflowResponse> {
    const startedAt = realNowMs();
    const deadline = startedAt + CONFIG.requestTimeoutMs;
    let lastError: unknown;

    for (let attempt = 0; attempt <= CONFIG.maxRetries; attempt += 1) {
      const remaining = deadline - realNowMs();
      if (remaining < CONFIG.minimumAttemptBudgetMs) break;

      try {
        const body = await this.attempt(request, remaining);
        return { body, roundTripMs: realNowMs() - startedAt };
      } catch (error) {
        lastError = error;
        if (error instanceof RoboflowHttpError) throw error;
        if (isAbort(error)) break;
        await realDelay(CONFIG.retryBackoffMs);
      }
    }

    if (lastError !== undefined && !isAbort(lastError)) throw lastError;
    throw new RoboflowTimeoutError(CONFIG.requestTimeoutMs);
  }

  private async attempt(request: RoboflowRequest, budgetMs: number): Promise<unknown> {
    const response = await fetch(this.url(request.path), {
      method: 'POST',
      headers: { 'Content-Type': request.contentType, ...this.authHeaders() },
      body: request.body,
      // The remaining budget is a fractional millisecond count; Node's timer
      // layer rejects anything that is not a whole number.
      signal: AbortSignal.timeout(Math.ceil(budgetMs)),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new RoboflowHttpError(response.status, detail.slice(0, 200));
    }

    return response.json();
  }

  private authHeaders(): Record<string, string> {
    if (this.proxied || CONFIG.apiKeyTransport !== 'header') return {};
    return { Authorization: `Bearer ${this.settings.apiKey}` };
  }

  /** The key rides in the URL only when neither the proxy nor the header carries it. */
  url(path: string): string {
    const base = `${this.baseUrl.replace(/\/$/, '')}${path}`;
    if (this.proxied || CONFIG.apiKeyTransport === 'header') return base;
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}api_key=${encodeURIComponent(this.settings.apiKey)}`;
  }
}
