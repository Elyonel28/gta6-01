// police.js — the wanted system: stars rise with crime, Solmar PD cruisers spawn
// and chase, lights flashing and sirens wailing. Lose them to cool off; get caught
// and you are busted.
import * as THREE from 'three';
import { mulberry32, randRange, clamp, angleLerp, dist2d } from './utils.js';
import { STREETS } from './city.js';
import { makeCar } from './vehicles.js';

export function createPolice(scene, city, audio) {
  const rng = mulberry32(777);
  const cars = [];
  let wanted = 0;
  let decayTimer = 0;
  let bustTimer = 0;
  let flashTimer = 0;
  let flashRed = false;
  let onBusted = null;

  function spawnCop(px, pz) {
    // Spawn on a nearby street, 55-75 units away.
    const street = STREETS[Math.floor(rng() * STREETS.length)];
    const axis = rng() < 0.5 ? 'x' : 'z';
    const along = clamp((axis === 'x' ? px : pz) + (rng() < 0.5 ? -1 : 1) * randRange(rng, 55, 75), -160, 160);
    const x = axis === 'x' ? along : street;
    const z = axis === 'x' ? street : along;
    const car = makeCar(scene, {
      kind: 'police', color: 0xf0f0f0, x, z,
      heading: Math.atan2(px - x, pz - z),
    });
    car.topSpeed = 30;
    car.police = { stuck: 0 };
    cars.push(car);
    return car;
  }

  function desiredCount() { return Math.min(wanted, 4); }

  return {
    cars,
    get wanted() { return wanted; },
    set onBustedCb(f) { onBusted = f; },
    addWanted(n) {
      wanted = clamp(wanted + n, 0, 5);
      decayTimer = 0;
    },
    setWanted(n) { wanted = clamp(n, 0, 5); decayTimer = 0; },
    clearWanted() { wanted = 0; bustTimer = 0; for (const c of cars) c.remove(); cars.length = 0; },
    update(dt, player, playerCar) {
      // Chase the car when the player is driving, the player on foot.
      const px = player.inCar && playerCar ? playerCar.x : player.x;
      const pz = player.inCar && playerCar ? playerCar.z : player.z;
      // Spawn / remove cruisers to match the wanted level.
      while (cars.length < desiredCount()) spawnCop(px, pz);
      while (cars.length > desiredCount()) {
        const c = cars.pop();
        c.remove();
      }
      const anyActive = cars.length > 0;
      audio.siren(anyActive);
      // Flashing light bars.
      flashTimer += dt;
      if (flashTimer > 0.25) {
        flashTimer = 0;
        flashRed = !flashRed;
        for (const c of cars) {
          const bar = c.mesh.getObjectByName('lightbar');
          if (bar) bar.material.color.setHex(flashRed ? 0xff2020 : 0x2050ff);
        }
      }
      if (wanted === 0) { bustTimer = 0; return { busted: false }; }
      // Chase: steer toward the player, ram, and push through buildings.
      let nearest = Infinity;
      for (const c of cars) {
        if (c.dead) continue;
        const d = dist2d(c.x, c.z, px, pz);
        nearest = Math.min(nearest, d);
        const targetHeading = Math.atan2(px - c.x, pz - c.z);
        const steer = clamp(((targetHeading - c.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -1, 1);
        const throttle = d > 6 ? 1 : 0.6;
        c.update(dt, { throttle, steer, handbrake: false }, city.colliders, cars);
        // Ram damage to the player's car, or the player on foot.
        if (d < 4.5) {
          if (playerCar && !playerCar.dead) {
            playerCar.health -= 6 * dt;
            if (playerCar.health <= 0) playerCar.damage(999);
          } else if (!player.inCar) {
            player.hurt(8 * dt);
          }
        }
        // Stuck against a wall: reverse out.
        if (Math.abs(c.speed) < 1 && d > 10) {
          c.police.stuck += dt;
          if (c.police.stuck > 2.5) {
            c.heading += Math.PI * 0.7;
            c.police.stuck = 0;
          }
        } else c.police.stuck = 0;
      }
      // Busted: a cruiser sits on a slow player for 2.5 s.
      const playerSpeed = playerCar ? Math.abs(playerCar.speed) : player.speed;
      if (nearest < 4.5 && playerSpeed < 4) {
        bustTimer += dt;
        if (bustTimer > 2.5) {
          bustTimer = 0;
          if (onBusted) onBusted();
          return { busted: true };
        }
      } else {
        bustTimer = Math.max(0, bustTimer - dt * 2);
      }
      // Cool off: no cruiser near for a while, one star fades.
      if (nearest > 80) {
        decayTimer += dt;
        if (decayTimer > 10) {
          decayTimer = 0;
          wanted = Math.max(0, wanted - 1);
        }
      } else decayTimer = 0;
      return { busted: false, nearest };
    },
  };
}
