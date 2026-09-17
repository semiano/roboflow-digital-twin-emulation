/**
 * Wire types for the Roboflow HTTP surface, plus tolerant readers for them.
 *
 * Roboflow serializes a detection the same way whether it came from the model
 * endpoint or from a Workflow block, but *where* that payload sits in the
 * response differs — the model endpoint puts it at the root, a Workflow buries
 * it under a step output whose name the user chose in the editor. Rather than
 * making the operator configure output names, the readers below locate payloads
 * by shape. A Workflow can be rebuilt in the Roboflow editor without touching
 * this app.
 */

export interface RoboflowDetection {
  class: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
  class_id?: number;
  detection_id?: string;
}

export interface RoboflowImageMeta {
  width: number;
  height: number;
}

/** Normalized result, whichever endpoint produced it. */
export interface RoboflowInferenceResult {
  detections: readonly RoboflowDetection[];
  image: RoboflowImageMeta | undefined;
  /** A Workflow visualization block's rendered frame, base64 JPEG/PNG without a data URI prefix. */
  visualizationBase64: string | undefined;
  /** Server-side model time in milliseconds, when reported. */
  serverTimeMs: number | undefined;
  inferenceId: string | undefined;
  /** Step output names the Workflow returned, surfaced in the HMI. */
  outputNames: readonly string[];
}

type Json = unknown;

const isRecord = (value: Json): value is Record<string, Json> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isDetection = (value: Json): value is RoboflowDetection =>
  isRecord(value) &&
  typeof value['class'] === 'string' &&
  typeof value['confidence'] === 'number' &&
  typeof value['x'] === 'number' &&
  typeof value['y'] === 'number' &&
  typeof value['width'] === 'number' &&
  typeof value['height'] === 'number';

const readDetectionArray = (value: Json): RoboflowDetection[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  // An empty array is a legitimate "nothing detected", so it must not be skipped.
  if (value.length > 0 && !value.every(isDetection)) return undefined;
  return value as RoboflowDetection[];
};

const readImageMeta = (value: Json): RoboflowImageMeta | undefined => {
  if (!isRecord(value)) return undefined;
  const { width, height } = value;
  if (typeof width !== 'number' || typeof height !== 'number') return undefined;
  return { width, height };
};

/**
 * Base64 image, either as a bare string or as Roboflow's `{type, value}` form.
 * A data URI prefix is stripped so callers can build their own.
 */
const readBase64Image = (value: Json): string | undefined => {
  const raw =
    typeof value === 'string'
      ? value
      : isRecord(value) && value['type'] === 'base64' && typeof value['value'] === 'string'
        ? value['value']
        : undefined;

  if (raw === undefined) return undefined;
  // Long enough to be an image rather than an id or a label.
  if (raw.length < 256) return undefined;
  return raw.replace(/^data:image\/[a-z+]+;base64,/, '');
};

/** Model endpoint: `POST {base}/{project}/{version}`. */
export function parseModelResponse(body: Json): RoboflowInferenceResult {
  const root = isRecord(body) ? body : {};
  const detections = readDetectionArray(root['predictions']) ?? [];
  const time = root['time'];

  return {
    detections,
    image: readImageMeta(root['image']),
    visualizationBase64: undefined,
    serverTimeMs: typeof time === 'number' ? time * 1000 : undefined,
    inferenceId: typeof root['inference_id'] === 'string' ? root['inference_id'] : undefined,
    outputNames: ['predictions'],
  };
}

/**
 * Workflow endpoint: `POST {base}/infer/workflows/{workspace}/{workflowId}`.
 *
 * `outputs` is one entry per input image; we send one frame, so entry zero is
 * the only one. Within it, every step output is inspected: the first detection
 * payload wins, and the first sufficiently large base64 image is taken as the
 * visualization.
 */
export function parseWorkflowResponse(body: Json): RoboflowInferenceResult {
  const root = isRecord(body) ? body : {};
  const outputs = root['outputs'];
  const first = Array.isArray(outputs) ? outputs[0] : outputs;
  const step = isRecord(first) ? first : {};

  let detections: RoboflowDetection[] | undefined;
  let image: RoboflowImageMeta | undefined;
  let visualizationBase64: string | undefined;

  for (const value of Object.values(step)) {
    if (!detections) {
      // Detections serialize either as a bare array or wrapped with image metadata.
      const direct = readDetectionArray(value);
      if (direct) {
        detections = direct;
      } else if (isRecord(value)) {
        const nested = readDetectionArray(value['predictions']);
        if (nested) {
          detections = nested;
          image ??= readImageMeta(value['image']);
        }
      }
    }
    visualizationBase64 ??= readBase64Image(value);
  }

  return {
    detections: detections ?? [],
    image,
    visualizationBase64,
    serverTimeMs: undefined,
    inferenceId: typeof root['inference_id'] === 'string' ? root['inference_id'] : undefined,
    outputNames: Object.keys(step),
  };
}
