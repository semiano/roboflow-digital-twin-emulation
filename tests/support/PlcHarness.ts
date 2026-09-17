import { idleInputImage, type PlcInputImage } from '@/controls/PlcIo';
import type { VirtualPLC } from '@/controls/VirtualPLC';

const SCAN = 0.01;

type PhotoeyeKey = 'pe100Entry' | 'pe101Inspection' | 'pe102Reject' | 'pe103Exit';

/** Drives a PLC in isolation with a hand-built input image. */
export class PlcHarness {
  readonly inputs: PlcInputImage = idleInputImage(0.35);
  private time = 0;

  constructor(private readonly plc: VirtualPLC) {}

  get simulationTime(): number {
    return this.time;
  }

  /** Runs `seconds` of simulated time in single scan increments. */
  run(seconds: number): void {
    const scans = Math.round(seconds / SCAN);
    for (let i = 0; i < scans; i += 1) {
      this.time += SCAN;
      this.plc.update(SCAN, this.time, this.inputs);
    }
  }

  /** Blocks then clears a photoeye, producing a clean rising and falling edge. */
  pulse(sensor: PhotoeyeKey, unitId: string, seconds = 0.05): void {
    this.inputs[sensor] = { active: true, unitId };
    this.run(seconds);
    this.inputs[sensor] = { active: false, unitId: undefined };
    this.run(SCAN * 2);
  }

  /** Brings the machine from STOPPED to RUNNING. */
  startAndSettle(): void {
    this.plc.start();
    this.run(0.5);
    this.inputs.conveyorRunning = true;
    this.run(SCAN * 2);
  }
}
