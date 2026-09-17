import { getEngine, useSimulationStore } from '@/app/simulationStore';
import { ROBOFLOW_RUNTIMES, ROBOFLOW_TRANSPORTS, visionConfig } from '@/config/vision.config';
import { Panel } from './Panel';

const RUNTIME_LABELS: Record<string, string> = {
  PROXY: 'CLOUD',
  LOCAL: 'SELF-HOSTED',
  DEDICATED: 'DEDICATED',
  SERVERLESS: 'DIRECT',
};

const RUNTIME_HINTS: Record<string, string> = {
  PROXY: 'Roboflow Cloud GPUs via the app proxy — key stays server-side',
  LOCAL: 'Roboflow Inference in Docker on this machine',
  DEDICATED: 'Single-tenant deployment — predictable latency',
  SERVERLESS: 'Browser → serverless.roboflow.com (blocked by CORS)',
};

/**
 * Spec §15. The Roboflow link, made operable rather than configured.
 *
 * Runtime is a live control because the same request runs unchanged against
 * Roboflow Cloud, a Dedicated Deployment, or a self-hosted Inference server —
 * being able to move the inference workload mid-run without touching the line
 * is the practical argument for the whole deployment model, so the demo should
 * be able to do it in front of someone.
 */
export function RoboflowPanel() {
  const snapshot = useSimulationStore((state) => state.snapshot);
  const engine = getEngine();
  const status = snapshot.roboflow;

  if (!status) return null;

  const { activeLearning } = status;
  const linkTone = status.connected ? 'is-ok' : status.configured ? 'is-fault' : 'is-warn';

  return (
    <Panel
      title="Roboflow"
      right={
        <span className={`link-pill ${linkTone}`}>
          {status.connected ? 'CONNECTED' : status.configured ? 'OFFLINE' : 'NOT CONFIGURED'}
        </span>
      }
    >
      {status.missingSettings.length > 0 ? (
        <p className="panel__note panel__note--warn">
          Set {status.missingSettings.join(', ')} in <code>.env.local</code>, then reselect the
          ROBOFLOW runtime mode.
        </p>
      ) : null}

      <div className="control-field">
        <span className="control-field__caption">
          Inference Runtime
          <span className="control-field__value">{RUNTIME_HINTS[status.runtime]}</span>
        </span>
        <div className="segmented">
          {ROBOFLOW_RUNTIMES.map((runtime) => (
            <button
              key={runtime}
              type="button"
              className={`segmented__item ${status.runtime === runtime ? 'is-active' : ''}`}
              disabled={!visionConfig.roboflow.endpoints[runtime]}
              title={visionConfig.roboflow.endpoints[runtime] || 'No endpoint URL configured'}
              onClick={() => engine.setRoboflowRuntime(runtime)}
            >
              {RUNTIME_LABELS[runtime]}
            </button>
          ))}
        </div>
      </div>

      <div className="control-field">
        <span className="control-field__caption">Endpoint Shape</span>
        <div className="segmented">
          {ROBOFLOW_TRANSPORTS.map((transport) => (
            <button
              key={transport}
              type="button"
              className={`segmented__item ${status.transport === transport ? 'is-active' : ''}`}
              onClick={() => engine.setRoboflowTransport(transport)}
            >
              {transport}
            </button>
          ))}
        </div>
        <p className="panel__note">
          A Workflow keeps the inspection recipe — model, thresholds, visualization — versioned in
          Roboflow instead of compiled into the PLC.
        </p>
      </div>

      <dl className="kv">
        <div>
          <dt>Target</dt>
          <dd title={status.endpoint}>{status.description}</dd>
        </div>
        <div>
          <dt>Server</dt>
          <dd title={status.server ?? ''}>{status.server ?? '—'}</dd>
        </div>
        <div>
          <dt>API key</dt>
          <dd>{status.proxied ? 'server-side' : 'in browser'}</dd>
        </div>
        <div>
          <dt>Requests</dt>
          <dd>
            {status.requestCount} ok · {status.errorCount} err
          </dd>
        </div>
        <div>
          <dt>Round trip</dt>
          <dd>{status.lastRoundTripMs ? `${Math.round(status.lastRoundTripMs)} ms` : '—'}</dd>
        </div>
      </dl>

      {status.lastOutputNames.length > 0 ? (
        <p className="panel__note">Workflow outputs: {status.lastOutputNames.join(', ')}</p>
      ) : null}

      {status.unmappedClasses.length > 0 ? (
        <p className="panel__note panel__note--warn">
          Unmapped Roboflow classes ignored: {status.unmappedClasses.join(', ')}. Add them to{' '}
          <code>roboflowClassMap</code>.
        </p>
      ) : null}

      {status.lastError ? (
        <p className="panel__note panel__note--warn">{status.lastError}</p>
      ) : null}

      <div className="control-field">
        <span className="control-field__caption">
          Active Learning
          <span className="control-field__value">
            {activeLearning.sent} sent · {activeLearning.remaining} left
          </span>
        </span>
        <div className="toggle-stack">
          <label className="toggle">
            <input
              type="checkbox"
              checked={activeLearning.enabled}
              disabled={!activeLearning.configured}
              onChange={() => engine.setActiveLearningEnabled(!activeLearning.enabled)}
            />
            <span>
              Auto-upload frames under{' '}
              {(visionConfig.activeLearning.confidenceCeiling * 100).toFixed(0)}% confidence
            </span>
          </label>
        </div>
        <button
          type="button"
          className="btn btn--sm"
          disabled={!activeLearning.configured}
          onClick={() => engine.uploadLastFrameForReview()}
        >
          Send last frame for labelling
        </button>
        <p className="panel__note">
          {activeLearning.configured
            ? `Uploads land in the "${visionConfig.activeLearning.batchName}" batch of ${activeLearning.project}.`
            : 'Set VITE_ROBOFLOW_DATASET_PROJECT to push low-confidence frames back for retraining.'}
        </p>
      </div>
    </Panel>
  );
}
