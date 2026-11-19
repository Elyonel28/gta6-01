// main.js — Solmar City: Streets of Gold. Boots the renderer, wires every system,
// runs the loop, the camera, the save, and the screenshot set-up modes.
import * as THREE from 'three';
import { buildCity, STREETS } from './city.js';
import { createPlayer } from './player.js';
import { makeCar, carColor } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createCombat } from './combat.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { mulberry32, randRange, randInt, pick, clamp, angleLerp, dist2d } from './utils.js';

const SAVE_KEY = 'solmar-city-save-v1';
const params = new URLSearchParams(location.search);
const shotMode = params.get('shot'); // drive | foot | chase | mission — screenshot set-up
const perfLow = params.get('perf') === 'low'; // low-fx mode: no shadows, 1x pixels (slow machines)

window.addEventListener('error', (e) => {
  const el = document.getElementById('err');
  if (el) { el.textContent = 'ERROR: ' + e.message; el.style.display = 'block'; }
});

// ---------- renderer, scene, lights ----------
const renderer = new THREE.WebGLRenderer({ antialias: !perfLow });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(perfLow ? 1 : Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = !perfLow;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ec8e8);
scene.fog = new THREE.Fog(0xa8c8d8, 220, 520);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(60, 40, 90);

const hemi = new THREE.HemisphereLight(0xbfe0ff, 0x8a7a5a, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe0b0, 2.2);
sun.position.set(120, 180, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -120; sun.shadow.camera.right = 120;
sun.shadow.camera.top = 120; sun.shadow.camera.bottom = -120;
sun.shadow.camera.far = 500;
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(sun.target);

// ---------- world and systems ----------
const city = buildCity(scene);
const audio = createAudio();
const hud = createHud();
const effects = createEffects(scene);
const player = createPlayer(scene, 20, 30);
const traffic = createTraffic(scene, city);
const police = createPolice(scene, city, audio);

const G = {
  state: 'menu', money: 0, time: 0, lastDamage: -99,
  camYaw: 2.6, camPitch: 0.3, camDist: 10, lastDrag: -10,
  keys: {}, dragging: false, dragMoved: 0, lastMX: 0, lastMY: 0,
  parkedCars: [], sportCar: null, sportUnlocked: false,
  cash: [], cashTaken: new Set(), autoDrive: false, autoWalk: false,
  dustTimer: 0, shotDone: false,
};

// Parked cars along the curbs, seeded so the same cars are always there.
(function parkCars() {
  const rng = mulberry32(99);
  for (let i = 0; i < 8; i++) {
    const axis = rng() < 0.5 ? 'x' : 'z';
    const street = pick(rng, STREETS);
    const along = randRange(rng, -140, 140);
    const side = rng() < 0.5 ? 7.4 : -7.4;
    const dir = rng() < 0.5 ? 1 : -1;
    const x = axis === 'x' ? along : street + side;
    const z = axis === 'x' ? street + side : along;
    const heading = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    const kind = rng() < 0.15 ? 'sport' : rng() < 0.2 ? 'taxi' : 'sedan';
    const car = makeCar(scene, { kind, color: carColor(randInt(rng, 0, 8)), x, z, heading });
    car.parked = true;
    G.parkedCars.push(car);
  }
})();

function allCars() {
  return [...G.parkedCars, ...traffic.cars, ...police.cars, ...(G.sportCar ? [G.sportCar] : [])];
}

function unlockSport() {
  if (G.sportUnlocked) return;
  G.sportUnlocked = true;
  G.sportCar = makeCar(scene, { kind: 'sport', color: 0xe8c832, x: 48, z: -8, heading: Math.PI / 2 });
  G.sportCar.parked = true;
  hud.message('A Vortex GT is parked at Voss Auto — yours for the taking.');
}

const missions = createMissions(scene, city.landmarks, {
  police, audio, hud,
  addMoney: (n) => { G.money += n; },
  save: () => saveGame(),
  unlockSport,
});
const combat = createCombat(scene, {
  camera, traffic, police, effects, audio, player, cityGroup: city.group,
});

// Cash pickups: spinning green bundles on the sidewalks.
const cashGeo = new THREE.BoxGeometry(0.7, 0.5, 0.7);
const cashMat = new THREE.MeshBasicMaterial({ color: 0x4ade80 });
for (const spot of city.cashSpots) {
  const mesh = new THREE.Mesh(cashGeo, cashMat);
  mesh.position.set(spot.x, 0.9, spot.z);
  scene.add(mesh);
  G.cash.push({ ...spot, mesh, taken: false });
}

// A pistol in the player's right hand, for the crosshair to mean something.
const gun = new THREE.Mesh(
  new THREE.BoxGeometry(0.12, 0.16, 0.42),
  new THREE.MeshLambertMaterial({ color: 0x181818 })
);
gun.position.set(0.42, 1.05, 0.25);
player.mesh.add(gun);

// ---------- save / load ----------
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: G.money,
      completedIds: missions.completedIds,
      cashTaken: [...G.cashTaken],
      px: player.x, pz: player.z,
      sportUnlocked: G.sportUnlocked,
    }));
  } catch (e) { /* private mode: play on without saving */ }
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function applySave(s) {
  G.money = s.money || 0;
  missions.loadProgress(s.completedIds || []);
  G.cashTaken = new Set(s.cashTaken || []);
  for (const c of G.cash) {
    if (G.cashTaken.has(c.id)) { c.taken = true; scene.remove(c.mesh); }
  }
  if (s.sportUnlocked) unlockSport();
  player.setPosition(s.px ?? 20, s.pz ?? 30);
}

// ---------- enter / exit cars ----------
function nearestCar(maxD) {
  let best = null, bestD = maxD;
  for (const c of allCars()) {
    if (c.dead || c === player.car) continue;
    const d = dist2d(player.x, player.z, c.x, c.z);
    if (d < bestD) { best = c; bestD = d; }
  }
  return best;
}
function enterCar(car) {
  player.inCar = true;
  player.car = car;
  player.mesh.visible = false;
  car.isPlayer = true;
  const ti = traffic.cars.indexOf(car);
  if (ti >= 0) traffic.cars.splice(ti, 1);
  const pi = G.parkedCars.indexOf(car);
  if (pi >= 0) G.parkedCars.splice(pi, 1);
  if (G.sportCar === car) G.sportCar = null;
  if (!car.stolen) {
    car.stolen = true;
    police.addWanted(1);
    hud.message('You stole a car! The PD is on to you.');
    audio.honk();
  }
  hud.setHint('W/S drive · A/D steer · Space handbrake · E exit · H honk');
}
function exitCar() {
  const car = player.car;
  if (!car) return;
  const h = car.heading;
  const rx = -Math.cos(h), rz = Math.sin(h);
  player.setPosition(car.x + rx * 3, car.z + rz * 3);
  player.inCar = false;
  player.car = null;
  player.mesh.visible = true;
  car.isPlayer = false;
  G.parkedCars.push(car);
  hud.setHint('WASD move · Shift run · Space jump · E enter car · Click shoot · M mission');
}
function tryEnterCar() {
  if (player.inCar) { exitCar(); return; }
  const car = nearestCar(4.5);
  if (car) enterCar(car);
}

// ---------- busted / wasted ----------
function endRun(kind) {
  const fine = 150;
  G.money = Math.max(0, G.money - fine);
  if (player.inCar) { player.car.isPlayer = false; G.parkedCars.push(player.car); player.car = null; player.inCar = false; player.mesh.visible = true; }
  player.setPosition(20, 30);
  player.health = 100;
  police.clearWanted();
  audio.siren(false);
  G.state = 'busted';
  hud.showBusted(true, kind === 'busted'
    ? 'BUSTED — The PD took you in. You lost $' + fine + ' in fines.'
    : 'WASTED — You woke up at the plaza clinic. You lost $' + fine + '.');
  saveGame();
}

// ---------- input ----------
const KEYMAP = {
  KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint', Space: 'jump',
};
window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  const k = KEYMAP[e.code];
  if (k) G.keys[k] = true;
  if (e.repeat) return;
  if (e.code === 'KeyE' && G.state === 'playing') tryEnterCar();
  if (e.code === 'KeyM' && G.state === 'playing') {
    if (!missions.active && !missions.done) missions.startNext();
    else hud.message(missions.objectiveText());
  }
  if (e.code === 'KeyH' && G.state === 'playing' && player.inCar) audio.honk();
  if (e.code === 'KeyN') { const m = audio.toggleMute(); hud.message(m ? 'Sound off' : 'Sound on'); }
  if ((e.code === 'Escape' || e.code === 'KeyP') && (G.state === 'playing' || G.state === 'paused')) {
    G.state = G.state === 'playing' ? 'paused' : 'playing';
    hud.showPause(G.state === 'paused');
    if (G.state === 'paused') saveGame();
  }
});
window.addEventListener('keyup', (e) => {
  const k = KEYMAP[e.code];
  if (k) G.keys[k] = false;
});
const cvs = renderer.domElement;
cvs.addEventListener('mousedown', (e) => {
  G.dragging = true; G.dragMoved = 0; G.lastMX = e.clientX; G.lastMY = e.clientY;
  audio.init();
});
window.addEventListener('mousemove', (e) => {
  if (!G.dragging) return;
  const dx = e.clientX - G.lastMX, dy = e.clientY - G.lastMY;
  G.lastMX = e.clientX; G.lastMY = e.clientY;
  G.dragMoved += Math.abs(dx) + Math.abs(dy);
  G.camYaw -= dx * 0.005;
  G.camPitch = clamp(G.camPitch + dy * 0.004, 0.06, 1.1);
  G.lastDrag = G.time;
});
window.addEventListener('mouseup', () => {
  if (G.dragging && G.dragMoved < 5 && G.state === 'playing' && !player.inCar) {
    combat.shoot(performance.now() / 1000);
  }
  G.dragging = false;
});
cvs.addEventListener('wheel', (e) => {
  e.preventDefault();
  G.camDist = clamp(G.camDist + Math.sign(e.deltaY) * 1.2, 6, 20);
}, { passive: false });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- menus ----------
const saved = loadSave();
hud.showMenu(!!saved);
hud.setHint('WASD move · Shift run · Space jump · E enter car · Click shoot · M mission');
document.getElementById('btn-start').addEventListener('click', () => {
  audio.init();
  G.money = 0;
  hud.hideMenu();
  G.state = 'playing';
  hud.message('Welcome to Solmar City. Press M to start your first job.');
});
document.getElementById('btn-continue').addEventListener('click', () => {
  audio.init();
  const s = loadSave();
  if (s) applySave(s);
  hud.hideMenu();
  G.state = 'playing';
  hud.message('Welcome back to Solmar City.');
});
document.getElementById('btn-resume').addEventListener('click', () => {
  G.state = 'playing';
  hud.showPause(false);
});
document.getElementById('btn-restart').addEventListener('click', () => {
  location.reload();
});
document.getElementById('btn-quit').addEventListener('click', () => {
  saveGame();
  G.state = 'menu';
  hud.showPause(false);
  hud.showMenu(!!loadSave());
});
document.getElementById('btn-busted').addEventListener('click', () => {
  hud.showBusted(false);
  G.state = 'playing';
});
document.getElementById('btn-mute').addEventListener('click', () => {
  audio.init();
  const m = audio.toggleMute();
  document.getElementById('btn-mute').textContent = m ? '🔇 Sound: off' : '🔊 Sound: on';
});

// ---------- screenshot set-up ----------
function stageNearby(px, pz) {
  // Pedestrians on the sidewalks around the player.
  const spots = [[7, 10], [-8, 6], [10, -8], [-5, -12], [12, 14], [-12, -4]];
  traffic.peds.slice(0, 6).forEach((p, i) => {
    p.x = px + spots[i][0];
    p.z = pz + spots[i][1];
    p.heading = Math.random() * Math.PI * 2;
    p.flee = 0;
  });
  // Two cars on the nearest street, in their correct lanes:
  // one oncoming (northbound, right lane is street+3), one ahead going south.
  const street = STREETS.reduce((a, b) => (Math.abs(b - px) < Math.abs(a - px) ? b : a));
  const c0 = traffic.cars[0];
  c0.x = street + 3; c0.z = pz + 40; c0.heading = Math.PI; c0.speed = 7;
  c0.traffic = { axis: 'z', dir: -1, street, speed: 7, wait: 0 };
  const c1 = traffic.cars[1];
  c1.x = street - 3; c1.z = pz + 26; c1.heading = 0; c1.speed = 7;
  c1.traffic = { axis: 'z', dir: 1, street, speed: 7, wait: 0 };
}

function setupShot() {
  hud.hideMenu();
  G.state = 'playing';
  audio.init();
  if (shotMode === 'foot') {
    player.setPosition(0, -40);
    G.camYaw = 0.15; G.camPitch = 0.3; G.camDist = 9;
    G.autoWalk = true;
    stageNearby(0, -40);
    missions.startNext(); // show the first job's objective on the HUD
  } else if (shotMode === 'drive' || shotMode === 'chase' || shotMode === 'mission') {
    const car = G.parkedCars[0];
    player.setPosition(car.x, car.z);
    enterCar(car);
    // Put the car on a downtown street, rolling south.
    car.x = 40; car.z = -60; car.heading = 0; car.speed = 14;
    G.camYaw = Math.PI; G.camPitch = 0.3; G.camDist = 13;
    G.autoDrive = true;
    stageNearby(40, -60);
    if (shotMode === 'chase') {
      police.setWanted(3);
      hud.message('Three stars — the PD is on you!');
    }
    if (shotMode === 'mission') {
      missions.startNext();
      car.x = 40; car.z = -100; car.heading = 0;
      stageNearby(40, -100);
    }
  }
}
if (shotMode) setupShot();

// ---------- test handle ----------
window.__solmar = {
  get state() { return G.state; },
  get money() { return G.money; },
  get wanted() { return police.wanted; },
  get inCar() { return player.inCar; },
  get playerX() { return player.inCar && player.car ? player.car.x : player.x; },
  get playerZ() { return player.inCar && player.car ? player.car.z : player.z; },
  get carSpeed() { return player.car ? player.car.speed : 0; },
  get missionIndex() { return missions.index; },
  get missionActive() { return missions.active; },
  get policeCount() { return police.cars.length; },
  get trafficCount() { return traffic.cars.length; },
  get pedCount() { return traffic.peds.length; },
  get time() { return G.time; },
  startMission: () => missions.startNext(),
  setWanted: (n) => police.setWanted(n),
  nearbyTraffic: () => {
    const px = player.inCar && player.car ? player.car.x : player.x;
    const pz = player.inCar && player.car ? player.car.z : player.z;
    return traffic.cars.filter((c) => !c.dead && Math.hypot(c.x - px, c.z - pz) < 32).length;
  },
  nearbyPeds: () => traffic.peds.filter((p) => !p.dead && Math.hypot(p.x - player.x, p.z - player.z) < 16).length,
  teleport: (x, z) => {
    if (player.inCar && player.car) { player.car.x = x; player.car.z = z; }
    player.setPosition(x, z);
  },
  enterNearestCar: () => tryEnterCar(),
  parked: () => G.parkedCars.map((c) => ({ x: c.x, z: c.z, kind: c.kind })),
  marker: () => missions.markerPos(),
  get ready() { return G.shotDone; },
};

// ---------- loop ----------
const clock = new THREE.Clock();
let hudTimer = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  G.time += dt;

  if (G.state === 'menu') {
    // Slow orbit over the plaza behind the title screen.
    const a = G.time * 0.05;
    camera.position.set(Math.sin(a) * 95, 46, Math.cos(a) * 95);
    camera.lookAt(0, 8, 0);
    sun.position.set(player.x + 120, 180, player.z + 60);
    sun.target.position.set(player.x, 0, player.z);
    renderer.render(scene, camera);
    G.shotDone = true;
    return;
  }
  if (G.state !== 'playing') {
    renderer.render(scene, camera);
    return;
  }

  const inCar = player.inCar;
  const car = player.car;
  // Where the action is: the car when driving, the player on foot.
  const px = inCar && car ? car.x : player.x;
  const pz = inCar && car ? car.z : player.z;

  // Input mapping.
  const input = {
    forward: !!G.keys.forward || G.autoWalk,
    back: !!G.keys.back,
    left: !!G.keys.left,
    right: !!G.keys.right,
    sprint: !!G.keys.sprint,
    jump: !!G.keys.jump,
  };

  if (inCar && car) {
    let throttle = 0;
    if (G.autoDrive) throttle = 1;
    else if (input.forward) throttle = 1;
    else if (input.back) throttle = -1;
    let steer = 0;
    if (G.autoDrive) {
      // Lane-keep on street x=40, rolling south.
      steer = clamp((car.heading - 0) * -1.2 + (40 - car.x) * 0.02, -1, 1);
    } else {
      steer = (input.left ? 1 : 0) + (input.right ? -1 : 0);
    }
    car.update(dt, { throttle, steer, handbrake: !!input.jump }, city.colliders, allCars());
    // Dust kicked up at speed.
    G.dustTimer -= dt;
    if (Math.abs(car.speed) > 10 && G.dustTimer <= 0) {
      G.dustTimer = 0.14;
      effects.spawnDust(car.x - Math.sin(car.heading) * 2, 0.3, car.z - Math.cos(car.heading) * 2);
    }
    // Running over pedestrians is a crime.
    if (Math.abs(car.speed) > 6) {
      for (const p of [...traffic.peds]) {
        if (p.dead) continue;
        if (dist2d(car.x, car.z, p.x, p.z) < 2.4) {
          traffic.killPed(p);
          police.addWanted(1);
          audio.thud();
          car.speed *= 0.6;
          hud.message('You hit a pedestrian! Wanted level up.');
        }
      }
    }
    // Car wrecked: bail out on foot.
    if (car.dead) {
      effects.spawnExplosion(car.x, 1, car.z);
      audio.thud();
      exitCar();
      player.hurt(20);
      G.lastDamage = G.time;
    }
  } else {
    player.update(dt, input, G.camYaw, city.colliders);
  }

  traffic.update(dt, car, px, pz);
  const res = police.update(dt, player, car);
  if (res && res.busted) endRun('busted');
  missions.update(dt, px, pz, inCar, police.wanted);
  combat.update(dt);
  effects.update(dt);
  audio.update(dt);
  audio.setEngine(inCar && car ? Math.abs(car.speed) / car.topSpeed : 0, inCar);

  // Smoking police cruisers.
  for (const c of police.cars) {
    if (c.health < 55 && Math.random() < dt * 6) effects.spawnSmoke(c.x, 1.4, c.z);
  }

  // Cash pickups.
  for (const c of G.cash) {
    if (c.taken) continue;
    c.mesh.rotation.y += dt * 2;
    c.mesh.position.y = 0.9 + Math.sin(G.time * 3 + c.id) * 0.15;
    if (dist2d(px, pz, c.x, c.z) < 2.2) {
      c.taken = true;
      G.cashTaken.add(c.id);
      scene.remove(c.mesh);
      G.money += 50;
      audio.chime();
      hud.message('Found $50 on the street.');
      saveGame();
    }
  }

  // Health regen and wasted check.
  if (G.time - G.lastDamage > 5 && player.health < 100) player.heal(2 * dt);
  if (player.health <= 0) endRun('wasted');

  // ---------- camera ----------
  const tx = inCar && car ? car.x : player.x;
  const tz = inCar && car ? car.z : player.z;
  if (inCar && car && G.time - G.lastDrag > 2.5) {
    G.camYaw = angleLerp(G.camYaw, car.heading + Math.PI, Math.min(1, dt * 1.4));
  }
  const dist = inCar ? Math.max(G.camDist, 12) : G.camDist;
  const cx = tx + Math.sin(G.camYaw) * Math.cos(G.camPitch) * dist;
  const cz = tz + Math.cos(G.camYaw) * Math.cos(G.camPitch) * dist;
  const cy = 2 + Math.sin(G.camPitch) * dist;
  camera.position.x += (cx - camera.position.x) * Math.min(1, dt * 8);
  camera.position.y += (cy - camera.position.y) * Math.min(1, dt * 8);
  camera.position.z += (cz - camera.position.z) * Math.min(1, dt * 8);
  camera.lookAt(tx, 2.2, tz);
  sun.position.set(tx + 120, 180, tz + 60);
  sun.target.position.set(tx, 0, tz);

  // ---------- HUD ----------
  hudTimer -= dt;
  if (hudTimer <= 0) {
    hudTimer = 0.12;
    const marker = missions.markerPos();
    hud.update({
      money: G.money,
      health: player.health,
      speedKmh: inCar && car ? Math.abs(car.speed) * 3.6 : Math.abs(player.speed) * 3.6,
      inCar,
      stars: police.wanted,
      objective: missions.objectiveText(),
      objDist: marker ? dist2d(tx, tz, marker.x, marker.z) : null,
      playerX: tx, playerZ: tz,
      heading: inCar && car ? car.heading : player.heading,
      traffic: traffic.cars.map((c) => ({ x: c.x, z: c.z })),
      police: police.cars.map((c) => ({ x: c.x, z: c.z })),
      marker,
      cash: G.cash.filter((c) => !c.taken),
      time: G.time,
    });
  }

  renderer.render(scene, camera);
  G.shotDone = true;
}
animate();
