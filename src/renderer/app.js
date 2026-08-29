/* The overlay: one full-screen transparent canvas per display. */
(function () {
  'use strict';
  const api = window.petpet;
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');

  /** @type {Map<string, any>} */
  const cats = new Map();
  const world = { width: 0, height: 0, scale: 3, cfg: null, cats };
  let cursor = null;
  let hovered = null;
  let interactive = false;
  let last = performance.now();
  let idleTimer = null;

  /* ---- sizing ------------------------------------------------------- */
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    world.width = window.innerWidth;
    world.height = window.innerHeight;
    canvas.width = Math.round(world.width * dpr);
    canvas.height = Math.round(world.height * dpr);
    canvas.style.width = world.width + 'px';
    canvas.style.height = world.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', resize);

  /* ---- config ------------------------------------------------------- */
  function applyConfig(cfg) {
    world.cfg = cfg;
    world.scale = Math.max(1, Math.min(6, cfg.scale || 3));
    window.PetAudio.setConfig({ sound: cfg.sound, volume: cfg.volume });
  }

  /* ---- pets in / out ------------------------------------------------ */
  function syncPets(list) {
    const mine = list.filter((p) => p.display === api.displayId);
    const seen = new Set();
    for (const p of mine) {
      seen.add(p.id);
      const cat = cats.get(p.id);
      if (cat) {
        cat.title = p.title;
        cat.dueAt = p.dueAt;
      } else {
        cats.set(p.id, new window.Cat(p, world));
      }
    }
    for (const [id, cat] of cats) {
      if (!seen.has(id) && !cat.leaving) cat.celebrate();
    }
    kick();
  }

  /* ---- hit testing --------------------------------------------------- */
  const inRect = (pt, r) => pt && r && pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h;

  function hitTest(pt) {
    if (!pt) return null;
    const list = [...cats.values()].filter((c) => !c.leaving && !c.gone).reverse();
    for (const cat of list) if (cat.hoverT > 0.4 && inRect(pt, cat._checkRect)) return { cat, part: 'check' };
    for (const cat of list) if (cat.contains(pt)) return { cat, part: 'body' };
    for (const cat of list) if (cat.hoverT > 0.4 && inRect(pt, cat._bubbleRect)) return { cat, part: 'bubble' };
    return null;
  }

  const inflate = (r, m) => r && { x: r.x - m, y: r.y - m, w: r.w + m * 2, h: r.h + m * 2 };

  function updateHover() {
    let hit = hitTest(cursor);
    // a few pixels of slack around the last hovered cat, so the bubble doesn't strobe
    if (!hit && hovered && cursor && cats.has(hovered.cat.id) && !hovered.cat.leaving) {
      const c = hovered.cat;
      const b = c.box();
      if (inRect(cursor, inflate(b, 14)) || inRect(cursor, inflate(c._bubbleRect, 14))) {
        hit = { cat: c, part: 'grace' };
      }
    }
    hovered = hit;
    for (const cat of cats.values()) cat.hover = !!hit && hit.cat === cat;
    const want = !!hit;
    if (want !== interactive) {
      interactive = want;
      api.setInteractive(want);
    }
    document.body.style.cursor = hit ? 'pointer' : 'default';
  }

  api.onCursor((pt) => { cursor = pt; updateHover(); });
  window.addEventListener('mousemove', (e) => { cursor = { x: e.clientX, y: e.clientY }; updateHover(); });

  async function finish(cat) {
    if (cat.leaving) return;
    cat.celebrate();
    const res = await api.complete(cat.id);
    if (!res || !res.ok) cat.failed(res && res.error ? 'Reminders said no' : 'could not tick that off');
  }

  window.addEventListener('mousedown', (e) => {
    const pt = { x: e.clientX, y: e.clientY };
    const hit = hitTest(pt);
    if (!hit) return;
    e.preventDefault();
    if (hit.part === 'check') finish(hit.cat);
    else if (hit.part === 'body') {
      if (world.cfg && world.cfg.clickBodyToComplete) finish(hit.cat);
      else hit.cat.pet();
    }
  });

  /* ---- speech bubble ------------------------------------------------- */
  function timeLabel(cat) {
    const m = cat.minutesLeft;
    if (m >= 1.5) return 'due in ' + Math.round(m) + ' min';
    if (m >= 0.5) return 'due in a minute';
    if (m >= -0.5) return 'due right now';
    const late = Math.round(-m);
    if (late < 60) return late + ' min late';
    return Math.round(late / 60) + 'h late';
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawBubble(cat) {
    const a = cat.hoverT;
    if (a < 0.02) { cat._checkRect = null; cat._bubbleRect = null; return; }

    const title = cat.title.length > 34 ? cat.title.slice(0, 33) + '…' : cat.title;
    const sub = cat.errorT > 0 ? cat.error : timeLabel(cat);
    ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    const titleW = ctx.measureText(title).width;
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    const subW = ctx.measureText(sub).width;

    const btn = 26;
    const padX = 10, padY = 8;
    const textW = Math.max(titleW, subW);
    const w = padX * 2 + textW + btn + 10;
    const h = 46;
    let x = Math.round(cat.x + cat.w / 2 - w / 2);
    x = Math.max(6, Math.min(world.width - w - 6, x));
    const y = Math.round(cat.top - h - 12);

    ctx.save();
    ctx.globalAlpha = a;

    // shadow + panel
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = '#fffdf7';
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // pointer
    const px = Math.max(x + 14, Math.min(x + w - 14, cat.x + cat.w / 2));
    ctx.beginPath();
    ctx.moveTo(px - 7, y + h - 1);
    ctx.lineTo(px + 7, y + h - 1);
    ctx.lineTo(px, y + h + 8);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#1d1a16';
    ctx.lineWidth = 1.5;
    roundRect(ctx, x + 0.75, y + 0.75, w - 1.5, h - 1.5, 10);
    ctx.stroke();

    // text
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#1d1a16';
    ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    ctx.fillText(title, x + padX, y + padY + 12);
    ctx.fillStyle = cat.errorT > 0 ? '#c0392b' : (cat.overdue ? '#d64545' : 'rgba(29,26,22,0.55)');
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    ctx.fillText(sub, x + padX, y + padY + 29);

    // done button
    const bx = x + w - btn - 8, by = y + (h - btn) / 2;
    const hot = inRect(cursor, { x: bx, y: by, w: btn, h: btn });
    ctx.fillStyle = hot ? '#ffcf40' : '#fff2c2';
    roundRect(ctx, bx, by, btn, btn, 7);
    ctx.fill();
    ctx.strokeStyle = '#1d1a16';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.strokeStyle = '#1d1a16';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx + 7, by + 13);
    ctx.lineTo(bx + 11, by + 17.5);
    ctx.lineTo(bx + 19, by + 8.5);
    ctx.stroke();

    ctx.restore();

    cat._checkRect = { x: bx, y: by, w: btn, h: btn };
    cat._bubbleRect = { x, y, w, h };
  }

  /* ---- main loop ------------------------------------------------------ */
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    ctx.clearRect(0, 0, world.width, world.height);

    for (const [id, cat] of cats) {
      cat.update(dt, cursor);
      if (cat.gone) cats.delete(id);
    }
    for (const cat of cats.values()) cat.draw(ctx);
    for (const cat of cats.values()) drawBubble(cat);

    if (cats.size === 0) {
      if (interactive) { interactive = false; api.setInteractive(false); }
      idleTimer = setTimeout(() => { idleTimer = null; last = performance.now(); requestAnimationFrame(frame); }, 400);
      return;
    }
    requestAnimationFrame(frame);
  }

  function kick() {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; last = performance.now(); requestAnimationFrame(frame); }
  }

  // handy when poking at the overlay from devtools (npm run dev)
  window.__petpet = { cats, world, hitTest };

  /* ---- boot ----------------------------------------------------------- */
  resize();
  api.getConfig().then((cfg) => {
    applyConfig(cfg);
    requestAnimationFrame(frame);
  });
  api.onConfig(applyConfig);
  api.onPets(syncPets);
  api.onFinished((id) => { const c = cats.get(id); if (c) c.celebrate(); });
})();
