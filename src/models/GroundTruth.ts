import type { DefectType, InspectionResult } from './DefectType';

/**
 * Private simulator truth about one specific unit.
 *
 * DEVIATION FROM SPEC §8 (intentional, see plan.md C1): ground truth is NOT a
 * field on `Product`. If it were, any module holding a Product could read it and
 * the §56 rule would be unenforceable. Ground truth lives in
 * `GroundTruthManager`, keyed by unitId, and is readable only by the rendering,
 * evaluation and dataset layers.
 */
export interface ProductGroundTruth {
  defectType: DefectType;

  capPresent: boolean;
  labelPresent: boolean;
  labelRotationDegrees: number;
  /** Label texture variant; a mismatch against the SKU's nominal label is WRONG_LABEL. */
  labelVariant: string;

  /** Normalised 0..1 liquid height. */
  fillLevel: number;

  expectedResult: InspectionResult;
}
