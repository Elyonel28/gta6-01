// player.js — Danny Reyes on foot: a low-poly figure that walks, runs, jumps,
// and climbs into any car with E. The camera lives in main.js; this is movement only.
import * as THREE from 'three';
import { clamp, resolveCircleBox } from './utils.js';

export function buildPlayerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x1a8a7a });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a2a34 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a077 });
  const hair = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const box = new THREE.BoxGeometry(1, 1, 1);

  const torso = new THREE.Mesh(box, jacket);
  torso.scale.set(0.62, 0.78, 0.34);
  torso.position.y = 1.18;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(box, skin);
  head.scale.set(0.34, 0.36, 0.32);
  head.position.y = 1.78;
  head.castShadow = true;
  g.add(head);
  const cap = new THREE.Mesh(box, hair);
  cap.scale.set(0.36, 0.14, 0.34);
  cap.position.y = 1.98;
  g.add(cap);
  const legL = new THREE.Mesh(box, pants);
  legL.scale.set(0.24, 0.72, 0.26);
  legL.position.set(-0.17, 0.38, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.17;
  g.add(legR);
  const armL = new THREE.Mesh(box, jacket);
  armL.scale.set(0.2, 0.66, 0.22);
  armL.position.set(-0.42, 1.2, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.42;
  g.add(armR);
  g.userData = { legL, legR, armL, armR };
  return g;
}

export function createPlayer(scene, x, z) {
  const mesh = buildPlayerMesh();
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  const p = {
    mesh, x, z, y: 0, vy: 0, heading: 0, speed: 0,
    health: 100, inCar: false, car: null, walkPhase: 0, radius: 0.6,
  };
  p.update = function (dt, input, camYaw, colliders) {
    if (p.inCar) return;
    // WASD relative to the camera: W walks away from the camera.
    let fx = 0, fz = 0;
    if (input.forward) { fx += -Math.sin(camYaw); fz += -Math.cos(camYaw); }
    if (input.back) { fx += Math.sin(camYaw); fz += Math.cos(camYaw); }
    if (input.left) { fx += -Math.cos(camYaw); fz += Math.sin(camYaw); }
    if (input.right) { fx += Math.cos(camYaw); fz += -Math.sin(camYaw); }
    const len = Math.hypot(fx, fz);
    const sprint = !!input.sprint;
    const target = len > 0 ? (sprint ? 10 : 6) : 0;
    p.speed += (target - p.speed) * Math.min(1, dt * 10);
    if (len > 0) {
      fx /= len; fz /= len;
      p.heading = Math.atan2(fx, fz);
      p.x += fx * p.speed * dt;
      p.z += fz * p.speed * dt;
      p.walkPhase += dt * p.speed * 1.6;
    }
    // Jump and gravity.
    if (input.jump && p.y === 0) { p.vy = 7; }
    if (p.y > 0 || p.vy !== 0) {
      p.vy -= 22 * dt;
      p.y += p.vy * dt;
      if (p.y <= 0) { p.y = 0; p.vy = 0; }
    }
    // Buildings push the player out; stay inside the city.
    if (colliders) {
      for (const b of colliders) {
        const r = resolveCircleBox(p.x, p.z, p.radius, b);
        if (r) { p.x = r.x; p.z = r.z; }
      }
    }
    p.x = clamp(p.x, -168, 168);
    p.z = clamp(p.z, -168, 262);
    mesh.position.set(p.x, p.y, p.z);
    mesh.rotation.y = p.heading;
    // Walk-cycle swing.
    const sw = Math.sin(p.walkPhase) * (p.speed > 0.5 ? 0.55 : 0);
    mesh.userData.legL.rotation.x = sw;
    mesh.userData.legR.rotation.x = -sw;
    mesh.userData.armL.rotation.x = -sw * 0.8;
    mesh.userData.armR.rotation.x = sw * 0.8;
  };
  p.setPosition = function (x, z) {
    p.x = x; p.z = z; p.y = 0; p.vy = 0;
    mesh.position.set(x, 0, z);
  };
  p.heal = function (n) { p.health = Math.min(100, p.health + n); };
  p.hurt = function (n) { p.health = Math.max(0, p.health - n); return p.health <= 0; };
  return p;
}
