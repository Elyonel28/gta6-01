// traffic.js — the city alive: cars driving the street grid and pedestrians
// walking the sidewalks. Traffic cars turn at intersections, queue behind each
// other, and stop for the player; pedestrians flee gunfire.
import * as THREE from 'three';
import { mulberry32, randRange, randInt, pick, clamp, angleLerp, dist2d } from './utils.js';
import { STREETS } from './city.js';
import { makeCar, carColor } from './vehicles.js';

function buildPedMesh(colorHex) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: colorHex });
  const pants = new THREE.MeshLambertMaterial({ color: [0x2a2a34, 0x4a3a2a, 0x3a4a5a][Math.floor(Math.random() * 3)] });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a077 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const torso = new THREE.Mesh(box, shirt);
  torso.scale.set(0.55, 0.7, 0.3);
  torso.position.y = 1.1;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(box, skin);
  head.scale.set(0.3, 0.32, 0.28);
  head.position.y = 1.66;
  g.add(head);
  const legL = new THREE.Mesh(box, pants);
  legL.scale.set(0.2, 0.66, 0.22);
  legL.position.set(-0.14, 0.34, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.14;
  g.add(legR);
  g.userData = { legL, legR, isActor: true };
  return g;
}

const PED_SHIRTS = [0xd06040, 0x4a7ab0, 0xe0c040, 0x7a4a9a, 0x4a9a6a, 0xe8e8e8, 0xb03060, 0x3a9a9a];

export function createTraffic(scene, city) {
  const rng = mulberry32(20240);
  const cars = [];
  const peds = [];

  // Right-hand lanes: driving +x uses street+3, -x uses street-3,
  // driving +z uses street-3, -z uses street+3.
  function laneOffset(axis, dir) {
    if (axis === 'x') return dir > 0 ? 3 : -3;
    return dir > 0 ? -3 : 3;
  }
  function spawnTrafficCar() {
    const axis = rng() < 0.5 ? 'x' : 'z';
    const street = pick(rng, STREETS);
    const dir = rng() < 0.5 ? 1 : -1;
    const along = randRange(rng, -150, 150);
    const x = axis === 'x' ? along : street + laneOffset(axis, dir);
    const z = axis === 'x' ? street + laneOffset(axis, dir) : along;
    const kind = rng() < 0.12 ? 'taxi' : rng() < 0.12 ? 'truck' : 'sedan';
    const car = makeCar(scene, {
      kind, color: kind === 'taxi' ? 0xe8c832 : carColor(randInt(rng, 0, 8)),
      x, z, heading: axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
    });
    car.traffic = { axis, dir, street, speed: randRange(rng, 8, 13), wait: 0 };
    cars.push(car);
    return car;
  }
  for (let i = 0; i < 14; i++) spawnTrafficCar();

  function spawnPed() {
    const street = pick(rng, STREETS);
    const along = randRange(rng, -150, 150);
    const side = rng() < 0.5 ? 8.6 : -8.6;
    const onX = rng() < 0.5;
    const mesh = buildPedMesh(PED_SHIRTS[randInt(rng, 0, PED_SHIRTS.length - 1)]);
    const x = onX ? along : street + side;
    const z = onX ? street + side : along;
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const ped = {
      mesh, x, z, heading: rng() * Math.PI * 2, speed: randRange(rng, 1.2, 2.2),
      walkPhase: rng() * 6, dead: false, flee: 0, fade: 1,
      axis: onX ? 'x' : 'z', dir: rng() < 0.5 ? 1 : -1, street,
    };
    peds.push(ped);
    return ped;
  }
  for (let i = 0; i < 24; i++) spawnPed();

  function carAhead(car) {
    // A car on the same road, same lane, in front within 9 units.
    for (const o of cars) {
      if (o === car || o.dead) continue;
      const t = car.traffic;
      const ot = o.traffic;
      if (t.axis !== ot.axis || t.street !== ot.street || t.dir !== ot.dir) continue;
      const along = t.axis === 'x' ? o.x - car.x : o.z - car.z;
      if (along * t.dir > 0 && Math.abs(along) < 9) return true;
    }
    return false;
  }

  return {
    cars, peds,
    fleeFrom(x, z, radius) {
      for (const p of peds) {
        if (p.dead) continue;
        if (dist2d(p.x, p.z, x, z) < radius) {
          p.flee = 3;
          p.heading = Math.atan2(p.x - x, p.z - z);
        }
      }
    },
    killPed(ped) {
      if (ped.dead) return;
      ped.dead = true;
      ped.mesh.rotation.x = -Math.PI / 2;
      ped.mesh.position.y = 0.3;
    },
    update(dt, playerCar, playerX, playerZ) {
      // --- traffic cars ---
      for (const car of cars) {
        if (car.dead) continue;
        const t = car.traffic;
        // Blocked by the car ahead, or by the player's car: wait.
        let blocked = carAhead(car);
        if (playerCar && !playerCar.dead) {
          const dx = playerCar.x - car.x, dz = playerCar.z - car.z;
          const ahead = t.axis === 'x' ? dx * t.dir : dz * t.dir;
          const side = t.axis === 'x' ? Math.abs(dz - laneOffset('x', t.dir) + 0) : 0;
          const lat = t.axis === 'x' ? Math.abs((car.z - t.street) - (playerCar.z - t.street)) : Math.abs((car.x - t.street) - (playerCar.x - t.street));
          if (ahead > 0 && ahead < 9 && lat < 5) blocked = true;
        }
        const targetSpeed = blocked ? 0 : t.speed;
        car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 3);
        car.x += Math.sin(car.heading) * car.speed * dt;
        car.z += Math.cos(car.heading) * car.speed * dt;
        // At a cross street, sometimes turn onto it.
        const along = t.axis === 'x' ? car.x : car.z;
        let nearestCross = null;
        for (const s of STREETS) {
          if (Math.abs(along - s) < 1.2) { nearestCross = s; break; }
        }
        if (nearestCross !== null && rng() < 0.012) {
          const newAxis = t.axis === 'x' ? 'z' : 'x';
          const newDir = rng() < 0.5 ? 1 : -1;
          const newStreet = nearestCross;
          t.axis = newAxis; t.dir = newDir; t.street = newStreet;
          if (newAxis === 'x') {
            car.z = newStreet + laneOffset('x', newDir);
            car.heading = newDir > 0 ? Math.PI / 2 : -Math.PI / 2;
          } else {
            car.x = newStreet + laneOffset('z', newDir);
            car.heading = newDir > 0 ? 0 : Math.PI;
          }
        }
        // Wrap around the city edge instead of driving into the sea.
        if (car.x > 168 || car.x < -168 || car.z > 168 || car.z < -168) {
          car.remove();
          const i = cars.indexOf(car);
          if (i >= 0) cars.splice(i, 1);
          spawnTrafficCar();
          continue;
        }
        car.mesh.position.set(car.x, 0, car.z);
        car.mesh.rotation.y = car.heading;
        for (const w of car.mesh.userData.wheels) w.rotation.x += (car.speed / 0.38) * dt;
      }
      // --- pedestrians ---
      for (const p of peds) {
        if (p.dead) {
          p.fade -= dt * 0.25;
          if (p.fade <= 0) {
            scene.remove(p.mesh);
            const i = peds.indexOf(p);
            if (i >= 0) peds.splice(i, 1);
            spawnPed();
          } else {
            p.mesh.traverse((o) => { if (o.material) o.material.transparent = true; });
            p.mesh.traverse((o) => { if (o.material) o.material.opacity = Math.max(0, p.fade); });
          }
          continue;
        }
        const speed = p.flee > 0 ? 6.5 : p.speed;
        if (p.flee > 0) p.flee -= dt;
        p.x += Math.sin(p.heading) * speed * dt;
        p.z += Math.cos(p.heading) * speed * dt;
        // At a cross street, sometimes turn onto the other sidewalk.
        const along = p.axis === 'x' ? p.x : p.z;
        let nearestCross = null;
        for (const s of STREETS) {
          if (Math.abs(along - s) < 1.0) { nearestCross = s; break; }
        }
        if (nearestCross !== null && rng() < 0.008) {
          const side = rng() < 0.5 ? 8.6 : -8.6;
          if (p.axis === 'x') {
            p.axis = 'z'; p.street = nearestCross;
            p.z = nearestCross + side;
            p.heading = p.dir > 0 ? 0 : Math.PI;
          } else {
            p.axis = 'x'; p.street = nearestCross;
            p.x = nearestCross + side;
            p.heading = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          }
        }
        if (p.x > 166 || p.x < -166 || p.z > 166 || p.z < -166) {
          p.heading += Math.PI;
          p.x = clamp(p.x, -166, 166);
          p.z = clamp(p.z, -166, 166);
        }
        p.walkPhase += dt * speed * 3.2;
        const sw = Math.sin(p.walkPhase) * 0.5;
        p.mesh.userData.legL.rotation.x = sw;
        p.mesh.userData.legR.rotation.x = -sw;
        p.mesh.position.set(p.x, 0, p.z);
        p.mesh.rotation.y = p.heading;
      }
    },
  };
}
