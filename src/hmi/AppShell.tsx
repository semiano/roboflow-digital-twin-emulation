import { useRef, useState } from 'react';
import { useSimulationRuntime } from '@/app/useSimulationRuntime';
import { AlarmBanner } from './AlarmBanner';
import { EventLogStrip } from './EventLogStrip';
import { FaultInjectionPanel } from './FaultInjectionPanel';
import { PlcTagMonitor } from './PlcTagMonitor';
import { ProductionMetricsPanel } from './ProductionMetricsPanel';
import { ProductionPanel } from './ProductionPanel';
import { RoboflowPanel } from './RoboflowPanel';
import { StatusHeader } from './StatusHeader';
import { TrainingStudio } from './TrainingStudio';
import { VisionPanel } from './VisionPanel';

type Workspace = 'operations' | 'training';

export function AppShell() {
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const inspectionCanvasRef = useRef<HTMLCanvasElement>(null);
  const [workspace, setWorkspace] = useState<Workspace>('operations');

  useSimulationRuntime(mainCanvasRef, inspectionCanvasRef);

  return (
    <div className="shell">
      <StatusHeader workspace={workspace} />

      <nav className="workspace-tabs" aria-label="Application workspace">
        <button type="button" className={workspace === 'operations' ? 'is-active' : ''} onClick={() => setWorkspace('operations')}>Operations</button>
        <button type="button" className={workspace === 'training' ? 'is-active' : ''} onClick={() => setWorkspace('training')}>Training Set</button>
      </nav>

      <main className={`shell__grid ${workspace !== 'operations' ? 'is-hidden' : ''}`}>
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

      <div className={workspace !== 'training' ? 'is-hidden' : ''}>
        <TrainingStudio />
      </div>

      <footer className={`shell__alarms ${workspace !== 'operations' ? 'is-hidden' : ''}`}>
        <div className="shell__alarms-inner">
          <AlarmBanner />
        </div>
        <EventLogStrip />
      </footer>
    </div>
  );
}
