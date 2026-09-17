import { conveyorConfig } from '@/config/line.config';
import { simulationConfig } from '@/config/simulation.config';
import { visionConfig, type FailSafeMode } from '@/config/vision.config';
import type { EventBus } from '@/core/EventBus';
import type { AlarmCode } from '@/models/Alarm';
import { nextInspectionId } from '@/utils/ids';
import { EdgeDetector, OnDelayTimer } from '@/utils/timing';
import type { VisionGateway, VisionOutcome } from '@/vision/VisionGateway';
import { AlarmManager } from './AlarmManager';
import { ControlStateMachine } from './ControlStateMachine';
import { Interlocks, type FaultCode } from './Interlocks';
import { idleInputImage, type PlcInputImage, type PlcOutputImage, type StackLight } from './PlcIo';
import { createPlcTags, type PlcTags } from './PlcTags';
import { RejectQueue } from './RejectQueue';

interface PendingInspection {
  inspectionId: string;
  unitId: string;
  requestedAt: number;
}

export interface VirtualPlcOptions {
  scanSeconds?: number;
  failSafeMode?: FailSafeMode;
  visionTimeoutMs?: number;
}

const FAULT_ALARMS: Partial<Record<FaultCode, AlarmCode>> = {
  VISION_OFFLINE: 'VISION_CONNECTION_LOST',
  CAMERA_OFFLINE: 'CAMERA_OFFLINE',
  REJECT_STATION_FAULT: 'REJECT_STATION_FAULT',
  PRODUCT_TRACKING_ERROR: 'TRACKING_MISMATCH',
};

/**
 * The automation layer (spec §17-§22).
 *
 * Reads only `PlcInputImage`, writes only `PlcOutputImage`. It has no reference
 * to the simulation, so it cannot reach simulator truth even by accident, and
 * it is fully testable with a hand-written input image.
 */
export class VirtualPLC {
  readonly tags: PlcTags = createPlcTags();
  readonly alarms = new AlarmManager();
  readonly interlocks = new Interlocks();
  readonly rejectQueue = new RejectQueue();
  readonly stateMachine: ControlStateMachine;

  private vision: VisionGateway | undefined;
  private readonly pending = new Map<string, PendingInspection>();

  private readonly pe100Edge = new EdgeDetector();
  private readonly pe101Edge = new EdgeDetector();
  private readonly pe102Edge = new EdgeDetector();
  private readonly pe103Edge = new EdgeDetector();

  private readonly rejectFeedbackTimer = new OnDelayTimer(
    simulationConfig.plc.rejectFeedbackSeconds,
  );
  private readonly visionOfflineTimer = new OnDelayTimer(
    simulationConfig.plc.visionOfflineSeconds,
  );
  private readonly jamTimer = new OnDelayTimer(simulationConfig.plc.jamDetectSeconds);

  private readonly scanSeconds: number;
  private readonly visionTimeoutSeconds: number;
  private failSafeMode: FailSafeMode;

  private inputs: PlcInputImage = idleInputImage();
  private outputs: PlcOutputImage = {
    runConveyor: false,
    rejectCommand: false,
    lineSpeedSetpoint: conveyorConfig.speedMetersPerSecond,
    stackLight: 'AMBER',
  };

  private scanAccumulator = 0;
  private scanTime = 0;
  private faultResetRequested = false;
  private rejectHoldSeconds = 0;
  private lineSpeedSetpoint = conveyorConfig.speedMetersPerSecond;
  private lastLatencyMs = 0;

  constructor(
    private readonly events: EventBus,
    options: VirtualPlcOptions = {},
  ) {
    this.scanSeconds = options.scanSeconds ?? simulationConfig.plc.scanSeconds;
    this.visionTimeoutSeconds = (options.visionTimeoutMs ?? visionConfig.timeoutMs) / 1000;
    this.failSafeMode = options.failSafeMode ?? visionConfig.failSafeMode;
    this.stateMachine = new ControlStateMachine(
      simulationConfig.plc.startingSeconds,
      simulationConfig.plc.stoppingSeconds,
    );
  }

  // --- operator commands -------------------------------------------------

  start(): void {
    this.tags.lineRunCommand = true;
    this.tags.lineStopCommand = false;
  }

  stop(): void {
    this.tags.lineRunCommand = false;
    this.tags.lineStopCommand = true;
  }

  /** Clears faults and their alarms. Conditions still present re-latch next scan. */
  resetFaults(): void {
    this.faultResetRequested = true;
    this.interlocks.reset();
    this.alarms.reset();
  }

  resetStatistics(): void {
    this.tags.totalCount = 0;
    this.tags.goodCount = 0;
    this.tags.rejectCount = 0;
  }

  /** Full controller reset: state, faults, queue, in-flight inspections, counters. */
  reset(): void {
    this.stateMachine.reset();
    this.interlocks.reset();
    this.alarms.reset();
    this.rejectQueue.clear();
    this.pending.clear();
    this.resetStatistics();

    this.tags.lineRunCommand = false;
    this.tags.lineStopCommand = false;
    this.tags.machineState = 'STOPPED';
    this.tags.visionResult = 'UNKNOWN';
    this.tags.visionDefectCode = '';
    this.tags.visionConfidence = 0;
    this.tags.visionBusy = false;

    this.pe100Edge.reset();
    this.pe101Edge.reset();
    this.pe102Edge.reset();
    this.pe103Edge.reset();
    this.rejectFeedbackTimer.reset();
    this.visionOfflineTimer.reset();
    this.jamTimer.reset();

    this.scanAccumulator = 0;
    this.scanTime = 0;
    this.rejectHoldSeconds = 0;
    this.faultResetRequested = false;
    this.inputs = idleInputImage(this.lineSpeedSetpoint);
    this.outputs = {
      runConveyor: false,
      rejectCommand: false,
      lineSpeedSetpoint: this.lineSpeedSetpoint,
      stackLight: 'AMBER',
    };
  }

  setLineSpeed(metersPerSecond: number): void {
    this.lineSpeedSetpoint = Math.max(0, metersPerSecond);
  }

  setFailSafeMode(mode: FailSafeMode): void {
    this.failSafeMode = mode;
  }

  getFailSafeMode(): FailSafeMode {
    return this.failSafeMode;
  }

  /** Pass `undefined` to run transport-only, with no inspection and no vision interlock. */
  attachVision(gateway: VisionGateway | undefined): void {
    this.vision = gateway;
    this.pending.clear();
    // A new link starts its comms debounce from zero.
    this.visionOfflineTimer.reset();
  }

  get visionAttached(): boolean {
    return this.vision !== undefined;
  }

  get pendingInspectionCount(): number {
    return this.pending.size;
  }

  /** Diagnostic only; not a spec §18 tag. */
  get lastInferenceLatencyMs(): number {
    return this.lastLatencyMs;
  }

  // --- scan cycle --------------------------------------------------------

  /**
   * Consumes one logic step's worth of time as a whole number of PLC scans.
   * Scans are shorter than the logic step, so timers advance at PLC resolution.
   */
  update(deltaSeconds: number, simulationTime: number, inputs: PlcInputImage): PlcOutputImage {
    this.inputs = inputs;
    this.scanAccumulator += deltaSeconds;

    let scanTime = simulationTime - deltaSeconds;
    while (this.scanAccumulator >= this.scanSeconds) {
      this.scanAccumulator -= this.scanSeconds;
      scanTime = Math.min(scanTime + this.scanSeconds, simulationTime);
      this.scanTime = scanTime;
      this.scan();
    }

    return this.outputs;
  }

  private scan(): void {
    this.readInputs();
    this.updateInterlocks();
    this.tags.machineState = this.stateMachine.update(
      {
        runCommand: this.tags.lineRunCommand,
        stopCommand: this.tags.lineStopCommand,
        faulted: this.interlocks.tripped,
        faultResetRequested: this.faultResetRequested,
      },
      this.scanSeconds,
    );
    this.faultResetRequested = false;

    // A fault drops the latched run command, so clearing it returns the machine
    // to STOPPED and a deliberate START is required to resume.
    if (this.tags.machineState === 'FAULTED') this.tags.lineRunCommand = false;

    this.runInspectionSequence();
    this.runRejectLogic();
    this.writeOutputs();
  }

  private readInputs(): void {
    const io = this.inputs;
    this.tags.pe100Entry = io.pe100Entry.active;
    this.tags.pe101Inspection = io.pe101Inspection.active;
    this.tags.pe102Reject = io.pe102Reject.active;
    this.tags.pe103Exit = io.pe103Exit.active;
    this.tags.lineRunning = io.conveyorRunning;
    this.tags.lineSpeed = io.lineSpeedMetersPerSecond;
    this.tags.rejectExtended = io.rejectStationExtended;
    this.tags.visionConnected = this.vision?.isConnected() ?? false;
    this.tags.visionReady = this.vision?.isReady() ?? false;
  }

  private updateInterlocks(): void {
    // Equipment interlocks only apply once the cell is actually inspecting.
    const inspecting = this.vision !== undefined;

    // Debounced: a real endpoint needs a moment to connect, and one dropped
    // scan of a comms bit is not a reason to stop a production line.
    this.visionOfflineTimer.update(inspecting && !this.tags.visionConnected, this.scanSeconds);
    this.setFault('VISION_OFFLINE', this.visionOfflineTimer.done);

    this.setFault('CAMERA_OFFLINE', inspecting && !this.inputs.cameraOnline);

    const commandedButNotExtended = this.tags.rejectCommand && !this.tags.rejectExtended;
    this.rejectFeedbackTimer.update(commandedButNotExtended, this.scanSeconds);
    if (this.rejectFeedbackTimer.done) this.setFault('REJECT_STATION_FAULT', true);

    const blockedAtStation = this.tags.pe101Inspection && this.tags.lineRunning;
    this.jamTimer.update(blockedAtStation, this.scanSeconds);
    if (this.jamTimer.done) this.setFault('JAM_DETECTED', true);
  }

  private setFault(code: FaultCode, active: boolean): void {
    if (!this.interlocks.set(code, active)) return;

    const alarmCode = FAULT_ALARMS[code];
    if (!alarmCode) return;

    if (active) this.raiseAlarm(alarmCode);
    else this.clearAlarm(alarmCode);
  }

  private runInspectionSequence(): void {
    const io = this.inputs;

    if (this.pe100Edge.update(io.pe100Entry.active) === 'RISING') {
      this.tags.totalCount += 1;
    }

    if (this.pe101Edge.update(io.pe101Inspection.active) === 'RISING') {
      this.beginInspection(io.pe101Inspection.unitId);
    }

    this.collectOutcomes();
    this.enforceVisionTimeout();
    this.tags.visionBusy = this.pending.size > 0;
  }

  private beginInspection(unitId: string | undefined): void {
    if (!unitId) return;

    this.events.emit({
      type: 'PRODUCT_ENTERED_INSPECTION',
      simulationTime: this.scanTime,
      unitId,
    });

    if (!this.vision || !this.tags.visionReady) return;

    const inspectionId = nextInspectionId();
    this.pending.set(inspectionId, { inspectionId, unitId, requestedAt: this.scanTime });
    this.vision.request({ inspectionId, unitId, simulationTime: this.scanTime });

    this.events.emit({
      type: 'VISION_REQUESTED',
      simulationTime: this.scanTime,
      inspectionId,
      unitId,
    });
  }

  private collectOutcomes(): void {
    if (!this.vision) return;

    for (const outcome of this.vision.poll(this.scanTime)) {
      const request = this.pending.get(outcome.inspectionId);

      // An unmatched result means unit identity was lost somewhere upstream.
      if (!request || request.unitId !== outcome.unitId) {
        this.setFault('PRODUCT_TRACKING_ERROR', true);
        this.events.emit({
          type: 'VISION_FAILED',
          simulationTime: this.scanTime,
          inspectionId: outcome.inspectionId,
          unitId: outcome.unitId,
          reason: 'No matching in-flight inspection',
        });
        continue;
      }

      this.pending.delete(outcome.inspectionId);
      this.applyOutcome(outcome);
    }
  }

  private applyOutcome(outcome: VisionOutcome): void {
    this.tags.visionResult = outcome.result;
    this.tags.visionDefectCode = outcome.defectCode;
    this.tags.visionConfidence = outcome.confidence;
    this.lastLatencyMs = outcome.inferenceLatencyMs;

    // A result arriving in time retires any standing timeout alarm.
    if (outcome.result !== 'UNKNOWN') this.clearAlarm('INSPECTION_TIMEOUT');

    this.events.emit({
      type: 'VISION_COMPLETED',
      simulationTime: this.scanTime,
      inspectionId: outcome.inspectionId,
      unitId: outcome.unitId,
      result: outcome.result,
      ...(outcome.defectCode ? { defectCode: outcome.defectCode } : {}),
      confidence: outcome.confidence,
      latencyMs: outcome.inferenceLatencyMs,
    });

    if (outcome.result === 'FAIL') {
      this.queueReject(outcome.unitId, outcome.defectCode, outcome.confidence);
      return;
    }

    if (outcome.result === 'UNKNOWN') this.applyFailSafe(outcome.unitId, outcome.confidence);
  }

  private enforceVisionTimeout(): void {
    if (this.pending.size === 0) return;

    for (const request of [...this.pending.values()]) {
      if (this.scanTime - request.requestedAt < this.visionTimeoutSeconds) continue;

      this.pending.delete(request.inspectionId);
      this.vision?.cancel(request.inspectionId);

      this.tags.visionResult = 'UNKNOWN';
      this.tags.visionDefectCode = '';
      this.tags.visionConfidence = 0;

      this.raiseAlarm('INSPECTION_TIMEOUT', request.unitId);
      this.events.emit({
        type: 'VISION_FAILED',
        simulationTime: this.scanTime,
        inspectionId: request.inspectionId,
        unitId: request.unitId,
        reason: `No result within ${this.visionTimeoutSeconds * 1000} ms`,
      });

      this.applyFailSafe(request.unitId, 0);
    }
  }

  private applyFailSafe(unitId: string, confidence: number): void {
    switch (this.failSafeMode) {
      case 'REJECT_UNKNOWN':
        this.queueReject(unitId, 'UNKNOWN', confidence);
        break;
      case 'ALLOW_UNKNOWN':
        break;
      case 'STOP_LINE':
        this.stop();
        break;
    }
  }

  private queueReject(unitId: string, defectCode: string, confidence: number): void {
    this.rejectQueue.enqueue({
      unitId,
      inspectionResult: 'FAIL',
      defectCode,
      confidence,
      queuedAt: this.scanTime,
    });
  }

  private runRejectLogic(): void {
    const io = this.inputs;

    if (this.pe102Edge.update(io.pe102Reject.active) === 'RISING') {
      const unitId = io.pe102Reject.unitId;
      const entry = unitId ? this.rejectQueue.peek(unitId) : undefined;

      if (unitId && entry) {
        this.rejectQueue.take(unitId);
        this.rejectHoldSeconds = simulationConfig.plc.rejectPulseSeconds;
        this.tags.rejectCount += 1;
        this.events.emit({
          type: 'PRODUCT_REJECTED',
          simulationTime: this.scanTime,
          unitId,
          defectCode: entry.defectCode,
        });
      }
    }

    if (this.pe103Edge.update(io.pe103Exit.active) === 'RISING') {
      const unitId = io.pe103Exit.unitId;
      if (unitId) {
        this.tags.goodCount += 1;
        this.events.emit({ type: 'PRODUCT_ACCEPTED', simulationTime: this.scanTime, unitId });
      }
    }

    this.rejectHoldSeconds = Math.max(0, this.rejectHoldSeconds - this.scanSeconds);
    this.tags.rejectCommand = this.rejectHoldSeconds > 0;
  }

  private writeOutputs(): void {
    this.outputs = {
      runConveyor: this.stateMachine.conveyorEnabled,
      rejectCommand: this.tags.rejectCommand,
      lineSpeedSetpoint: this.lineSpeedSetpoint,
      stackLight: this.stackLight(),
    };
  }

  private stackLight(): StackLight {
    switch (this.tags.machineState) {
      case 'FAULTED':
        return 'RED';
      case 'RUNNING':
        return this.alarms.activeCount > 0 ? 'AMBER' : 'GREEN';
      case 'STARTING':
      case 'STOPPING':
        return 'AMBER';
      case 'STOPPED':
        return 'OFF';
    }
  }

  private raiseAlarm(code: AlarmCode, detail?: string): void {
    const alarm = this.alarms.raise(code, this.scanTime, detail);
    if (!alarm) return;

    this.events.emit({
      type: 'ALARM_RAISED',
      simulationTime: this.scanTime,
      alarmId: alarm.id,
      code: alarm.code,
      severity: alarm.severity,
      message: alarm.message,
    });
  }

  private clearAlarm(code: AlarmCode): void {
    const alarm = this.alarms.clear(code, this.scanTime);
    if (!alarm) return;

    this.events.emit({
      type: 'ALARM_CLEARED',
      simulationTime: this.scanTime,
      alarmId: alarm.id,
      code: alarm.code,
    });
  }
}
