import { conveyorConfig, rejectStationConfig, type RejectStationConfig } from '@/config/line.config';
import type { Product } from '@/models/Product';
import { EdgeDetector } from '@/utils/timing';

export type RejectStationState = 'RETRACTED' | 'EXTENDING' | 'EXTENDED' | 'RETRACTING';

/**
 * Pneumatic diverter (spec §22). Physical only: it pushes whatever happens to
 * be in front of it, and knows nothing about unit identity or ground truth.
 * If the PLC fires it at the wrong moment the wrong bottle goes in the bin —
 * which is exactly the failure mode the reject-queue tests need to be able to
 * detect.
 */
export class RejectStation {
  private _state: RejectStationState = 'RETRACTED';
  private _strokeFraction = 0;
  private command = false;
  private faulted = false;
  private dwellSeconds = 0;
  private readonly commandEdge = new EdgeDetector();

  constructor(
    private readonly config: RejectStationConfig = rejectStationConfig,
    private readonly positionMeters: number = conveyorConfig.rejectPositionMeters,
    private readonly beltEdgeMeters: number = conveyorConfig.widthMeters / 2,
  ) {}

  get state(): RejectStationState {
    return this._state;
  }

  /** 0 = fully retracted, 1 = fully extended. */
  get strokeFraction(): number {
    return this._strokeFraction;
  }

  /** The feedback bit the PLC reads back. Stays false while the station is faulted. */
  get extended(): boolean {
    return this._state === 'EXTENDED';
  }

  get faultInjected(): boolean {
    return this.faulted;
  }

  setCommand(on: boolean): void {
    this.command = on;
  }

  /** Fault injection (spec §26): the cylinder stops responding to the command. */
  setFaulted(on: boolean): void {
    this.faulted = on;
  }

  update(deltaSeconds: number, products: readonly Product[]): void {
    this.advanceActuator(deltaSeconds);
    this.pushUnitsInPath(products);
    this.slideDivertedUnits(deltaSeconds, products);
  }

  reset(): void {
    this._state = 'RETRACTED';
    this._strokeFraction = 0;
    this.command = false;
    this.faulted = false;
    this.dwellSeconds = 0;
    this.commandEdge.reset();
  }

  private advanceActuator(deltaSeconds: number): void {
    const wantExtend = this.command && !this.faulted;
    const fired = this.commandEdge.update(wantExtend) === 'RISING';

    switch (this._state) {
      case 'RETRACTED':
        if (fired) this._state = 'EXTENDING';
        break;

      case 'EXTENDING':
        this._strokeFraction = Math.min(
          1,
          this._strokeFraction + deltaSeconds / this.config.extendSeconds,
        );
        if (!wantExtend) this._state = 'RETRACTING';
        else if (this._strokeFraction >= 1) {
          this._state = 'EXTENDED';
          this.dwellSeconds = 0;
        }
        break;

      case 'EXTENDED':
        this.dwellSeconds += deltaSeconds;
        if (!wantExtend || this.dwellSeconds >= this.config.dwellSeconds) {
          this._state = 'RETRACTING';
        }
        break;

      case 'RETRACTING':
        // A fresh command mid-retraction reverses the rod for back-to-back rejects.
        if (fired) {
          this._state = 'EXTENDING';
          break;
        }
        this._strokeFraction = Math.max(
          0,
          this._strokeFraction - deltaSeconds / this.config.retractSeconds,
        );
        if (this._strokeFraction <= 0) this._state = 'RETRACTED';
        break;
    }
  }

  /** A retracting rod is moving away from the belt, so it cannot push anything. */
  private pushUnitsInPath(products: readonly Product[]): void {
    if (this._state !== 'EXTENDING' && this._state !== 'EXTENDED') return;
    const reach = this._strokeFraction * this.config.strokeMeters;

    for (const product of products) {
      const inPath =
        Math.abs(product.positionMeters - this.positionMeters) <=
        this.config.pusherHalfWidthMeters;
      if (!inPath) continue;
      if (product.lateralOffsetMeters > this.beltEdgeMeters) continue;
      if (product.lateralOffsetMeters >= reach) continue;

      product.lateralOffsetMeters = reach;
      product.rejected = true;
      product.state = 'DIVERTING';
    }
  }

  /** A unit knocked clear of the belt keeps travelling into the bin — no teleporting. */
  private slideDivertedUnits(deltaSeconds: number, products: readonly Product[]): void {
    const slide = this.config.slideSpeedMetersPerSecond * deltaSeconds;

    for (const product of products) {
      if (!product.rejected) continue;
      if (product.state === 'REJECTED') continue;
      if (product.lateralOffsetMeters <= this.beltEdgeMeters) continue;

      product.lateralOffsetMeters = Math.min(
        this.config.binCenterLateralMeters,
        product.lateralOffsetMeters + slide,
      );
      if (product.lateralOffsetMeters >= this.config.binCenterLateralMeters) {
        product.state = 'REJECTED';
      }
    }
  }
}
