import * as THREE from 'three';

/** Shared industrial palette. Materials are reused so the GPU sees few draw state changes. */
export const materials = {
  floor: new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.95, metalness: 0.0 }),
  beltSurface: new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.8, metalness: 0.1 }),
  frame: new THREE.MeshStandardMaterial({ color: 0x8d9298, roughness: 0.45, metalness: 0.85 }),
  guard: new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.6, metalness: 0.2 }),
  cabinet: new THREE.MeshStandardMaterial({ color: 0xcfd4d9, roughness: 0.5, metalness: 0.6 }),
  bin: new THREE.MeshStandardMaterial({ color: 0xb03a2e, roughness: 0.7, metalness: 0.1 }),
  cameraBody: new THREE.MeshStandardMaterial({ color: 0x1b1e21, roughness: 0.35, metalness: 0.8 }),
  backdrop: new THREE.MeshStandardMaterial({ color: 0x9aa4ad, roughness: 1, metalness: 0 }),
  lightBar: new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 1.4,
    roughness: 1,
  }),

  bottleGlass: new THREE.MeshPhysicalMaterial({
    color: 0xd8ecdf,
    roughness: 0.08,
    metalness: 0,
    transmission: 0.85,
    thickness: 0.01,
    transparent: true,
    opacity: 0.55,
  }),
  liquid: new THREE.MeshStandardMaterial({ color: 0xe8a33d, roughness: 0.25, metalness: 0.0 }),
  cap: new THREE.MeshStandardMaterial({ color: 0x1e5aa8, roughness: 0.4, metalness: 0.2 }),

  stackRed: new THREE.MeshStandardMaterial({ color: 0x5a1512, emissive: 0x000000, roughness: 0.5 }),
  stackAmber: new THREE.MeshStandardMaterial({
    color: 0x6a4a0c,
    emissive: 0x000000,
    roughness: 0.5,
  }),
  stackGreen: new THREE.MeshStandardMaterial({
    color: 0x14421d,
    emissive: 0x000000,
    roughness: 0.5,
  }),
} as const;

/** Label variants are distinguished by colour so the defect is visible to a camera. */
const LABEL_COLORS: Record<string, number> = {
  'LBL-500ML-A': 0xf4f4f0,
  'LBL-750ML-B': 0x2f7d4f,
  'LBL-330ML-C': 0xb5651d,
  'LBL-500ML-LEGACY': 0x6d6f95,
};

const labelMaterialCache = new Map<string, THREE.MeshStandardMaterial>();

export function labelMaterial(variant: string): THREE.MeshStandardMaterial {
  const cached = labelMaterialCache.get(variant);
  if (cached) return cached;

  const material = new THREE.MeshStandardMaterial({
    color: LABEL_COLORS[variant] ?? 0xf4f4f0,
    roughness: 0.85,
    metalness: 0,
  });
  labelMaterialCache.set(variant, material);
  return material;
}

export function disposeMaterials(): void {
  for (const material of Object.values(materials)) material.dispose();
  for (const material of labelMaterialCache.values()) material.dispose();
  labelMaterialCache.clear();
}
