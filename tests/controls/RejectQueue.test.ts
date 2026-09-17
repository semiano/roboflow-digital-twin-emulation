import { describe, expect, it } from 'vitest';
import { RejectQueue } from '@/controls/RejectQueue';

function entry(unitId: string, queuedAt: number) {
  return {
    unitId,
    inspectionResult: 'FAIL' as const,
    defectCode: 'MISSING_CAP',
    confidence: 0.9,
    queuedAt,
  };
}

describe('RejectQueue', () => {
  it('matches on unit identity, not arrival order', () => {
    const queue = new RejectQueue();
    queue.enqueue(entry('UNIT-1', 0));
    queue.enqueue(entry('UNIT-3', 1));

    expect(queue.has('UNIT-2')).toBe(false);
    expect(queue.take('UNIT-3')?.unitId).toBe('UNIT-3');
    expect(queue.has('UNIT-1')).toBe(true);
    expect(queue.size).toBe(1);
  });

  it('removes the entry after a successful reject', () => {
    const queue = new RejectQueue();
    queue.enqueue(entry('UNIT-1', 0));

    expect(queue.take('UNIT-1')).toBeDefined();
    expect(queue.take('UNIT-1')).toBeUndefined();
    expect(queue.size).toBe(0);
  });

  it('keeps only the latest decision for a re-inspected unit', () => {
    const queue = new RejectQueue();
    queue.enqueue(entry('UNIT-1', 0));
    queue.enqueue({ ...entry('UNIT-1', 5), defectCode: 'UNDERFILL' });

    expect(queue.size).toBe(1);
    expect(queue.peek('UNIT-1')?.defectCode).toBe('UNDERFILL');
  });
});
