// city.js — builds Solmar City: a sun-soaked coastal grid of streets, towers,
// palms, a beach, a pier and five named landmarks. One fixed seed, same city every load.
import * as THREE from 'three';
import { mulberry32, randRange, randInt, pick } from './utils.js';

export const STREETS = [-160, -120, -80, -40, 0, 40, 80, 120, 160];
export const ROAD_HALF = 6;
export const CITY_HALF = 170;
export const BEACH_Z = 180;

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function windowTexture(base, lit) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let y = 12; y < h - 12; y += 22) {
      for (let x = 10; x < w - 10; x += 20) {
        g.fillStyle = Math.random() < 0.28 ? lit : 'rgba(20,28,40,0.85)';
        g.fillRect(x, y, 12, 14);
      }
    }
  });
}

function roadTexture(horizontal) {
  return canvasTexture(horizontal ? 256 : 64, horizontal ? 64 : 256, (g, w, h) => {
    g.fillStyle = '#3b3b40'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#54545c';
    if (horizontal) { g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3); }
    else { g.fillRect(0, 0, 3, h); g.fillRect(w - 3, 0, 3, h); }
    g.fillStyle = '#e8d24a';
    if (horizontal) { g.fillRect(20, h / 2 - 2, 70, 4); g.fillRect(150, h / 2 - 2, 70, 4); }
    else { g.fillRect(w / 2 - 2, 20, 4, 70); g.fillRect(w / 2 - 2, 150, 4, 70); }
  });
}

function signTexture(text, bg, fg, sub) {
  return canvasTexture(512, 192, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = fg; g.textAlign = 'center'; g.font = 'bold 64px Arial';
    g.fillText(text, w / 2, sub ? 92 : 112);
    if (sub) { g.font = 'bold 34px Arial'; g.fillText(sub, w / 2, 152); }
  });
}

const BLOCKS = [-154, -114, -74, -34, 6, 46, 86, 126]; // block starts (28 wide)
const PALETTE = ['#d9a05b', '#c97e5a', '#e0b96f', '#8fa8b8', '#b8c4c9', '#d97f6a', '#a8b08a', '#e8dcc8', '#7fa3b0', '#c9b18a'];

export function buildCity(scene) {
  const rng = mulberry32(1337);
  const colliders = [];
  const landmarks = {};
  const cashSpots = [];
  const group = new THREE.Group();
  scene.add(group);

  // Ground: warm concrete, then the beach and the ocean to the south.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 560),
    new THREE.MeshLambertMaterial({ color: 0xa89a86 })
  );
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  group.add(ground);
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 64),
    new THREE.MeshLambertMaterial({ color: 0xdcc184 })
  );
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.02, 212);
  sand.receiveShadow = true;
  group.add(sand);
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 340),
    new THREE.MeshLambertMaterial({ color: 0x2f7ea6 })
  );
  ocean.rotation.x = -Math.PI / 2; ocean.position.set(0, 0.01, 412);
  group.add(ocean);
  // Foam lines where the water meets the sand.
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xeaf6f8, transparent: true, opacity: 0.7 });
  for (let i = 0; i < 3; i++) {
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(560, 1.6), foamMat);
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(0, 0.05, 244 + i * 4);
    group.add(foam);
  }

  // Roads with dashed centrelines: dashes run along each road's long axis.
  const texH = roadTexture(true);
  const texV = roadTexture(false);
  for (const x of STREETS) {
    const tex = texV.clone();
    tex.needsUpdate = true;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 7);
    const r = new THREE.Mesh(new THREE.PlaneGeometry(12, 348), new THREE.MeshLambertMaterial({ map: tex }));
    r.rotation.x = -Math.PI / 2; r.position.set(x, 0.03, 0);
    r.receiveShadow = true;
    group.add(r);
  }
  for (const z of STREETS) {
    const tex = texH.clone();
    tex.needsUpdate = true;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(7, 1);
    const r = new THREE.Mesh(new THREE.PlaneGeometry(348, 12), new THREE.MeshLambertMaterial({ map: tex }));
    r.rotation.x = -Math.PI / 2; r.position.set(0, 0.045, z);
    r.receiveShadow = true;
    group.add(r);
  }

  // Building materials: a few shared window textures in warm and glass tones.
  const mats = [
    new THREE.MeshLambertMaterial({ map: windowTexture('#d9a05b', '#ffd98a') }),
    new THREE.MeshLambertMaterial({ map: windowTexture('#8fa8b8', '#bfe8ff') }),
    new THREE.MeshLambertMaterial({ map: windowTexture('#c97e5a', '#ffcf9a') }),
    new THREE.MeshLambertMaterial({ map: windowTexture('#b8c4c9', '#fff2c0') }),
    new THREE.MeshLambertMaterial({ map: windowTexture('#a8b08a', '#ffe9a0') }),
  ];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x6b6258 });

  const landmarkBlocks = new Set(['5,3', '2,2', '6,5', '1,6', '0,7']);

  function addBuilding(cx, cz, w, d, h, mat) {
    const m = new THREE.Mesh(boxGeo, mat || pick(rng, mats));
    m.scale.set(w, h, d);
    m.position.set(cx, h / 2, cz);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    const roof = new THREE.Mesh(boxGeo, roofMat);
    roof.scale.set(w * 0.9, 0.6, d * 0.9);
    roof.position.set(cx, h + 0.3, cz);
    group.add(roof);
    colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    return m;
  }

  // Ordinary blocks: one or two towers each, taller toward the centre.
  for (let bi = 0; bi < BLOCKS.length; bi++) {
    for (let bj = 0; bj < BLOCKS.length; bj++) {
      const key = bi + ',' + bj;
      if (landmarkBlocks.has(key)) continue;
      if (bi === 4 && bj === 4) continue; // central plaza
      const bx = BLOCKS[bi], bz = BLOCKS[bj];
      const distC = Math.abs(bx + 14) + Math.abs(bz + 14);
      const maxH = 46 - distC * 0.16;
      const n = rng() < 0.55 ? 1 : 2;
      if (n === 1) {
        const w = randRange(rng, 16, 24), d = randRange(rng, 16, 24);
        addBuilding(bx + 14, bz + 14, w, d, randRange(rng, 9, Math.max(10, maxH)));
      } else {
        addBuilding(bx + 8, bz + 8, randRange(rng, 10, 13), randRange(rng, 10, 13), randRange(rng, 8, Math.max(9, maxH * 0.8)));
        addBuilding(bx + 20, bz + 20, randRange(rng, 10, 13), randRange(rng, 10, 13), randRange(rng, 8, Math.max(9, maxH)));
      }
    }
  }

  // Central plaza: fountain and palms instead of towers.
  const fountain = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 8, 1.2, 20),
    new THREE.MeshLambertMaterial({ color: 0x8fb8c9 })
  );
  fountain.position.set(20, 0.6, 20); fountain.castShadow = true;
  group.add(fountain);
  colliders.push({ minX: 13, maxX: 27, minZ: 13, maxZ: 27 });

  // Landmarks: named, signed, unmistakable. The returned point is the
  // street-side mission marker (mx, mz), not the building's centre, so the
  // beacon stands on the road where the player can see and reach it.
  function addLandmark(name, sub, cx, cz, w, d, h, color, signBg, mx, mz) {
    const mat = new THREE.MeshLambertMaterial({ map: windowTexture(color, '#ffe9a0') });
    addBuilding(cx, cz, w, d, h, mat);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.9, w * 0.34),
      new THREE.MeshBasicMaterial({ map: signTexture(name, signBg, '#ffffff', sub) })
    );
    sign.position.set(cx, h * 0.72, cz - d / 2 - 0.15);
    sign.rotation.y = Math.PI;
    group.add(sign);
    const sign2 = sign.clone();
    sign2.position.z = cz + d / 2 + 0.15;
    sign2.rotation.y = 0;
    group.add(sign2);
    return { x: mx ?? cx, z: mz ?? cz };
  }
  landmarks.garage = addLandmark('VOSS AUTO', 'GARAGE', 60, -20, 22, 20, 12, '#b0603a', '#3a5a78', 44, -20);
  landmarks.bank = addLandmark('MERIDIAN BANK', '', -60, -60, 24, 22, 26, '#7a8a9a', '#274a2e', -44, -60);
  landmarks.hotel = addLandmark('GRAND SOLMAR', 'HOTEL', 100, 60, 24, 22, 34, '#c9a24a', '#6a3a5a', 84, 60);
  landmarks.safehouse = addLandmark('SAFEHOUSE', '', -100, 100, 18, 16, 10, '#5a7a5a', '#333333', -88, 100);
  // Harbor: containers and crates on the south-west block, no tower.
  const contCols = [0xb04030, 0x3a6a9a, 0xc9a24a, 0x4a8a5a];
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: contCols[i % 4] }));
    const cw = 12, ch = 3, cd = 3;
    c.scale.set(cw, ch, cd);
    c.position.set(-148 + (i % 3) * 14, ch / 2 + (i >= 3 ? ch : 0), 138 + Math.floor(i / 3) * 8);
    c.castShadow = true;
    group.add(c);
    colliders.push({ minX: c.position.x - cw / 2, maxX: c.position.x + cw / 2, minZ: c.position.z - cd / 2, maxZ: c.position.z + cd / 2 });
  }
  landmarks.harbor = { x: -138, z: 152 };

  // Pier: wooden deck running into the ocean at x 52..68.
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6a44 });
  for (let z = 180; z < 262; z += 8) {
    const plank = new THREE.Mesh(boxGeo, pierMat);
    plank.scale.set(16, 1, 7.6);
    plank.position.set(60, 1.2, z + 4);
    plank.castShadow = true; plank.receiveShadow = true;
    group.add(plank);
  }
  landmarks.pier = { x: 60, z: 252 };
  colliders.push({ minX: 51, maxX: 69, minZ: 178, maxZ: 264 }); // pier edges keep cars off

  // Palms along the streets and the beach.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f8a4a });
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 7, 6);
  const frondGeo = new THREE.ConeGeometry(2.6, 4.5, 5);
  function addPalm(x, z) {
    const p = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 3.5; trunk.rotation.z = randRange(rng, -0.08, 0.08);
    trunk.castShadow = true;
    p.add(trunk);
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(frondGeo, frondMat);
      const a = (i / 5) * Math.PI * 2;
      f.position.set(Math.cos(a) * 1.4, 7.4, Math.sin(a) * 1.4);
      f.rotation.z = Math.cos(a) * 1.1;
      f.rotation.x = -Math.sin(a) * 1.1;
      p.add(f);
    }
    p.position.set(x, 0, z);
    group.add(p);
  }
  for (const s of STREETS) {
    for (let t = -150; t <= 150; t += 30) {
      if (rng() < 0.55) addPalm(s + 9, t + randRange(rng, -6, 6));
      if (rng() < 0.4) addPalm(t + randRange(rng, -6, 6), s + 9);
    }
  }
  for (let x = -160; x <= 160; x += 24) addPalm(x, 186);
  addPalm(14, 14); addPalm(26, 26); addPalm(14, 26); addPalm(26, 14);

  // Street lamps at every other intersection.
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2e });
  const lampGlow = new THREE.MeshBasicMaterial({ color: 0xffe9a0 });
  const poleGeo = new THREE.CylinderGeometry(0.18, 0.24, 8, 6);
  const bulbGeo = new THREE.SphereGeometry(0.5, 8, 6);
  for (let i = 0; i < STREETS.length; i += 2) {
    for (let j = 0; j < STREETS.length; j += 2) {
      const pole = new THREE.Mesh(poleGeo, lampMat);
      pole.position.set(STREETS[i] + 8, 4, STREETS[j] + 8);
      group.add(pole);
      const bulb = new THREE.Mesh(bulbGeo, lampGlow);
      bulb.position.set(STREETS[i] + 8, 8.2, STREETS[j] + 8);
      group.add(bulb);
    }
  }

  // Mountains ringing the north and sides, hazy in the sun.
  const mtnMat = new THREE.MeshLambertMaterial({ color: 0x8a7a6a });
  const mtnGeo = new THREE.ConeGeometry(1, 1, 5);
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(mtnGeo, mtnMat);
    const a = -Math.PI * 0.15 - (i / 13) * Math.PI * 0.7;
    const r = randRange(rng, 300, 380);
    const h = randRange(rng, 60, 130);
    m.scale.set(randRange(rng, 90, 150), h, randRange(rng, 60, 100));
    m.position.set(Math.sin(a) * r, h / 2 - 2, -Math.abs(Math.cos(a)) * r * 0.9 - 40);
    group.add(m);
  }

  // Billboards on downtown rooftops.
  const bbTexts = [['SOLMAR', 'CITY OF GOLD', '#b03030'], ['VOSS AUTO', 'WE FIX ANYTHING', '#3a5a78'], ['PALM COLA', 'TASTE THE SUN', '#c94a6a']];
  bbTexts.forEach((b, i) => {
    const bb = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 10),
      new THREE.MeshBasicMaterial({ map: signTexture(b[0], b[2], '#ffffff', b[1]) })
    );
    bb.position.set(-60 + i * 70, 52 - i * 6, -60 + i * 20);
    bb.rotation.y = randRange(rng, -0.4, 0.4);
    group.add(bb);
  });

  // Cash pickups: ten spots on sidewalks, fixed by the seed.
  for (let i = 0; i < 10; i++) {
    const s = pick(rng, STREETS);
    const t = randRange(rng, -150, 150);
    cashSpots.push({ x: s + 8.5, z: t, id: i });
  }

  return { colliders, landmarks, cashSpots, group };
}
