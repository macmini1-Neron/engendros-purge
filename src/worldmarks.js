// worldmarks.js — reusable industrial landmark builders for the «КОМБИНАТ» / Зона-704 world map.
// Each builder returns a self-contained THREE.Group at the origin; the caller positions it
// (`group.position.set(x, y, z)`) and adds it to the scene. No textures, no custom shaders,
// no heightfield coupling — drop-in props.
//
// Provenance: extracted from the «Зона 704» world-experience demo (the standalone showcase HTML)
// so the assets the owner liked aren't lost in a one-off demo file. The cooling tower is the first;
// its siblings (factory hall + striped chimney, slag cone «террикон», water tower) can join here.
import * as THREE from 'three';

// Iconic waisted-hyperboloid Soviet power-plant cooling tower (ТЭЦ). ~34 m tall, base radius 15 m,
// pinched to ~9.6 m at the waist, flaring to an 11.8 m top rim. The silhouette IS the landmark, so
// the profile is fixed; only the materials are injectable (e.g. to share a scene-wide concrete set).
export function buildCoolingTower(opts = {}) {
  const concrete = opts.concrete || new THREE.MeshStandardMaterial({ color: 0x787a72, roughness: 0.95, side: THREE.DoubleSide });
  const concreteD = opts.concreteD || new THREE.MeshStandardMaterial({ color: 0x595b53, roughness: 0.96 });
  // 2D profile (radius, height) rotated about +Y into a surface of revolution.
  const prof = [[15, 0], [13.5, 6], [11, 14], [9.6, 22], [10, 28], [11.8, 34]].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.Group();
  g.name = 'coolingTower';
  const shell = new THREE.Mesh(new THREE.LatheGeometry(prof, 30), concrete); // DoubleSide so the inner wall reads when looking up the throat
  shell.castShadow = true; shell.receiveShadow = true;
  g.add(shell);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(11.8, 0.6, 8, 30), concreteD); // top lip ring
  rim.rotation.x = Math.PI / 2; rim.position.y = 34;
  g.add(rim);
  return g;
}
