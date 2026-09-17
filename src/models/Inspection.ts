import type { InspectionResult } from './DefectType';

/** What the vision system claims it saw. Carries no simulator truth. */
export interface InspectionDecision {
  inspectionId: string;
  unitId: string;
  /** Simulated seconds at which the decision was recorded. */
  simulationTime: number;
  result: InspectionResult | 'UNKNOWN';
  defectCode?: string;
  confidence: number;
  inferenceLatencyMs?: number;
}

export type QualityEvaluation =
  | 'TRUE_POSITIVE'
  | 'TRUE_NEGATIVE'
  | 'FALSE_POSITIVE'
  | 'FALSE_NEGATIVE';

/** Operator-facing wording for the confusion matrix (spec §28). */
export const EVALUATION_LABELS: Record<QualityEvaluation, string> = {
  TRUE_POSITIVE: 'Correct Reject',
  TRUE_NEGATIVE: 'Correct Accept',
  FALSE_POSITIVE: 'False Reject',
  FALSE_NEGATIVE: 'Escape',
};
