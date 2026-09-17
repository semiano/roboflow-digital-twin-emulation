import { describe, expect, it } from 'vitest';
import { SimulationClock } from '@/simulation/SimulationClock';
import { simulationConfig } from '@/config/simulation.config';

const STEP = simulationConfig.fixedStepSeconds;

describe('SimulationClock', () => {
  it('advances in fixed steps regardless of frame pacing', () => {
    const steady = new SimulationClock();
    const jittery = new SimulationClock();

    for (let i = 0; i < 120; i += 1) {
      runFrame(steady, 1 / 60);
    }

    // Same total real time, wildly uneven frames.
    const jitterFrames = [0.004, 0.05, 0.001, 0.12, 0.033, 0.009];
    let delivered = 0;
    const total = 2;
    let index = 0;
    while (delivered < total) {
      const frame = Math.min(jitterFrames[index % jitterFrames.length]!, total - delivered);
      runFrame(jittery, frame);
      delivered += frame;
      index += 1;
    }

    expect(steady.elapsedSeconds).toBeCloseTo(2, 5);
    expect(jittery.elapsedSeconds).toBeCloseTo(steady.elapsedSeconds, 5);
  });

  it('scales elapsed time by the speed multiplier', () => {
    const clock = new SimulationClock();
    clock.setSpeed(2);

    for (let i = 0; i < 60; i += 1) runFrame(clock, 1 / 60);

    expect(clock.elapsedSeconds).toBeCloseTo(2, 5);
  });

  it('produces no steps at 0x or while paused', () => {
    const clock = new SimulationClock();

    clock.setSpeed(0);
    expect(clock.advance(1)).toBe(0);

    clock.setSpeed(1);
    clock.pause();
    expect(clock.advance(1)).toBe(0);
    expect(clock.deltaSeconds).toBe(0);

    clock.resume();
    expect(clock.advance(1)).toBeGreaterThan(0);
  });

  it('caps catch-up work after a long stall', () => {
    const clock = new SimulationClock();
    expect(clock.advance(30)).toBe(simulationConfig.maxStepsPerFrame);
  });

  it('carries fractional leftover time rather than losing it', () => {
    const clock = new SimulationClock();
    const frame = STEP * 1.5;

    expect(clock.advance(frame)).toBe(1);
    expect(clock.advance(frame)).toBe(2);
  });

  it('reset returns the clock to zero and unpauses', () => {
    const clock = new SimulationClock();
    runFrame(clock, 1);
    clock.pause();

    clock.reset();

    expect(clock.elapsedSeconds).toBe(0);
    expect(clock.paused).toBe(false);
  });
});

function runFrame(clock: SimulationClock, realDeltaSeconds: number): void {
  const steps = clock.advance(realDeltaSeconds);
  for (let i = 0; i < steps; i += 1) clock.step();
}
