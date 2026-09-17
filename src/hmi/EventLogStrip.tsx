import { useSimulationStore } from '@/app/simulationStore';
import type { SystemEvent } from '@/core/events';

const TONE: Partial<Record<SystemEvent['type'], string>> = {
  PRODUCT_REJECTED: 'is-reject',
  PRODUCT_ACCEPTED: 'is-accept',
  VISION_FAILED: 'is-fault',
  ALARM_RAISED: 'is-fault',
  ALARM_CLEARED: 'is-accept',
};

function describe(event: SystemEvent): string {
  switch (event.type) {
    case 'SIMULATION_STARTED':
      return 'Line start commanded';
    case 'SIMULATION_STOPPED':
      return 'Line stop commanded';
    case 'PRODUCT_CREATED':
      return `${event.unitId} spawned (${event.sku})`;
    case 'PRODUCT_ENTERED_INSPECTION':
      return `${event.unitId} at inspection station`;
    case 'SENSOR_CHANGED':
      return `${event.sensorId} ${event.state ? 'blocked' : 'clear'}`;
    case 'VISION_REQUESTED':
      return `${event.inspectionId} requested for ${event.unitId}`;
    case 'VISION_COMPLETED':
      return `${event.unitId} ${event.result}${event.defectCode ? ` · ${event.defectCode}` : ''} · ${(event.confidence * 100).toFixed(0)}% · ${Math.round(event.latencyMs)} ms`;
    case 'VISION_FAILED':
      return `${event.unitId} inference failed — ${event.reason}`;
    case 'PRODUCT_REJECTED':
      return `${event.unitId} rejected${event.defectCode ? ` · ${event.defectCode}` : ''}`;
    case 'PRODUCT_ACCEPTED':
      return `${event.unitId} accepted`;
    case 'ALARM_RAISED':
      return `${event.code} — ${event.message}`;
    case 'ALARM_CLEARED':
      return `${event.code} cleared`;
    case 'INSPECTION_RECORDED':
      return `${event.unitId} recorded`;
  }
}

/** Spec §46 event log strip. Newest first, fed by the engine's bounded ring. */
export function EventLogStrip() {
  const events = useSimulationStore((state) => state.snapshot.recentEvents);
  const ordered = [...events].reverse();

  return (
    <section className="event-log">
      <header className="event-log__head">Event Log</header>
      <ol className="event-log__list">
        {ordered.length === 0 ? <li className="event-log__empty">No events yet</li> : null}
        {ordered.map((event, index) => (
          <li
            key={`${event.simulationTime}-${event.type}-${index}`}
            className={`event-log__row ${TONE[event.type] ?? ''}`}
          >
            <span className="event-log__time">{event.simulationTime.toFixed(2)}</span>
            <span className="event-log__type">{event.type}</span>
            <span className="event-log__text">{describe(event)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
