import type { VisionInput, VisionPrediction } from './VisionTypes';

/**
 * Spec §14. The only thing the rest of the app knows about an inference engine.
 *
 * `inspect` is genuinely asynchronous because real inference is. The PLC does
 * not consume it directly — `ProviderVisionGateway` adapts this onto the polled
 * `VisionGateway` port so the control layer stays on its scan boundary (D7).
 */
export interface VisionProvider {
  /** Shown on the HMI so a mock result can never be mistaken for a real one. */
  readonly name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  inspect(input: VisionInput): Promise<VisionPrediction>;
}
