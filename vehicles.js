// vehicles.js — builds cars from boxes and drives them with arcade physics.
// Kinds: sedan, taxi, sport, truck, police. One mesh builder, one physics step.
import * as THREE from 'three';
import { clamp, angleLerp, resolveCircleBox } from './utils.js';

const CAR_COLORS = [0xc03028, 0x2a5ab0, 0xe8c832, 0x3a9a5a, 0x8a8a92, 0xe8e8e8, 0x222226, 0xd07020, 0x7a4a9a];

export function carColor(i) { return CAR_COLORS[i % CAR_COLORS.length]; }

export function buildCarMesh(kind, colorHex) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: colorHex });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2836 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x181818 });
  const box = new THREE.BoxGeometry(1, 1, 1);

  const body = new THREE.Mesh(box, bodyMat);
  body.scale.set(2.0, 0.62, 4.4);
  body.position.y = 0.55;
  body.castShadow = true;
  g.add(body);

  const cabin = new THREE.Mesh(box, kind === 'truck' ? bodyMat : glassMat);
  cabin.scale.set(1.8, 0.55, kind === 'truck' ? 1.2 : 2.2);
  cabin.position.set(0, 1.1, kind === 'truck' ? 1.2 : -0.2);
  cabin.castShadow = true;
  g.add(cabin);

  if (kind === 'truck') {
    const bed = new THREE.Mesh(box, darkMat);
    bed.scale.set(1.9, 0.5, 2.0);
    bed.position.set(0, 0.95, -1.1);
    g.add(bed);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0xffe94a }));
    sign.scale.set(0.9, 0.25, 0.4);
    sign.position.set(0, 1.5, -0.2);
    g.add(sign);
  }
  if (kind === 'police') {
    const bar = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    bar.scale.set(1.2, 0.18, 0.4);
    bar.position.set(0, 1.45, -0.2);
    bar.name = 'lightbar';
    g.add(bar);
    const stripe = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0x111111 }));
    stripe.scale.set(2.02, 0.2, 4.42);
    stripe.position.y = 0.62;
    g.add(stripe);
  }

  // Headlights and taillights.
  const hl = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  const tl = new THREE.MeshBasicMaterial({ color: 0xd02020 });
  for (const sx of [-0.7, 0.7]) {
    const h = new THREE.Mesh(box, hl);
    h.scale.set(0.4, 0.18, 0.1);
    h.position.set(sx, 0.62, 2.22);
    g.add(h);
    const t = new THREE.Mesh(box, tl);
    t.scale.set(0.4, 0.18, 0.1);
    t.position.set(sx, 0.62, -2.22);
    g.add(t);
  }

  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    w.castShadow = true;
    g.add(w);
    wheels.push(w);
  }
  g.userData.wheels = wheels;
  g.userData.isActor = true;
  return g;
}

// Arcade car: throttle/brake/steer, building collisions, car-car push-apart.
export function makeCar(scene, opts) {
  const mesh = buildCarMesh(opts.kind || 'sedan', opts.color ?? 0xc03028);
  mesh.position.set(opts.x || 0, 0, opts.z || 0);
  mesh.rotation.y = opts.heading || 0;
  scene.add(mesh);
  const car = {
    mesh, kind: opts.kind || 'sedan', heading: opts.heading || 0,
    speed: 0, steer: 0, health: 100, dead: false, isPlayer: !!opts.isPlayer,
    topSpeed: opts.kind === 'sport' ? 34 : opts.kind === 'truck' ? 20 : 26,
    accel: opts.kind === 'sport' ? 16 : 11,
    radius: 2.4,
    x: opts.x || 0, z: opts.z || 0,
  };
  car.update = function (dt, input, colliders, others) {
    if (car.dead) return;
    const throttle = input.throttle || 0; // -1..1
    const steerIn = input.steer || 0; // -1..1
    const handbrake = !!input.handbrake;
    const maxRev = -8;
    if (throttle > 0) car.speed += car.accel * throttle * dt;
    else if (throttle < 0) {
      if (car.speed > 0.5) car.speed -= 22 * dt; // brake
      else car.speed = Math.max(maxRev, car.speed - 6 * dt); // reverse
    } else {
      car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
    }
    if (handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
    car.speed = clamp(car.speed, maxRev, car.topSpeed);
    const spd = Math.abs(car.speed);
    const steerTarget = steerIn * (0.55 + 0.5 * (1 - spd / car.topSpeed));
    car.steer = angleLerp(car.steer, steerTarget, Math.min(1, dt * 8));
    car.heading += (car.steer * spd * 0.055 * (car.speed >= 0 ? 1 : -1)) * dt;
    const nx = car.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.z + Math.cos(car.heading) * car.speed * dt;
    car.x = nx; car.z = nz;
    // Buildings: slide along them, lose a little speed on impact.
    if (colliders) {
      for (const b of colliders) {
        const r = resolveCircleBox(car.x, car.z, car.radius, b);
        if (r) {
          const hitSpeed = Math.abs(car.speed);
          car.x = r.x; car.z = r.z;
          if (hitSpeed > 6) car.speed *= 0.4;
          else car.speed *= 0.85;
        }
      }
    }
    // Other cars: push apart.
    if (others) {
      for (const o of others) {
        if (o === car || o.dead) continue;
        const dx = car.x - o.x, dz = car.z - o.z;
        const d2 = dx * dx + dz * dz;
        const min = car.radius + o.radius;
        if (d2 < min * min && d2 > 0.001) {
          const d = Math.sqrt(d2);
          const push = (min - d) / 2;
          car.x += (dx / d) * push; car.z += (dz / d) * push;
          o.x -= (dx / d) * push; o.z -= (dz / d) * push;
          car.speed *= 0.7;
        }
      }
    }
    car.x = clamp(car.x, -168, 168);
    car.z = clamp(car.z, -168, 168);
    mesh.position.set(car.x, 0, car.z);
    mesh.rotation.y = car.heading;
    for (const w of mesh.userData.wheels) w.rotation.x += (car.speed / 0.38) * dt;
    mesh.userData.wheels[0].rotation.y = car.steer * 0.4;
    mesh.userData.wheels[1].rotation.y = car.steer * 0.4;
  };
  car.damage = function (n) {
    car.health -= n;
    if (car.health <= 0 && !car.dead) { car.dead = true; }
    return car.dead;
  };
  car.remove = function () { scene.remove(mesh); };
  return car;
}
