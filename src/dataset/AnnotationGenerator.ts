import * as THREE from 'three';
import { datasetClassNames, datasetClasses } from '@/config/dataset.config';
import type { DefectType } from '@/models/DefectType';

export interface YoloAnnotation {
  classId: number;
  className: (typeof datasetClasses)[number];
  xCenter: number;
  yCenter: number;
  width: number;
  height: number;
}

const cornersOf = (box: THREE.Box3): THREE.Vector3[] => {
  const { min, max } = box;
  return [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z),
  ];
};

const clampUnit = (value: number): number => Math.max(0, Math.min(1, value));

/** Projects one product's complete visible geometry into a normalized YOLO box. */
export function generateProductAnnotation(
  product: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
  defectType: DefectType,
): YoloAnnotation | undefined {
  if (!product.visible) return undefined;

  product.updateWorldMatrix(true, true);
  camera.updateWorldMatrix(true, false);
  camera.updateProjectionMatrix();

  const bounds = new THREE.Box3().setFromObject(product);
  if (bounds.isEmpty()) return undefined;

  const cameraSpaceCenter = bounds.getCenter(new THREE.Vector3()).applyMatrix4(camera.matrixWorldInverse);
  if (cameraSpaceCenter.z >= -camera.near || cameraSpaceCenter.z <= -camera.far) return undefined;

  const projected = cornersOf(bounds).map((corner) => corner.project(camera));
  const left = clampUnit((Math.min(...projected.map((point) => point.x)) + 1) / 2);
  const right = clampUnit((Math.max(...projected.map((point) => point.x)) + 1) / 2);
  const top = clampUnit((1 - Math.max(...projected.map((point) => point.y))) / 2);
  const bottom = clampUnit((1 - Math.min(...projected.map((point) => point.y))) / 2);

  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) return undefined;

  const className = datasetClassNames[defectType];
  return {
    classId: datasetClasses.indexOf(className),
    className,
    xCenter: left + width / 2,
    yCenter: top + height / 2,
    width,
    height,
  };
}

export function serializeYoloAnnotation(annotation: YoloAnnotation): string {
  return [
    annotation.classId,
    annotation.xCenter,
    annotation.yCenter,
    annotation.width,
    annotation.height,
  ]
    .map((value, index) => (index === 0 ? String(value) : value.toFixed(6)))
    .join(' ');
}