import type { SensorConfig } from '@/config/line.config';
import type { Product } from '@/models/Product';

/** What a sensor reports to the PLC input image. No ground truth, ever. */
export interface SensorReading {
  active: boolean;
  unitId: string | undefined;
}

/**
 * A through-beam photoeye. Blocked when a unit is within half the beam
 * aperture of the sensor position *and* still laterally on the belt — a unit
 * knocked off by the diverter no longer breaks downstream beams.
 */
export class VirtualSensor {
  private _active = false;
  private _unitId: string | undefined;

  constructor(
    readonly config: SensorConfig,
    private readonly lateralLimitMeters: number,
  ) {}

  get id(): string {
    return this.config.id;
  }

  get label(): string {
    return this.config.label;
  }

  get positionMeters(): number {
    return this.config.positionMeters;
  }

  get active(): boolean {
    return this._active;
  }

  get unitId(): string | undefined {
    return this._unitId;
  }

  evaluate(products: readonly Product[]): boolean {
    const halfAperture = this.config.apertureMeters / 2;
    let blocking: Product | undefined;

    for (const product of products) {
      if (Math.abs(product.lateralOffsetMeters) > this.lateralLimitMeters) continue;
      if (Math.abs(product.positionMeters - this.config.positionMeters) > halfAperture) continue;
      blocking = product;
      break;
    }

    this._active = blocking !== undefined;
    this._unitId = blocking?.unitId;
    return this._active;
  }

  read(): SensorReading {
    return { active: this._active, unitId: this._unitId };
  }

  reset(): void {
    this._active = false;
    this._unitId = undefined;
  }
}
