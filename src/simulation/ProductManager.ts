import type { EventBus } from '@/core/EventBus';
import type { DefectType } from '@/models/DefectType';
import type { Product } from '@/models/Product';
import type { ConveyorSystem } from './ConveyorSystem';
import type { ProductFactory } from './ProductFactory';

/**
 * Owns the population of products on the line and their belt ordering.
 * Products are kept sorted furthest-travelled first so spacing and sensor
 * checks are single-pass.
 */
export class ProductManager {
  private products: Product[] = [];
  private autoSpawnEnabled = false;
  private spawnAccumulatorSeconds = 0;

  /** Notified when a unit leaves the line, so downstream layers can finalise it. */
  onProductExited?: (product: Product) => void;

  constructor(
    private readonly factory: ProductFactory,
    private readonly conveyor: ConveyorSystem,
    private readonly events: EventBus,
  ) {}

  getProducts(): readonly Product[] {
    return this.products;
  }

  find(unitId: string): Product | undefined {
    return this.products.find((product) => product.unitId === unitId);
  }

  get count(): number {
    return this.products.length;
  }

  setAutoSpawn(enabled: boolean): void {
    this.autoSpawnEnabled = enabled;
    if (!enabled) this.spawnAccumulatorSeconds = 0;
  }

  get autoSpawn(): boolean {
    return this.autoSpawnEnabled;
  }

  update(deltaSeconds: number, simulationTime: number): void {
    this.conveyor.advanceProducts(this.products, deltaSeconds);
    this.despawnExited();
    if (this.autoSpawnEnabled) this.updateAutoSpawn(deltaSeconds, simulationTime);
  }

  spawnGood(simulationTime: number): Product | undefined {
    return this.admit(this.factory.spawnGoodProduct(simulationTime), simulationTime);
  }

  spawnWithDefect(defect: DefectType, simulationTime: number): Product | undefined {
    return this.admit(this.factory.spawnProductWithDefect(defect, simulationTime), simulationTime);
  }

  spawnRandom(simulationTime: number): Product | undefined {
    return this.admit(this.factory.spawnRandomProduct(simulationTime), simulationTime);
  }

  spawnRandomDefect(simulationTime: number): Product | undefined {
    return this.admit(this.factory.spawnRandomDefect(simulationTime), simulationTime);
  }

  clear(): void {
    this.products = [];
    this.spawnAccumulatorSeconds = 0;
  }

  private updateAutoSpawn(deltaSeconds: number, simulationTime: number): void {
    const unitsPerMinute = this.factory.getRecipe().unitsPerMinute;
    if (unitsPerMinute <= 0 || !this.conveyor.running) return;

    this.spawnAccumulatorSeconds += deltaSeconds;
    const intervalSeconds = 60 / unitsPerMinute;

    while (this.spawnAccumulatorSeconds >= intervalSeconds) {
      this.spawnAccumulatorSeconds -= intervalSeconds;
      if (!this.spawnRandom(simulationTime)) {
        // Infeed is blocked; hold the slot rather than stacking units.
        this.spawnAccumulatorSeconds = 0;
        break;
      }
    }
  }

  /** Rejects the spawn if the infeed is occupied, mirroring a real accumulation gate. */
  private admit(product: Product, simulationTime: number): Product | undefined {
    const tail = this.products[this.products.length - 1];
    if (tail && tail.positionMeters < this.conveyor.config.minimumSpacingMeters) return undefined;

    this.products.push(product);
    this.events.emit({
      type: 'PRODUCT_CREATED',
      simulationTime,
      unitId: product.unitId,
      sku: product.sku,
    });
    return product;
  }

  private despawnExited(): void {
    if (this.products.length === 0) return;

    const remaining: Product[] = [];
    for (const product of this.products) {
      // 'REJECTED' is set by the diverter once the unit has reached the bin.
      if (product.state === 'REJECTED') {
        this.onProductExited?.(product);
        continue;
      }
      if (this.conveyor.hasExited(product)) {
        product.state = 'EXITED';
        this.onProductExited?.(product);
        continue;
      }
      remaining.push(product);
    }
    this.products = remaining;
  }
}
