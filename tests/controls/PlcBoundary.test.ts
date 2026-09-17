import { describe, expect, it } from 'vitest';
import { DEFECT_TYPES } from '@/models/DefectType';
import { SimulationEngine } from '@/simulation/SimulationEngine';

/**
 * Constraint C1 (spec §56): the controls layer must be structurally unable to
 * see simulator truth. ESLint blocks the import; this asserts the *runtime*
 * surface the PLC is handed is equally clean.
 */
describe('PLC input boundary', () => {
  it('exposes no ground truth to the controls layer', async () => {
    const engine = new SimulationEngine({ seed: 7 });
    engine.setRuntimeMode('MOCK_VISION');
    engine.configureMockVision({ latencyMode: 25 });
    engine.start();

    for (const defect of DEFECT_TYPES) engine.injectDefect(defect);
    for (let i = 0; i < 600; i += 1) {
      engine.tick(1 / 60);
      await Promise.resolve();
    }

    const image = engine.getPlcInputImage();
    const serialised = JSON.stringify(image);

    for (const key of ['defectType', 'expectedResult', 'capPresent', 'labelPresent', 'fillLevel']) {
      expect(serialised).not.toContain(key);
    }
    for (const defect of DEFECT_TYPES) {
      if (defect === 'NONE') continue;
      expect(serialised).not.toContain(defect);
    }

    expect(Object.keys(image).sort()).toEqual([
      'cameraOnline',
      'conveyorRunning',
      'lineSpeedMetersPerSecond',
      'pe100Entry',
      'pe101Inspection',
      'pe102Reject',
      'pe103Exit',
      'rejectStationExtended',
    ]);
  });
});
