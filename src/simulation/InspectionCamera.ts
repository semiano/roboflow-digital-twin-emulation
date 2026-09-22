import * as THREE from 'three';
import { simulationConfig } from '@/config/simulation.config';
import type { CameraStreamAdapter } from '@/vision/CameraStreamAdapter';

const CONFIG = simulationConfig.inspectionCamera;

/**
 * Fixed station camera (spec §12/§13). It owns a dedicated canvas and renderer
 * so the pixels handed to the vision layer are exactly what the camera sees —
 * never the operator's view, and never with HMI overlays baked in.
 */
export class InspectionCamera implements CameraStreamAdapter {
  readonly camera: THREE.PerspectiveCamera;
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private secondsSinceRender = 0;
  private mediaStream: MediaStream | undefined;
  private _online = true;
  private _framesRendered = 0;

  constructor(canvas?: HTMLCanvasElement) {
    this.canvas = canvas ?? document.createElement('canvas');
    this.canvas.width = CONFIG.renderWidth;
    this.canvas.height = CONFIG.renderHeight;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      // Required so captureStream and toBlob see a stable buffer.
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(CONFIG.renderWidth, CONFIG.renderHeight, false);
    this.renderer.setClearColor(0x14171a, 1);

    this.camera = new THREE.PerspectiveCamera(
      CONFIG.fov,
      CONFIG.renderWidth / CONFIG.renderHeight,
      CONFIG.near,
      CONFIG.far,
    );
    this.camera.position.set(...CONFIG.position);
    this.camera.lookAt(new THREE.Vector3(...CONFIG.target));
  }

  get online(): boolean {
    return this._online;
  }

  /** Frame metadata for the vision layer; a frozen feed stops advancing it. */
  get framesRendered(): number {
    return this._framesRendered;
  }

  /** Simulates a camera dropout: the feed freezes rather than showing a stale-but-live image. */
  setOnline(online: boolean): void {
    this._online = online;
    if (!online) {
      this.renderer.clear();
    }
  }

  /** Renders at the configured frame rate, decoupled from the display refresh. */
  render(scene: THREE.Scene, realDeltaSeconds: number): void {
    if (!this._online) return;

    this.secondsSinceRender += realDeltaSeconds;
    if (this.secondsSinceRender < 1 / CONFIG.fps) return;
    this.secondsSinceRender = 0;

    this._framesRendered += 1;
    this.renderer.render(scene, this.camera);
  }

  renderNow(scene: THREE.Scene): void {
    this.renderer.render(scene, this.camera);
  }

  /** The pixel boundary handed to the vision layer (plan.md C2). */
  getMediaStream(): MediaStream {
    this.mediaStream ??= this.canvas.captureStream(CONFIG.fps);
    return this.mediaStream;
  }

  async grabFrame(quality = 0.92): Promise<Blob> {
    return new Promise((resolve, reject) => {
      this.canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('inspection camera frame grab failed'))),
        'image/jpeg',
        quality,
      );
    });
  }

  dispose(): void {
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = undefined;
    this.renderer.dispose();
  }
}
