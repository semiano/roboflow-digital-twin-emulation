import {
  defectSeverityOrder,
  roboflowClassMap,
  visionConfig,
} from '@/config/vision.config';
import type { DefectType, InspectionResult } from '@/models/DefectType';
import type { VisionDetection, VisionPrediction } from '@/vision/VisionTypes';
import type { RoboflowInferenceResult } from './RoboflowTypes';

export interface MappedPrediction {
  prediction: VisionPrediction;
  /** Roboflow classes with no entry in the config map, for operator feedback. */
  unmappedClasses: readonly string[];
}

const severityRank = (defect: DefectType): number => {
  const index = defectSeverityOrder.indexOf(defect);
  return index === -1 ? defectSeverityOrder.length : index;
};

/** Tolerates the `missing-cap` / `missing_cap` / `Missing Cap` variants Roboflow projects use. */
const normalizeClassName = (className: string): string =>
  className.trim().toLowerCase().replace(/[\s-]+/g, '_');

export function mapClassName(className: string): DefectType | undefined {
  return roboflowClassMap[normalizeClassName(className)];
}

/**
 * Roboflow response -> `VisionPrediction` (spec §16).
 *
 * The aggregation rule is deliberately conservative and lives here rather than
 * in the PLC: a controller decides what to *do* with a verdict, it does not
 * decide what a pile of bounding boxes means.
 *
 *  - detections under `minimumDetectionConfidence` are not evidence of anything
 *  - any surviving defect class fails the unit; the most severe one names it
 *  - otherwise a recognised `bottle`/`good` box passes the unit
 *  - nothing recognised at all, or a verdict under `unknownConfidenceThreshold`,
 *    is UNKNOWN — which hands the decision to the configured fail-safe rather
 *    than quietly passing product
 */
export function mapRoboflowResult(
  result: RoboflowInferenceResult,
  capturedAtSeconds: number,
  latencyMs: number,
): MappedPrediction {
  const detections: VisionDetection[] = [];
  const unmapped = new Set<string>();

  let worstDefect: DefectType | undefined;
  let worstConfidence = 0;
  let bottleConfidence = 0;

  for (const raw of result.detections) {
    detections.push({
      className: raw.class,
      confidence: raw.confidence,
      x: raw.x,
      y: raw.y,
      width: raw.width,
      height: raw.height,
    });

    const defect = mapClassName(raw.class);
    if (defect === undefined) {
      unmapped.add(raw.class);
      continue;
    }
    if (raw.confidence < visionConfig.minimumDetectionConfidence) continue;

    if (defect === 'NONE') {
      bottleConfidence = Math.max(bottleConfidence, raw.confidence);
      continue;
    }

    if (worstDefect === undefined || severityRank(defect) < severityRank(worstDefect)) {
      worstDefect = defect;
      worstConfidence = raw.confidence;
    }
  }

  let inspectionResult: InspectionResult | 'UNKNOWN';
  let confidence: number;

  if (worstDefect !== undefined) {
    inspectionResult = 'FAIL';
    confidence = worstConfidence;
  } else if (bottleConfidence > 0) {
    inspectionResult = 'PASS';
    confidence = bottleConfidence;
  } else {
    inspectionResult = 'UNKNOWN';
    confidence = 0;
  }

  if (confidence < visionConfig.unknownConfidenceThreshold) inspectionResult = 'UNKNOWN';

  const prediction: VisionPrediction = {
    timestamp: capturedAtSeconds,
    detections,
    inspectionResult,
    ...(inspectionResult === 'FAIL' && worstDefect ? { defectCode: worstDefect } : {}),
    confidence,
    inferenceLatencyMs: latencyMs,
    sourceWidth: result.image?.width ?? 0,
    sourceHeight: result.image?.height ?? 0,
    ...(result.visualizationBase64 ? { annotatedFrameBase64: result.visualizationBase64 } : {}),
    ...(result.inferenceId ? { inferenceId: result.inferenceId } : {}),
  };

  return { prediction, unmappedClasses: [...unmapped] };
}
