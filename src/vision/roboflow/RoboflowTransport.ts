import { visionConfig, type RoboflowTransportId } from '@/config/vision.config';
import type { RoboflowClient } from './RoboflowClient';
import {
  parseModelResponse,
  parseWorkflowResponse,
  type RoboflowInferenceResult,
} from './RoboflowTypes';

const CONFIG = visionConfig.roboflow;

/** A frame ready to post: base64 JPEG with no data URI prefix. */
export interface RoboflowFrame {
  base64: string;
  width: number;
  height: number;
}

export interface RoboflowTransport {
  readonly id: RoboflowTransportId;
  /** Shown in the HMI so the operator knows which Roboflow surface is live. */
  describe(): string;
  endpoint(): string;
  infer(frame: RoboflowFrame): Promise<RoboflowInferenceResult>;
}

/**
 * The primary path: a saved Roboflow Workflow.
 *
 * A Workflow is preferred over the raw model endpoint because the inspection
 * *recipe* — which model, what confidence, which classes matter, how they are
 * visualized — is then versioned in Roboflow rather than compiled into the
 * control system. Re-tuning the inspection is a Workflow edit, not a release.
 */
export class WorkflowTransport implements RoboflowTransport {
  readonly id = 'WORKFLOW';

  constructor(private readonly client: RoboflowClient) {}

  private get path(): string {
    const { workspace, workflowId } = this.client.getSettings();
    return `/infer/workflows/${workspace}/${workflowId}`;
  }

  describe(): string {
    const { workspace, workflowId } = this.client.getSettings();
    if (!workspace || !workflowId) return 'workflow (not set)';
    return `workflow ${workspace}/${workflowId}`;
  }

  endpoint(): string {
    return `${this.client.baseUrl}${this.path}`;
  }

  async infer(frame: RoboflowFrame): Promise<RoboflowInferenceResult> {
    const { body, roundTripMs } = await this.client.post({
      path: this.path,
      contentType: 'application/json',
      body: JSON.stringify({
        inputs: {
          [CONFIG.workflowImageInput]: { type: 'base64', value: frame.base64 },
        },
      }),
    });

    const result = parseWorkflowResponse(body);
    // A Workflow reports no model time of its own, so the round trip stands in.
    return { ...result, serverTimeMs: result.serverTimeMs ?? roundTripMs };
  }
}

/**
 * Secondary path: a single trained model, `POST {base}/{project}/{version}`.
 *
 * Kept because it is the lowest-dependency way to prove the loop works — a
 * model trained from the Phase 10 synthetic dataset can be pointed at before
 * any Workflow exists around it.
 */
export class ModelTransport implements RoboflowTransport {
  readonly id = 'MODEL';

  constructor(private readonly client: RoboflowClient) {}

  private get path(): string {
    return `/${this.client.getSettings().modelId}`;
  }

  describe(): string {
    return `model ${this.client.getSettings().modelId || '(not set)'}`;
  }

  endpoint(): string {
    return `${this.client.baseUrl}${this.path}`;
  }

  async infer(frame: RoboflowFrame): Promise<RoboflowInferenceResult> {
    // This endpoint takes the raw base64 as the body, not JSON.
    const { body, roundTripMs } = await this.client.post({
      path: this.path,
      contentType: 'application/x-www-form-urlencoded',
      body: frame.base64,
    });

    const result = parseModelResponse(body);
    return { ...result, serverTimeMs: result.serverTimeMs ?? roundTripMs };
  }
}

export function createTransport(
  id: RoboflowTransportId,
  client: RoboflowClient,
): RoboflowTransport {
  return id === 'WORKFLOW' ? new WorkflowTransport(client) : new ModelTransport(client);
}
