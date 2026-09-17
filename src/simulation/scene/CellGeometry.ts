import * as THREE from 'three';
import { conveyorConfig, rejectStationConfig } from '@/config/line.config';
import { materials } from './materials';

const BELT_Y = conveyorConfig.surfaceHeightMeters;
const LENGTH = conveyorConfig.lengthMeters;
const WIDTH = conveyorConfig.widthMeters;

function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: [number, number, number],
  name?: string,
): THREE.Mesh {
  const result = new THREE.Mesh(geometry, material);
  result.position.set(...position);
  result.castShadow = true;
  result.receiveShadow = true;
  if (name) result.name = name;
  return result;
}

function buildConveyor(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'conveyor';

  const beltThickness = 0.04;
  group.add(
    mesh(
      new THREE.BoxGeometry(LENGTH, beltThickness, WIDTH),
      materials.beltSurface,
      [LENGTH / 2, BELT_Y - beltThickness / 2, 0],
      'belt',
    ),
  );

  // Side rails
  const railHeight = 0.05;
  for (const side of [-1, 1]) {
    group.add(
      mesh(
        new THREE.BoxGeometry(LENGTH, railHeight, 0.015),
        materials.frame,
        [LENGTH / 2, BELT_Y + railHeight / 2, side * (WIDTH / 2 + 0.01)],
      ),
    );
  }

  // Frame rails and legs
  const legHeight = BELT_Y - beltThickness;
  for (const side of [-1, 1]) {
    group.add(
      mesh(
        new THREE.BoxGeometry(LENGTH, 0.06, 0.04),
        materials.frame,
        [LENGTH / 2, BELT_Y - 0.12, side * (WIDTH / 2 + 0.02)],
      ),
    );
  }
  for (let x = 0.35; x <= LENGTH; x += 1.1) {
    for (const side of [-1, 1]) {
      group.add(
        mesh(
          new THREE.BoxGeometry(0.05, legHeight, 0.05),
          materials.frame,
          [x, legHeight / 2, side * (WIDTH / 2 + 0.02)],
        ),
      );
    }
  }

  return group;
}

function buildInspectionStation(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'inspectionStation';
  const x = conveyorConfig.inspectionPositionMeters;
  const archHeight = 0.62;
  // The arch is offset upstream so its uprights stay out of the camera's line of sight.
  const archX = x - 0.32;

  for (const side of [-1, 1]) {
    group.add(
      mesh(
        new THREE.BoxGeometry(0.05, archHeight, 0.05),
        materials.frame,
        [archX, BELT_Y + archHeight / 2, side * 0.36],
      ),
    );
  }
  group.add(
    mesh(new THREE.BoxGeometry(0.08, 0.05, 0.82), materials.frame, [archX, BELT_Y + archHeight, 0]),
  );

  // Bar light above the inspection point, angled back so it lights the unit, not the lens.
  group.add(
    mesh(
      new THREE.BoxGeometry(0.06, 0.02, 0.5),
      materials.lightBar,
      [archX, BELT_Y + archHeight - 0.05, -0.1],
    ),
  );

  // Camera bracket: arm runs from the arch out to the housing.
  group.add(
    mesh(new THREE.BoxGeometry(0.5, 0.03, 0.03), materials.frame, [x - 0.1, BELT_Y + 0.34, 0.9]),
  );
  group.add(
    mesh(new THREE.BoxGeometry(0.03, 0.34, 0.03), materials.frame, [archX, BELT_Y + 0.45, 0.9]),
  );

  // Housing and lens sit behind the camera's near plane so they never occlude it.
  group.add(
    mesh(
      new THREE.BoxGeometry(0.09, 0.09, 0.14),
      materials.cameraBody,
      [x, BELT_Y + 0.27, 0.9],
      'cameraHousing',
    ),
  );
  const lens = mesh(
    new THREE.CylinderGeometry(0.028, 0.028, 0.05, 20),
    materials.cameraBody,
    [x, BELT_Y + 0.27, 0.82],
  );
  lens.rotation.x = Math.PI / 2;
  group.add(lens);

  // Diffuse backdrop: gives the vision model consistent contrast behind the unit.
  // Sized to fill the inspection camera frame at its mounted distance.
  group.add(
    mesh(new THREE.BoxGeometry(1.15, 0.9, 0.02), materials.backdrop, [x, BELT_Y + 0.28, -0.42]),
  );

  return group;
}

function buildRejectStation(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'rejectStation';
  const x = conveyorConfig.rejectPositionMeters;

  // Pneumatic cylinder body on the far side; the rod is animated separately.
  group.add(
    mesh(
      new THREE.BoxGeometry(0.1, 0.1, 0.22),
      materials.frame,
      [x, BELT_Y + 0.06, -(WIDTH / 2 + 0.18)],
      'rejectCylinder',
    ),
  );

  const rod = mesh(
    new THREE.BoxGeometry(0.08, 0.07, 0.12),
    materials.guard,
    [x, BELT_Y + 0.055, -(WIDTH / 2 + 0.02)],
    'rejectPusher',
  );
  group.add(rod);

  // Reject bin on the near side
  const bin = new THREE.Group();
  bin.name = 'rejectBin';
  bin.position.set(x + 0.1, 0, rejectStationConfig.binCenterLateralMeters);
  bin.add(mesh(new THREE.BoxGeometry(0.5, 0.02, 0.5), materials.bin, [0, 0.3, 0]));
  for (const [dx, dz] of [
    [0.25, 0],
    [-0.25, 0],
    [0, 0.25],
    [0, -0.25],
  ] as const) {
    bin.add(
      mesh(
        new THREE.BoxGeometry(dx === 0 ? 0.5 : 0.02, 0.3, dz === 0 ? 0.5 : 0.02),
        materials.bin,
        [dx, 0.45, dz],
      ),
    );
  }
  group.add(bin);

  return group;
}

function buildStackLight(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'stackLight';
  group.position.set(LENGTH - 0.4, 0, -0.85);

  group.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.03, 16), materials.frame, [0, 0.015, 0]));
  group.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.2, 12), materials.frame, [0, 0.6, 0]));

  const lens = new THREE.CylinderGeometry(0.05, 0.05, 0.07, 20);
  group.add(mesh(lens, materials.stackRed, [0, 1.36, 0], 'stackRed'));
  group.add(mesh(lens, materials.stackAmber, [0, 1.28, 0], 'stackAmber'));
  group.add(mesh(lens, materials.stackGreen, [0, 1.2, 0], 'stackGreen'));

  return group;
}

function buildControlCabinet(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'controlCabinet';
  group.position.set(LENGTH - 1.2, 0, -1.25);

  group.add(mesh(new THREE.BoxGeometry(0.7, 1.1, 0.35), materials.cabinet, [0, 0.55, 0]));
  group.add(mesh(new THREE.BoxGeometry(0.02, 0.9, 0.02), materials.frame, [0.3, 0.55, 0.18]));
  group.add(mesh(new THREE.BoxGeometry(0.28, 0.2, 0.02), materials.cameraBody, [-0.1, 0.85, 0.18]));

  return group;
}

function buildGuarding(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'guarding';

  for (let x = 0.2; x <= LENGTH; x += 1.2) {
    group.add(mesh(new THREE.BoxGeometry(0.03, 1.0, 0.03), materials.guard, [x, 0.5, -1.0]));
  }
  group.add(mesh(new THREE.BoxGeometry(LENGTH, 0.03, 0.03), materials.guard, [LENGTH / 2, 1.0, -1.0]));
  group.add(mesh(new THREE.BoxGeometry(LENGTH, 0.03, 0.03), materials.guard, [LENGTH / 2, 0.45, -1.0]));

  return group;
}

function buildSpawnStation(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'spawnStation';
  group.add(mesh(new THREE.BoxGeometry(0.3, 0.7, 0.55), materials.cabinet, [-0.2, BELT_Y - 0.1, 0]));
  group.add(mesh(new THREE.BoxGeometry(0.06, 0.12, 0.42), materials.frame, [0.0, BELT_Y + 0.28, 0]));
  return group;
}

/** Static, non-animated cell furniture. Built once at startup. */
export function buildCell(): THREE.Group {
  const cell = new THREE.Group();
  cell.name = 'cell';

  const floor = mesh(new THREE.BoxGeometry(14, 0.05, 10), materials.floor, [LENGTH / 2, -0.025, 0]);
  floor.castShadow = false;
  cell.add(floor);

  cell.add(buildConveyor());
  cell.add(buildSpawnStation());
  cell.add(buildInspectionStation());
  cell.add(buildRejectStation());
  cell.add(buildStackLight());
  cell.add(buildControlCabinet());
  cell.add(buildGuarding());

  return cell;
}
