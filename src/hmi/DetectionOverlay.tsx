import { useEffect, useRef } from 'react';
import { mapClassName } from '@/vision/roboflow/PredictionMapper';
import type { VisionDetection } from '@/vision/VisionTypes';

interface Props {
  detections: readonly VisionDetection[];
  sourceWidth: number;
  sourceHeight: number;
}

/** Defect boxes read red, the bottle box reads neutral, anything unmapped reads amber. */
function strokeFor(className: string): string {
  const defect = mapClassName(className);
  if (defect === undefined) return '#f0a500';
  return defect === 'NONE' ? '#3fa7ff' : '#ff4d4f';
}

/**
 * Spec §53 step 4 — detections drawn over the live camera panel.
 *
 * This is a *separate* canvas stacked on top of CAM01, never a draw into the
 * camera's own buffer. The pixels Roboflow receives have to stay clean: baking
 * annotations into the source frame would poison every image the active
 * learning uploader and the Phase 10 dataset generator send back.
 */
export function DetectionOverlay({ detections, sourceWidth, sourceHeight }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || sourceWidth <= 0 || sourceHeight <= 0) return;

    // Draw in source pixel space and let CSS scale the canvas to the panel.
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
    context.clearRect(0, 0, sourceWidth, sourceHeight);

    context.lineWidth = 3;
    context.font = '600 15px ui-monospace, monospace';
    context.textBaseline = 'bottom';

    for (const detection of detections) {
      // Roboflow boxes are centre-origin.
      const left = detection.x - detection.width / 2;
      const top = detection.y - detection.height / 2;
      const color = strokeFor(detection.className);

      context.strokeStyle = color;
      context.strokeRect(left, top, detection.width, detection.height);

      const label = `${detection.className} ${(detection.confidence * 100).toFixed(1)}%`;
      const textWidth = context.measureText(label).width;
      // Flip the caption inside the box when it would be clipped at the top.
      const captionBottom = top < 20 ? top + detection.height + 20 : top - 4;

      context.fillStyle = color;
      context.fillRect(left, captionBottom - 17, textWidth + 10, 19);
      context.fillStyle = '#0b0d10';
      context.fillText(label, left + 5, captionBottom);
    }
  }, [detections, sourceWidth, sourceHeight]);

  return <canvas ref={canvasRef} className="cam-feed__overlay-canvas" aria-hidden />;
}
