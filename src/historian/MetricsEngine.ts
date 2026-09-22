import type { QualityEvaluation } from '@/models/Inspection';
import { percentile } from '@/utils/math';
import type { EvaluatedInspection } from './EvaluationService';

export interface QualityMetrics {
  totalUnits: number;
  goodUnits: number;
  actualDefectiveUnits: number;
  visionPasses: number;
  visionFailures: number;
  unknowns: number;
  truePositives: number;
  trueNegatives: number;
  falseRejects: number;
  escapes: number;
  falseRejectRate: number;
  escapeRate: number;
  precision: number;
  recall: number;
  accuracy: number;
  coverage: number;
  unknownRate: number;
  defectClassAccuracy: number;
  firstPassYield: number;
  meanLatencyMs: number;
  p95LatencyMs: number;
}

const zeroEvaluations = (): Record<QualityEvaluation, number> => ({
  TRUE_POSITIVE: 0,
  TRUE_NEGATIVE: 0,
  FALSE_POSITIVE: 0,
  FALSE_NEGATIVE: 0,
});

const ratio = (numerator: number, denominator: number): number =>
  denominator === 0 ? 0 : numerator / denominator;

export class MetricsEngine {
  private totalUnits = 0;
  private actualDefectiveUnits = 0;
  private visionPasses = 0;
  private visionFailures = 0;
  private unknowns = 0;
  private defectClassCorrect = 0;
  private acceptedUnits = 0;
  private readonly evaluations = zeroEvaluations();
  private readonly latencies: number[] = [];

  record(inspection: EvaluatedInspection): void {
    this.totalUnits += 1;
    if (inspection.expectedResult === 'FAIL') this.actualDefectiveUnits += 1;
    if (inspection.result === 'PASS') this.visionPasses += 1;
    else if (inspection.result === 'FAIL') this.visionFailures += 1;
    else this.unknowns += 1;
    if (inspection.evaluation) this.evaluations[inspection.evaluation] += 1;
    if (inspection.defectClassCorrect) this.defectClassCorrect += 1;
    if (inspection.action === 'ACCEPT') this.acceptedUnits += 1;
    if (inspection.latencyMs > 0) this.latencies.push(inspection.latencyMs);
  }

  snapshot(): QualityMetrics {
    const truePositives = this.evaluations.TRUE_POSITIVE;
    const trueNegatives = this.evaluations.TRUE_NEGATIVE;
    const falseRejects = this.evaluations.FALSE_POSITIVE;
    const escapes = this.evaluations.FALSE_NEGATIVE;
    const goodUnits = this.totalUnits - this.actualDefectiveUnits;
    const decided = this.totalUnits - this.unknowns;
    const latencyTotal = this.latencies.reduce((sum, value) => sum + value, 0);

    return {
      totalUnits: this.totalUnits,
      goodUnits,
      actualDefectiveUnits: this.actualDefectiveUnits,
      visionPasses: this.visionPasses,
      visionFailures: this.visionFailures,
      unknowns: this.unknowns,
      truePositives,
      trueNegatives,
      falseRejects,
      escapes,
      falseRejectRate: ratio(falseRejects, goodUnits),
      escapeRate: ratio(escapes, this.actualDefectiveUnits),
      precision: ratio(truePositives, truePositives + falseRejects),
      recall: ratio(truePositives, this.actualDefectiveUnits),
      accuracy: ratio(truePositives + trueNegatives, this.totalUnits),
      coverage: ratio(decided, this.totalUnits),
      unknownRate: ratio(this.unknowns, this.totalUnits),
      defectClassAccuracy: ratio(this.defectClassCorrect, this.totalUnits),
      firstPassYield: ratio(this.acceptedUnits, this.totalUnits),
      meanLatencyMs: ratio(latencyTotal, this.latencies.length),
      p95LatencyMs: percentile(this.latencies, 0.95),
    };
  }

  reset(): void {
    this.totalUnits = 0;
    this.actualDefectiveUnits = 0;
    this.visionPasses = 0;
    this.visionFailures = 0;
    this.unknowns = 0;
    this.defectClassCorrect = 0;
    this.acceptedUnits = 0;
    Object.assign(this.evaluations, zeroEvaluations());
    this.latencies.length = 0;
  }
}