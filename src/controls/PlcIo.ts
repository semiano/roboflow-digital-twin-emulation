/**
 * The PLC's I/O images.
 *
 * `PlcInputImage` is the *complete* surface the controls layer can see (spec
 * §17). It carries sensor states, equipment feedback and line status — and no
 * simulator truth. `tests/controls/PlcBoundary.test.ts` asserts this.
 */

export interface SensorInput {
  active: boolean;
  unitId: string | undefined;
}

export interface PlcInputImage {
  pe100Entry: SensorInput;
  pe101Inspection: SensorInput;
  pe102Reject: SensorInput;
  pe103Exit: SensorInput;

  cameraOnline: boolean;
  conveyorRunning: boolean;
  lineSpeedMetersPerSecond: number;
  rejectStationExtended: boolean;
}

export type StackLight = 'OFF' | 'GREEN' | 'AMBER' | 'RED';

export interface PlcOutputImage {
  runConveyor: boolean;
  rejectCommand: boolean;
  lineSpeedSetpoint: number;
  stackLight: StackLight;
}

export function idleInputImage(lineSpeedMetersPerSecond = 0): PlcInputImage {
  const idle: SensorInput = { active: false, unitId: undefined };
  return {
    pe100Entry: { ...idle },
    pe101Inspection: { ...idle },
    pe102Reject: { ...idle },
    pe103Exit: { ...idle },
    cameraOnline: true,
    conveyorRunning: false,
    lineSpeedMetersPerSecond,
    rejectStationExtended: false,
  };
}
