import { defaultRecipe, productGeometry, type ProductionRecipe } from '@/config/line.config';
import type { DefectType } from '@/models/DefectType';
import type { ProductGroundTruth } from '@/models/GroundTruth';
import type { Product } from '@/models/Product';
import { nextUnitId } from '@/utils/ids';
import type { Rng } from '@/utils/rng';
import type { GroundTruthManager } from './GroundTruthManager';

export const NOMINAL_LABEL_VARIANT = 'LBL-500ML-A';
const ALTERNATE_LABEL_VARIANTS = ['LBL-750ML-B', 'LBL-330ML-C', 'LBL-500ML-LEGACY'] as const;

const DEFECT_KEYS: readonly Exclude<DefectType, 'NONE'>[] = [
  'MISSING_CAP',
  'MISSING_LABEL',
  'CROOKED_LABEL',
  'WRONG_LABEL',
  'UNDERFILL',
];

/**
 * Builds product records and their private ground truth. Produces data only —
 * meshes are built separately so the engine can run headless in tests.
 */
export class ProductFactory {
  constructor(
    private readonly groundTruth: GroundTruthManager,
    private readonly rng: Rng,
    private recipe: ProductionRecipe = defaultRecipe,
  ) {}

  setRecipe(recipe: ProductionRecipe): void {
    this.recipe = recipe;
  }

  getRecipe(): ProductionRecipe {
    return this.recipe;
  }

  spawnGoodProduct(simulationTime: number): Product {
    return this.create('NONE', simulationTime);
  }

  spawnProductWithDefect(defect: DefectType, simulationTime: number): Product {
    return this.create(defect, simulationTime);
  }

  spawnRandomProduct(simulationTime: number): Product {
    const defect = this.rng.bool(this.recipe.defectProbability)
      ? this.rng.weighted(this.recipe.defectDistribution)
      : 'NONE';
    return this.create(defect, simulationTime);
  }

  spawnRandomDefect(simulationTime: number): Product {
    return this.create(this.rng.pick(DEFECT_KEYS), simulationTime);
  }

  private create(defect: DefectType, simulationTime: number): Product {
    const unitId = nextUnitId();
    this.groundTruth.register(unitId, this.buildGroundTruth(defect));

    return {
      unitId,
      sku: this.recipe.sku,
      positionMeters: 0,
      velocityMetersPerSecond: 0,
      lateralOffsetMeters: 0,
      createdAt: simulationTime,
      state: 'TRANSPORT',
      rejected: false,
    };
  }

  private buildGroundTruth(defectType: DefectType): ProductGroundTruth {
    const [crookedMin, crookedMax] = productGeometry.crookedLabelRangeDegrees;
    const [underfillMin, underfillMax] = productGeometry.underfillRange;

    // Good units still vary slightly so the model never sees a perfect constant.
    const truth: ProductGroundTruth = {
      defectType,
      capPresent: true,
      labelPresent: true,
      labelRotationDegrees: this.rng.range(-2.5, 2.5),
      labelVariant: NOMINAL_LABEL_VARIANT,
      fillLevel: this.rng.range(
        productGeometry.nominalFillLevel - 0.03,
        productGeometry.nominalFillLevel + 0.03,
      ),
      expectedResult: defectType === 'NONE' ? 'PASS' : 'FAIL',
    };

    switch (defectType) {
      case 'MISSING_CAP':
        truth.capPresent = false;
        break;
      case 'MISSING_LABEL':
        truth.labelPresent = false;
        break;
      case 'CROOKED_LABEL':
        truth.labelRotationDegrees =
          this.rng.range(crookedMin, crookedMax) * (this.rng.bool(0.5) ? 1 : -1);
        break;
      case 'WRONG_LABEL':
        truth.labelVariant = this.rng.pick(ALTERNATE_LABEL_VARIANTS);
        break;
      case 'UNDERFILL':
        truth.fillLevel = this.rng.range(underfillMin, underfillMax);
        break;
      case 'NONE':
        break;
    }

    return truth;
  }
}
