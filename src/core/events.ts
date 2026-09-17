import type { AlarmCode, AlarmSeverity } from '@/models/Alarm';
import type { InspectionResult } from '@/models/DefectType';

/**
 * Typed system event union (spec §38). Every event carries the simulated time
 * at which it occurred so consumers never need the wall clock.
 */

interface BaseEvent {
  simulationTime: number;
}

export interface SimulationStartedEvent extends BaseEvent {
  type: 'SIMULATION_STARTED';
}

export interface SimulationStoppedEvent extends BaseEvent {
  type: 'SIMULATION_STOPPED';
}

export interface ProductCreatedEvent extends BaseEvent {
  type: 'PRODUCT_CREATED';
  unitId: string;
  sku: string;
}

export interface ProductEnteredInspectionEvent extends BaseEvent {
  type: 'PRODUCT_ENTERED_INSPECTION';
  unitId: string;
}

export interface SensorChangedEvent extends BaseEvent {
  type: 'SENSOR_CHANGED';
  sensorId: string;
  state: boolean;
  unitId?: string;
}

export interface VisionRequestedEvent extends BaseEvent {
  type: 'VISION_REQUESTED';
  inspectionId: string;
  unitId: string;
}

export interface VisionCompletedEvent extends BaseEvent {
  type: 'VISION_COMPLETED';
  inspectionId: string;
  unitId: string;
  result: InspectionResult | 'UNKNOWN';
  defectCode?: string;
  confidence: number;
  latencyMs: number;
}

export interface VisionFailedEvent extends BaseEvent {
  type: 'VISION_FAILED';
  inspectionId: string;
  unitId: string;
  reason: string;
}

export interface ProductRejectedEvent extends BaseEvent {
  type: 'PRODUCT_REJECTED';
  unitId: string;
  defectCode?: string;
}

export interface ProductAcceptedEvent extends BaseEvent {
  type: 'PRODUCT_ACCEPTED';
  unitId: string;
}

export interface AlarmRaisedEvent extends BaseEvent {
  type: 'ALARM_RAISED';
  alarmId: string;
  code: AlarmCode;
  severity: AlarmSeverity;
  message: string;
}

export interface AlarmClearedEvent extends BaseEvent {
  type: 'ALARM_CLEARED';
  alarmId: string;
  code: AlarmCode;
}

export interface InspectionRecordedEvent extends BaseEvent {
  type: 'INSPECTION_RECORDED';
  unitId: string;
}

export type SystemEvent =
  | SimulationStartedEvent
  | SimulationStoppedEvent
  | ProductCreatedEvent
  | ProductEnteredInspectionEvent
  | SensorChangedEvent
  | VisionRequestedEvent
  | VisionCompletedEvent
  | VisionFailedEvent
  | ProductRejectedEvent
  | ProductAcceptedEvent
  | AlarmRaisedEvent
  | AlarmClearedEvent
  | InspectionRecordedEvent;

export type SystemEventType = SystemEvent['type'];

export type EventOfType<T extends SystemEventType> = Extract<SystemEvent, { type: T }>;
