import { conveyorConfig } from '@/config/line.config';
import {
  simulationConfig,
  type RuntimeMode,
  type SimulationSpeed,
} from '@/config/simulation.config';
import type {
  FailSafeMode,
  RoboflowRuntime,
  RoboflowTransportId,
} from '@/config/vision.config';
import type { PlcInputImage, PlcOutputImage } from '@/controls/PlcIo';
import { VirtualPLC } from '@/controls/VirtualPLC';
import { EventBus } from '@/core/EventBus';
import type { SystemEvent } from '@/core/events';
import { logger } from '@/core/Logger';
import { DatasetGenerator } from '@/dataset/DatasetGenerator';
import type { DatasetGenerationProgress, DatasetRenderRequest, DatasetRenderResult, DatasetSample } from '@/dataset/DatasetTypes';
import { EvaluationService, type ProductionAction } from '@/historian/EvaluationService';
import { MetricsEngine } from '@/historian/MetricsEngine';
import type { DefectType } from '@/models/DefectType';
import type { ProductGroundTruth } from '@/models/GroundTruth';
import type { Product } from '@/models/Product';
import { createRng } from '@/utils/rng';
import { MockVisionProvider, type MockVisionSettings } from '@/vision/MockVisionProvider';
import { ProviderVisionGateway } from '@/vision/ProviderVisionGateway';
import { RoboflowProvider } from '@/vision/roboflow/RoboflowProvider';
import type { VisionProvider } from '@/vision/VisionProvider';
import type { VisionGateway } from '@/vision/VisionGateway';
import type { VisionInput } from '@/vision/VisionTypes';
import { ConveyorSystem } from './ConveyorSystem';
import { GroundTruthManager } from './GroundTruthManager';
import { ProductFactory } from './ProductFactory';
import { ProductManager } from './ProductManager';
import { RejectStation } from './RejectStation';
import { SensorManager } from './SensorManager';
import type { SimulationSnapshot, VisionOverlaySnapshot } from './SimulationSnapshot';
import { SimulationClock } from './SimulationClock';

const EVENT_LOG_CAPACITY = 200;

/**
 * Optional rendering attachment. The engine runs fully headless without one,
 * which is what lets the control logic be tested in CI with no GPU.
 */
export interface SceneBridge {
  syncProducts(
    products: readonly Product[],
    groundTruthOf: (unitId: string) => ProductGroundTruth | undefined,
  ): void;
  setRealDelta?(seconds: number): void;
  setRejectStroke?(fraction: number): void;
  setStackLight?(state: PlcOutputImage['stackLight']): void;
  setCameraOnline?(online: boolean): void;
  /** Hands the vision layer a live pixel handle on CAM01 (plan.md C2). */
  captureVisionFrame?(capturedAtSeconds: number): VisionInput;
  captureDatasetSample?(request: DatasetRenderRequest): Promise<DatasetRenderResult>;
  render(): void;
  dispose(): void;
}

export interface SimulationEngineOptions {
  seed?: number;
  scene?: SceneBridge;
  visionTimeoutMs?: number;
}

/** Orchestrates the fixed-step tick. Subsystem update order is deterministic. */
export class SimulationEngine {
  readonly clock = new SimulationClock();
  readonly events = new EventBus();
  readonly conveyor: ConveyorSystem;
  readonly groundTruth = new GroundTruthManager();
  readonly productFactory: ProductFactory;
  readonly products: ProductManager;
  readonly sensors: SensorManager;
  readonly rejectStation = new RejectStation();
  readonly plc: VirtualPLC;
  readonly evaluation = new EvaluationService();
  readonly metrics = new MetricsEngine();

  private scene: SceneBridge | undefined;
  private totalSpawned = 0;
  private totalExited = 0;
  private snapshotAccumulator = 0;
  private snapshot: SimulationSnapshot;
  private cameraOnline = true;
  private outputs: PlcOutputImage;

  private readonly visionRng: ReturnType<typeof createRng>;
  private runtimeMode: RuntimeMode = 'SIMULATION_ONLY';
  private visionProvider: VisionProvider | undefined;
  private mockVision: MockVisionProvider | undefined;
  private roboflow: RoboflowProvider | undefined;
  private visionGateway: ProviderVisionGateway | undefined;
  private readonly eventLog: SystemEvent[] = [];

  onSnapshot?: (snapshot: SimulationSnapshot) => void;

  constructor(options: SimulationEngineOptions = {}) {
    const seed = options.seed ?? simulationConfig.defaultSeed;
    const rng = createRng(seed);
    // A separate stream so vision sampling cannot perturb defect distribution.
    this.visionRng = createRng(seed + 1);

    this.conveyor = new ConveyorSystem(conveyorConfig);
    this.productFactory = new ProductFactory(this.groundTruth, rng);
    this.products = new ProductManager(this.productFactory, this.conveyor, this.events);
    this.sensors = new SensorManager(undefined, undefined, this.events);
    this.plc = new VirtualPLC(
      this.events,
      options.visionTimeoutMs === undefined ? {} : { visionTimeoutMs: options.visionTimeoutMs },
    );
    this.scene = options.scene;

    this.outputs = {
      runConveyor: false,
      rejectCommand: false,
      lineSpeedSetpoint: conveyorConfig.speedMetersPerSecond,
      stackLight: 'OFF',
    };

    this.products.onProductExited = (product) => {
      this.totalExited += 1;
      this.groundTruth.forget(product.unitId);
      this.plc.rejectQueue.remove(product.unitId);
    };

    this.events.on('PRODUCT_CREATED', () => {
      this.totalSpawned += 1;
    });

    this.events.on('VISION_COMPLETED', (event) => this.evaluation.recordVision(event));
    this.events.on('VISION_FAILED', (event) => this.evaluation.recordVisionFailure(event.unitId));
    this.events.on('PRODUCT_REJECTED', (event) => this.recordEvaluation(event.unitId, 'REJECT'));
    this.events.on('PRODUCT_ACCEPTED', (event) => this.recordEvaluation(event.unitId, 'ACCEPT'));

    this.events.onAny((event) => {
      // Photoeye chatter would bury everything else in a 200-entry ring, and
      // the tag monitor already shows sensor state live.
      if (event.type === 'SENSOR_CHANGED') return;
      this.eventLog.push(event);
      if (this.eventLog.length > EVENT_LOG_CAPACITY) this.eventLog.shift();
    });

    this.events.onHandlerError = (event, error) => {
      logger.error('eventbus.handler_error', { type: event.type, error: String(error) });
    };

    this.snapshot = this.buildSnapshot();
  }

  attachScene(scene: SceneBridge): void {
    this.scene = scene;
  }

  /**
   * Low-level port attachment, used by tests to drive the PLC with a scripted
   * gateway. Production code goes through `setRuntimeMode`.
   */
  attachVision(gateway: VisionGateway | undefined): void {
    this.plc.attachVision(gateway);
  }

  /**
   * Spec §47. The mode owns which inference engine, if any, is wired in.
   * A provider that cannot connect leaves the gateway attached but reporting
   * disconnected, so the PLC raises VISION_OFFLINE through its ordinary
   * interlock path instead of the app crashing or silently running blind.
   */
  setRuntimeMode(mode: RuntimeMode): void {
    void this.visionProvider?.disconnect();
    this.visionProvider = undefined;
    this.mockVision = undefined;
    this.roboflow = undefined;
    this.visionGateway = undefined;
    this.plc.attachVision(undefined);

    this.runtimeMode = mode;

    const provider = this.createProvider(mode);
    if (!provider) {
      logger.info('vision.mode_changed', { mode, provider: 'NONE' });
      this.publishSnapshot();
      return;
    }

    this.visionProvider = provider;
    this.visionGateway = new ProviderVisionGateway(provider, (capturedAt) =>
      this.captureVisionInput(capturedAt),
    );
    this.plc.attachVision(this.visionGateway);

    // Connection is asynchronous for a real endpoint. Failure is not fatal:
    // the provider simply stays disconnected and the interlock fires.
    void provider.connect().catch((error: unknown) => {
      logger.error('vision.connect_failed', { mode, error: String(error) });
      this.publishSnapshot();
    });

    logger.info('vision.mode_changed', { mode, provider: provider.name });
    this.publishSnapshot();
  }

  private createProvider(mode: RuntimeMode): VisionProvider | undefined {
    if (mode === 'MOCK_VISION') {
      const provider = new MockVisionProvider(this.visionRng, () => this.defectInFrame());
      this.mockVision = provider;
      return provider;
    }

    if (mode === 'ROBOFLOW') {
      const provider = new RoboflowProvider();
      this.roboflow = provider;
      return provider;
    }

    return undefined;
  }

  getRuntimeMode(): RuntimeMode {
    return this.runtimeMode;
  }

  setRoboflowRuntime(runtime: RoboflowRuntime): void {
    this.roboflow?.setRuntime(runtime);
    this.reconnectRoboflow();
  }

  setRoboflowTransport(transport: RoboflowTransportId): void {
    this.roboflow?.setTransport(transport);
    this.reconnectRoboflow();
  }

  setActiveLearningEnabled(enabled: boolean): void {
    this.roboflow?.uploader.setEnabled(enabled);
    this.publishSnapshot();
  }

  /** Operator action: push the frame currently held by the provider for labelling. */
  uploadLastFrameForReview(): void {
    const provider = this.roboflow;
    const base64 = provider?.getLastFrameBase64();
    if (!provider || !base64) return;

    void provider.uploader
      .upload({
        base64,
        predictedClass: this.plc.tags.visionDefectCode || this.plc.tags.visionResult,
        confidence: this.plc.tags.visionConfidence,
        simulationTime: this.clock.elapsedSeconds,
      })
      .then(() => this.publishSnapshot());
  }

  private reconnectRoboflow(): void {
    const provider = this.roboflow;
    if (!provider) return;

    void provider
      .connect()
      .catch((error: unknown) => logger.error('vision.connect_failed', { error: String(error) }))
      .finally(() => this.publishSnapshot());

    this.publishSnapshot();
  }

  /** Fault injection: pulls the provider offline, which trips VISION_OFFLINE. */
  setVisionConnected(connected: boolean): void {
    const provider = this.visionProvider;
    if (!provider) return;
    void (connected ? provider.connect() : provider.disconnect());
    this.publishSnapshot();
  }

  configureMockVision(settings: Partial<MockVisionSettings>): void {
    this.mockVision?.configure(settings);
    this.publishSnapshot();
  }

  /**
   * The mock's only privileged channel (spec §48): the defect on whatever unit
   * is in front of CAM01 right now. No unit id crosses, so the mock cannot
   * correlate anything it is not looking at.
   */
  private defectInFrame(): DefectType | undefined {
    const unitId = this.sensors.read('PE101').unitId;
    if (!unitId) return undefined;
    return this.groundTruth.get(unitId)?.defectType;
  }

  private captureVisionInput(capturedAtSeconds: number): VisionInput {
    return (
      this.scene?.captureVisionFrame?.(capturedAtSeconds) ?? {
        camera: undefined,
        stream: undefined,
        width: simulationConfig.inspectionCamera.renderWidth,
        height: simulationConfig.inspectionCamera.renderHeight,
        capturedAtSeconds,
        frameNumber: 0,
      }
    );
  }

  /** Fault injection (spec §26). A dark camera faults the PLC and freezes CAM01. */
  setCameraOnline(online: boolean): void {
    this.cameraOnline = online;
    this.scene?.setCameraOnline?.(online);
  }

  setRejectStationFaulted(faulted: boolean): void {
    this.rejectStation.setFaulted(faulted);
  }

  setFailSafeMode(mode: FailSafeMode): void {
    this.plc.setFailSafeMode(mode);
  }

  start(): void {
    this.plc.start();
    this.clock.resume();
    this.events.emit({ type: 'SIMULATION_STARTED', simulationTime: this.clock.elapsedSeconds });
    logger.info('simulation.started', { elapsedSeconds: this.clock.elapsedSeconds });
  }

  stop(): void {
    this.plc.stop();
    this.events.emit({ type: 'SIMULATION_STOPPED', simulationTime: this.clock.elapsedSeconds });
    logger.info('simulation.stopped', { elapsedSeconds: this.clock.elapsedSeconds });
  }

  /** Operator fault reset. Conditions still present simply re-latch. */
  resetFaults(): void {
    this.plc.resetFaults();
  }

  reset(): void {
    this.plc.reset();
    this.sensors.reset();
    this.rejectStation.reset();
    this.conveyor.stop();
    this.clock.reset();
    this.products.clear();
    this.groundTruth.clear();
    this.evaluation.reset();
    this.metrics.reset();
    this.eventLog.length = 0;
    this.totalSpawned = 0;
    this.totalExited = 0;
    this.setCameraOnline(true);
    this.publishSnapshot();
  }

  setSpeed(multiplier: SimulationSpeed): void {
    this.clock.setSpeed(multiplier);
  }

  setLineSpeed(metersPerSecond: number): void {
    this.plc.setLineSpeed(metersPerSecond);
  }

  injectGood(): Product | undefined {
    return this.products.spawnGood(this.clock.elapsedSeconds);
  }

  injectDefect(defect: DefectType): Product | undefined {
    return this.products.spawnWithDefect(defect, this.clock.elapsedSeconds);
  }

  injectRandomDefect(): Product | undefined {
    return this.products.spawnRandomDefect(this.clock.elapsedSeconds);
  }

  async generateDatasetPreview(
    samplesPerClass: number,
    seed: number,
    onProgress?: (progress: DatasetGenerationProgress) => void,
  ): Promise<DatasetSample[]> {
    const capture = this.scene?.captureDatasetSample;
    if (!capture) throw new Error('Dataset rendering requires an attached browser scene');
    this.stop();
    this.setRuntimeMode('DATASET_GENERATION');
    return new DatasetGenerator((request) => capture.call(this.scene, request)).generateBalancedPreview(
      samplesPerClass,
      seed,
      onProgress,
    );
  }

  /** Drives the simulation from real elapsed time, then renders at most once. */
  tick(realDeltaSeconds: number): void {
    const steps = this.clock.advance(realDeltaSeconds);

    for (let i = 0; i < steps; i += 1) {
      const delta = this.clock.step();
      this.update(delta);
    }

    if (this.scene) {
      this.scene.setRealDelta?.(realDeltaSeconds);
      this.scene.setRejectStroke?.(this.rejectStation.strokeFraction);
      this.scene.setStackLight?.(this.outputs.stackLight);
      this.scene.syncProducts(this.products.getProducts(), (unitId) =>
        this.groundTruth.get(unitId),
      );
      this.scene.render();
    }

    this.snapshotAccumulator += realDeltaSeconds;
    if (this.snapshotAccumulator >= 1 / simulationConfig.snapshotHz) {
      this.snapshotAccumulator = 0;
      this.publishSnapshot();
    }
  }

  /**
   * One fixed logic step, in physical order: transport, then sense, then decide,
   * then actuate. The PLC only ever sees `buildInputImage()`.
   */
  private update(deltaSeconds: number): void {
    const simulationTime = this.clock.elapsedSeconds;

    this.products.update(deltaSeconds, simulationTime);
    this.sensors.update(this.products.getProducts(), simulationTime);

    this.outputs = this.plc.update(deltaSeconds, simulationTime, this.getPlcInputImage());

    this.conveyor.setSpeed(this.outputs.lineSpeedSetpoint);
    if (this.outputs.runConveyor) this.conveyor.start();
    else this.conveyor.stop();

    this.rejectStation.setCommand(this.outputs.rejectCommand);
    this.rejectStation.update(deltaSeconds, this.products.getProducts());
  }

  /**
   * The complete PLC input surface. Deliberately free of simulator truth (C1);
   * asserted by tests/controls/PlcBoundary.test.ts.
   */
  getPlcInputImage(): PlcInputImage {
    return {
      pe100Entry: this.sensors.read('PE100'),
      pe101Inspection: this.sensors.read('PE101'),
      pe102Reject: this.sensors.read('PE102'),
      pe103Exit: this.sensors.read('PE103'),
      cameraOnline: this.cameraOnline,
      conveyorRunning: this.conveyor.running,
      lineSpeedMetersPerSecond: this.conveyor.speedMetersPerSecond,
      rejectStationExtended: this.rejectStation.extended,
    };
  }

  getSnapshot(): SimulationSnapshot {
    return this.snapshot;
  }

  dispose(): void {
    this.events.clear();
    this.scene?.dispose();
    this.scene = undefined;
  }

  private publishSnapshot(): void {
    this.snapshot = this.buildSnapshot();
    this.onSnapshot?.(this.snapshot);
  }

  private buildSnapshot(): SimulationSnapshot {
    return {
      elapsedSeconds: this.clock.elapsedSeconds,
      speedMultiplier: this.clock.speedMultiplier,
      paused: this.clock.paused,

      conveyorRunning: this.conveyor.running,
      lineSpeedMetersPerSecond: this.conveyor.speedMetersPerSecond,
      unitsPerMinute: this.productFactory.getRecipe().unitsPerMinute,
      autoSpawn: this.products.autoSpawn,

      productCount: this.products.count,
      products: this.products.getProducts().map((product) => ({
        unitId: product.unitId,
        sku: product.sku,
        positionMeters: product.positionMeters,
        lateralOffsetMeters: product.lateralOffsetMeters,
        state: product.state,
        rejected: product.rejected,
      })),

      totalSpawned: this.totalSpawned,
      totalExited: this.totalExited,

      machineState: this.plc.tags.machineState,
      stackLight: this.outputs.stackLight,
      tags: { ...this.plc.tags },
      sensors: this.sensors.sensors.map((sensor) => ({
        id: sensor.id,
        label: sensor.label,
        positionMeters: sensor.positionMeters,
        active: sensor.active,
        unitId: sensor.unitId,
      })),

      rejectStationState: this.rejectStation.state,
      rejectStationStroke: this.rejectStation.strokeFraction,
      rejectStationFaulted: this.rejectStation.faultInjected,
      rejectQueueSize: this.plc.rejectQueue.size,
      pendingInspections: this.plc.pendingInspectionCount,
      lastInferenceLatencyMs: this.plc.lastInferenceLatencyMs,

      alarms: this.plc.alarms.getActive(),
      faults: this.plc.interlocks.getActive(),

      visionAttached: this.plc.visionAttached,
      cameraOnline: this.cameraOnline,

      runtimeMode: this.runtimeMode,
      visionProviderName: this.visionProvider?.name,
      visionProviderConnected: this.visionProvider?.isConnected() ?? false,
      mockVision: this.mockVision?.getSettings(),
      visionOverlay: this.buildOverlaySnapshot(),
      roboflow: this.roboflow?.status(),
      qualityMetrics: this.metrics.snapshot(),
      recentEvents: this.eventLog.slice(-EVENT_LOG_CAPACITY),
    };
  }

  private recordEvaluation(unitId: string, action: ProductionAction): void {
    const truth = this.groundTruth.get(unitId);
    if (!truth) return;

    this.metrics.record(this.evaluation.evaluateAction(unitId, action, truth));
    this.events.emit({
      type: 'INSPECTION_RECORDED',
      simulationTime: this.clock.elapsedSeconds,
      unitId,
    });
  }

  /** Display-only. Bounding boxes never travel through the PLC input image. */
  private buildOverlaySnapshot(): VisionOverlaySnapshot | undefined {
    const view = this.visionGateway?.getLastPrediction();
    if (!view) return undefined;

    const { prediction } = view;
    return {
      unitId: view.unitId,
      detections: prediction.detections,
      sourceWidth: prediction.sourceWidth ?? simulationConfig.inspectionCamera.renderWidth,
      sourceHeight: prediction.sourceHeight ?? simulationConfig.inspectionCamera.renderHeight,
      annotatedFrameBase64: prediction.annotatedFrameBase64,
      inferenceId: prediction.inferenceId,
    };
  }
}
