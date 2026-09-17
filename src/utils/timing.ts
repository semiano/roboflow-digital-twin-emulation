/**
 * PLC-style timers driven by simulated seconds. Nothing here reads wall-clock
 * time; callers must feed `deltaSeconds` from the SimulationClock.
 */

/** On-delay timer (TON): `done` goes true after the input has been held for `presetSeconds`. */
export class OnDelayTimer {
  private accumulated = 0;
  private input = false;

  constructor(public presetSeconds: number) {}

  update(input: boolean, deltaSeconds: number): boolean {
    this.input = input;
    if (!input) {
      this.accumulated = 0;
      return false;
    }
    this.accumulated = Math.min(this.accumulated + deltaSeconds, this.presetSeconds);
    return this.done;
  }

  get done(): boolean {
    return this.input && this.accumulated >= this.presetSeconds;
  }

  get elapsedSeconds(): number {
    return this.accumulated;
  }

  reset(): void {
    this.accumulated = 0;
    this.input = false;
  }
}

/** Detects rising and falling transitions of a boolean signal. */
export class EdgeDetector {
  private previous: boolean;

  constructor(initial = false) {
    this.previous = initial;
  }

  update(current: boolean): 'RISING' | 'FALLING' | 'NONE' {
    const edge =
      current === this.previous ? 'NONE' : current ? ('RISING' as const) : ('FALLING' as const);
    this.previous = current;
    return edge;
  }

  get state(): boolean {
    return this.previous;
  }

  reset(initial = false): void {
    this.previous = initial;
  }
}
