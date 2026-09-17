import { getEngine, useSimulationStore } from '@/app/simulationStore';

const SEVERITY_ORDER = { CRITICAL: 0, WARNING: 1, INFO: 2 } as const;

export function AlarmBanner() {
  const alarms = useSimulationStore((state) => state.snapshot.alarms);

  if (alarms.length === 0) {
    return <span className="alarm-banner alarm-banner--clear">NO ACTIVE ALARMS</span>;
  }

  const sorted = [...alarms].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.raisedAt - b.raisedAt,
  );

  return (
    <div className="alarm-banner-group">
      {sorted.map((alarm) => (
        <span
          key={alarm.id}
          className={`alarm-banner alarm-banner--${alarm.severity.toLowerCase()} ${
            alarm.acknowledged ? 'is-acknowledged' : ''
          }`}
        >
          <span className="alarm-banner__code">{alarm.code}</span>
          <span className="alarm-banner__message">{alarm.message}</span>
          <span className="alarm-banner__time">{alarm.raisedAt.toFixed(1)}s</span>
        </span>
      ))}

      <div className="alarm-banner__actions">
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => getEngine().plc.alarms.acknowledgeAll()}
        >
          ACK ALL
        </button>
      </div>
    </div>
  );
}
