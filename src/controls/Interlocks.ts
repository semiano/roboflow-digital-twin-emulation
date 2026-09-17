export type FaultCode =
  | 'VISION_OFFLINE'
  | 'CAMERA_OFFLINE'
  | 'REJECT_STATION_FAULT'
  | 'PRODUCT_TRACKING_ERROR'
  | 'JAM_DETECTED';

export const FAULT_CODES: readonly FaultCode[] = [
  'VISION_OFFLINE',
  'CAMERA_OFFLINE',
  'REJECT_STATION_FAULT',
  'PRODUCT_TRACKING_ERROR',
  'JAM_DETECTED',
];

export const FAULT_MESSAGES: Record<FaultCode, string> = {
  VISION_OFFLINE: 'Vision system offline',
  CAMERA_OFFLINE: 'Inspection camera offline',
  REJECT_STATION_FAULT: 'Reject station did not confirm extend',
  PRODUCT_TRACKING_ERROR: 'Inspection result could not be matched to a unit',
  JAM_DETECTED: 'Product jam at the inspection station',
};

/**
 * The machine's fault word (spec §19). Any latched fault drives the state
 * machine to FAULTED; an operator reset only succeeds once the underlying
 * condition has gone away.
 */
export class Interlocks {
  private readonly active = new Set<FaultCode>();

  /** Returns true when the fault's state actually changed. */
  set(code: FaultCode, active: boolean): boolean {
    if (active === this.active.has(code)) return false;
    if (active) this.active.add(code);
    else this.active.delete(code);
    return true;
  }

  isActive(code: FaultCode): boolean {
    return this.active.has(code);
  }

  get tripped(): boolean {
    return this.active.size > 0;
  }

  getActive(): readonly FaultCode[] {
    return FAULT_CODES.filter((code) => this.active.has(code));
  }

  reset(): void {
    this.active.clear();
  }
}
