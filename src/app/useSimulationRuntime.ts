import { useEffect, type RefObject } from 'react';
import { SceneManager } from '@/simulation/SceneManager';
import { getEngine } from './simulationStore';

/**
 * Owns the render loop lifetime. Real frame time comes from the rAF timestamp,
 * so no module outside SimulationClock reads a wall clock (plan.md C5).
 */
export function useSimulationRuntime(
  mainCanvasRef: RefObject<HTMLCanvasElement>,
  inspectionCanvasRef: RefObject<HTMLCanvasElement>,
): void {
  useEffect(() => {
    const mainCanvas = mainCanvasRef.current;
    const inspectionCanvas = inspectionCanvasRef.current;
    if (!mainCanvas || !inspectionCanvas) return;

    const engine = getEngine();
    const scene = new SceneManager(mainCanvas, inspectionCanvas);
    engine.attachScene(scene);

    let frameId = 0;
    let previousTimestamp: number | undefined;

    const loop = (timestamp: number): void => {
      const realDeltaSeconds =
        previousTimestamp === undefined ? 0 : (timestamp - previousTimestamp) / 1000;
      previousTimestamp = timestamp;

      // Cap to avoid a huge step when the tab regains focus.
      engine.tick(Math.min(realDeltaSeconds, 0.25));
      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frameId);
      scene.dispose();
    };
  }, [mainCanvasRef, inspectionCanvasRef]);
}
