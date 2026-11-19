// combat.js — the pistol: click to fire from the camera's crosshair, a tracer,
// a muzzle flash, and real consequences. Pedestrians fall, police cruisers smoke
// and burn, and every shot is heard across the block.
import * as THREE from 'three';

export function createCombat(scene, game) {
  const raycaster = new THREE.Raycaster();
  const flash = new THREE.PointLight(0xffc860, 0, 18, 1.8);
  scene.add(flash);
  let tracer = null;
  let tracerLife = 0;
  let lastShot = 0;

  function makeTracer(from, to) {
    if (tracer) scene.remove(tracer);
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xffe9a0, transparent: true, opacity: 0.9,
    }));
    scene.add(tracer);
    tracerLife = 0.09;
  }

  return {
    update(dt) {
      if (tracer) {
        tracerLife -= dt;
        if (tracerLife <= 0) { scene.remove(tracer); tracer = null; }
        else tracer.material.opacity = tracerLife / 0.09;
      }
      flash.intensity = Math.max(0, flash.intensity - dt * 60);
    },
    // Returns 'ped' | 'cop' | 'world' | null (null = still cooling down).
    shoot(now) {
      if (now - lastShot < 0.18) return null;
      lastShot = now;
      const { camera, traffic, police, effects, audio, player } = game;
      const origin = new THREE.Vector3();
      camera.getWorldPosition(origin);
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      raycaster.set(origin, dir);
      raycaster.far = 120;

      // Targets: pedestrians, police cruisers, then the world itself.
      const targets = [];
      for (const p of traffic.peds) if (!p.dead) targets.push(p.mesh);
      for (const c of police.cars) if (!c.dead) targets.push(c.mesh);
      const hits = raycaster.intersectObjects(targets, true);
      const worldHits = raycaster.intersectObjects(game.cityGroup.children, true);
      let hit = null;
      let hitKind = null;
      if (hits.length) { hit = hits[0]; hitKind = 'actor'; }
      if (worldHits.length && (!hit || worldHits[0].distance < hit.distance)) {
        hit = worldHits[0]; hitKind = 'world';
      }
      const from = origin.clone().add(dir.clone().multiplyScalar(1.2));
      from.y -= 0.25;
      const end = hit ? hit.point.clone() : origin.clone().add(dir.clone().multiplyScalar(90));
      makeTracer(from, end);
      flash.position.copy(from);
      flash.intensity = 5;
      audio.gunshot();
      traffic.fleeFrom(player.x, player.z, 30);

      if (!hit) return 'world';
      if (hitKind === 'world') {
        effects.spawnSparks(hit.point.x, hit.point.y + 0.1, hit.point.z);
        return 'world';
      }
      // Which actor did we hit?
      let obj = hit.object;
      while (obj && !obj.userData.isActor) obj = obj.parent;
      // Walk up: ped meshes and car meshes carry their owner in userData.
      let ped = null, cop = null;
      for (const p of traffic.peds) if (!p.dead && p.mesh === obj) ped = p;
      for (const c of police.cars) if (!c.dead && c.mesh === obj) cop = c;
      if (ped) {
        traffic.killPed(ped);
        effects.spawnBurst(hit.point.x, hit.point.y, hit.point.z, { count: 14, color: 0xc02020, speed: 5, life: 0.5 });
        police.addWanted(1);
        return 'ped';
      }
      if (cop) {
        const dead = cop.damage(34);
        effects.spawnSparks(hit.point.x, hit.point.y, hit.point.z);
        if (dead) {
          effects.spawnExplosion(cop.x, 1, cop.z);
          audio.thud();
          police.addWanted(2);
          const i = police.cars.indexOf(cop);
          if (i >= 0) police.cars.splice(i, 1);
          cop.remove();
          return 'cop-dead';
        }
        police.addWanted(1);
        return 'cop';
      }
      effects.spawnSparks(hit.point.x, hit.point.y + 0.1, hit.point.z);
      return 'world';
    },
  };
}
