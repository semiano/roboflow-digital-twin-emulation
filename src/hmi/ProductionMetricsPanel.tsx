import { useSimulationStore } from '@/app/simulationStore';
import { Metric, Panel } from './Panel';

export function ProductionMetricsPanel() {
  const snapshot = useSimulationStore((state) => state.snapshot);
  const { totalCount, goodCount, rejectCount } = snapshot.tags;
  const decided = goodCount + rejectCount;

  return (
    <Panel title="Production Metrics">
      <div className="metric-grid">
        <Metric label="On Line" value={String(snapshot.productCount)} />
        <Metric label="Total Count" value={totalCount.toLocaleString()} />
        <Metric label="Accepted" value={goodCount.toLocaleString()} />
        <Metric label="Rejected" value={rejectCount.toLocaleString()} />
        <Metric
          label="Line Speed"
          value={snapshot.lineSpeedMetersPerSecond.toFixed(2)}
          unit="m/s"
        />
        <Metric label="Reject Queue" value={String(snapshot.rejectQueueSize)} />
        <Metric label="Diverter" value={snapshot.rejectStationState} />
        <Metric
          label="Reject Rate"
          value={decided === 0 ? '—' : `${((rejectCount / decided) * 100).toFixed(1)}`}
          {...(decided > 0 ? { unit: '%' } : {})}
        />
      </div>
      <p className="panel__note">
        Counters are sensor-driven: PE100 totals, PE102 rejects, PE103 accepts. Quality evaluation
        against ground truth arrives in Phase 7.
      </p>
    </Panel>
  );
}
