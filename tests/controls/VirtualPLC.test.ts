import { beforeEach, describe, expect, it } from 'vitest';
import { simulationConfig } from '@/config/simulation.config';
import { VirtualPLC } from '@/controls/VirtualPLC';
import { EventBus } from '@/core/EventBus';
import type { SystemEvent } from '@/core/events';
import { resetIdCounters } from '@/utils/ids';
import { PlcHarness } from '../support/PlcHarness';
import { ScriptedVisionGateway } from '../support/ScriptedVisionGateway';

describe('VirtualPLC', () => {
  let events: EventBus;
  let vision: ScriptedVisionGateway;
  let plc: VirtualPLC;
  let harness: PlcHarness;
  let log: SystemEvent[];

  beforeEach(() => {
    resetIdCounters();
    events = new EventBus();
    log = [];
    events.onAny((event) => log.push(event));

    vision = new ScriptedVisionGateway();
    plc = new VirtualPLC(events);
    plc.attachVision(vision);
    harness = new PlcHarness(plc);
    harness.startAndSettle();
  });

  it('reaches RUNNING through STARTING and returns via STOPPING', () => {
    expect(plc.tags.machineState).toBe('RUNNING');

    plc.stop();
    harness.run(0.05);
    expect(plc.tags.machineState).toBe('STOPPING');

    harness.run(0.3);
    expect(plc.tags.machineState).toBe('STOPPED');
  });

  it('puts a failed unit in the reject queue', () => {
    vision.scriptResult('UNIT-A', { result: 'FAIL', defectCode: 'MISSING_CAP', confidence: 0.91 });

    harness.pulse('pe101Inspection', 'UNIT-A');
    harness.run(0.05);

    expect(plc.rejectQueue.has('UNIT-A')).toBe(true);
    expect(plc.rejectQueue.peek('UNIT-A')?.defectCode).toBe('MISSING_CAP');
  });

  it('leaves a passing unit out of the reject queue', () => {
    vision.scriptResult('UNIT-A', { result: 'PASS' });

    harness.pulse('pe101Inspection', 'UNIT-A');
    harness.run(0.05);

    expect(plc.rejectQueue.size).toBe(0);
    expect(plc.tags.visionResult).toBe('PASS');
  });

  it('fires the diverter only for the queued unit', () => {
    vision.scriptResult('BAD', { result: 'FAIL', defectCode: 'UNDERFILL' });
    vision.scriptResult('GOOD', { result: 'PASS' });

    harness.pulse('pe101Inspection', 'BAD');
    harness.pulse('pe101Inspection', 'GOOD');
    harness.run(0.05);

    harness.inputs.pe102Reject = { active: true, unitId: 'GOOD' };
    harness.run(0.02);
    expect(plc.tags.rejectCommand).toBe(false);

    harness.inputs.pe102Reject = { active: false, unitId: undefined };
    harness.run(0.02);

    harness.inputs.pe102Reject = { active: true, unitId: 'BAD' };
    harness.run(0.02);
    expect(plc.tags.rejectCommand).toBe(true);
    expect(plc.rejectQueue.has('BAD')).toBe(false);
    expect(plc.tags.rejectCount).toBe(1);
  });

  it('keeps two adjacent units matched to their own results', () => {
    vision.latencySeconds = 0.4;
    vision.scriptResult('UNIT-1', { result: 'FAIL', defectCode: 'MISSING_CAP' });
    vision.scriptResult('UNIT-2', { result: 'PASS' });

    harness.pulse('pe101Inspection', 'UNIT-1');
    harness.run(0.1);
    harness.pulse('pe101Inspection', 'UNIT-2');

    expect(plc.pendingInspectionCount).toBe(2);
    expect(plc.tags.visionBusy).toBe(true);

    harness.run(0.6);

    expect(plc.rejectQueue.has('UNIT-1')).toBe(true);
    expect(plc.rejectQueue.has('UNIT-2')).toBe(false);
    expect(plc.tags.visionBusy).toBe(false);
  });

  it('raises an alarm and applies the fail-safe when vision times out', () => {
    vision.scriptSilence('UNIT-A');

    harness.pulse('pe101Inspection', 'UNIT-A');
    harness.run(1.2);

    expect(plc.alarms.isActive('INSPECTION_TIMEOUT')).toBe(true);
    expect(plc.tags.visionResult).toBe('UNKNOWN');
    // Default fail-safe is REJECT_UNKNOWN.
    expect(plc.rejectQueue.has('UNIT-A')).toBe(true);
  });

  it('honours the ALLOW_UNKNOWN fail-safe', () => {
    plc.setFailSafeMode('ALLOW_UNKNOWN');
    vision.scriptSilence('UNIT-A');

    harness.pulse('pe101Inspection', 'UNIT-A');
    harness.run(1.2);

    expect(plc.alarms.isActive('INSPECTION_TIMEOUT')).toBe(true);
    expect(plc.rejectQueue.size).toBe(0);
  });

  it('stops the line on the STOP_LINE fail-safe', () => {
    plc.setFailSafeMode('STOP_LINE');
    vision.scriptSilence('UNIT-A');

    harness.pulse('pe101Inspection', 'UNIT-A');
    harness.run(1.5);

    expect(plc.tags.machineState).toBe('STOPPED');
  });

  it('faults on an unmatched inspection result', () => {
    vision.corruptNextInspectionId = true;
    harness.pulse('pe101Inspection', 'UNIT-A');
    harness.run(0.05);

    expect(plc.interlocks.isActive('PRODUCT_TRACKING_ERROR')).toBe(true);
    expect(plc.tags.machineState).toBe('FAULTED');
    expect(plc.alarms.isActive('TRACKING_MISMATCH')).toBe(true);
  });

  it('rides through a brief comms dropout instead of stopping the line', () => {
    // A real endpoint takes a moment to complete its connection handshake, and
    // a controller does not fault on a single scan of a comms bit.
    vision.connected = false;
    harness.run(simulationConfig.plc.visionOfflineSeconds - 0.1);
    expect(plc.interlocks.isActive('VISION_OFFLINE')).toBe(false);

    vision.connected = true;
    harness.run(simulationConfig.plc.visionOfflineSeconds);
    expect(plc.interlocks.isActive('VISION_OFFLINE')).toBe(false);
    expect(plc.tags.machineState).not.toBe('FAULTED');
  });

  it('faults when vision disconnects and clears on reset once restored', () => {
    vision.connected = false;
    harness.run(simulationConfig.plc.visionOfflineSeconds + 0.05);

    expect(plc.interlocks.isActive('VISION_OFFLINE')).toBe(true);
    expect(plc.tags.machineState).toBe('FAULTED');

    // Resetting while the condition persists must not clear the fault.
    plc.resetFaults();
    harness.run(simulationConfig.plc.visionOfflineSeconds + 0.05);
    expect(plc.tags.machineState).toBe('FAULTED');

    vision.connected = true;
    plc.resetFaults();
    harness.run(0.05);
    expect(plc.tags.machineState).toBe('STOPPED');
    expect(plc.alarms.activeCount).toBe(0);
  });

  it('faults when the diverter never confirms extend', () => {
    vision.scriptResult('BAD', { result: 'FAIL', defectCode: 'MISSING_CAP' });
    harness.pulse('pe101Inspection', 'BAD');
    harness.run(0.05);

    harness.inputs.pe102Reject = { active: true, unitId: 'BAD' };
    harness.run(0.02);
    // rejectStationExtended stays false: the cylinder never moves.
    harness.run(0.3);

    expect(plc.interlocks.isActive('REJECT_STATION_FAULT')).toBe(true);
  });

  it('counts entries, accepts and rejects from the photoeyes', () => {
    vision.scriptResult('BAD', { result: 'FAIL', defectCode: 'MISSING_CAP' });

    harness.pulse('pe100Entry', 'GOOD');
    harness.pulse('pe100Entry', 'BAD');
    expect(plc.tags.totalCount).toBe(2);

    harness.pulse('pe101Inspection', 'BAD');
    harness.run(0.05);
    harness.pulse('pe102Reject', 'BAD');
    expect(plc.tags.rejectCount).toBe(1);

    harness.pulse('pe103Exit', 'GOOD');
    expect(plc.tags.goodCount).toBe(1);
  });

  it('clears counters, queue and faults on a full reset', () => {
    vision.scriptResult('BAD', { result: 'FAIL', defectCode: 'MISSING_CAP' });
    harness.pulse('pe100Entry', 'BAD');
    harness.pulse('pe101Inspection', 'BAD');
    harness.run(0.05);
    vision.connected = false;
    harness.run(simulationConfig.plc.visionOfflineSeconds + 0.05);

    expect(plc.tags.machineState).toBe('FAULTED');
    expect(plc.rejectQueue.size).toBe(1);

    vision.connected = true;
    plc.reset();
    harness.run(0.05);

    expect(plc.tags.machineState).toBe('STOPPED');
    expect(plc.tags.totalCount).toBe(0);
    expect(plc.rejectQueue.size).toBe(0);
    expect(plc.interlocks.tripped).toBe(false);
  });

  it('emits a rejection event carrying the unit id and defect code', () => {
    vision.scriptResult('BAD', { result: 'FAIL', defectCode: 'WRONG_LABEL' });
    harness.pulse('pe101Inspection', 'BAD');
    harness.run(0.05);
    harness.pulse('pe102Reject', 'BAD');

    const rejected = log.find((event) => event.type === 'PRODUCT_REJECTED');
    expect(rejected).toMatchObject({ unitId: 'BAD', defectCode: 'WRONG_LABEL' });
  });
});
