import { useMemo, useState } from 'react';
import { getEngine } from '@/app/simulationStore';
import { datasetConfig } from '@/config/dataset.config';
import { visionConfig } from '@/config/vision.config';
import { serializeYoloAnnotation } from '@/dataset/AnnotationGenerator';
import { exportYoloDataset } from '@/dataset/DatasetExporter';
import type { DatasetGenerationProgress, DatasetSample, DatasetSplit } from '@/dataset/DatasetTypes';
import { RoboflowTrainingClient } from '@/dataset/RoboflowTrainingClient';
import { DEFECT_LABELS, DEFECT_TYPES, type DefectType } from '@/models/DefectType';

type ClassFilter = DefectType | 'ALL';
type SplitFilter = DatasetSplit | 'all';

const downloadArchive = (samples: readonly DatasetSample[], seed: number): void => {
  const url = URL.createObjectURL(exportYoloDataset(samples));
  const link = document.createElement('a');
  link.href = url;
  link.download = `roboflow-training-seed-${seed}.zip`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

const trainingClient = new RoboflowTrainingClient();

export function TrainingStudio() {
  const [samples, setSamples] = useState<DatasetSample[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [classFilter, setClassFilter] = useState<ClassFilter>('ALL');
  const [splitFilter, setSplitFilter] = useState<SplitFilter>('all');
  const [samplesPerClass, setSamplesPerClass] = useState(4);
  const [seed, setSeed] = useState(20260917);
  const [progress, setProgress] = useState<DatasetGenerationProgress>();
  const [error, setError] = useState<string>();
  const [generating, setGenerating] = useState(false);
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [datasetVersion, setDatasetVersion] = useState<number>();
  const [handoffStatus, setHandoffStatus] = useState('Generate and review a dataset before uploading.');
  const [modelType, setModelType] = useState('rfdetr-nano');

  const workspace = visionConfig.roboflow.workspace;
  const project = visionConfig.activeLearning.project;
  const roboflowConfigured = workspace !== '' && project !== '';
  const hasTrainingVolume = DEFECT_TYPES.every(
    (defectType) =>
      samples.filter((sample) => sample.defectType === defectType).length >=
      datasetConfig.minimumImagesPerClass,
  );

  const filtered = useMemo(
    () =>
      samples.filter(
        (sample) =>
          (classFilter === 'ALL' || sample.defectType === classFilter) &&
          (splitFilter === 'all' || sample.split === splitFilter),
      ),
    [classFilter, samples, splitFilter],
  );
  const selected = samples.find((sample) => sample.id === selectedId) ?? filtered[0];

  const generate = async (): Promise<void> => {
    setGenerating(true);
    setError(undefined);
    setProgress(undefined);
    try {
      const generated = await getEngine().generateDatasetPreview(samplesPerClass, seed, setProgress);
      setSamples(generated);
      setSelectedId(generated[0]?.id);
      setUploadComplete(false);
      setDatasetVersion(undefined);
      setHandoffStatus('Dataset rendered. Export it or upload it to Roboflow.');
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : String(generationError));
    } finally {
      setGenerating(false);
    }
  };

  const uploadDataset = async (): Promise<void> => {
    setRemoteBusy(true);
    setError(undefined);
    try {
      await trainingClient.uploadDatasetZip(
        exportYoloDataset(samples),
        workspace,
        project,
        `virtual-vision-cell-seed-${seed}`,
        (status, detail) => setHandoffStatus(`Roboflow upload: ${status}${detail ? ` ${detail}` : ''}`),
      );
      setUploadComplete(true);
      setHandoffStatus('Upload processed. Generate an immutable dataset version next.');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
      setHandoffStatus('Upload failed. No dataset version or training was started.');
    } finally {
      setRemoteBusy(false);
    }
  };

  const generateVersion = async (): Promise<void> => {
    setRemoteBusy(true);
    setError(undefined);
    try {
      const version = await trainingClient.generateVersion(workspace, project);
      setDatasetVersion(version);
      setHandoffStatus(`Dataset version ${version} created. Review it before starting paid training.`);
    } catch (versionError) {
      setError(versionError instanceof Error ? versionError.message : String(versionError));
    } finally {
      setRemoteBusy(false);
    }
  };

  const trainModel = async (): Promise<void> => {
    if (!datasetVersion) return;
    const confirmed = window.confirm(
      `Start billable Roboflow training for ${project}/${datasetVersion} with ${modelType}?`,
    );
    if (!confirmed) return;

    setRemoteBusy(true);
    setError(undefined);
    try {
      await trainingClient.startTraining(
        workspace,
        project,
        datasetVersion,
        modelType,
        (detail) => setHandoffStatus(detail),
      );
      setHandoffStatus(`Training queued for ${project}/${datasetVersion} with ${modelType}.`);
    } catch (trainingError) {
      setError(trainingError instanceof Error ? trainingError.message : String(trainingError));
    } finally {
      setRemoteBusy(false);
    }
  };

  return (
    <main className="training-studio">
      <header className="training-studio__toolbar">
        <div>
          <span className="training-studio__eyebrow">Synthetic dataset workbench</span>
          <h1>Roboflow Training Set</h1>
        </div>
        <div className="training-studio__controls">
          <label>
            Seed
            <input type="number" value={seed} onChange={(event) => setSeed(Number(event.target.value))} />
          </label>
          <label>
            Per class
            <input
              type="number"
              min={3}
              max={1000}
              value={samplesPerClass}
              onChange={(event) => setSamplesPerClass(Number(event.target.value))}
            />
          </label>
          <button type="button" className="btn btn--start" onClick={() => void generate()} disabled={generating}>
            {generating ? `Rendering ${progress?.completed ?? 0}/${progress?.total ?? 0}` : 'Generate Preview'}
          </button>
          <button type="button" className="btn" onClick={() => downloadArchive(samples, seed)} disabled={samples.length === 0}>
            Download YOLO ZIP
          </button>
        </div>
      </header>

      <section className="training-pipeline" aria-label="Roboflow training workflow">
        <div className={`pipeline-step ${samples.length > 0 ? 'is-complete' : 'is-active'}`}>
          <span>01</span><strong>Generate</strong><small>{samples.length || 'Preview set'}</small>
        </div>
        <div className={`pipeline-step ${samples.length > 0 ? 'is-active' : ''}`}>
          <span>02</span><strong>Review</strong><small>Boxes + balance</small>
        </div>
        <div className={`pipeline-step ${samples.length > 0 ? 'is-complete' : ''}`}>
          <span>03</span><strong>Export</strong><small>{samples.length > 0 ? 'YOLO ZIP ready' : 'Awaiting samples'}</small>
        </div>
        <div className={`pipeline-step ${uploadComplete ? 'is-complete' : samples.length > 0 ? 'is-active' : ''}`}>
          <span>04</span><strong>Upload</strong><small>{uploadComplete ? 'Processed' : 'Roboflow dataset'}</small>
        </div>
        <div className={`pipeline-step ${datasetVersion ? 'is-active' : ''}`}>
          <span>05</span><strong>Train</strong><small>{datasetVersion ? `Version ${datasetVersion}` : 'Create version first'}</small>
        </div>
      </section>

      {error ? <div className="training-error">{error}</div> : null}

      <div className="training-studio__layout">
        <aside className="training-sidebar">
          <div className="training-section-head"><span>Class Balance</span><b>{samples.length}</b></div>
          <button type="button" className={`class-filter ${classFilter === 'ALL' ? 'is-active' : ''}`} onClick={() => setClassFilter('ALL')}>
            <span>All classes</span><b>{samples.length}</b>
          </button>
          {DEFECT_TYPES.map((defect) => {
            const count = samples.filter((sample) => sample.defectType === defect).length;
            return (
              <button key={defect} type="button" className={`class-filter ${classFilter === defect ? 'is-active' : ''}`} onClick={() => setClassFilter(defect)}>
                <span><i className={`class-dot class-dot--${defect.toLowerCase()}`} />{DEFECT_LABELS[defect]}</span><b>{count}</b>
              </button>
            );
          })}
          <div className="training-section-head"><span>Split</span></div>
          <div className="segmented">
            {(['all', 'train', 'valid', 'test'] as const).map((split) => (
              <button key={split} type="button" className={`segmented__item ${splitFilter === split ? 'is-active' : ''}`} onClick={() => setSplitFilter(split)}>
                {split.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="dataset-contract">
            <span>Contract</span>
            <strong>512 × 512 JPEG</strong>
            <small>One whole-product YOLO box per image</small>
            <small>Camera poses A–D · pose E excluded</small>
          </div>
        </aside>

        <section className="training-browser">
          <div className="training-browser__head">
            <span>{filtered.length} samples</span>
            <span>{workspace || 'workspace unset'} / {project || 'dataset project unset'}</span>
          </div>
          {filtered.length === 0 ? (
            <div className="training-empty">
              <strong>No preview frames yet</strong>
              <span>Generate a balanced set to inspect the rendered bottles and YOLO annotations.</span>
            </div>
          ) : (
            <div className="training-grid">
              {filtered.map((sample) => {
                const box = sample.annotation;
                return (
                  <button key={sample.id} type="button" className={`training-card ${selected?.id === sample.id ? 'is-selected' : ''}`} onClick={() => setSelectedId(sample.id)}>
                    <span className="training-card__image">
                      <img src={sample.imageDataUrl} alt={`${DEFECT_LABELS[sample.defectType]} training sample`} />
                      <i className="annotation-box" style={{ left: `${(box.xCenter - box.width / 2) * 100}%`, top: `${(box.yCenter - box.height / 2) * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }} />
                      <em>{box.className}</em>
                    </span>
                    <span className="training-card__meta"><strong>{DEFECT_LABELS[sample.defectType]}</strong><small>{sample.split} · pose {sample.cameraPose}</small></span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <aside className="training-inspector">
          <div className="training-section-head"><span>Annotation Inspector</span></div>
          {selected ? (
            <>
              <div className="inspector-preview">
                <img src={selected.imageDataUrl} alt="Selected training sample" />
                <i className="annotation-box" style={{ left: `${(selected.annotation.xCenter - selected.annotation.width / 2) * 100}%`, top: `${(selected.annotation.yCenter - selected.annotation.height / 2) * 100}%`, width: `${selected.annotation.width * 100}%`, height: `${selected.annotation.height * 100}%` }} />
              </div>
              <dl className="inspector-data">
                <div><dt>Class</dt><dd>{selected.annotation.className}</dd></div>
                <div><dt>Class ID</dt><dd>{selected.annotation.classId}</dd></div>
                <div><dt>Split</dt><dd>{selected.split}</dd></div>
                <div><dt>Camera</dt><dd>Pose {selected.cameraPose}</dd></div>
                <div><dt>Seed</dt><dd>{selected.seed}</dd></div>
              </dl>
              <code className="yolo-row">{serializeYoloAnnotation(selected.annotation)}</code>
            </>
          ) : <div className="training-empty training-empty--small">Select a sample to inspect.</div>}
          <div className="roboflow-handoff">
            <span>Roboflow handoff</span>
            <button type="button" className="btn" disabled={!hasTrainingVolume || !roboflowConfigured || remoteBusy} onClick={() => void uploadDataset()}>
              Upload Dataset
            </button>
            <button type="button" className="btn" disabled={!uploadComplete || remoteBusy} onClick={() => void generateVersion()}>
              Generate Version
            </button>
            <label className="training-model-select">
              Model
              <select value={modelType} onChange={(event) => setModelType(event.target.value)} disabled={remoteBusy}>
                <option value="rfdetr-nano">RF-DETR Nano</option>
                <option value="yolov11">YOLO11</option>
                <option value="yolov8">YOLOv8</option>
              </select>
            </label>
            <button type="button" className="btn btn--start" disabled={!datasetVersion || remoteBusy} onClick={() => void trainModel()}>
              Start Training
            </button>
            <small>{handoffStatus}</small>
            {samples.length > 0 && !hasTrainingVolume ? (
              <small>Preview only: training upload requires {datasetConfig.minimumImagesPerClass} samples per class.</small>
            ) : null}
            {!roboflowConfigured ? <small>Set VITE_ROBOFLOW_WORKSPACE and VITE_ROBOFLOW_DATASET_PROJECT.</small> : null}
          </div>
        </aside>
      </div>
    </main>
  );
}