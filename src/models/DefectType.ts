/**
 * Shared defect vocabulary.
 *
 * This is deliberately separate from ProductGroundTruth. The *names* of defects
 * are common language between the vision layer, the PLC and the HMI. What must
 * never cross the boundary is the truth about a specific unit — that lives in
 * models/GroundTruth.ts and is blocked by the ESLint layer rules.
 */

export type DefectType =
  | 'NONE'
  | 'MISSING_CAP'
  | 'MISSING_LABEL'
  | 'CROOKED_LABEL'
  | 'WRONG_LABEL'
  | 'UNDERFILL';

export const DEFECT_TYPES: readonly DefectType[] = [
  'NONE',
  'MISSING_CAP',
  'MISSING_LABEL',
  'CROOKED_LABEL',
  'WRONG_LABEL',
  'UNDERFILL',
] as const;

export const DEFECT_LABELS: Record<DefectType, string> = {
  NONE: 'Good Product',
  MISSING_CAP: 'Missing Cap',
  MISSING_LABEL: 'Missing Label',
  CROOKED_LABEL: 'Crooked Label',
  WRONG_LABEL: 'Wrong Label',
  UNDERFILL: 'Underfill',
};

export type InspectionResult = 'PASS' | 'FAIL';
