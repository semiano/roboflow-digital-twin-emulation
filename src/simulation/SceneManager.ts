import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { conveyorConfig, rejectStationConfig } from '@/config/line.config';
import { simulationConfig } from '@/config/simulation.config';
import type { StackLight } from '@/controls/PlcIo';
import { generateProductAnnotation } from '@/dataset/AnnotationGenerator';
import type { DatasetCameraPose, DatasetRenderRequest, DatasetRenderResult } from '@/dataset/DatasetTypes';
import type { ProductGroundTruth } from '@/models/GroundTruth';
import type { Product } from '@/models/Product';
import type { VisionInput } from '@/vision/VisionTypes';
import { InspectionCamera } from './InspectionCamera';
import { buildCell } from './scene/CellGeometry';
import { disposeMaterials, materials } from './scene/materials';
import { createProductView, disposeProductGeometries, type ProductView } from './scene/ProductMeshFactory';
import type { SceneBridge } from './SimulationEngine';

const OPERATOR = simulationConfig.operatorCamera;
const BELT_EDGE = conveyorConfig.widthMeters / 2;
const MAX_BIN_DROP = 0.32;
const DATASET_POSE_OFFSETS: Record<DatasetCameraPose, readonly [number, number, number]> = {
  A: [0, 0, 0],
  B: [-0.025, 0.018, 0.015],
  C: [0.022, -0.012, -0.012],
  D: [0.012, 0.025, 0.025],
};

const STACK_LENSES: Record<
  Exclude<StackLight, 'OFF'>,
  { material: THREE.MeshStandardMaterial; emissive: number }
> = {
  RED: { material: materials.stackRed, emissive: 0xd83a2e },
  AMBER: { material: materials.stackAmber, emissive: 0xe0a21a },
  GREEN: { material: materials.stackGreen, emissive: 0x27c24c },
};

/**
 * Owns everything Three.js. Implements SceneBridge so the engine can drive it
 * without importing Three.js itself.
 */
export class SceneManager implements SceneBridge {
  readonly scene = new THREE.Scene();
  readonly operatorCamera: THREE.PerspectiveCamera;
  readonly inspectionCamera: InspectionCamera;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly views = new Map<string, ProductView>();
  private readonly resizeObserver: ResizeObserver;
  private readonly rejectPusher: THREE.Object3D | undefined;
  private readonly pusherHomeZ: number;
  private lastRealDeltaSeconds = 0;

  constructor(mainCanvas: HTMLCanvasElement, inspectionCanvas: HTMLCanvasElement) {
    this.scene.background = new THREE.Color(0x1a1d21);
    this.scene.fog = new THREE.Fog(0x1a1d21, 12, 26);
    this.scene.add(buildCell());
    this.addLighting();

    this.rejectPusher = this.scene.getObjectByName('rejectPusher');
    this.pusherHomeZ = this.rejectPusher?.position.z ?? 0;

    this.renderer = new THREE.WebGLRenderer({ canvas: mainCanvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.operatorCamera = new THREE.PerspectiveCamera(OPERATOR.fov, 1, OPERATOR.near, OPERATOR.far);
    this.operatorCamera.position.set(...OPERATOR.position);

    this.controls = new OrbitControls(this.operatorCamera, mainCanvas);
    this.controls.target.set(...OPERATOR.target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2.05;
    this.controls.minDistance = 0.8;
    this.controls.maxDistance = 14;
    this.controls.update();

    this.inspectionCamera = new InspectionCamera(inspectionCanvas);

    this.resizeObserver = new ResizeObserver(() => this.resize(mainCanvas));
    this.resizeObserver.observe(mainCanvas);
    this.resize(mainCanvas);
  }

  /** Called by the engine before each render so camera pacing tracks real time. */
  setRealDelta(seconds: number): void {
    this.lastRealDeltaSeconds = seconds;
  }

  setRejectStroke(fraction: number): void {
    if (!this.rejectPusher) return;
    this.rejectPusher.position.z =
      this.pusherHomeZ + fraction * rejectStationConfig.strokeMeters;
  }

  setStackLight(state: StackLight): void {
    for (const [tone, lens] of Object.entries(STACK_LENSES)) {
      lens.material.emissive.setHex(tone === state ? lens.emissive : 0x000000);
    }
  }

  setCameraOnline(online: boolean): void {
    this.inspectionCamera.setOnline(online);
  }

  /**
   * The single point where rendered pixels leave the simulation (plan.md C2).
   * What crosses is a canvas handle and frame metadata — nothing else.
   */
  captureVisionFrame(capturedAtSeconds: number): VisionInput {
    return {
      camera: this.inspectionCamera,
      stream: this.inspectionCamera.online ? this.inspectionCamera.getMediaStream() : undefined,
      grabFrame: (quality) => this.inspectionCamera.grabFrame(quality),
      width: simulationConfig.inspectionCamera.renderWidth,
      height: simulationConfig.inspectionCamera.renderHeight,
      capturedAtSeconds,
      frameNumber: this.inspectionCamera.framesRendered,
    };
  }

  async captureDatasetSample(request: DatasetRenderRequest): Promise<DatasetRenderResult> {
    const view = createProductView(request.truth);
    const camera = this.inspectionCamera.camera;
    const originalPosition = camera.position.clone();
    const visibleProducts = [...this.views.values()].filter((product) => product.group.visible);
    const poseOffset = DATASET_POSE_OFFSETS[request.cameraPose];
    const jitter = (value: number): number => ((request.seed * value) % 17) / 1700 - 0.005;

    for (const product of visibleProducts) product.group.visible = false;
    view.group.position.set(
      conveyorConfig.inspectionPositionMeters + jitter(7),
      conveyorConfig.surfaceHeightMeters,
      jitter(11),
    );
    view.group.rotation.y = jitter(13) * 18;
    this.scene.add(view.group);

    try {
      camera.position.set(
        originalPosition.x + poseOffset[0],
        originalPosition.y + poseOffset[1],
        originalPosition.z + poseOffset[2],
      );
      camera.lookAt(new THREE.Vector3(...simulationConfig.inspectionCamera.target));
      camera.updateProjectionMatrix();
      this.inspectionCamera.renderNow(this.scene);
      const annotation = generateProductAnnotation(view.group, camera, request.truth.defectType);
      if (!annotation) throw new Error('Generated product is outside the training camera frame');
      const blob = await this.inspectionCamera.grabFrame(0.92);
      const imageDataUrl = await this.blobToDataUrl(blob);
      return { imageDataUrl, annotation };
    } finally {
      this.scene.remove(view.group);
      for (const product of visibleProducts) product.group.visible = true;
      camera.position.copy(originalPosition);
      camera.lookAt(new THREE.Vector3(...simulationConfig.inspectionCamera.target));
      camera.updateProjectionMatrix();
    }
  }

  syncProducts(
    products: readonly Product[],
    groundTruthOf: (unitId: string) => ProductGroundTruth | undefined,
  ): void {
    const seen = new Set<string>();

    for (const product of products) {
      seen.add(product.unitId);

      let view = this.views.get(product.unitId);
      if (!view) {
        view = createProductView(groundTruthOf(product.unitId));
        this.views.set(product.unitId, view);
        this.scene.add(view.group);
      }

      // A unit pushed past the belt edge has nothing under it, so it drops.
      const overhang = Math.max(0, Math.abs(product.lateralOffsetMeters) - BELT_EDGE);
      const drop = Math.min(MAX_BIN_DROP, overhang * 0.75);

      view.group.position.set(
        product.positionMeters,
        conveyorConfig.surfaceHeightMeters - drop,
        product.lateralOffsetMeters,
      );
    }

    for (const [unitId, view] of this.views) {
      if (seen.has(unitId)) continue;
      this.scene.remove(view.group);
      this.views.delete(unitId);
    }
  }

  render(): void {
    this.controls.update();
    this.renderer.render(this.scene, this.operatorCamera);
    this.inspectionCamera.render(this.scene, this.lastRealDeltaSeconds);
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.inspectionCamera.dispose();
    this.renderer.dispose();
    disposeProductGeometries();
    disposeMaterials();
    this.views.clear();
  }

  private resize(canvas: HTMLCanvasElement): void {
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    this.renderer.setSize(width, height, false);
    this.operatorCamera.aspect = width / height;
    this.operatorCamera.updateProjectionMatrix();
  }

  private addLighting(): void {
    this.scene.add(new THREE.HemisphereLight(0xdfe7f0, 0x2b2f33, 0.9));

    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(3.5, 4.5, 3.0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -6;
    key.shadow.camera.right = 6;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -6;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xc8d8ff, 0.6);
    fill.position.set(-3, 3, -2.5);
    this.scene.add(fill);

    // Dedicated station light so the inspection view is evenly lit.
    const stationLight = new THREE.SpotLight(0xffffff, 12, 2.2, Math.PI / 5, 0.5, 1.5);
    stationLight.position.set(conveyorConfig.inspectionPositionMeters, 1.45, -0.05);
    stationLight.target.position.set(conveyorConfig.inspectionPositionMeters, 0.9, 0);
    this.scene.add(stationLight);
    this.scene.add(stationLight.target);
  }

  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener('load', () => resolve(String(reader.result)), { once: true });
      reader.addEventListener('error', () => reject(reader.error ?? new Error('frame read failed')), {
        once: true,
      });
      reader.readAsDataURL(blob);
    });
  }
}
