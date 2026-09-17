import { describe, expect, it } from 'vitest';
import { conveyorConfig, rejectStationConfig } from '@/config/line.config';
import type { Product } from '@/models/Product';
import { RejectStation } from '@/simulation/RejectStation';

const REJECT_X = conveyorConfig.rejectPositionMeters;

function product(unitId: string, positionMeters: number): Product {
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

function cycle(station: RejectStation, products: Product[], seconds: number): void {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i += 1) station.update(1 / 60, products);
}

describe('RejectStation', () => {
  it('walks RETRACTED -> EXTENDING -> EXTENDED -> RETRACTING', () => {
    const station = new RejectStation();
    expect(station.state).toBe('RETRACTED');

    station.setCommand(true);
    cycle(station, [], 1 / 60);
    expect(station.state).toBe('EXTENDING');

    cycle(station, [], rejectStationConfig.extendSeconds);
    expect(station.state).toBe('EXTENDED');
    expect(station.extended).toBe(true);

    cycle(station, [], rejectStationConfig.dwellSeconds + 0.02);
    expect(station.state).toBe('RETRACTING');

    cycle(station, [], rejectStationConfig.retractSeconds + 0.02);
    expect(station.state).toBe('RETRACTED');
    expect(station.strokeFraction).toBe(0);
  });

  it('pushes a unit in its path progressively, never instantly', () => {
    const station = new RejectStation();
    const unit = product('UNIT-1', REJECT_X);
    const samples: number[] = [];

    station.setCommand(true);
    for (let i = 0; i < 30; i += 1) {
      station.update(1 / 60, [unit]);
      samples.push(unit.lateralOffsetMeters);
    }

    const biggestJump = samples.reduce(
      (largest, value, index) => Math.max(largest, value - (samples[index - 1] ?? 0)),
      0,
    );

    // A teleport would show one step covering the whole stroke.
    expect(biggestJump).toBeLessThan(rejectStationConfig.strokeMeters / 3);
    expect(samples.filter((value) => value > 0).length).toBeGreaterThan(5);
    expect(Math.max(...samples)).toBeLessThanOrEqual(
      rejectStationConfig.binCenterLateralMeters + 1e-9,
    );
    expect(unit.rejected).toBe(true);
  });

  it('leaves a unit outside the pusher path untouched', () => {
    const station = new RejectStation();
    const upstream = product('UNIT-2', REJECT_X - 0.4);

    station.setCommand(true);
    cycle(station, [upstream], 0.5);

    expect(upstream.lateralOffsetMeters).toBe(0);
    expect(upstream.rejected).toBe(false);
  });

  it('does nothing while faulted', () => {
    const station = new RejectStation();
    const unit = product('UNIT-1', REJECT_X);

    station.setFaulted(true);
    station.setCommand(true);
    cycle(station, [unit], 0.5);

    expect(station.state).toBe('RETRACTED');
    expect(station.extended).toBe(false);
    expect(unit.rejected).toBe(false);
  });

  it('slides a diverted unit into the bin and marks it REJECTED', () => {
    const station = new RejectStation();
    const unit = product('UNIT-1', REJECT_X);

    station.setCommand(true);
    cycle(station, [unit], 0.2);
    station.setCommand(false);
    cycle(station, [unit], 1.0);

    expect(unit.lateralOffsetMeters).toBeCloseTo(rejectStationConfig.binCenterLateralMeters, 3);
    expect(unit.state).toBe('REJECTED');
  });
});
