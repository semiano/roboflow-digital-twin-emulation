import { forwardRef, useState } from 'react';
import { useSimulationStore } from '@/app/simulationStore';
import { DEFECT_LABELS, type DefectType } from '@/models/DefectType';
import { DetectionOverlay } from './DetectionOverlay';
import { Panel } from './Panel';

const RESULT_TONE: Record<string, string> = {
  PASS: 'is-pass',
  FAIL: 'is-fail',
  UNKNOWN: 'is-unknown',
};

/** Live output of InspectionCamera01. This canvas is the AI boundary (plan.md C2). */
export const VisionPanel = forwardRef<HTMLCanvasElement>(function VisionPanel(_props, ref) {
  const snapshot = useSimulationStore((state) => state.snapshot);
  const [showBoxes, setShowBoxes] = useState(true);
  const [showRoboflowRender, setShowRoboflowRender] = useState(false);

  const { visionResult, visionDefectCode, visionConfidence } = snapshot.tags;
  const inspected = snapshot.tags.goodCount + snapshot.tags.rejectCount > 0 || visionConfidence > 0;
  const overlay = snapshot.visionOverlay;
  const annotated = overlay?.annotatedFrameBase64;
  const showAnnotated = Boolean(annotated) && showRoboflowRender;

  const defectLabel =
    visionDefectCode && visionDefectCode in DEFECT_LABELS
      ? DEFECT_LABELS[visionDefectCode as DefectType]
      : visionDefectCode || '—';

  return (
    <Panel
      title="CAM01 · Inspection"
      right={
        <div className="panel__head-badges">
          {snapshot.visionProviderName ? (
            <span className="mode-badge">VISION MODE: {snapshot.visionProviderName}</span>
          ) : null}
          <span className="live-dot">LIVE</span>
        </div>
      }
      bodyClassName="panel__body--flush"
    >
      <div className="cam-feed">
        {/* The camera canvas stays mounted whatever is shown on top of it: it is
            the surface captureStream is attached to, so unmounting it would tear
            the feed down. */}
        <canvas ref={ref} className="cam-feed__canvas" />

        {showAnnotated ? (
          <img
            className="cam-feed__annotated"
            src={`data:image/jpeg;base64,${annotated}`}
            alt="Roboflow workflow visualization"
          />
        ) : null}

        {showBoxes && overlay && !showAnnotated ? (
          <DetectionOverlay
            detections={overlay.detections}
            sourceWidth={overlay.sourceWidth}
            sourceHeight={overlay.sourceHeight}
          />
        ) : null}

        <div className="cam-feed__overlay">
          <span>INSPECTION CAMERA 01</span>
          <span>512 × 512 · 20 fps</span>
        </div>
      </div>

      <div className="cam-toggles">
        <label className="toggle toggle--inline">
          <input type="checkbox" checked={showBoxes} onChange={() => setShowBoxes(!showBoxes)} />
          <span>Detections</span>
        </label>
        <label className="toggle toggle--inline">
          <input
            type="checkbox"
            checked={showAnnotated}
            disabled={!annotated}
            onChange={() => setShowRoboflowRender(!showRoboflowRender)}
          />
          <span>Roboflow render</span>
        </label>
        {overlay?.inferenceId ? (
          <span className="cam-toggles__id" title={overlay.inferenceId}>
            {overlay.inferenceId.slice(0, 8)}
          </span>
        ) : null}
      </div>

      <div className="cam-readout">
        <div>
          <span className="cam-readout__label">Result</span>
          <span className={`cam-readout__value ${inspected ? RESULT_TONE[visionResult] : ''}`}>
            {inspected ? visionResult : '—'}
          </span>
        </div>
        <div>
          <span className="cam-readout__label">Defect</span>
          <span className="cam-readout__value">{inspected ? defectLabel : '—'}</span>
        </div>
        <div>
          <span className="cam-readout__label">Confidence</span>
          <span className="cam-readout__value">
            {inspected ? `${(visionConfidence * 100).toFixed(1)}%` : '—'}
          </span>
        </div>
        <div>
          <span className="cam-readout__label">Latency</span>
          <span className="cam-readout__value">
            {inspected ? `${Math.round(snapshot.lastInferenceLatencyMs)} ms` : '—'}
          </span>
        </div>
      </div>
    </Panel>
  );
});
