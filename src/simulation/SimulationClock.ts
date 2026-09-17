import { simulationConfig, type SimulationSpeed } from '@/config/simulation.config';

/**
 * The single source of simulated time (plan.md C5).
 *
 * Real elapsed time is scaled by the speed multiplier and consumed in fixed
 * steps, so simulation results are identical regardless of frame rate.
 */
export class SimulationClock {
  private _elapsedSeconds = 0;
  private _deltaSeconds = 0;
  private _speedMultiplier: SimulationSpeed = simulationConfig.defaultSpeed;
  private _paused = false;
  private accumulator = 0;

  readonly fixedStepSeconds = simulationConfig.fixedStepSeconds;

  get elapsedSeconds(): number {
    return this._elapsedSeconds;
  }

  get deltaSeconds(): number {
    return this._deltaSeconds;
  }

  get speedMultiplier(): SimulationSpeed {
    return this._speedMultiplier;
  }

  get paused(): boolean {
    return this._paused;
  }

  get running(): boolean {
    return !this._paused && this._speedMultiplier > 0;
  }

  pause(): void {
    this._paused = true;
    this._deltaSeconds = 0;
  }

  resume(): void {
    this._paused = false;
  }

  reset(): void {
    this._elapsedSeconds = 0;
    this._deltaSeconds = 0;
    this.accumulator = 0;
    this._paused = false;
  }

  setSpeed(multiplier: SimulationSpeed): void {
    this._speedMultiplier = multiplier;
    if (multiplier === 0) this._deltaSeconds = 0;
  }

  /**
   * Feeds real elapsed time in and returns how many fixed steps are due.
   * Leftover time is carried, so no simulated time is lost or duplicated.
   */
  advance(realDeltaSeconds: number): number {
    if (!this.running || realDeltaSeconds <= 0) {
      this._deltaSeconds = 0;
      return 0;
    }

    this.accumulator += realDeltaSeconds * this._speedMultiplier;

    let steps = 0;
    while (this.accumulator >= this.fixedStepSeconds && steps < simulationConfig.maxStepsPerFrame) {
      this.accumulator -= this.fixedStepSeconds;
      steps += 1;
    }

    // Drop the backlog rather than fast-forwarding after a long stall.
    if (this.accumulator > this.fixedStepSeconds * simulationConfig.maxStepsPerFrame) {
      this.accumulator = 0;
    }

    return steps;
  }

  /** Commits one fixed step. Call once per step reported by `advance`. */
  step(): number {
    this._deltaSeconds = this.fixedStepSeconds;
    this._elapsedSeconds += this.fixedStepSeconds;
    return this._deltaSeconds;
  }
}
