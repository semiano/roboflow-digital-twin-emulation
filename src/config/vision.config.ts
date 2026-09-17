import type { DefectType } from '@/models/DefectType';

export type FailSafeMode = 'REJECT_UNKNOWN' | 'ALLOW_UNKNOWN' | 'STOP_LINE';

export type LatencyMode = 25 | 50 | 100 | 250 | 500 | 1500 | 'RANDOM';

/** 1500 ms deliberately exceeds `timeoutMs` so the fail-safe is reachable from the HMI. */
export const LATENCY_MODES: readonly LatencyMode[] = [25, 50, 100, 250, 500, 1500, 'RANDOM'];

/**
 * Where inference runs. The request body is identical for all of them — only
 * the base URL changes — which is exactly the portability Roboflow's deployment
 * story is built on, so the HMI exposes it as a live selector.
 *
 * `PROXY` is the default and the only cloud route that works from a browser:
 * Roboflow's cloud endpoints return no `Access-Control-Allow-Origin`, so a
 * direct `fetch` is blocked whatever headers it sends (measured, see TODO.md
 * §6). Proxying also keeps the API key server-side where it belongs.
 */
export type RoboflowRuntime = 'PROXY' | 'SERVERLESS' | 'DEDICATED' | 'LOCAL';

/** Which Roboflow endpoint shape is called. */
export type RoboflowTransportId = 'WORKFLOW' | 'MODEL';

export const ROBOFLOW_RUNTIMES: readonly RoboflowRuntime[] = [
  'PROXY',
  'LOCAL',
  'DEDICATED',
  'SERVERLESS',
];
export const ROBOFLOW_TRANSPORTS: readonly RoboflowTransportId[] = ['WORKFLOW', 'MODEL'];

const env = import.meta.env;

export const visionConfig = {
  /** PLC gives up on an inference after this long (spec §43). */
  timeoutMs: 1000,
  failSafeMode: 'REJECT_UNKNOWN' as FailSafeMode,

  /** Detections below this are not considered evidence of a defect. */
  minimumDetectionConfidence: 0.5,
  /** Whole-unit decisions below this are reported as UNKNOWN. */
  unknownConfidenceThreshold: 0.35,

  roboflow: {
    apiKey: env?.VITE_ROBOFLOW_API_KEY ?? '',
    workspace: env?.VITE_ROBOFLOW_WORKSPACE ?? '',
    workflowId: env?.VITE_ROBOFLOW_WORKFLOW_ID ?? '',
    /** `project/version`, used by the model transport. */
    modelId: env?.VITE_ROBOFLOW_MODEL_ID ?? '',

    runtime: (env?.VITE_ROBOFLOW_RUNTIME ?? 'PROXY') as RoboflowRuntime,
    transport: (env?.VITE_ROBOFLOW_TRANSPORT ?? 'WORKFLOW') as RoboflowTransportId,

    endpoints: {
      /** Same-origin; the dev server forwards it and attaches the key. */
      PROXY: '/rf-infer',
      SERVERLESS: 'https://serverless.roboflow.com',
      DEDICATED: env?.VITE_ROBOFLOW_DEDICATED_URL ?? '',
      LOCAL: env?.VITE_ROBOFLOW_INFERENCE_URL ?? 'http://localhost:9001',
    } as Readonly<Record<RoboflowRuntime, string>>,

    /** Runtimes where the proxy owns authentication, so the browser sends none. */
    proxiedRuntimes: ['PROXY'] as readonly RoboflowRuntime[],

    /**
     * `header` sends `Authorization: Bearer` and keeps the key out of URLs and
     * logs. It costs a CORS preflight; `query` is the legacy `?api_key=`
     * channel kept as an escape hatch for servers that reject the preflight.
     */
    apiKeyTransport: (env?.VITE_ROBOFLOW_API_KEY_TRANSPORT ?? 'header') as 'header' | 'query',

    /** Name of the image input declared in the Workflow. */
    workflowImageInput: env?.VITE_ROBOFLOW_WORKFLOW_IMAGE_INPUT ?? 'image',

    /**
     * Must stay under `timeoutMs` so the request aborts before the PLC declares
     * the inspection lost — otherwise a late response arrives with no pending
     * inspection to match and looks like a tracking error.
     */
    requestTimeoutMs: 850,
    /**
     * The connect-time reachability check is not on the PLC's critical path, so
     * it gets its own budget. Reusing `requestTimeoutMs` made a cold TLS
     * handshake to the cloud report the link as offline (measured).
     */
    probeTimeoutMs: 5000,
    /** Retries share the same deadline; an attempt is skipped if this much budget is gone. */
    minimumAttemptBudgetMs: 250,
    maxRetries: 1,
    retryBackoffMs: 80,

    /** JPEG quality for the frame posted to Roboflow. 0.85 measured at ~10 KB. */
    frameQuality: 0.85,

    /** Consecutive failures before the provider reports itself offline (comms watchdog). */
    failuresBeforeOffline: 3,
    /**
     * A backgrounded tab throttles rAF to zero, which freezes CAM01. Inferring on
     * a frozen frame would silently inspect the wrong unit. One repeat is
     * tolerated — at 20 fps a frame lasts 50 ms, so two units can legitimately
     * land on the same one — but this many consecutive repeats is a camera fault.
     */
    staleFrameInspections: 2,
  },

  /**
   * Spec §33. Frames the model was least sure about are the ones worth
   * labelling, so they go back to Roboflow for retraining. Confidence is the
   * only trigger available here by design — an escape is only knowable from
   * ground truth, which this layer must never see (C1). Phase 8 adds the
   * truth-aware triggers from the evaluation side.
   */
  activeLearning: {
    enabled: env?.VITE_ROBOFLOW_ACTIVE_LEARNING === 'true',
    /** Roboflow project slug to upload into. Defaults to the inference project. */
    project: env?.VITE_ROBOFLOW_DATASET_PROJECT ?? '',
    /** Same-origin proxy to api.roboflow.com, for the same CORS reason. */
    proxyApiUrl: '/rf-api',
    directApiUrl: 'https://api.roboflow.com',
    /** Frames below this confidence are candidates. */
    confidenceCeiling: 0.75,
    split: 'train' as 'train' | 'valid' | 'test',
    batchName: 'virtual-vision-cell',
    /** Hard stop so a long soak cannot flood a dataset or burn credits. */
    maxUploadsPerSession: 25,
    /** Minimum simulated seconds between automatic uploads. */
    minimumIntervalSeconds: 5,
  },
} as const;


export const mockVisionConfig = {
  /** Probability the mock names the right defect, given it made the right call. */
  accuracy: 0.96,
  latencyMode: 50 as LatencyMode,
  randomLatencyRangeMs: [20, 400] as const,
  falsePositiveProbability: 0.02,
  falseNegativeProbability: 0.03,
  /** Confidence sampled from these ranges depending on correctness. */
  confidentRange: [0.88, 0.995] as const,
  uncertainRange: [0.45, 0.8] as const,
  /** Reported when the camera is looking at an empty belt. */
  emptyFrameConfidence: 0.2,
};

/**
 * Synthetic boxes in 512x512 camera pixels, centre origin. They exist so the
 * Phase 6 detection overlay can be built and demoed against mock output.
 */
export const mockDetectionBoxes = {
  bottle: { x: 256, y: 300, width: 150, height: 330 },
  cap: { x: 256, y: 132, width: 74, height: 64 },
  label: { x: 256, y: 362, width: 152, height: 108 },
  fill: { x: 256, y: 252, width: 138, height: 124 },
} as const;

/** Which region of the bottle each defect class is evidenced by. */
export const defectDetectionRegion: Readonly<Record<DefectType, keyof typeof mockDetectionBoxes>> =
  {
    NONE: 'bottle',
    MISSING_CAP: 'cap',
    MISSING_LABEL: 'label',
    CROOKED_LABEL: 'label',
    WRONG_LABEL: 'label',
    UNDERFILL: 'fill',
  };

/** Internal defect code -> Roboflow class name (the inverse of roboflowClassMap). */
export const defectClassNames: Readonly<Record<DefectType, string>> = {
  NONE: 'bottle',
  MISSING_CAP: 'missing_cap',
  MISSING_LABEL: 'missing_label',
  CROOKED_LABEL: 'crooked_label',
  WRONG_LABEL: 'wrong_label',
  UNDERFILL: 'underfill',
};

/**
 * Roboflow class name -> internal defect code. Anything unmapped is ignored by
 * PredictionMapper rather than crashing the line.
 */
export const roboflowClassMap: Readonly<Record<string, DefectType>> = {
  bottle: 'NONE',
  good: 'NONE',
  missing_cap: 'MISSING_CAP',
  'missing-cap': 'MISSING_CAP',
  missing_label: 'MISSING_LABEL',
  'missing-label': 'MISSING_LABEL',
  crooked_label: 'CROOKED_LABEL',
  'crooked-label': 'CROOKED_LABEL',
  wrong_label: 'WRONG_LABEL',
  'wrong-label': 'WRONG_LABEL',
  underfill: 'UNDERFILL',
};

/** Highest severity wins when several defects are detected on one unit. */
export const defectSeverityOrder: readonly DefectType[] = [
  'MISSING_CAP',
  'MISSING_LABEL',
  'UNDERFILL',
  'WRONG_LABEL',
  'CROOKED_LABEL',
  'NONE',
];

export const reviewPolicy = {
  lowConfidenceThreshold: 0.75,
  automaticallyQueueFalsePredictions: true,
};
