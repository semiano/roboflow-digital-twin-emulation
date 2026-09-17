import type { InspectionResult } from '@/models/DefectType';
import type { VisionGateway, VisionOutcome, VisionRequest } from '@/vision/VisionGateway';

interface ScriptedResponse {
  result: InspectionResult | 'UNKNOWN';
  defectCode?: string;
  confidence?: number;
}

/**
 * Test double for the vision port. Responses are scripted per unit id so the
 * control logic can be exercised without ground truth or a renderer.
 */
export class ScriptedVisionGateway implements VisionGateway {
  connected = true;
  ready = true;
  latencySeconds = 0;

  readonly requests: VisionRequest[] = [];

  private readonly responses = new Map<string, ScriptedResponse>();
  private readonly silent = new Set<string>();
  private pending: Array<{ dueAt: number; outcome: VisionOutcome }> = [];

  /** Overrides the inspection id on the next outcome, to simulate lost tracking. */
  corruptNextInspectionId = false;

  scriptResult(unitId: string, response: ScriptedResponse): void {
    this.responses.set(unitId, response);
  }

  /** The gateway accepts the request but never answers, forcing a timeout. */
  scriptSilence(unitId: string): void {
    this.silent.add(unitId);
  }

  isConnected(): boolean {
    return this.connected;
  }

  isReady(): boolean {
    return this.connected && this.ready;
  }

  request(request: VisionRequest): void {
    this.requests.push(request);
    if (this.silent.has(request.unitId)) return;

    const scripted = this.responses.get(request.unitId) ?? { result: 'PASS' as const };
    const inspectionId = this.corruptNextInspectionId
      ? `${request.inspectionId}-LOST`
      : request.inspectionId;
    this.corruptNextInspectionId = false;

    this.pending.push({
      dueAt: request.simulationTime + this.latencySeconds,
      outcome: {
        inspectionId,
        unitId: request.unitId,
        result: scripted.result,
        defectCode: scripted.defectCode ?? '',
        confidence: scripted.confidence ?? 0.95,
        inferenceLatencyMs: this.latencySeconds * 1000,
      },
    });
  }

  poll(simulationTime: number): VisionOutcome[] {
    const due: VisionOutcome[] = [];
    const held: typeof this.pending = [];

    for (const item of this.pending) {
      if (item.dueAt <= simulationTime) due.push(item.outcome);
      else held.push(item);
    }

    this.pending = held;
    return due;
  }

  cancel(inspectionId: string): void {
    this.pending = this.pending.filter((item) => item.outcome.inspectionId !== inspectionId);
  }
}
