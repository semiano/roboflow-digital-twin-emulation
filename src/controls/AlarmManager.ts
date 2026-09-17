import { ALARM_DEFINITIONS, type Alarm, type AlarmCode } from '@/models/Alarm';
import { nextAlarmId } from '@/utils/ids';

/**
 * Alarm state is held separately from the event stream (spec §42): events are a
 * log of what happened, alarms are a live set of what is still wrong.
 */
export class AlarmManager {
  private readonly active = new Map<AlarmCode, Alarm>();
  private readonly history: Alarm[] = [];

  /** Returns the new alarm, or undefined if that code was already active. */
  raise(code: AlarmCode, simulationTime: number, detail?: string): Alarm | undefined {
    if (this.active.has(code)) return undefined;

    const definition = ALARM_DEFINITIONS[code];
    const alarm: Alarm = {
      id: nextAlarmId(),
      code,
      severity: definition.severity,
      active: true,
      acknowledged: false,
      raisedAt: simulationTime,
      message: detail ? `${definition.message} — ${detail}` : definition.message,
    };

    this.active.set(code, alarm);
    this.history.push(alarm);
    return alarm;
  }

  clear(code: AlarmCode, simulationTime: number): Alarm | undefined {
    const alarm = this.active.get(code);
    if (!alarm) return undefined;

    alarm.active = false;
    alarm.clearedAt = simulationTime;
    this.active.delete(code);
    return alarm;
  }

  acknowledge(alarmId: string): boolean {
    for (const alarm of this.active.values()) {
      if (alarm.id !== alarmId) continue;
      alarm.acknowledged = true;
      return true;
    }
    return false;
  }

  acknowledgeAll(): void {
    for (const alarm of this.active.values()) alarm.acknowledged = true;
  }

  isActive(code: AlarmCode): boolean {
    return this.active.has(code);
  }

  /** Copies so the HMI cannot mutate alarm state through the snapshot. */
  getActive(): readonly Alarm[] {
    return [...this.active.values()].map((alarm) => ({ ...alarm }));
  }

  getHistory(): readonly Alarm[] {
    return this.history.map((alarm) => ({ ...alarm }));
  }

  get activeCount(): number {
    return this.active.size;
  }

  get unacknowledgedCount(): number {
    let count = 0;
    for (const alarm of this.active.values()) if (!alarm.acknowledged) count += 1;
    return count;
  }

  reset(): void {
    this.active.clear();
    this.history.length = 0;
  }
}
