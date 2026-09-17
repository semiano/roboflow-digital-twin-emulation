import type { InspectionResult } from '@/models/DefectType';

export interface VisionRequest {
  inspectionId: string;
  unitId: string;
  /** Simulated seconds at which the PLC issued the request. */
  simulationTime: number;
}

export interface VisionOutcome {
  inspectionId: string;
  unitId: string;
  result: InspectionResult | 'UNKNOWN';
  defectCode: string;
  confidence: number;
  inferenceLatencyMs: number;
}

/**
 * The narrow port the PLC uses to talk to the vision system.
 *
 * Results are *polled*, not pushed. A real inference call is asynchronous, but
 * a PLC consumes it on a scan boundary the same way it consumes a message
 * instruction's done bit — so the simulation stays deterministic no matter when
 * the underlying promise settles.
 */
export interface VisionGateway {
  isConnected(): boolean;
  isReady(): boolean;
  request(request: VisionRequest): void;
  /** Drains every outcome that has completed by `simulationTime`. */
  poll(simulationTime: number): VisionOutcome[];
  cancel(inspectionId: string): void;
}
