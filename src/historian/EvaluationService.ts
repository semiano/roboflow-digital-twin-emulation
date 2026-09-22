import type { VisionCompletedEvent } from '@/core/events';
import type { DefectType, InspectionResult } from '@/models/DefectType';
import type { ProductGroundTruth } from '@/models/GroundTruth';
import type { QualityEvaluation } from '@/models/Inspection';

export type ProductionAction = 'ACCEPT' | 'REJECT';

export interface PendingVisionDecision {
  result: InspectionResult | 'UNKNOWN';
  defectCode?: string;
  confidence: number;
  latencyMs: number;
}

export interface EvaluatedInspection extends PendingVisionDecision {
  unitId: string;
  truthDefect: DefectType;
  expectedResult: InspectionResult;
  action: ProductionAction;
  evaluation: QualityEvaluation | undefined;
  productionActionCorrect: boolean;
  defectClassCorrect: boolean;
}

/** Joins a pixel-derived verdict to simulator truth only after the PLC has acted. */
export class EvaluationService {
  private readonly pending = new Map<string, PendingVisionDecision>();

  recordVision(event: VisionCompletedEvent): void {
    this.pending.set(event.unitId, {
      result: event.result,
      ...(event.defectCode ? { defectCode: event.defectCode } : {}),
      confidence: event.confidence,
      latencyMs: event.latencyMs,
    });
  }

  recordVisionFailure(unitId: string): void {
    this.pending.set(unitId, { result: 'UNKNOWN', confidence: 0, latencyMs: 0 });
  }

  evaluateAction(
    unitId: string,
    action: ProductionAction,
    truth: ProductGroundTruth,
  ): EvaluatedInspection {
    const decision = this.pending.get(unitId) ?? {
      result: 'UNKNOWN' as const,
      confidence: 0,
      latencyMs: 0,
    };
    this.pending.delete(unitId);

    const evaluation = this.classify(decision.result, truth.expectedResult);
    return {
      unitId,
      truthDefect: truth.defectType,
      expectedResult: truth.expectedResult,
      action,
      ...decision,
      evaluation,
      productionActionCorrect:
        (truth.expectedResult === 'FAIL' && action === 'REJECT') ||
        (truth.expectedResult === 'PASS' && action === 'ACCEPT'),
      defectClassCorrect:
        truth.defectType === 'NONE'
          ? decision.result === 'PASS'
          : decision.result === 'FAIL' && decision.defectCode === truth.defectType,
    };
  }

  reset(): void {
    this.pending.clear();
  }

  private classify(
    predicted: InspectionResult | 'UNKNOWN',
    expected: InspectionResult,
  ): QualityEvaluation | undefined {
    if (predicted === 'UNKNOWN') return undefined;
    if (predicted === 'FAIL') {
      return expected === 'FAIL' ? 'TRUE_POSITIVE' : 'FALSE_POSITIVE';
    }
    return expected === 'PASS' ? 'TRUE_NEGATIVE' : 'FALSE_NEGATIVE';
  }
}