import { getEngine, useSimulationStore } from '@/app/simulationStore';
import type { RuntimeMode } from '@/config/simulation.config';
import { LATENCY_MODES } from '@/config/vision.config';
import { FAULT_MESSAGES } from '@/controls/Interlocks';
import { Panel } from './Panel';

/** Phase 10 lights up the remaining mode. */
const RUNTIME_MODES: ReadonlyArray<{ mode: RuntimeMode; label: string; available: boolean }> = [
  { mode: 'SIMULATION_ONLY', label: 'SIM ONLY', available: true },
  { mode: 'MOCK_VISION', label: 'MOCK', available: true },
  { mode: 'ROBOFLOW', label: 'ROBOFLOW', available: true },
  { mode: 'DATASET_GENERATION', label: 'DATASET', available: false },
];

/**
 * Vision mode and equipment faults (spec §26/§47/§48). Environmental faults
 * arrive with domain shift in Phase 9; defect injection lives in Machine
 * Controls.
 */
export function FaultInjectionPanel() {
  const snapshot = useSimulationStore((state) => state.snapshot);
  const engine = getEngine();

  const mock = snapshot.mockVision;
  const visionOffline = snapshot.visionAttached && !snapshot.visionProviderConnected;

  return (
    <Panel title="Vision &amp; Fault Injection">
      <div className="control-field">
        <span className="control-field__caption">Runtime Mode</span>
        <div className="segmented">
          {RUNTIME_MODES.map(({ mode, label, available }) => (
            <button
              key={mode}
              type="button"
              className={`segmented__item ${snapshot.runtimeMode === mode ? 'is-active' : ''}`}
              disabled={!available}
              title={available ? mode : `${mode} is not implemented yet`}
              onClick={() => engine.setRuntimeMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="control-field">
        <span className="control-field__caption">Equipment</span>
        <div className="toggle-stack">
          {/* Handlers toggle the known engine state, not event.target.checked:
              these inputs are driven by a 10 Hz snapshot and would otherwise
              desync from the DOM on a fast second click. */}
          <label className="toggle">
            <input
              type="checkbox"
              checked={visionOffline}
              disabled={!snapshot.visionAttached}
              onChange={() => engine.setVisionConnected(visionOffline)}
            />
            <span>Vision Offline</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={!snapshot.cameraOnline}
              onChange={() => engine.setCameraOnline(!snapshot.cameraOnline)}
            />
            <span>Camera Offline</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={snapshot.rejectStationFaulted}
              onChange={() => engine.setRejectStationFaulted(!snapshot.rejectStationFaulted)}
            />
            <span>Reject Station Fault</span>
          </label>
        </div>
      </div>

      {mock ? (
        <>
          <div className="control-field">
            <span className="control-field__caption">
              Inference Latency
              <span className="control-field__value">{mock.latencyMode}</span>
            </span>
            <div className="segmented">
              {LATENCY_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`segmented__item ${mock.latencyMode === mode ? 'is-active' : ''}`}
                  onClick={() => engine.configureMockVision({ latencyMode: mode })}
                >
                  {mode === 'RANDOM' ? 'RND' : mode}
                </button>
              ))}
            </div>
            <p className="panel__note">
              1500 ms exceeds the 1000 ms PLC timeout, forcing UNKNOWN and exercising the fail-safe.
            </p>
          </div>

          <div className="control-field">
            <label htmlFor="mock-accuracy">
              Class Accuracy
              <span className="control-field__value">{(mock.accuracy * 100).toFixed(0)}%</span>
            </label>
            <input
              id="mock-accuracy"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={mock.accuracy}
              onChange={(event) =>
                engine.configureMockVision({ accuracy: Number(event.target.value) })
              }
            />
          </div>

          <div className="control-field">
            <label htmlFor="mock-fp">
              False Reject Rate
              <span className="control-field__value">
                {(mock.falsePositiveProbability * 100).toFixed(0)}%
              </span>
            </label>
            <input
              id="mock-fp"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={mock.falsePositiveProbability}
              onChange={(event) =>
                engine.configureMockVision({ falsePositiveProbability: Number(event.target.value) })
              }
            />
          </div>

          <div className="control-field">
            <label htmlFor="mock-fn">
              Escape Rate
              <span className="control-field__value">
                {(mock.falseNegativeProbability * 100).toFixed(0)}%
              </span>
            </label>
            <input
              id="mock-fn"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={mock.falseNegativeProbability}
              onChange={(event) =>
                engine.configureMockVision({ falseNegativeProbability: Number(event.target.value) })
              }
            />
          </div>
        </>
      ) : snapshot.visionAttached ? (
        <p className="panel__note">
          {snapshot.visionProviderName} is the active inference engine. Its own controls are in the
          Roboflow panel.
        </p>
      ) : (
        <p className="panel__note">
          No inference engine is attached in {snapshot.runtimeMode.replace(/_/g, ' ')}. Units run
          the line uninspected.
        </p>
      )}

      {snapshot.faults.length > 0 ? (
        <div className="fault-list">
          {snapshot.faults.map((code) => (
            <span key={code} className="fault-list__item">
              {FAULT_MESSAGES[code]}
            </span>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}
