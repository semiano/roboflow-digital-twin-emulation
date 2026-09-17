import { useRef } from 'react';
import { useSimulationRuntime } from '@/app/useSimulationRuntime';
import { AlarmBanner } from './AlarmBanner';
import { EventLogStrip } from './EventLogStrip';
import { FaultInjectionPanel } from './FaultInjectionPanel';
import { PlcTagMonitor } from './PlcTagMonitor';
import { ProductionMetricsPanel } from './ProductionMetricsPanel';
import { ProductionPanel } from './ProductionPanel';
import { RoboflowPanel } from './RoboflowPanel';
import { StatusHeader } from './StatusHeader';
import { VisionPanel } from './VisionPanel';

export function AppShell() {
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const inspectionCanvasRef = useRef<HTMLCanvasElement>(null);

  useSimulationRuntime(mainCanvasRef, inspectionCanvasRef);

  return (
    <div className="shell">
      <StatusHeader />

      <main className="shell__grid">
        <section className="shell__viewport">
          <canvas ref={mainCanvasRef} className="viewport__canvas" />
          <div className="viewport__badge">OPERATOR VIEW · orbit / scroll to zoom</div>
        </section>

        <aside className="shell__side">
          <VisionPanel ref={inspectionCanvasRef} />
          <RoboflowPanel />
          <ProductionMetricsPanel />
          <PlcTagMonitor />
        </aside>

        <section className="shell__controls">
          <ProductionPanel />
        </section>

        <section className="shell__faults">
          <FaultInjectionPanel />
        </section>
      </main>

      <footer className="shell__alarms">
        <div className="shell__alarms-inner">
          <AlarmBanner />
        </div>
        <EventLogStrip />
      </footer>
    </div>
  );
}
