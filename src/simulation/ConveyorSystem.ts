import { conveyorConfig, type ConveyorConfig } from '@/config/line.config';
import type { Product } from '@/models/Product';

export interface WorldPosition {
  x: number;
  y: number;
  z: number;
}

/**
 * Deterministic transport. Position along the belt is the authoritative
 * coordinate; world space is derived from it, never the other way around.
 */
export class ConveyorSystem {
  private _running = false;
  private _speedMetersPerSecond: number;

  constructor(readonly config: ConveyorConfig = conveyorConfig) {
    this._speedMetersPerSecond = config.speedMetersPerSecond;
  }

  get running(): boolean {
    return this._running;
  }

  get speedMetersPerSecond(): number {
    return this._running ? this._speedMetersPerSecond : 0;
  }

  get commandedSpeedMetersPerSecond(): number {
    return this._speedMetersPerSecond;
  }

  /** Throughput at the current speed and spacing, in units per minute. */
  get unitsPerMinuteCapacity(): number {
    return (this.speedMetersPerSecond / this.config.minimumSpacingMeters) * 60;
  }

  start(): void {
    this._running = true;
  }

  stop(): void {
    this._running = false;
  }

  setSpeed(metersPerSecond: number): void {
    this._speedMetersPerSecond = Math.max(0, metersPerSecond);
  }

  /**
   * Advances every product, preserving belt order and minimum spacing.
   * Products are expected to be ordered furthest-travelled first.
   */
  advanceProducts(products: Product[], deltaSeconds: number): void {
    const travel = this.speedMetersPerSecond * deltaSeconds;
    if (travel <= 0) {
      for (const product of products) product.velocityMetersPerSecond = 0;
      return;
    }

    let leaderPosition = Number.POSITIVE_INFINITY;

    for (const product of products) {
      // A diverted unit has lost belt contact, so it no longer travels
      // downstream and no longer blocks the unit behind it.
      if (this.isOffBelt(product)) {
        product.velocityMetersPerSecond = 0;
        continue;
      }

      const unconstrained = product.positionMeters + travel;
      const limit = leaderPosition - this.config.minimumSpacingMeters;
      const next = Math.min(unconstrained, limit);
      const applied = Math.max(product.positionMeters, next);

      product.velocityMetersPerSecond =
        deltaSeconds > 0 ? (applied - product.positionMeters) / deltaSeconds : 0;
      product.positionMeters = applied;
      leaderPosition = applied;
    }
  }

  isOffBelt(product: Product): boolean {
    return Math.abs(product.lateralOffsetMeters) > this.config.widthMeters / 2;
  }

  hasExited(product: Product): boolean {
    return product.positionMeters >= this.config.lengthMeters;
  }

  /** Belt-relative position to scene coordinates. X runs along the belt, Z is lateral. */
  positionToWorld(positionMeters: number, lateralOffsetMeters = 0): WorldPosition {
    return {
      x: positionMeters,
      y: this.config.surfaceHeightMeters,
      z: lateralOffsetMeters,
    };
  }
}
