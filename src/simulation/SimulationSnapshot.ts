import type { RuntimeMode, SimulationSpeed } from '@/config/simulation.config';
import type { MachineState } from '@/controls/ControlStateMachine';
import type { FaultCode } from '@/controls/Interlocks';
import type { StackLight } from '@/controls/PlcIo';
import type { PlcTags } from '@/controls/PlcTags';
import type { SystemEvent } from '@/core/events';
import type { QualityMetrics } from '@/historian/MetricsEngine';
import type { Alarm } from '@/models/Alarm';
import type { ProductLifecycleState } from '@/models/Product';
import type { MockVisionSettings } from '@/vision/MockVisionProvider';
import type { RoboflowStatus } from '@/vision/roboflow/RoboflowProvider';
import type { VisionDetection } from '@/vision/VisionTypes';
import type { RejectStationState } from './RejectStation';

/**
 * Everything the CAM01 panel needs to draw the last inference. It is display
 * data only — the control layer never sees a bounding box.
 */
export interface VisionOverlaySnapshot {
  unitId: string;
  detections: readonly VisionDetection[];
  /** Pixel space the boxes are expressed in, so the panel can scale them. */
  sourceWidth: number;
  sourceHeight: number;
  /** Roboflow's own rendered overlay, when the Workflow returns a visualization. */
  annotatedFrameBase64: string | undefined;
  inferenceId: string | undefined;
}

export interface ProductSnapshot {
  unitId: string;
  sku: string;
  positionMeters: number;
  lateralOffsetMeters: number;
  state: ProductLifecycleState;
  rejected: boolean;
}

export interface SensorSnapshot {
  id: string;
  label: string;
  positionMeters: number;
  active: boolean;
  unitId: string | undefined;
}

/**
 * Immutable view handed to React at a throttled rate (plan.md §2.3).
 * Contains no ground truth and no live engine object references.
 */
export interface SimulationSnapshot {
  elapsedSeconds: number;
  speedMultiplier: SimulationSpeed;
  paused: boolean;

  conveyorRunning: boolean;
  lineSpeedMetersPerSecond: number;
  unitsPerMinute: number;
  autoSpawn: boolean;

  productCount: number;
  products: readonly ProductSnapshot[];

  totalSpawned: number;
  totalExited: number;

  machineState: MachineState;
  stackLight: StackLight;
  tags: PlcTags;
  sensors: readonly SensorSnapshot[];

  rejectStationState: RejectStationState;
  rejectStationStroke: number;
  rejectStationFaulted: boolean;
  rejectQueueSize: number;
  pendingInspections: number;
  lastInferenceLatencyMs: number;

  alarms: readonly Alarm[];
  faults: readonly FaultCode[];

  visionAttached: boolean;
  cameraOnline: boolean;

  runtimeMode: RuntimeMode;
  /** Undefined when no inference engine is wired in (SIMULATION_ONLY). */
  visionProviderName: string | undefined;
  /**
   * The live link state. The PLC's `visionConnected` tag is a copy taken on the
   * last scan, so it is stale before the line is first started.
   */
  visionProviderConnected: boolean;
  /** Present only while the mock provider is the active one. */
  mockVision: MockVisionSettings | undefined;
  /** Last inference, for the CAM01 detection overlay. */
  visionOverlay: VisionOverlaySnapshot | undefined;
  /** Present only while the Roboflow provider is the active one. */
  roboflow: RoboflowStatus | undefined;
  qualityMetrics: QualityMetrics;
  recentEvents: readonly SystemEvent[];
}
