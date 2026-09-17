import { beforeEach, describe, expect, it } from 'vitest';
import { conveyorConfig } from '@/config/line.config';
import { SimulationEngine } from '@/simulation/SimulationEngine';
import { resetIdCounters } from '@/utils/ids';

/** Drives the headless engine for `seconds` of real time at 60 fps. */
function run(engine: SimulationEngine, seconds: number): void {
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i += 1) engine.tick(1 / 60);
}

/** START only raises the run command; the PLC still walks through STARTING. */
function startAndSettle(engine: SimulationEngine): void {
  engine.start();
  run(engine, 0.5);
}

describe('SimulationEngine (headless)', () => {
  let engine: SimulationEngine;

  beforeEach(() => {
    resetIdCounters();
    engine = new SimulationEngine({ seed: 1 });
  });

  it('constructs and ticks with no scene attached', () => {
    engine.start();
    engine.injectGood();

    run(engine, 1);

    expect(engine.products.count).toBe(1);
    expect(engine.clock.elapsedSeconds).toBeCloseTo(1, 3);
  });

  it('assigns unique unit ids', () => {
    startAndSettle(engine);
    engine.setLineSpeed(1.0);

    const ids = new Set<string>();
    for (let i = 0; i < 5; i += 1) {
      const product = engine.injectGood();
      if (product) ids.add(product.unitId);
      run(engine, 0.5);
    }

    expect(ids.size).toBe(5);
  });

  it('despawns a product once it passes the exit', () => {
    startAndSettle(engine);
    engine.setLineSpeed(1.0);
    engine.injectGood();

    run(engine, conveyorConfig.lengthMeters / 1.0 + 0.5);

    expect(engine.products.count).toBe(0);
    expect(engine.getSnapshot().totalExited).toBe(1);
  });

  it('holds position while the conveyor is stopped', () => {
    startAndSettle(engine);
    engine.injectGood();
    run(engine, 1);

    engine.stop();
    run(engine, 0.5); // the belt coasts down through STOPPING

    const held = engine.products.getProducts()[0]!.positionMeters;
    run(engine, 2);

    expect(engine.conveyor.running).toBe(false);
    expect(engine.products.getProducts()[0]!.positionMeters).toBeCloseTo(held, 6);
  });

  it('keeps ground truth out of the product record', () => {
    engine.injectDefect('MISSING_CAP');
    const product = engine.products.getProducts()[0]!;

    expect(product).not.toHaveProperty('groundTruth');
    expect(engine.groundTruth.get(product.unitId)?.capPresent).toBe(false);
  });

  it('produces the same result for the same seed', () => {
    const a = new SimulationEngine({ seed: 42 });
    const b = new SimulationEngine({ seed: 42 });

    startAndSettle(a);
    startAndSettle(b);
    a.products.setAutoSpawn(true);
    b.products.setAutoSpawn(true);

    run(a, 10);
    run(b, 10);

    expect(a.getSnapshot().totalSpawned).toBe(b.getSnapshot().totalSpawned);
    expect(a.products.getProducts().map((p) => p.positionMeters)).toEqual(
      b.products.getProducts().map((p) => p.positionMeters),
    );
  });
});
