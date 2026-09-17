import type { DefectType } from '@/models/DefectType';

export interface ConveyorConfig {
  lengthMeters: number;
  speedMetersPerSecond: number;

  inspectionPositionMeters: number;
  rejectPositionMeters: number;
  exitPositionMeters: number;

  /** Enforced minimum gap between unit centres. */
  minimumSpacingMeters: number;

  widthMeters: number;
  surfaceHeightMeters: number;
}

export interface SensorConfig {
  id: string;
  label: string;
  positionMeters: number;
  /** Beam width; a unit within +/- half this distance blocks the beam. */
  apertureMeters: number;
}

export interface RejectStationConfig {
  extendSeconds: number;
  dwellSeconds: number;
  retractSeconds: number;
  /** Lateral travel applied to a diverted unit. */
  strokeMeters: number;
  binCenterLateralMeters: number;
  /** A unit within +/- this distance of the reject point is in the pusher's path. */
  pusherHalfWidthMeters: number;
  /** Speed at which a unit knocked clear of the belt slides into the bin. */
  slideSpeedMetersPerSecond: number;
}

export interface ProductionRecipe {
  sku: string;
  unitsPerMinute: number;
  defectProbability: number;
  defectDistribution: Record<Exclude<DefectType, 'NONE'>, number>;
}

export const LINE_ID = 'LINE-01';
export const LINE_NAME = 'LINE 01 - VISION INSPECTION';

export const conveyorConfig: ConveyorConfig = {
  lengthMeters: 5.0,
  speedMetersPerSecond: 0.35,

  inspectionPositionMeters: 2.0,
  rejectPositionMeters: 3.5,
  exitPositionMeters: 4.8,

  minimumSpacingMeters: 0.22,

  widthMeters: 0.4,
  surfaceHeightMeters: 0.85,
};

export const sensorConfigs: readonly SensorConfig[] = [
  { id: 'PE100', label: 'Entry', positionMeters: 0.45, apertureMeters: 0.07 },
  {
    id: 'PE101',
    label: 'Inspection',
    positionMeters: conveyorConfig.inspectionPositionMeters,
    apertureMeters: 0.07,
  },
  {
    id: 'PE102',
    label: 'Reject',
    positionMeters: conveyorConfig.rejectPositionMeters,
    apertureMeters: 0.07,
  },
  {
    id: 'PE103',
    label: 'Exit',
    positionMeters: conveyorConfig.exitPositionMeters,
    apertureMeters: 0.07,
  },
];

export const rejectStationConfig: RejectStationConfig = {
  // Fast pneumatic cylinder. The pusher must finish its stroke and start
  // retracting before the next unit reaches its path, or it would clip a good
  // unit travelling directly behind a rejected one.
  extendSeconds: 0.08,
  dwellSeconds: 0.05,
  retractSeconds: 0.12,
  strokeMeters: 0.55,
  binCenterLateralMeters: 0.75,
  pusherHalfWidthMeters: 0.09,
  slideSpeedMetersPerSecond: 0.8,
};

export const defaultRecipe: ProductionRecipe = {
  sku: 'BOTTLE-500ML',
  unitsPerMinute: 42,
  defectProbability: 0.3,
  defectDistribution: {
    MISSING_CAP: 0.3,
    MISSING_LABEL: 0.2,
    CROOKED_LABEL: 0.2,
    WRONG_LABEL: 0.15,
    UNDERFILL: 0.15,
  },
};

/** Nominal product geometry, in metres. Shared by the mesh builder and annotation projection. */
export const productGeometry = {
  bodyHeight: 0.16,
  bodyRadius: 0.035,
  neckHeight: 0.035,
  neckRadius: 0.014,
  capHeight: 0.018,
  capRadius: 0.018,
  /**
   * The label sits low on the body so the liquid surface stays visible above it
   * at every fill level in `underfillRange` — otherwise UNDERFILL would be
   * occluded and undetectable by the camera.
   */
  labelHeight: 0.06,
  labelCenterHeight: 0.05,
  nominalFillLevel: 0.95,
  underfillRange: [0.55, 0.75] as const,
  crookedLabelRangeDegrees: [8, 25] as const,
} as const;
