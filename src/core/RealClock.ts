/**
 * The only wall clock in the product code besides `SimulationClock` and the
 * logger (plan.md C5, decision D18).
 *
 * A network round trip to Roboflow happens in *real* time while simulated time
 * is frozen between fixed steps, so it cannot be measured with the simulation
 * clock. Keeping that read in one named place preserves the constraint's intent:
 * no module invents its own notion of time.
 */
export function realNowMs(): number {
  return performance.now();
}

/** Real-world delay, used for retry backoff. Never for simulation timing. */
export function realDelay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
