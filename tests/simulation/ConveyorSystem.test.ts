import { beforeEach, describe, expect, it } from 'vitest';
import { conveyorConfig } from '@/config/line.config';
import { ConveyorSystem } from '@/simulation/ConveyorSystem';
import type { Product } from '@/models/Product';

function makeProduct(unitId: string, positionMeters: number): Product {
  return {
    unitId,
    sku: 'BOTTLE-500ML',
    positionMeters,
    velocityMetersPerSecond: 0,
    lateralOffsetMeters: 0,
    createdAt: 0,
    state: 'TRANSPORT',
    rejected: false,
  };
}

describe('ConveyorSystem', () => {
  let conveyor: ConveyorSystem;

  beforeEach(() => {
    conveyor = new ConveyorSystem();
    conveyor.setSpeed(0.5);
    conveyor.start();
  });

  it('moves a product speed * time metres', () => {
    const product = makeProduct('UNIT-1', 0);

    for (let i = 0; i < 120; i += 1) conveyor.advanceProducts([product], 1 / 60);

    expect(product.positionMeters).toBeCloseTo(1.0, 5);
    expect(product.velocityMetersPerSecond).toBeCloseTo(0.5, 5);
  });

  it('does not move products while stopped', () => {
    const product = makeProduct('UNIT-1', 1);
    conveyor.stop();

    conveyor.advanceProducts([product], 1);

    expect(product.positionMeters).toBe(1);
    expect(product.velocityMetersPerSecond).toBe(0);
  });

  it('stalls a follower that is closer than the minimum spacing', () => {
    const leader = makeProduct('UNIT-1', 1.0);
    const follower = makeProduct('UNIT-2', 0.95);

    conveyor.advanceProducts([leader, follower], 1 / 60);

    expect(leader.positionMeters).toBeGreaterThan(1.0);
    expect(follower.positionMeters).toBe(0.95);
    expect(follower.velocityMetersPerSecond).toBe(0);
  });

  it('never lets the gap fall below minimum spacing over a long run', () => {
    const products = [
      makeProduct('UNIT-1', 0.9),
      makeProduct('UNIT-2', 0.8),
      makeProduct('UNIT-3', 0.78),
    ];

    for (let i = 0; i < 600; i += 1) conveyor.advanceProducts(products, 1 / 60);

    for (let i = 1; i < products.length; i += 1) {
      const gap = products[i - 1]!.positionMeters - products[i]!.positionMeters;
      expect(gap).toBeGreaterThanOrEqual(conveyorConfig.minimumSpacingMeters - 1e-9);
    }
  });

  it('never moves a product backwards', () => {
    const leader = makeProduct('UNIT-1', 1.0);
    const follower = makeProduct('UNIT-2', 0.99);

    conveyor.advanceProducts([leader, follower], 1 / 60);

    expect(follower.positionMeters).toBeGreaterThanOrEqual(0.99);
    expect(follower.velocityMetersPerSecond).toBeGreaterThanOrEqual(0);
  });

  it('reports a product as exited past the belt length', () => {
    expect(conveyor.hasExited(makeProduct('UNIT-1', conveyorConfig.lengthMeters - 0.01))).toBe(
      false,
    );
    expect(conveyor.hasExited(makeProduct('UNIT-2', conveyorConfig.lengthMeters))).toBe(true);
  });

  it('maps belt position to world coordinates at the belt surface', () => {
    const world = conveyor.positionToWorld(2.0, 0.3);

    expect(world.x).toBe(2.0);
    expect(world.y).toBe(conveyorConfig.surfaceHeightMeters);
    expect(world.z).toBe(0.3);
  });
});
