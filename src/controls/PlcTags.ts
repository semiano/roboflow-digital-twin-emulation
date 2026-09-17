import type { InspectionResult } from '@/models/DefectType';
import { conveyorConfig } from '@/config/line.config';
import type { MachineState } from './ControlStateMachine';

/** Spec §18. Tag names are verbatim from the spec so the HMI tag monitor matches. */
export interface PlcTags {
  // Machine
  lineRunCommand: boolean;
  lineStopCommand: boolean;
  lineRunning: boolean;
  lineSpeed: number;

  // Sensors
  pe100Entry: boolean;
  pe101Inspection: boolean;
  pe102Reject: boolean;
  pe103Exit: boolean;

  // Vision
  visionConnected: boolean;
  visionReady: boolean;
  visionBusy: boolean;

  visionResult: InspectionResult | 'UNKNOWN';
  visionDefectCode: string;
  visionConfidence: number;

  // Reject system
  rejectCommand: boolean;
  rejectExtended: boolean;

  // Production
  totalCount: number;
  goodCount: number;
  rejectCount: number;

  // Machine state
  machineState: MachineState;
}

export function createPlcTags(
  lineSpeed: number = conveyorConfig.speedMetersPerSecond,
): PlcTags {
  return {
    lineRunCommand: false,
    lineStopCommand: false,
    lineRunning: false,
    lineSpeed,

    pe100Entry: false,
    pe101Inspection: false,
    pe102Reject: false,
    pe103Exit: false,

    visionConnected: false,
    visionReady: false,
    visionBusy: false,

    visionResult: 'UNKNOWN',
    visionDefectCode: '',
    visionConfidence: 0,

    rejectCommand: false,
    rejectExtended: false,

    totalCount: 0,
    goodCount: 0,
    rejectCount: 0,

    machineState: 'STOPPED',
  };
}
