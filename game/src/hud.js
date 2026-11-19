// hud.js — every pixel of interface: wanted stars, money, health, speed,
// mission objective, message feed, banners, the minimap, and the menu screens.
import { STREETS } from './city.js';
import { fmtMoney } from './utils.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    hud: $('hud'), stars: $('stars'), money: $('money'),
    healthFill: $('health-fill'), speed: $('speed'), speedUnit: $('speed-unit'),
    objective: $('objective'), objDist: $('obj-dist'),
    msg: $('msg'), banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    minimap: $('minimap'), crosshair: $('crosshair'), hint: $('hint'),
    menu: $('menu'), pause: $('pause'), busted: $('busted'), bustedText: $('busted-text'),
    btnContinue: $('btn-continue'),
  };
  const mctx = els.minimap.getContext('2d');
  let msgTimer = null;
  let bannerTimer = null;

  function drawMinimap(s) {
    const W = 190, H = 190;
    const x0 = -180, z0 = -180, scale = W / 450; // world -180..180 x, -180..270 z
    const X = (x) => (x - x0) * scale;
    const Z = (z) => (z - z0) * scale;
    mctx.clearRect(0, 0, W, H);
    mctx.fillStyle = '#14202e';
    mctx.fillRect(0, 0, W, H);
    // Ocean and sand at the south.
    mctx.fillStyle = '#2f7ea6';
    mctx.fillRect(0, Z(244), W, H - Z(244));
    mctx.fillStyle = '#dcc184';
    mctx.fillRect(0, Z(180), W, Z(244) - Z(180));
    // Streets.
    mctx.strokeStyle = '#4a5560';
    mctx.lineWidth = 3;
    for (const st of STREETS) {
      mctx.beginPath(); mctx.moveTo(X(st), 0); mctx.lineTo(X(st), Z(180)); mctx.stroke();
      mctx.beginPath(); mctx.moveTo(0, Z(st)); mctx.lineTo(W, Z(st)); mctx.stroke();
    }
    // Cash pickups.
    mctx.fillStyle = '#4ade80';
    for (const c of s.cash) {
      mctx.fillRect(X(c.x) - 1.5, Z(c.z) - 1.5, 3, 3);
    }
    // Mission marker: pulsing diamond.
    if (s.marker) {
      const p = 1 + Math.sin(s.time * 4) * 0.25;
      mctx.fillStyle = '#ffc832';
      const mx = X(s.marker.x), mz = Z(s.marker.z), r = 5 * p;
      mctx.beginPath();
      mctx.moveTo(mx, mz - r); mctx.lineTo(mx + r, mz);
      mctx.lineTo(mx, mz + r); mctx.lineTo(mx - r, mz);
      mctx.closePath(); mctx.fill();
    }
    // Traffic dots.
    mctx.fillStyle = '#e8d24a';
    for (const c of s.traffic) mctx.fillRect(X(c.x) - 1.5, Z(c.z) - 1.5, 3, 3);
    // Police: flashing dots.
    const flash = Math.floor(s.time * 2.5) % 2 === 0;
    mctx.fillStyle = flash ? '#ff3030' : '#3060ff';
    for (const c of s.police) {
      mctx.beginPath(); mctx.arc(X(c.x), Z(c.z), 3, 0, Math.PI * 2); mctx.fill();
    }
    // Player arrow.
    const px = X(s.playerX), pz = Z(s.playerZ);
    mctx.save();
    mctx.translate(px, pz);
    mctx.rotate(s.heading + Math.PI);
    mctx.fillStyle = '#ffffff';
    mctx.beginPath();
    mctx.moveTo(0, -7); mctx.lineTo(5, 6); mctx.lineTo(-5, 6);
    mctx.closePath(); mctx.fill();
    mctx.restore();
    mctx.strokeStyle = 'rgba(255,255,255,0.35)';
    mctx.lineWidth = 1;
    mctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  }

  return {
    update(s) {
      els.money.textContent = fmtMoney(s.money);
      els.healthFill.style.width = Math.max(0, s.health) + '%';
      els.healthFill.style.background = s.health > 50 ? '#4ade80' : s.health > 25 ? '#e8c832' : '#ef4444';
      els.speed.textContent = Math.round(s.speedKmh);
      els.speed.style.display = s.inCar ? 'block' : 'none';
      els.speedUnit.style.display = s.inCar ? 'block' : 'none';
      els.objective.textContent = s.objective;
      els.objDist.textContent = s.objDist != null ? Math.round(s.objDist) + 'm' : '';
      els.crosshair.style.display = s.inCar ? 'none' : 'block';
      // Stars.
      let stars = '';
      for (let i = 0; i < 5; i++) stars += i < s.stars ? '★' : '☆';
      els.stars.textContent = stars;
      els.stars.style.color = s.stars > 0 ? '#ffd24a' : 'rgba(255,255,255,0.35)';
      drawMinimap(s);
    },
    message(text) {
      els.msg.textContent = text;
      els.msg.style.opacity = '1';
      clearTimeout(msgTimer);
      msgTimer = setTimeout(() => { els.msg.style.opacity = '0'; }, 4200);
    },
    banner(title, sub) {
      els.bannerTitle.textContent = title;
      els.bannerSub.textContent = sub || '';
      els.banner.classList.add('show');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => els.banner.classList.remove('show'), 3400);
    },
    showMenu(hasSave) {
      els.menu.style.display = 'flex';
      els.hud.style.display = 'none';
      els.pause.style.display = 'none';
      els.busted.style.display = 'none';
      els.btnContinue.style.display = hasSave ? 'inline-block' : 'none';
    },
    hideMenu() {
      els.menu.style.display = 'none';
      els.hud.style.display = 'block';
    },
    showPause(show) { els.pause.style.display = show ? 'flex' : 'none'; },
    showBusted(show, text) {
      els.busted.style.display = show ? 'flex' : 'none';
      if (text) els.bustedText.textContent = text;
    },
    setHint(text) { els.hint.textContent = text; },
  };
}
