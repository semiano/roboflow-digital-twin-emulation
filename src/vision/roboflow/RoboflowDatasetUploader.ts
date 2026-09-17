import { visionConfig } from '@/config/vision.config';
import { logger } from '@/core/Logger';
import { realNowMs } from '@/core/RealClock';

const CONFIG = visionConfig.activeLearning;
const ROBOFLOW = visionConfig.roboflow;

export interface UploadCandidate {
  base64: string;
  /** Predicted class, used as a Roboflow tag so the batch can be triaged. */
  predictedClass: string;
  confidence: number;
  /** Simulated seconds, used to name the image and to rate-limit uploads. */
  simulationTime: number;
}

export interface UploaderStats {
  enabled: boolean;
  configured: boolean;
  project: string;
  sent: number;
  failed: number;
  skipped: number;
  remaining: number;
  lastError: string | undefined;
}

/**
 * Closes the MLOps loop: the frames the model was least sure about go straight
 * back into a Roboflow project for labelling and retraining (spec §33).
 *
 * Confidence is the only trigger available at this layer and that is by design.
 * "This was an escape" is only knowable from ground truth, which the vision
 * layer must never see (plan.md C1) — so the uploader decides using exactly
 * what a real deployment would have: the model's own uncertainty.
 */
export class RoboflowDatasetUploader {
  private sent = 0;
  private failed = 0;
  private skipped = 0;
  private lastUploadTime = Number.NEGATIVE_INFINITY;
  private lastError: string | undefined;
  private inFlight = false;

  constructor(
    private readonly apiKey: string,
    private readonly project: string,
    private enabled = CONFIG.enabled,
    /** When true an upstream proxy attaches the key, so the browser sends none. */
    private proxied = true,
  ) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setProxied(proxied: boolean): void {
    this.proxied = proxied;
  }

  get configured(): boolean {
    return (this.apiKey !== '' || this.proxied) && this.project !== '';
  }

  stats(): UploaderStats {
    return {
      enabled: this.enabled,
      configured: this.configured,
      project: this.project,
      sent: this.sent,
      failed: this.failed,
      skipped: this.skipped,
      remaining: Math.max(0, CONFIG.maxUploadsPerSession - this.sent),
      lastError: this.lastError,
    };
  }

  /** Applies the policy, then uploads. Returns whether anything was sent. */
  async consider(candidate: UploadCandidate): Promise<boolean> {
    if (!this.enabled) return false;
    if (candidate.confidence > CONFIG.confidenceCeiling) return false;
    if (candidate.simulationTime - this.lastUploadTime < CONFIG.minimumIntervalSeconds) {
      this.skipped += 1;
      return false;
    }
    return this.upload(candidate);
  }

  /** Bypasses the policy. Wired to the operator's manual send button. */
  async upload(candidate: UploadCandidate): Promise<boolean> {
    if (!this.configured) {
      this.lastError = 'dataset project or API key not configured';
      return false;
    }
    // One at a time: a flood of concurrent uploads would compete with inference
    // for the same connection budget the PLC is timing.
    if (this.inFlight || this.sent >= CONFIG.maxUploadsPerSession) {
      this.skipped += 1;
      return false;
    }

    this.inFlight = true;
    this.lastUploadTime = candidate.simulationTime;

    try {
      const response = await fetch(this.buildUrl(candidate), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...(!this.proxied && ROBOFLOW.apiKeyTransport === 'header'
            ? { Authorization: `Bearer ${this.apiKey}` }
            : {}),
        },
        body: candidate.base64,
        signal: AbortSignal.timeout(ROBOFLOW.requestTimeoutMs * 4),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      this.sent += 1;
      this.lastError = undefined;
      logger.info('roboflow.active_learning_upload', {
        project: this.project,
        predictedClass: candidate.predictedClass,
        confidence: Number(candidate.confidence.toFixed(3)),
      });
      return true;
    } catch (error) {
      this.failed += 1;
      this.lastError = String(error);
      logger.warn('roboflow.active_learning_failed', { error: this.lastError });
      return false;
    } finally {
      this.inFlight = false;
    }
  }

  private buildUrl(candidate: UploadCandidate): string {
    const params = new URLSearchParams({
      // Real wall time keeps names unique across reloads, where simulated time restarts at zero.
      name: `cam01-${Math.round(realNowMs())}.jpg`,
      split: CONFIG.split,
      batch: CONFIG.batchName,
      tag: candidate.predictedClass,
    });
    if (!this.proxied && ROBOFLOW.apiKeyTransport !== 'header') {
      params.set('api_key', this.apiKey);
    }

    const base = this.proxied ? CONFIG.proxyApiUrl : CONFIG.directApiUrl;
    return `${base}/dataset/${this.project}/upload?${params.toString()}`;
  }
}
