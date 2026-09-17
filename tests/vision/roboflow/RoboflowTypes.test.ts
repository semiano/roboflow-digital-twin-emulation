import { describe, expect, it } from 'vitest';
import { parseModelResponse, parseWorkflowResponse } from '@/vision/roboflow/RoboflowTypes';

const detection = (className: string, confidence: number) => ({
  x: 256,
  y: 300,
  width: 150,
  height: 330,
  confidence,
  class: className,
  class_id: 0,
  detection_id: 'det-1',
});

const bigBase64 = 'a'.repeat(512);

describe('parseModelResponse', () => {
  it('reads detections, image metadata and server time from the model endpoint', () => {
    const result = parseModelResponse({
      inference_id: 'inf-99',
      time: 0.045,
      image: { width: 512, height: 512 },
      predictions: [detection('missing_cap', 0.91)],
    });

    expect(result.detections).toHaveLength(1);
    expect(result.image).toEqual({ width: 512, height: 512 });
    expect(result.serverTimeMs).toBeCloseTo(45);
    expect(result.inferenceId).toBe('inf-99');
  });

  it('survives a response shape it does not recognise', () => {
    expect(parseModelResponse({ error: 'nope' }).detections).toEqual([]);
    expect(parseModelResponse(null).detections).toEqual([]);
  });
});

describe('parseWorkflowResponse', () => {
  it('finds detections under a step output whose name it was never told', () => {
    const result = parseWorkflowResponse({
      outputs: [
        {
          // Step names are chosen by whoever built the Workflow in the editor.
          my_detection_step: {
            image: { width: 640, height: 640 },
            predictions: [detection('underfill', 0.77)],
          },
        },
      ],
    });

    expect(result.detections[0]?.class).toBe('underfill');
    expect(result.image).toEqual({ width: 640, height: 640 });
    expect(result.outputNames).toEqual(['my_detection_step']);
  });

  it('accepts a bare detection array as well as the wrapped form', () => {
    const result = parseWorkflowResponse({
      outputs: [{ predictions: [detection('bottle', 0.98)] }],
    });

    expect(result.detections).toHaveLength(1);
  });

  it('picks up a visualization block output and strips any data URI prefix', () => {
    const result = parseWorkflowResponse({
      outputs: [
        {
          predictions: [],
          bounding_box_visualization: {
            type: 'base64',
            value: `data:image/jpeg;base64,${bigBase64}`,
          },
        },
      ],
    });

    expect(result.visualizationBase64).toBe(bigBase64);
  });

  it('does not mistake a short string output for an image', () => {
    const result = parseWorkflowResponse({
      outputs: [{ label: 'FAIL', predictions: [] }],
    });

    expect(result.visualizationBase64).toBeUndefined();
  });

  it('reports an empty detection list rather than treating it as unparseable', () => {
    const result = parseWorkflowResponse({
      outputs: [{ predictions: { image: { width: 512, height: 512 }, predictions: [] } }],
    });

    expect(result.detections).toEqual([]);
    expect(result.image).toEqual({ width: 512, height: 512 });
  });
});
