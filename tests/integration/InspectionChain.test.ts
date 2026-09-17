import { beforeEach, describe, expect, it } from 'vitest';
import type { LatencyMode } from '@/config/vision.config';
import { SimulationEngine } from '@/simulation/SimulationEngine';
import { resetIdCounters } from '@/utils/ids';

/**
 * Inference is genuinely asynchronous, so a step has to yield to the microtask
 * queue for a settled prediction to reach the gateway. The outcome still only
 * becomes visible to the PLC once *simulated* time passes the reported latency,
 * which is what keeps the chain deterministic.
 */
async function run(engine: SimulationEngine, seconds: number): Promise<void> {
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i += 1) {
    engine.tick(1 / 60);
    await Promise.resolve();
  }
}

interface Chain {
  engine: SimulationEngine;
  rejected: string[];
  accepted: string[];
}

/** The production wiring, with the mock's error rates dialled out. */
async function buildChain(seed = 5, latencyMode: LatencyMode = 50): Promise<Chain> {
  const engine = new SimulationEngine({ seed });
  engine.setRuntimeMode('MOCK_VISION');
  engine.configureMockVision({
    accuracy: 1,
    falsePositiveProbability: 0,
    falseNegativeProbability: 0,
    latencyMode,
  });

  const rejected: string[] = [];
  const accepted: string[] = [];
  engine.events.on('PRODUCT_REJECTED', (event) => rejected.push(event.unitId));
  engine.events.on('PRODUCT_ACCEPTED', (event) => accepted.push(event.unitId));

  engine.start();
  await run(engine, 0.5); // let the start sequence complete
  return { engine, rejected, accepted };
}

/**
 * Phase 3 acceptance, now driven through the Phase 5 provider: with a perfect
 * model the *correct* units divert. Back-to-back good/bad pairs are the case
 * that catches time-based rejecting.
 */
describe('inspection -> reject chain', () => {
  beforeEach(() => {
    resetIdCounters();
  });

  it('diverts only the defective units of an alternating sequence', async () => {
    const { engine, rejected, accepted } = await buildChain();

    const good: string[] = [];
    const bad: string[] = [];

    for (let i = 0; i < 6; i += 1) {
      const product = i % 2 === 0 ? engine.injectGood() : engine.injectDefect('MISSING_CAP');
      expect(product).toBeDefined();
      (i % 2 === 0 ? good : bad).push(product!.unitId);
      await run(engine, 0.7);
    }

    await run(engine, 20);

    expect(engine.products.count).toBe(0);
    expect(rejected.sort()).toEqual(bad.sort());
    expect(accepted.sort()).toEqual(good.sort());
  });

  it('physically pushes the rejected unit clear of the belt without teleporting', async () => {
    const { engine } = await buildChain();
    const product = engine.injectDefect('UNDERFILL')!;

    const lateralSamples: number[] = [];
    for (let i = 0; i < 60 * 25; i += 1) {
      engine.tick(1 / 60);
      await Promise.resolve();
      const live = engine.products.find(product.unitId);
      if (live) lateralSamples.push(live.lateralOffsetMeters);
    }

    const moved = lateralSamples.filter((value) => value > 0);
    // A teleport would show one or two samples; a real push shows many.
    expect(moved.length).toBeGreaterThan(10);
    expect(Math.max(...lateralSamples)).toBeGreaterThan(engine.conveyor.config.widthMeters / 2);
  });

  it('does not divert the unit when the diverter is faulted', async () => {
    const { engine } = await buildChain();
    engine.setRejectStationFaulted(true);

    const product = engine.injectDefect('MISSING_CAP')!;
    let maxLateral = 0;
    for (let i = 0; i < 60 * 20; i += 1) {
      engine.tick(1 / 60);
      await Promise.resolve();
      const live = engine.products.find(product.unitId);
      if (live) maxLateral = Math.max(maxLateral, live.lateralOffsetMeters);
    }

    // The PLC commanded the reject; the cylinder simply never moved.
    expect(maxLateral).toBe(0);
    expect(engine.plc.interlocks.isActive('REJECT_STATION_FAULT')).toBe(true);
    expect(engine.plc.tags.machineState).toBe('FAULTED');
  });

  it('freezes the conveyor on stop and resumes tracking on start', async () => {
    const { engine } = await buildChain();
    const product = engine.injectGood()!;
    await run(engine, 2);

    engine.stop();
    await run(engine, 0.5); // the belt coasts down through STOPPING

    const held = engine.products.find(product.unitId)!.positionMeters;
    await run(engine, 3);

    expect(engine.conveyor.running).toBe(false);
    expect(engine.products.find(product.unitId)!.positionMeters).toBeCloseTo(held, 6);

    engine.start();
    await run(engine, 1);
    expect(engine.products.find(product.unitId)!.positionMeters).toBeGreaterThan(held);
  });

  it('rejects on the timeout fail-safe when inference is slower than the PLC allows', async () => {
    const { engine, rejected } = await buildChain(5, 1500);

    const product = engine.injectGood()!;
    await run(engine, 25);

    expect(engine.plc.alarms.isActive('INSPECTION_TIMEOUT')).toBe(true);
    expect(rejected).toContain(product.unitId);
  });

  it('runs the line uninspected in SIMULATION_ONLY', async () => {
    const { engine, rejected, accepted } = await buildChain();
    engine.setRuntimeMode('SIMULATION_ONLY');

    const product = engine.injectDefect('MISSING_CAP')!;
    await run(engine, 25);

    expect(engine.plc.visionAttached).toBe(false);
    expect(rejected).toEqual([]);
    expect(accepted).toContain(product.unitId);
  });
});
