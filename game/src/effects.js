// effects.js — one pooled particle system for dust, sparks, smoke and
// explosions. No textures, no files: points with per-particle colour.
import * as THREE from 'three';

const MAX = 600;

export function createEffects(scene) {
  // Soft round sprite so particles read as puffs and sparks, not squares.
  const sprite = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const positions = new Float32Array(MAX * 3);
  const colors = new Float32Array(MAX * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.55, vertexColors: true, transparent: true, opacity: 0.95,
    depthWrite: false, sizeAttenuation: true, map: sprite, alphaTest: 0.02,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  for (let i = 0; i < MAX; i++) positions[i * 3 + 1] = -999;

  const parts = [];
  for (let i = 0; i < MAX; i++) {
    parts.push({ alive: false, x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, grav: 0, r: 1, g: 1, b: 1 });
  }
  let cursor = 0;

  function spawn(x, y, z, vx, vy, vz, life, color, grav) {
    const p = parts[cursor];
    cursor = (cursor + 1) % MAX;
    p.alive = true; p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.life = life; p.maxLife = life; p.grav = grav;
    const c = new THREE.Color(color);
    p.r = c.r; p.g = c.g; p.b = c.b;
  }

  const E = {
    spawnBurst(x, y, z, opts) {
      const n = opts.count || 12;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (opts.speed || 5) * (0.4 + Math.random() * 0.8);
        spawn(
          x, y, z,
          Math.cos(a) * sp, (opts.up || 0.6) * sp * Math.random() + 1, Math.sin(a) * sp,
          (opts.life || 0.6) * (0.6 + Math.random() * 0.8),
          opts.color || 0xffc832, opts.grav ?? 6
        );
      }
    },
    spawnDust(x, y, z) {
      E.spawnBurst(x, y, z, { count: 3, color: 0xb0a890, speed: 1.6, life: 0.7, up: 0.4, grav: -1 });
    },
    spawnSparks(x, y, z) {
      E.spawnBurst(x, y, z, { count: 10, color: 0xffd24a, speed: 7, life: 0.35, up: 0.5, grav: 9 });
    },
    spawnSmoke(x, y, z) {
      E.spawnBurst(x, y, z, { count: 2, color: 0x3a3a3a, speed: 1.2, life: 1.4, up: 1.4, grav: -2 });
    },
    spawnExplosion(x, y, z) {
      E.spawnBurst(x, y, z, { count: 40, color: 0xff7a20, speed: 11, life: 0.8, up: 0.9, grav: 4 });
      E.spawnBurst(x, y, z, { count: 24, color: 0x2a2a2a, speed: 5, life: 1.6, up: 1.6, grav: -2 });
      E.spawnBurst(x, y, z, { count: 16, color: 0xffe94a, speed: 14, life: 0.4, up: 0.7, grav: 6 });
    },
    update(dt) {
      for (let i = 0; i < MAX; i++) {
        const p = parts[i];
        if (!p.alive) { positions[i * 3 + 1] = -999; continue; }
        p.life -= dt;
        if (p.life <= 0) { p.alive = false; positions[i * 3 + 1] = -999; continue; }
        p.vy -= p.grav * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < 0.05) { p.y = 0.05; p.vy = 0; }
        positions[i * 3] = p.x;
        positions[i * 3 + 1] = p.y;
        positions[i * 3 + 2] = p.z;
        const f = p.life / p.maxLife;
        colors[i * 3] = p.r * f;
        colors[i * 3 + 1] = p.g * f;
        colors[i * 3 + 2] = p.b * f;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
  };
  return E;
}
