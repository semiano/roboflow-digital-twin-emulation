export type MachineState = 'STOPPED' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'FAULTED';

export interface StateMachineInputs {
  runCommand: boolean;
  stopCommand: boolean;
  faulted: boolean;
  faultResetRequested: boolean;
}

/**
 * Machine sequence from spec §19. Transitions are evaluated once per PLC scan
 * and driven entirely by simulated time, so behaviour is frame-rate independent.
 */
export class ControlStateMachine {
  private _state: MachineState = 'STOPPED';
  private timerSeconds = 0;

  constructor(
    private readonly startingSeconds: number,
    private readonly stoppingSeconds: number,
  ) {}

  get state(): MachineState {
    return this._state;
  }

  /** The only output the conveyor cares about. */
  get conveyorEnabled(): boolean {
    return this._state === 'RUNNING';
  }

  update(inputs: StateMachineInputs, deltaSeconds: number): MachineState {
    this.timerSeconds += deltaSeconds;

    if (inputs.faulted && this._state !== 'FAULTED') {
      this.transition('FAULTED');
      return this._state;
    }

    switch (this._state) {
      case 'FAULTED':
        if (!inputs.faulted && inputs.faultResetRequested) this.transition('STOPPED');
        break;

      case 'STOPPED':
        if (inputs.runCommand && !inputs.stopCommand) this.transition('STARTING');
        break;

      case 'STARTING':
        if (inputs.stopCommand || !inputs.runCommand) this.transition('STOPPING');
        else if (this.timerSeconds >= this.startingSeconds) this.transition('RUNNING');
        break;

      case 'RUNNING':
        if (inputs.stopCommand || !inputs.runCommand) this.transition('STOPPING');
        break;

      case 'STOPPING':
        if (this.timerSeconds >= this.stoppingSeconds) this.transition('STOPPED');
        break;
    }

    return this._state;
  }

  reset(): void {
    this._state = 'STOPPED';
    this.timerSeconds = 0;
  }

  private transition(next: MachineState): void {
    this._state = next;
    this.timerSeconds = 0;
  }
}
