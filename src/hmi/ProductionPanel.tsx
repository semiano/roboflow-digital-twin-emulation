import { getEngine, useSimulationStore } from '@/app/simulationStore';
import { conveyorConfig } from '@/config/line.config';
import { SIMULATION_SPEEDS, type SimulationSpeed } from '@/config/simulation.config';
import { DEFECT_LABELS, DEFECT_TYPES } from '@/models/DefectType';
import { Panel } from './Panel';

export function ProductionPanel() {
  const snapshot = useSimulationStore((state) => state.snapshot);
  const setSpeed = useSimulationStore((state) => state.setSpeed);
  const engine = getEngine();

  const startProduction = (): void => {
    engine.products.setAutoSpawn(true);
    engine.start();
  };

  return (
    <Panel title="Machine Controls">
      <div className="control-row">
        <button
          type="button"
          className="btn btn--start"
          onClick={startProduction}
          disabled={snapshot.machineState !== 'STOPPED'}
        >
          START
        </button>
        <button
          type="button"
          className="btn btn--stop"
          onClick={() => engine.stop()}
          disabled={snapshot.machineState === 'STOPPED' || snapshot.machineState === 'FAULTED'}
        >
          STOP
        </button>
        <button
          type="button"
          className="btn btn--fault-reset"
          onClick={() => engine.resetFaults()}
          disabled={snapshot.machineState !== 'FAULTED'}
        >
          RESET FAULTS
        </button>
        <button type="button" className="btn" onClick={() => engine.reset()}>
          RESET
        </button>
      </div>

      <div className="control-field">
        <label htmlFor="line-speed">
          Line Speed
          <span className="control-field__value">
            {snapshot.lineSpeedMetersPerSecond.toFixed(2)} m/s
          </span>
        </label>
        <input
          id="line-speed"
          type="range"
          min={0.05}
          max={1.0}
          step={0.05}
          defaultValue={conveyorConfig.speedMetersPerSecond}
          onChange={(event) => engine.setLineSpeed(Number(event.target.value))}
        />
      </div>

      <div className="control-field">
        <span className="control-field__caption">Simulation Speed</span>
        <div className="segmented">
          {SIMULATION_SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              className={`segmented__item ${snapshot.speedMultiplier === speed ? 'is-active' : ''}`}
              onClick={() => setSpeed(speed as SimulationSpeed)}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>

      <div className="control-field">
        <label className="toggle">
          <input
            type="checkbox"
            checked={snapshot.autoSpawn}
            onChange={() => engine.products.setAutoSpawn(!snapshot.autoSpawn)}
          />
          <span>Automatic production ({snapshot.unitsPerMinute} units/min)</span>
        </label>
      </div>

      <div className="control-field">
        <span className="control-field__caption">Inject Product</span>
        <div className="inject-grid">
          {DEFECT_TYPES.map((defect) => (
            <button
              key={defect}
              type="button"
              className={`btn btn--sm ${defect === 'NONE' ? 'btn--good' : 'btn--defect'}`}
              onClick={() => engine.injectDefect(defect)}
            >
              {DEFECT_LABELS[defect]}
            </button>
          ))}
          <button
            type="button"
            className="btn btn--sm btn--defect"
            onClick={() => engine.injectRandomDefect()}
          >
            Random Defect
          </button>
        </div>
      </div>
    </Panel>
  );
}
