import { LINE_NAME } from '@/config/line.config';
import { useSimulationStore } from '@/app/simulationStore';
import { StatusChip } from './Panel';

const MACHINE_TONE = {
  RUNNING: 'ok',
  STARTING: 'warn',
  STOPPING: 'warn',
  STOPPED: 'idle',
  FAULTED: 'fault',
} as const;

export interface StatusHeaderProps {
  workspace?: 'operations' | 'training';
}

export function StatusHeader({ workspace = 'operations' }: StatusHeaderProps) {
  const snapshot = useSimulationStore((state) => state.snapshot);

  const visionValue = !snapshot.visionAttached
    ? 'NOT CONFIGURED'
    : snapshot.visionProviderConnected
      ? 'CONNECTED'
      : 'OFFLINE';

  return (
    <header className="status-header">
      <div className="status-header__identity">
        <span className="status-header__line">{LINE_NAME}</span>
        <span className="status-header__phase">
          {workspace === 'training'
            ? 'Phase 10 · Dataset Generation & Training'
            : 'Operations · Vision Inspection'}
        </span>
      </div>

      <div className="status-header__chips">
        <StatusChip
          label="Machine"
          value={snapshot.machineState}
          tone={MACHINE_TONE[snapshot.machineState]}
        />
        <StatusChip
          label="Camera"
          value={snapshot.cameraOnline ? 'ONLINE' : 'OFFLINE'}
          tone={snapshot.cameraOnline ? 'ok' : 'fault'}
        />
        <StatusChip
          label="Vision"
          value={visionValue}
          tone={snapshot.visionProviderConnected ? 'ok' : 'idle'}
        />
        <StatusChip
          label="Vision Mode"
          value={snapshot.visionProviderName ?? snapshot.runtimeMode.replace(/_/g, ' ')}
          tone={snapshot.visionProviderName === 'MOCK' ? 'warn' : 'idle'}
        />
        <StatusChip
          label="Reject Queue"
          value={String(snapshot.rejectQueueSize)}
          tone={snapshot.rejectQueueSize > 0 ? 'warn' : 'idle'}
        />
        <StatusChip
          label="Sim Clock"
          value={`${snapshot.elapsedSeconds.toFixed(1)}s @ ${snapshot.speedMultiplier}x`}
          tone="idle"
        />
      </div>
    </header>
  );
}
