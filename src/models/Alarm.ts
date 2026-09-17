export type AlarmSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export type AlarmCode =
  | 'VISION_CONNECTION_LOST'
  | 'CAMERA_OFFLINE'
  | 'REJECT_STATION_FAULT'
  | 'INSPECTION_TIMEOUT'
  | 'TRACKING_MISMATCH'
  | 'CONVEYOR_STOPPED_UNEXPECTEDLY';

export interface Alarm {
  id: string;
  code: AlarmCode;
  severity: AlarmSeverity;
  active: boolean;
  acknowledged: boolean;
  /** Simulated seconds. */
  raisedAt: number;
  clearedAt?: number;
  message: string;
}

export const ALARM_DEFINITIONS: Record<AlarmCode, { severity: AlarmSeverity; message: string }> = {
  VISION_CONNECTION_LOST: {
    severity: 'CRITICAL',
    message: 'Vision connection lost',
  },
  CAMERA_OFFLINE: { severity: 'CRITICAL', message: 'Inspection camera offline' },
  REJECT_STATION_FAULT: { severity: 'CRITICAL', message: 'Reject station fault' },
  INSPECTION_TIMEOUT: { severity: 'WARNING', message: 'Inspection timed out' },
  TRACKING_MISMATCH: { severity: 'WARNING', message: 'Product tracking mismatch' },
  CONVEYOR_STOPPED_UNEXPECTEDLY: {
    severity: 'WARNING',
    message: 'Conveyor stopped unexpectedly',
  },
};
