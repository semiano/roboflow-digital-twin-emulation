import { create } from 'zustand';
import { defaultRuntimeMode, simulationConfig, type SimulationSpeed } from '@/config/simulation.config';
import { SimulationEngine } from '@/simulation/SimulationEngine';
import type { SimulationSnapshot } from '@/simulation/SimulationSnapshot';

/**
 * The single bridge between the engine and React (plan.md §2.3).
 * React reads snapshots; it never holds engine or Three.js objects.
 */

let engineInstance: SimulationEngine | undefined;

export function getEngine(): SimulationEngine {
  if (!engineInstance) {
    engineInstance = new SimulationEngine({ seed: simulationConfig.defaultSeed });
    engineInstance.setRuntimeMode(defaultRuntimeMode);

    engineInstance.onSnapshot = (snapshot) => {
      useSimulationStore.setState({ snapshot });
    };
  }
  return engineInstance;
}

export function disposeEngine(): void {
  engineInstance?.dispose();
  engineInstance = undefined;
}

interface SimulationStore {
  snapshot: SimulationSnapshot;
  setSpeed: (speed: SimulationSpeed) => void;
}

export const useSimulationStore = create<SimulationStore>((set) => ({
  snapshot: getEngine().getSnapshot(),
  setSpeed: (speed) => {
    getEngine().setSpeed(speed);
    set((state) => ({ snapshot: { ...state.snapshot, speedMultiplier: speed } }));
  },
}));
