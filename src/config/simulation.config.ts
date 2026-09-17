export type RuntimeMode =
  | 'SIMULATION_ONLY'
  | 'MOCK_VISION'
  | 'ROBOFLOW'
  | 'DATASET_GENERATION';

export type SimulationSpeed = 0 | 0.5 | 1 | 2 | 5;

export const SIMULATION_SPEEDS: readonly SimulationSpeed[] = [0, 0.5, 1, 2, 5];

export const simulationConfig = {
  /** Logic runs at a fixed step so results are frame-rate independent. */
  fixedStepSeconds: 1 / 60,
  /** Guard against spiral-of-death after a tab stall. */
  maxStepsPerFrame: 8,
  defaultSpeed: 1 as SimulationSpeed,

  /** Engine -> React snapshot rate. Keeps per-frame React renders off the hot path. */
  snapshotHz: 10,

  /** Seed for the default session; dataset generation overrides it. */
  defaultSeed: 20260916,

  plc: {
    /** Scan period in simulated seconds. Runs faster than the logic step. */
    scanSeconds: 0.01,
    startingSeconds: 0.25,
    stoppingSeconds: 0.2,
    /** How long the reject output is held after a match at PE102. */
    rejectPulseSeconds: 0.2,
    /** Reject must report extended within this long of being commanded. */
    rejectFeedbackSeconds: 0.15,
    /**
     * Vision comms must be down this long to be a fault. A controller does not
     * fault on one scan of a comms bit, and a real endpoint takes a moment to
     * complete its connection handshake.
     */
    visionOfflineSeconds: 1.5,
    /** PE101 blocked this long with the belt running means a jam. */
    jamDetectSeconds: 5,
  },

  operatorCamera: {
    position: [3.6, 2.2, 3.0] as const,
    target: [2.4, 0.95, 0] as const,
    fov: 50,
    near: 0.05,
    far: 100,
  },

  inspectionCamera: {
    /**
     * Near side-on view: cap presence, label position and fill level are all
     * measurable from this pose. Everything in the camera bracket sits behind
     * this Z so the housing never occludes the view.
     */
    position: [2.0, 1.12, 0.78] as const,
    target: [2.0, 0.96, 0] as const,
    fov: 34,
    near: 0.05,
    far: 20,
    renderWidth: 512,
    renderHeight: 512,
    /** Matches the captureStream rate handed to Roboflow. */
    fps: 20,
  },
} as const;

function readRuntimeMode(): RuntimeMode {
  const raw = import.meta.env?.VITE_RUNTIME_MODE;
  const allowed: readonly RuntimeMode[] = [
    'SIMULATION_ONLY',
    'MOCK_VISION',
    'ROBOFLOW',
    'DATASET_GENERATION',
  ];
  // Mock vision is the default so a fresh clone runs the full inspection loop
  // with no configuration (spec §48).
  return allowed.includes(raw as RuntimeMode) ? (raw as RuntimeMode) : 'MOCK_VISION';
}

export const defaultRuntimeMode: RuntimeMode = readRuntimeMode();

export const debugLogging: boolean = import.meta.env?.VITE_DEBUG_LOGGING === 'true';
