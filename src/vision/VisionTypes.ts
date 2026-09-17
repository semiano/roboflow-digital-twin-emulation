import type { InspectionResult } from "@/models/DefectType";
import type { CameraStreamAdapter } from "./CameraStreamAdapter";

/**
 * The pixel boundary (plan.md C2).
 *
 * A `VisionInput` carries pixels and frame metadata and nothing else — no unit
 * id, no scene object, no simulator truth. A provider therefore cannot cheat by
 * reading the input; it can only look at the image, exactly like a real model.
 */
export interface VisionInput {
  /** The camera itself, for providers that consume a stream or pull their own stills. */
  camera: CameraStreamAdapter | undefined;
  /** Live handle on the inspection camera canvas, when one is rendering. */
  stream: MediaStream | undefined;
  /** Pulls a single still frame. Used by the Roboflow frame API. */
  grabFrame?: (quality?: number) => Promise<Blob>;
  width: number;
  height: number;
  /** Simulated seconds at which the frame was taken. */
  capturedAtSeconds: number;
  frameNumber: number;
}

/** Spec §16. Pixel-space box, centre origin, matching Roboflow's convention. */
export interface VisionDetection {
  className: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Spec §16. Every provider normalizes onto this, whatever its wire format. */
export interface VisionPrediction {
  /** Simulated seconds of the frame this prediction describes. */
  timestamp: number;
  detections: VisionDetection[];
  inspectionResult: InspectionResult | "UNKNOWN";
  defectCode?: string;
  confidence: number;
  inferenceLatencyMs?: number;

  /**
   * Pixel dimensions the detection boxes are expressed in. The overlay needs it
   * to scale boxes onto a CAM01 panel that is rarely at native resolution.
   */
  sourceWidth?: number;
  sourceHeight?: number;
  /** Roboflow's own rendered overlay, when the Workflow includes a visualization block. */
  annotatedFrameBase64?: string;
  /** Roboflow inference id, carried for traceability in Phase 8. */
  inferenceId?: string;
}
