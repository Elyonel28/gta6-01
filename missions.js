// missions.js — the story of Danny Reyes, a wheelman back in Solmar City,
// and his fixer Mara Voss. Five jobs, each a chain of waypoints with a beacon,
// a payout and a rising heat.
import * as THREE from 'three';
import { dist2d, fmtMoney } from './utils.js';

const MISSION_DEFS = [
  {
    id: 'wheels', title: 'Wheels Up', reward: 200,
    brief: 'Mara needs wheels. Steal any car and bring it to Voss Auto.',
    steps: [
      { type: 'car', at: 'garage', label: 'Steal a car and bring it to Voss Auto', radius: 12 },
    ],
  },
  {
    id: 'package', title: 'The Package', reward: 350,
    brief: 'A package is waiting on the pier. Pick it up, deliver it to the Grand Solmar.',
    steps: [
      { type: 'goto', at: 'pier', label: 'Pick up the package at the pier', radius: 6 },
      { type: 'goto', at: 'hotel', label: 'Deliver the package to the Grand Solmar', radius: 10 },
    ],
  },
  {
    id: 'heat', title: 'Heat Wave', reward: 400,
    brief: 'The PD has your plate. Three stars. Lose them — get your wanted level to zero.',
    wantedOnStart: 3,
    steps: [
      { type: 'escape', label: 'Lose the cops — wanted level to zero', radius: 0 },
    ],
  },
  {
    id: 'harbor', title: 'Harbor Run', reward: 600,
    brief: 'A crate at the harbor is worth real money. Grab it and bring it back — quietly.',
    steps: [
      { type: 'goto', at: 'harbor', label: 'Grab the crate at the harbor', radius: 8, wantedOnArrive: 2 },
      { type: 'goto', at: 'garage', label: 'Bring the crate back to Voss Auto', radius: 12 },
    ],
  },
  {
    id: 'score', title: 'The Solmar Score', reward: 1500,
    brief: 'The Meridian Bank. One job, one bag, and every cruiser in the city. Make it count.',
    steps: [
      { type: 'goto', at: 'bank', label: 'Hit the Meridian Bank', radius: 10, wantedOnArrive: 3 },
      { type: 'goto', at: 'safehouse', label: 'Escape to the safehouse', radius: 10 },
    ],
  },
];

export function createMissions(scene, landmarks, ctx) {
  // Beacon: a pillar of light and a pulsing ring over the current objective.
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0xffc832, transparent: true, opacity: 0.55,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 60, 12, 1, true), beaconMat);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3, 4.2, 24),
    new THREE.MeshBasicMaterial({ color: 0xffc832, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  beacon.visible = false;
  ring.visible = false;
  scene.add(beacon);
  scene.add(ring);

  const M = {
    defs: MISSION_DEFS,
    index: 0, step: 0, active: false, done: false, pulse: 0,
    completedIds: [],
  };

  function currentDef() { return MISSION_DEFS[M.index]; }
  function currentStep() {
    const d = currentDef();
    return d ? d.steps[M.step] : null;
  }
  function stepPos(step) {
    if (!step || !step.at) return null;
    return landmarks[step.at];
  }
  function placeMarker() {
    const step = currentStep();
    const pos = stepPos(step);
    if (!pos || step.type === 'escape') { beacon.visible = false; ring.visible = false; return; }
    beacon.position.set(pos.x, 30, pos.z);
    ring.position.set(pos.x, 0.15, pos.z);
    beacon.visible = true;
    ring.visible = true;
  }

  M.startNext = function () {
    if (M.done || M.active) return false;
    const def = currentDef();
    if (!def) return false;
    M.step = 0;
    M.active = true;
    if (def.wantedOnStart) ctx.police.setWanted(def.wantedOnStart);
    ctx.hud.banner(def.title, def.brief);
    ctx.hud.message('Mission started: ' + def.title);
    ctx.audio.jingle();
    placeMarker();
    return true;
  };
  M.abandon = function () {
    M.active = false;
    beacon.visible = false;
    ring.visible = false;
    ctx.hud.setObjective('No active mission — press M to start the next job.');
  };
  M.objectiveText = function () {
    if (M.done) return 'Story complete — Solmar is yours. Free roam!';
    if (!M.active) {
      const d = currentDef();
      return d ? 'Next job: ' + d.title + ' — press M to start.' : '';
    }
    const step = currentStep();
    return step ? step.label : '';
  };
  M.markerPos = function () {
    const step = currentStep();
    return M.active ? stepPos(step) : null;
  };
  M.update = function (dt, px, pz, inCar, wanted) {
    M.pulse += dt;
    if (beacon.visible) {
      const s = 1 + Math.sin(M.pulse * 3) * 0.12;
      ring.scale.set(s, s, 1);
      beaconMat.opacity = 0.48 + Math.sin(M.pulse * 3) * 0.12;
    }
    if (!M.active) return;
    const def = currentDef();
    const step = currentStep();
    if (!step) return;
    if (step.type === 'escape') {
      if (wanted === 0) M.completeStep();
      return;
    }
    const pos = stepPos(step);
    if (!pos) return;
    const d = dist2d(px, pz, pos.x, pos.z);
    if (step.type === 'car' && !inCar) return;
    if (d < step.radius) M.completeStep();
  };
  M.completeStep = function () {
    const def = currentDef();
    const step = currentStep();
    if (step && step.wantedOnArrive) ctx.police.addWanted(step.wantedOnArrive);
    ctx.audio.chime();
    M.step++;
    if (M.step >= def.steps.length) {
      // Mission complete.
      M.completedIds.push(def.id);
      ctx.addMoney(def.reward);
      ctx.hud.banner('MISSION COMPLETE', def.title + ' — +' + fmtMoney(def.reward));
      ctx.audio.jingle();
      M.active = false;
      beacon.visible = false;
      ring.visible = false;
      M.index++;
      if (def.id === 'heat') ctx.police.clearWanted();
      if (def.id === 'heat') ctx.unlockSport();
      if (M.index >= MISSION_DEFS.length) {
        M.done = true;
        ctx.addMoney(1000);
        ctx.hud.banner('STORY COMPLETE', 'Solmar Legend — bonus +$1,000. Free roam!');
        ctx.unlockSport();
      } else {
        ctx.hud.message('Next job ready — press M: ' + MISSION_DEFS[M.index].title);
      }
      ctx.save();
    } else {
      ctx.hud.message('Objective updated: ' + currentStep().label);
      placeMarker();
    }
  };
  M.loadProgress = function (ids) {
    M.completedIds = ids.slice();
    M.index = MISSION_DEFS.findIndex((d) => !ids.includes(d.id));
    if (M.index === -1) { M.index = MISSION_DEFS.length; M.done = true; }
  };
  return M;
}
