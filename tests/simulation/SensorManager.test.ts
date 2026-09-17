import { describe, expect, it } from 'vitest';
import { conveyorConfig } from '@/config/line.config';
import { EventBus } from '@/core/EventBus';
import type { Product } from '@/models/Product';
import { SensorManager } from '@/simulation/SensorManager';

function product(unitId: string, positionMeters: number, lateralOffsetMeters = 0): Product {
  return {
    unitId,
    sku: 'BOTTLE-500ML',
    positionMeters,
    velocityMetersPerSecond: 0.35,
    lateralOffsetMeters,
    createdAt: 0,
    state: 'TRANSPORT',
    rejected: false,
  };
}

describe('SensorManager', () => {
  it('reports the blocking unit id at the inspection photoeye', () => {
    const sensors = new SensorManager();
    sensors.update([product('UNIT-1', conveyorConfig.inspectionPositionMeters)], 0);

    expect(sensors.read('PE101')).toEqual({ active: true, unitId: 'UNIT-1' });
    expect(sensors.read('PE102').active).toBe(false);
  });

  it('ignores a unit that has been pushed off the belt', () => {
    const sensors = new SensorManager();
    const diverted = product('UNIT-1', conveyorConfig.rejectPositionMeters, 0.5);

    sensors.update([diverted], 0);
    expect(sensors.read('PE102').active).toBe(false);
  });

  it('emits one event per transition, not per step', () => {
    const events = new EventBus();
    const seen: Array<{ sensorId: string; state: boolean }> = [];
    events.on('SENSOR_CHANGED', (event) => seen.push({ sensorId: event.sensorId, state: event.state }));

    const sensors = new SensorManager(undefined, undefined, events);
    const unit = product('UNIT-1', conveyorConfig.inspectionPositionMeters);

    sensors.update([unit], 0);
    sensors.update([unit], 0.016);
    sensors.update([unit], 0.032);
    unit.positionMeters = 3.0;
    sensors.update([unit], 0.048);

    const pe101 = seen.filter((event) => event.sensorId === 'PE101');
    expect(pe101).toEqual([
      { sensorId: 'PE101', state: true },
      { sensorId: 'PE101', state: false },
    ]);
  });

  it('reports an unknown sensor id as idle rather than throwing', () => {
    const sensors = new SensorManager();
    expect(sensors.read('PE999')).toEqual({ active: false, unitId: undefined });
  });
});
