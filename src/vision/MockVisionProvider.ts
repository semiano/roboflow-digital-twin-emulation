import {
  defectClassNames,
  defectDetectionRegion,
  mockDetectionBoxes,
  mockVisionConfig,
  type LatencyMode,
} from '@/config/vision.config';
import { DEFECT_TYPES, type DefectType, type InspectionResult } from '@/models/DefectType';
import type { Rng } from '@/utils/rng';
import type { VisionProvider } from './VisionProvider';
import type { VisionDetection, VisionInput, VisionPrediction } from './VisionTypes';

/**
 * What the camera can actually see right now: the defect present on the unit in
 * frame, or `undefined` for an empty belt.
 *
 * This is the mock's *entire* privileged channel, and spec §48 explicitly
 * permits it. Note what it is not: the mock cannot query an arbitrary unit, and
 * it never learns a unit id, so it cannot correlate anything it is not looking
 * at. The oracle is supplied by the simulation layer, which is where truth
 * legitimately lives — MockVisionProvider does not import GroundTruthManager.
 */
export type FrameOracle = () => DefectType | undefined;

export interface MockVisionSettings {
  accuracy: number;
  latencyMode: LatencyMode;
  falsePositiveProbability: number;
  falseNegativeProbability: number;
}

const DEFECTIVE_TYPES = DEFECT_TYPES.filter((defect) => defect !== 'NONE');

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Spec §48. A model that is wrong in the ways real models are wrong.
 *
 * The three error knobs are deliberately non-overlapping so the Phase 7
 * confusion matrix stays interpretable:
 *  - `falsePositiveProbability` — a good unit called FAIL  (a false reject)
 *  - `falseNegativeProbability` — a bad unit called PASS   (an escape)
 *  - `accuracy` — given the FAIL call was right, whether the *class* is right
 */
export class MockVisionProvider implements VisionProvider {
  readonly name = 'MOCK';

  private connected = false;
  private settings: MockVisionSettings = {
    accuracy: mockVisionConfig.accuracy,
    latencyMode: mockVisionConfig.latencyMode,
    falsePositiveProbability: mockVisionConfig.falsePositiveProbability,
    falseNegativeProbability: mockVisionConfig.falseNegativeProbability,
  };

  constructor(
    private readonly rng: Rng,
    private readonly oracle: FrameOracle,
  ) {}

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getSettings(): MockVisionSettings {
    return { ...this.settings };
  }

  configure(settings: Partial<MockVisionSettings>): void {
    this.settings = {
      accuracy: clamp01(settings.accuracy ?? this.settings.accuracy),
      latencyMode: settings.latencyMode ?? this.settings.latencyMode,
      falsePositiveProbability: clamp01(
        settings.falsePositiveProbability ?? this.settings.falsePositiveProbability,
      ),
      falseNegativeProbability: clamp01(
        settings.falseNegativeProbability ?? this.settings.falseNegativeProbability,
      ),
    };
  }

  async inspect(input: VisionInput): Promise<VisionPrediction> {
    if (!this.connected) throw new Error('mock vision provider is disconnected');

    const latencyMs = this.sampleLatencyMs();
    const truth = this.oracle();

    if (truth === undefined) {
      return {
        timestamp: input.capturedAtSeconds,
        detections: [],
        inspectionResult: 'UNKNOWN',
        confidence: mockVisionConfig.emptyFrameConfidence,
        inferenceLatencyMs: latencyMs,
        sourceWidth: input.width,
        sourceHeight: input.height,
      };
    }

    const { reported, result, confident } = this.decide(truth);
    const [low, high] = confident
      ? mockVisionConfig.confidentRange
      : mockVisionConfig.uncertainRange;
    const confidence = this.rng.range(low, high);

    return {
      timestamp: input.capturedAtSeconds,
      detections: this.buildDetections(reported, confidence),
      inspectionResult: result,
      ...(reported === 'NONE' ? {} : { defectCode: reported }),
      confidence,
      inferenceLatencyMs: latencyMs,
      // Boxes are authored in camera pixels, so the overlay scales identically
      // for mock and for Roboflow output.
      sourceWidth: input.width,
      sourceHeight: input.height,
    };
  }

  private decide(truth: DefectType): {
    reported: DefectType;
    result: InspectionResult;
    confident: boolean;
  } {
    if (truth === 'NONE') {
      if (this.rng.bool(this.settings.falsePositiveProbability)) {
        return { reported: this.rng.pick(DEFECTIVE_TYPES), result: 'FAIL', confident: false };
      }
      return { reported: 'NONE', result: 'PASS', confident: true };
    }

    if (this.rng.bool(this.settings.falseNegativeProbability)) {
      return { reported: 'NONE', result: 'PASS', confident: false };
    }

    if (this.rng.bool(this.settings.accuracy)) {
      return { reported: truth, result: 'FAIL', confident: true };
    }

    // Right call, wrong class: still a reject, but the Pareto chart will be off.
    const alternatives = DEFECTIVE_TYPES.filter((defect) => defect !== truth);
    return { reported: this.rng.pick(alternatives), result: 'FAIL', confident: false };
  }

  private buildDetections(reported: DefectType, confidence: number): VisionDetection[] {
    const bottle: VisionDetection = {
      className: defectClassNames.NONE,
      confidence: this.rng.range(...mockVisionConfig.confidentRange),
      ...mockDetectionBoxes.bottle,
    };

    if (reported === 'NONE') return [bottle];

    return [
      bottle,
      {
        className: defectClassNames[reported],
        confidence,
        ...mockDetectionBoxes[defectDetectionRegion[reported]],
      },
    ];
  }

  private sampleLatencyMs(): number {
    const mode = this.settings.latencyMode;
    if (mode !== 'RANDOM') return mode;
    return Math.round(this.rng.range(...mockVisionConfig.randomLatencyRangeMs));
  }
}
