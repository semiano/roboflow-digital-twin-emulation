import * as THREE from 'three';
import { productGeometry } from '@/config/line.config';
import type { ProductGroundTruth } from '@/models/GroundTruth';
import { degreesToRadians } from '@/utils/math';
import { labelMaterial, materials } from './materials';

const G = productGeometry;

/** Shared geometries — one allocation per shape regardless of product count. */
const geometries = {
  body: new THREE.CylinderGeometry(G.bodyRadius, G.bodyRadius, G.bodyHeight, 24),
  shoulder: new THREE.CylinderGeometry(G.neckRadius, G.bodyRadius, 0.03, 24),
  neck: new THREE.CylinderGeometry(G.neckRadius, G.neckRadius, G.neckHeight, 20),
  cap: new THREE.CylinderGeometry(G.capRadius, G.capRadius, G.capHeight, 20),
  label: new THREE.CylinderGeometry(G.bodyRadius + 0.0015, G.bodyRadius + 0.0015, G.labelHeight, 24, 1, true),
  fill: new THREE.CylinderGeometry(G.bodyRadius - 0.003, G.bodyRadius - 0.003, 1, 20),
};

export interface ProductView {
  group: THREE.Group;
  cap: THREE.Mesh;
  label: THREE.Mesh;
  fill: THREE.Mesh;
}

/**
 * Builds the visual bottle. Part names are stable because the annotation
 * generator projects them into bounding boxes in Phase 10.
 */
export function createProductView(groundTruth: ProductGroundTruth | undefined): ProductView {
  const truth: ProductGroundTruth = groundTruth ?? {
    defectType: 'NONE',
    capPresent: true,
    labelPresent: true,
    labelRotationDegrees: 0,
    labelVariant: 'LBL-500ML-A',
    fillLevel: G.nominalFillLevel,
    expectedResult: 'PASS',
  };

  const group = new THREE.Group();
  group.name = 'bottle';

  const body = new THREE.Mesh(geometries.body, materials.bottleGlass);
  body.name = 'bottle_body';
  body.position.y = G.bodyHeight / 2;
  body.castShadow = true;
  group.add(body);

  const shoulder = new THREE.Mesh(geometries.shoulder, materials.bottleGlass);
  shoulder.position.y = G.bodyHeight + 0.015;
  group.add(shoulder);

  const neck = new THREE.Mesh(geometries.neck, materials.bottleGlass);
  neck.position.y = G.bodyHeight + 0.03 + G.neckHeight / 2;
  group.add(neck);

  const fill = new THREE.Mesh(geometries.fill, materials.liquid);
  fill.name = 'fill_region';
  group.add(fill);
  applyFillLevel(fill, truth.fillLevel);

  const cap = new THREE.Mesh(geometries.cap, materials.cap);
  cap.name = 'cap';
  cap.position.y = G.bodyHeight + 0.03 + G.neckHeight + G.capHeight / 2;
  cap.castShadow = true;
  cap.visible = truth.capPresent;
  group.add(cap);

  const label = new THREE.Mesh(geometries.label, labelMaterial(truth.labelVariant));
  label.name = 'label';
  label.material.side = THREE.DoubleSide;
  label.position.y = G.labelCenterHeight;
  label.rotation.z = degreesToRadians(truth.labelRotationDegrees);
  label.visible = truth.labelPresent;
  group.add(label);

  return { group, cap, label, fill };
}

function applyFillLevel(fill: THREE.Mesh, fillLevel: number): void {
  const height = Math.max(0.001, fillLevel * (G.bodyHeight - 0.006));
  fill.scale.y = height;
  fill.position.y = 0.003 + height / 2;
}

export function disposeProductGeometries(): void {
  for (const geometry of Object.values(geometries)) geometry.dispose();
}
