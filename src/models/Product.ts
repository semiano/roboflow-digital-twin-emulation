import type { InspectionDecision } from './Inspection';

export type ProductLifecycleState =
  | 'TRANSPORT'
  | 'INSPECTING'
  | 'INSPECTED'
  | 'DIVERTING'
  | 'REJECTED'
  | 'EXITED';

/**
 * The public transport record. Safe to hand to the PLC, sensors and HMI.
 * Ground truth is deliberately absent — see models/GroundTruth.ts.
 */
export interface Product {
  unitId: string;
  sku: string;

  /** Distance travelled along the conveyor centreline, in metres. */
  positionMeters: number;
  velocityMetersPerSecond: number;

  /** Lateral offset from the conveyor centreline, in metres. Driven by the diverter. */
  lateralOffsetMeters: number;

  /** Simulated seconds at spawn. */
  createdAt: number;

  state: ProductLifecycleState;

  inspection?: InspectionDecision;
  rejected: boolean;
}
