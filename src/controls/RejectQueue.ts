/**
 * Units awaiting the diverter, keyed by unit identity (spec §21).
 *
 * Deliberately a Map and not a time-ordered list: rejecting on elapsed time is
 * the classic way to divert the wrong bottle when the line speed changes or a
 * unit accumulates behind another.
 */
export interface RejectQueueEntry {
  unitId: string;
  inspectionResult: 'FAIL';
  defectCode: string;
  confidence: number;
  /** Simulated seconds at which the unit was queued. Diagnostic only. */
  queuedAt: number;
}

export class RejectQueue {
  private readonly entries = new Map<string, RejectQueueEntry>();

  enqueue(entry: RejectQueueEntry): void {
    this.entries.set(entry.unitId, entry);
  }

  has(unitId: string): boolean {
    return this.entries.has(unitId);
  }

  peek(unitId: string): RejectQueueEntry | undefined {
    return this.entries.get(unitId);
  }

  /** Removes and returns the entry after a successful reject. */
  take(unitId: string): RejectQueueEntry | undefined {
    const entry = this.entries.get(unitId);
    if (entry) this.entries.delete(unitId);
    return entry;
  }

  remove(unitId: string): boolean {
    return this.entries.delete(unitId);
  }

  get size(): number {
    return this.entries.size;
  }

  list(): readonly RejectQueueEntry[] {
    return [...this.entries.values()];
  }

  clear(): void {
    this.entries.clear();
  }
}
