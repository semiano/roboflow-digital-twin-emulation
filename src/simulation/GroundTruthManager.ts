import type { ProductGroundTruth } from '@/models/GroundTruth';

/**
 * Private store of simulator truth (spec §3.3, §56).
 *
 * Readable only by the rendering, evaluation and dataset layers. The controls
 * and vision layers are blocked from importing this module by the ESLint
 * boundary rules in eslint.config.js.
 */
export class GroundTruthManager {
  private readonly truths = new Map<string, ProductGroundTruth>();

  register(unitId: string, truth: ProductGroundTruth): void {
    this.truths.set(unitId, truth);
  }

  /** Returns a copy so callers cannot mutate simulator truth. */
  get(unitId: string): ProductGroundTruth | undefined {
    const truth = this.truths.get(unitId);
    return truth ? { ...truth } : undefined;
  }

  has(unitId: string): boolean {
    return this.truths.has(unitId);
  }

  /** Retained after a unit leaves the line so the historian can still join it. */
  forget(unitId: string): void {
    this.truths.delete(unitId);
  }

  clear(): void {
    this.truths.clear();
  }

  get size(): number {
    return this.truths.size;
  }
}
