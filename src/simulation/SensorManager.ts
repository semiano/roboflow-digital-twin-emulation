import { conveyorConfig, sensorConfigs, type SensorConfig } from '@/config/line.config';
import type { EventBus } from '@/core/EventBus';
import type { Product } from '@/models/Product';
import { EdgeDetector } from '@/utils/timing';
import { VirtualSensor, type SensorReading } from './VirtualSensor';

const IDLE: SensorReading = { active: false, unitId: undefined };

/** Evaluates every photoeye once per logic step and publishes transitions. */
export class SensorManager {
  readonly sensors: readonly VirtualSensor[];

  private readonly byId = new Map<string, VirtualSensor>();
  private readonly edges = new Map<string, EdgeDetector>();

  constructor(
    configs: readonly SensorConfig[] = sensorConfigs,
    lateralLimitMeters: number = conveyorConfig.widthMeters / 2,
    private readonly events?: EventBus,
  ) {
    this.sensors = configs.map((config) => new VirtualSensor(config, lateralLimitMeters));
    for (const sensor of this.sensors) {
      this.byId.set(sensor.id, sensor);
      this.edges.set(sensor.id, new EdgeDetector());
    }
  }

  update(products: readonly Product[], simulationTime: number): void {
    for (const sensor of this.sensors) {
      const active = sensor.evaluate(products);
      const edge = this.edges.get(sensor.id)?.update(active);
      if (edge === 'NONE' || edge === undefined) continue;

      const unitId = sensor.unitId;
      this.events?.emit({
        type: 'SENSOR_CHANGED',
        simulationTime,
        sensorId: sensor.id,
        state: active,
        ...(unitId ? { unitId } : {}),
      });
    }
  }

  read(sensorId: string): SensorReading {
    return this.byId.get(sensorId)?.read() ?? IDLE;
  }

  get(sensorId: string): VirtualSensor | undefined {
    return this.byId.get(sensorId);
  }

  reset(): void {
    for (const sensor of this.sensors) {
      sensor.reset();
      this.edges.get(sensor.id)?.reset();
    }
  }
}
