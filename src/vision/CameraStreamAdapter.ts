/**
 * Spec §13. The whole of what the vision layer knows about a camera.
 *
 * Every transport Roboflow supports is reachable from here: `getMediaStream()`
 * is what a WebRTC or browser-SDK path consumes, `grabFrame()` is what the
 * request/response APIs consume. Nothing downstream depends on the fact that
 * the pixels happen to come from a WebGL canvas, so an OBS virtual camera or an
 * RTSP bridge could be substituted without touching the provider.
 */
export interface CameraStreamAdapter {
  getMediaStream(): MediaStream;
  /** A single still, encoded as JPEG. */
  grabFrame(quality?: number): Promise<Blob>;
  /** Monotonic render counter. A frozen feed stops advancing it. */
  readonly framesRendered: number;
  readonly online: boolean;
}
