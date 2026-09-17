import { logger } from '@/core/Logger';
import type { VisionGateway, VisionOutcome, VisionRequest } from './VisionGateway';
import type { VisionProvider } from './VisionProvider';
import type { VisionInput, VisionPrediction } from './VisionTypes';

export type FrameCapture = (capturedAtSeconds: number) => VisionInput;

/** Display-only view of the last inference. Never reaches the control layer. */
export interface PredictionView {
  unitId: string;
  prediction: VisionPrediction;
}

interface InFlight {
  request: VisionRequest;
  outcome: VisionOutcome | undefined;
  /** Simulated time the result becomes visible to the PLC. */
  dueAt: number;
}

/**
 * Adapts an asynchronous `VisionProvider` onto the polled `VisionGateway` port
 * the PLC consumes (D7).
 *
 * Two things have to be true at once for an outcome to be handed over: the
 * promise must have settled, *and* simulated time must have reached the
 * reported inference latency. The first keeps the async provider honest; the
 * second keeps the line deterministic and makes latency mean the same thing at
 * 1x and at 5x.
 *
 * Unit identity is held here, on the control side of the boundary, and is never
 * passed into `inspect()` — the provider only ever receives pixels (C2).
 */
export class ProviderVisionGateway implements VisionGateway {
  private readonly inflight = new Map<string, InFlight>();
  private frameNumber = 0;
  private lastPrediction: PredictionView | undefined;

  constructor(
    readonly provider: VisionProvider,
    private readonly capture: FrameCapture,
  ) {}

  /**
   * Bounding boxes exist for the operator, not for the controller, so they are
   * read from here rather than smuggled through `VisionOutcome`. The PLC's
   * input surface stays exactly as narrow as the boundary test pins it.
   */
  getLastPrediction(): PredictionView | undefined {
    return this.lastPrediction;
  }

  isConnected(): boolean {
    return this.provider.isConnected();
  }

  isReady(): boolean {
    return this.provider.isConnected();
  }

  request(request: VisionRequest): void {
    if (!this.provider.isConnected()) return;

    const entry: InFlight = { request, outcome: undefined, dueAt: Infinity };
    this.inflight.set(request.inspectionId, entry);

    this.frameNumber += 1;
    const input = { ...this.capture(request.simulationTime), frameNumber: this.frameNumber };

    // Both outcomes are attached to the same promise rather than chained, so a
    // failure settles in the same microtask a success would have.
    void this.provider.inspect(input).then(
      (prediction) => {
        if (!this.inflight.has(request.inspectionId)) return;
        const latencyMs = prediction.inferenceLatencyMs ?? 0;

        this.lastPrediction = { unitId: request.unitId, prediction };

        entry.outcome = {
          inspectionId: request.inspectionId,
          unitId: request.unitId,
          result: prediction.inspectionResult,
          defectCode: prediction.defectCode ?? '',
          confidence: prediction.confidence,
          inferenceLatencyMs: latencyMs,
        };
        entry.dueAt = request.simulationTime + latencyMs / 1000;
      },
      (error: unknown) => {
        if (!this.inflight.has(request.inspectionId)) return;
        logger.warn('vision.inspect_failed', {
          inspectionId: request.inspectionId,
          provider: this.provider.name,
          error: String(error),
        });

        // Clear the overlay: leaving the previous unit's boxes on screen would
        // be worse than showing nothing.
        this.lastPrediction = {
          unitId: request.unitId,
          prediction: {
            timestamp: request.simulationTime,
            detections: [],
            inspectionResult: 'UNKNOWN',
            confidence: 0,
            inferenceLatencyMs: 0,
          },
        };

        // An inference that throws is not a silent pass: the PLC gets UNKNOWN
        // immediately and the configured fail-safe decides what happens.
        entry.outcome = {
          inspectionId: request.inspectionId,
          unitId: request.unitId,
          result: 'UNKNOWN',
          defectCode: '',
          confidence: 0,
          inferenceLatencyMs: 0,
        };
        entry.dueAt = request.simulationTime;
      },
    );
  }

  poll(simulationTime: number): VisionOutcome[] {
    if (this.inflight.size === 0) return [];

    const due: VisionOutcome[] = [];
    for (const [inspectionId, entry] of this.inflight) {
      if (!entry.outcome || entry.dueAt > simulationTime) continue;
      due.push(entry.outcome);
      this.inflight.delete(inspectionId);
    }
    return due;
  }

  /** Removing the entry also orphans any late promise settlement for it. */
  cancel(inspectionId: string): void {
    this.inflight.delete(inspectionId);
  }

  get pendingCount(): number {
    return this.inflight.size;
  }
}
