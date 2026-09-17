/** Monotonic, zero-padded identity generators. Reset only via `resetIdCounters`. */

let unitCounter = 0;
let inspectionCounter = 0;
let alarmCounter = 0;

const pad = (value: number, width: number): string => String(value).padStart(width, '0');

export function nextUnitId(): string {
  unitCounter += 1;
  return `UNIT-${pad(unitCounter, 6)}`;
}

export function nextInspectionId(): string {
  inspectionCounter += 1;
  return `INS-${pad(inspectionCounter, 7)}`;
}

export function nextAlarmId(): string {
  alarmCounter += 1;
  return `ALM-${pad(alarmCounter, 5)}`;
}

export function resetIdCounters(): void {
  unitCounter = 0;
  inspectionCounter = 0;
  alarmCounter = 0;
}
