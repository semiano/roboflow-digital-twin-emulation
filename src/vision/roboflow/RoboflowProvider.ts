import {
  visionConfig,
  type RoboflowRuntime,
  type RoboflowTransportId,
} from '@/config/vision.config';
import { logger } from '@/core/Logger';
import { realNowMs } from '@/core/RealClock';
import type { VisionProvider } from '@/vision/VisionProvider';
import type { VisionInput, VisionPrediction } from '@/vision/VisionTypes';
import { mapRoboflowResult } from './PredictionMapper';
import { RoboflowClient } from './RoboflowClient';
import { RoboflowDatasetUploader, type UploaderStats } from './RoboflowDatasetUploader';
import { createTransport, type RoboflowTransport } from './RoboflowTransport';

const CONFIG = visionConfig.roboflow;

export interface RoboflowStatus {
  configured: boolean;
  missingSettings: readonly string[];
  /** True when the dev-server proxy carries the API key instead of the browser. */
  proxied: boolean;
  runtime: RoboflowRuntime;
  transport: RoboflowTransportId;
  endpoint: string;
  description: string;
  connected: boolean;
  /** What `/info` said it is, e.g. "Roboflow Inference Server 1.6.0". */
  server: string | undefined;
  requestCount: number;
  errorCount: number;
  consecutiveFailures: number;
  lastError: string | undefined;
  /** Milliseconds spent between posting the frame and parsing the answer. */
  lastRoundTripMs: number | undefined;
  /** Server-side model time when Roboflow reports it. */
  lastServerTimeMs: number | undefined;
  /** Step outputs the last Workflow run returned, so the operator can see its shape. */
  lastOutputNames: readonly string[];
  /** Classes Roboflow returned that have no entry in the config map. */
  unmappedClasses: readonly string[];
  activeLearning: UploaderStats;
}

const BASE64_CHUNK = 0x8000;

/** Blob -> base64 without a data URI prefix, chunked so a large frame cannot blow the stack. */
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK));
  }
  return btoa(binary);
}

/**
 * Spec §14/§15. Roboflow as an industrial sensor.
 *
 * Two behaviours make it behave like one rather than like an API call:
 *
 *  - a **comms watchdog**. A single failed request is a bad frame; several in a
 *    row means the link is down, so the provider reports itself disconnected and
 *    the PLC raises VISION_OFFLINE through its normal interlock path. Nothing
 *    here knows what an alarm is.
 *  - a **stale-feed guard**. A backgrounded browser tab throttles rendering to
 *    zero (measured during the Phase 5 spike). Inferring on a frozen frame would
 *    confidently inspect the *previous* unit, so a feed that has not advanced is
 *    refused outright and becomes UNKNOWN for the fail-safe to handle.
 */
export class RoboflowProvider implements VisionProvider {
  readonly name = 'ROBOFLOW';

  readonly client = new RoboflowClient();
  readonly uploader: RoboflowDatasetUploader;

  private transport: RoboflowTransport;
  private connected = false;
  private requestCount = 0;
  private errorCount = 0;
  private consecutiveFailures = 0;
  private lastError: string | undefined;
  private serverIdentity: string | undefined;
  private lastRoundTripMs: number | undefined;
  private lastServerTimeMs: number | undefined;
  private lastOutputNames: readonly string[] = [];
  private unmappedClasses = new Set<string>();
  private lastFrameNumber = -1;
  private staleFrameCount = 0;
  private lastFrameBase64: string | undefined;

  constructor() {
    this.transport = createTransport(this.client.getSettings().transport, this.client);
    const settings = this.client.getSettings();
    this.uploader = new RoboflowDatasetUploader(
      settings.apiKey,
      // The inference project is the sensible default target for review frames.
      visionConfig.activeLearning.project || settings.modelId.split('/')[0] || '',
      visionConfig.activeLearning.enabled,
      this.client.proxied,
    );
  }

  async connect(): Promise<void> {
    const missing = this.client.missingSettings();
    if (missing.length > 0) {
      this.connected = false;
      this.lastError = `missing configuration: ${missing.join(', ')}`;
      throw new Error(this.lastError);
    }

    const { reachable, server } = await this.client.probe();
    this.connected = reachable;
    this.consecutiveFailures = 0;
    this.serverIdentity = server;

    if (!reachable) {
      this.lastError = `${this.client.baseUrl} is unreachable`;
      throw new Error(this.lastError);
    }

    this.lastError = undefined;
    logger.info('roboflow.connected', {
      endpoint: this.transport.endpoint(),
      transport: this.transport.id,
      server: server ?? 'unidentified',
    });
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  /** Runtime and transport are live controls; switching either rebuilds the request. */
  setRuntime(runtime: RoboflowRuntime): void {
    this.client.configure({ runtime });
    this.uploader.setProxied(this.client.proxied);
    this.resetLink();
  }

  setTransport(id: RoboflowTransportId): void {
    this.client.configure({ transport: id });
    this.transport = createTransport(id, this.client);
    this.resetLink();
  }

  status(): RoboflowStatus {
    const settings = this.client.getSettings();
    return {
      configured: this.client.configured,
      missingSettings: this.client.missingSettings(),
      proxied: this.client.proxied,
      runtime: settings.runtime,
      transport: settings.transport,
      endpoint: this.transport.endpoint(),
      description: this.transport.describe(),
      connected: this.connected,
      server: this.serverIdentity,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      consecutiveFailures: this.consecutiveFailures,
      lastError: this.lastError,
      lastRoundTripMs: this.lastRoundTripMs,
      lastServerTimeMs: this.lastServerTimeMs,
      lastOutputNames: this.lastOutputNames,
      unmappedClasses: [...this.unmappedClasses],
      activeLearning: this.uploader.stats(),
    };
  }

  /** The most recent frame posted, so the operator can send it for labelling by hand. */
  getLastFrameBase64(): string | undefined {
    return this.lastFrameBase64;
  }

  async inspect(input: VisionInput): Promise<VisionPrediction> {
    if (!this.connected) throw new Error('Roboflow provider is disconnected');

    const frame = await this.captureFrame(input);
    const startedAt = realNowMs();

    try {
      const result = await this.transport.infer(frame);
      const latencyMs = realNowMs() - startedAt;

      this.requestCount += 1;
      this.consecutiveFailures = 0;
      this.lastError = undefined;
      this.lastRoundTripMs = latencyMs;
      this.lastServerTimeMs = result.serverTimeMs;
      this.lastOutputNames = result.outputNames;

      const { prediction, unmappedClasses } = mapRoboflowResult(
        result,
        input.capturedAtSeconds,
        latencyMs,
      );
      this.recordUnmapped(unmappedClasses);

      void this.uploader.consider({
        base64: frame.base64,
        predictedClass: prediction.defectCode ?? prediction.inspectionResult,
        confidence: prediction.confidence,
        simulationTime: input.capturedAtSeconds,
      });

      return prediction;
    } catch (error) {
      this.recordFailure(error);
      throw error;
    }
  }

  private async captureFrame(input: VisionInput): Promise<{
    base64: string;
    width: number;
    height: number;
  }> {
    if (!input.grabFrame) throw new Error('inspection camera is offline');

    if (input.frameNumber === this.lastFrameNumber) {
      this.staleFrameCount += 1;
      if (this.staleFrameCount >= CONFIG.staleFrameInspections) {
        throw new Error('inspection camera feed is frozen — is the tab in the background?');
      }
    } else {
      this.staleFrameCount = 0;
      this.lastFrameNumber = input.frameNumber;
    }

    const blob = await input.grabFrame(CONFIG.frameQuality);
    const base64 = await blobToBase64(blob);
    this.lastFrameBase64 = base64;

    return { base64, width: input.width, height: input.height };
  }

  private recordFailure(error: unknown): void {
    this.errorCount += 1;
    this.consecutiveFailures += 1;
    this.lastError = error instanceof Error ? error.message : String(error);

    if (this.connected && this.consecutiveFailures >= CONFIG.failuresBeforeOffline) {
      this.connected = false;
      logger.error('roboflow.link_lost', {
        consecutiveFailures: this.consecutiveFailures,
        error: this.lastError,
      });
    }
  }

  /** Reported once per class so a mismatched Workflow is obvious but not noisy. */
  private recordUnmapped(classNames: readonly string[]): void {
    for (const className of classNames) {
      if (this.unmappedClasses.has(className)) continue;
      this.unmappedClasses.add(className);
      logger.warn('roboflow.unmapped_class', { className });
    }
  }

  private resetLink(): void {
    this.connected = false;
    this.consecutiveFailures = 0;
    this.lastOutputNames = [];
    this.serverIdentity = undefined;
  }
}
