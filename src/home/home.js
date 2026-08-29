/* Mimi home screen: status, the pet shelter, and every knob worth turning. */
(function () {
  'use strict';
  const api = window.purrmind;
  const S = window.SPRITES;
  const $ = (id) => document.getElementById(id);

  window.PetAudio.setConfig({ sound: false, volume: 0 });  // the home screen stays quiet

  let cfg = null;
  let saveTimer = null;
  const saveSoon = (patch) => {         // sliders fire constantly; don't hammer the main process
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => api.setConfig(patch), 150);
  };
  let status = { pets: [], error: null, lists: [], loginItem: false, version: '' };
  const previews = [];   // { canvas, ctx, cat, world }

  /* ---- little animated cat in a box --------------------------------- */
  function makePreview(canvas, coat, scale) {
    const world = {
      width: 0, height: 0, scale: scale || 2, cats: new Map(),
      cfg: { meowEverySeconds: 9, overdueMeowEverySeconds: 9, clickBodyToComplete: false }
    };
    const p = { canvas, ctx: canvas.getContext('2d'), world, coat, cat: null };
    sizePreview(p);
    p.cat = new window.Cat({ id: 'preview', title: '', dueAt: Date.now() + 3600e3, coat }, world);
    world.cats.set('preview', p.cat);
    previews.push(p);
    return p;
  }

  function sizePreview(p) {
    const dpr = window.devicePixelRatio || 1;
    const r = p.canvas.getBoundingClientRect();
    const w = Math.max(40, Math.round(r.width || p.canvas.width));
    const h = Math.max(30, Math.round(r.height || p.canvas.height));
    p.canvas.width = Math.round(w * dpr);
    p.canvas.height = Math.round(h * dpr);
    p.canvas.style.width = w + 'px';      // pin the CSS size or the canvas grows every resize
    p.canvas.style.height = h + 'px';
    p.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    p.ctx.imageSmoothingEnabled = false;
    p.world.width = w;
    p.world.height = h;
  }

  function setPreviewCoat(p, coat) {
    p.coat = coat;
    if (p.cat) p.cat.coat = coat;
  }

  let lastT = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    for (const p of previews) {
      p.ctx.clearRect(0, 0, p.world.width, p.world.height);
      if (!p.cat) continue;
      p.cat.update(dt, null);
      if (p.cat.gone) {
        p.cat = new window.Cat({ id: 'preview', title: '', dueAt: Date.now() + 3600e3, coat: p.coat }, p.world);
        p.world.cats.set('preview', p.cat);
      }
      p.cat.draw(p.ctx);
    }
    requestAnimationFrame(loop);
  }

  /* ---- gallery -------------------------------------------------------- */
  function buildGallery() {
    const gallery = $('gallery');
    gallery.innerHTML = '';
    const entries = [['random', { label: 'Surprise me', sub: 'a random cat every time' }]]
      .concat(S.COAT_NAMES.map((k) => [k, S.COATS[k]]));

    for (const [key, meta] of entries) {
      const card = document.createElement('div');
      card.className = 'pet-card' + (cfg.coat === key ? ' selected' : '');
      card.dataset.coat = key;
      const canvas = document.createElement('canvas');
      const label = document.createElement('div');
      label.className = 'label';
      label.textContent = meta.label || key;
      const sub = document.createElement('div');
      sub.className = 'sub';
      sub.textContent = meta.sub || meta.blurb || '';
      card.append(canvas, label, sub);
      card.addEventListener('click', () => selectCoat(key));
      gallery.appendChild(card);

      const p = makePreview(canvas, key === 'random' ? S.COAT_NAMES[0] : key, 3);
      if (key === 'random') {
        p.shuffle = setInterval(() => {
          setPreviewCoat(p, S.COAT_NAMES[Math.floor(Math.random() * S.COAT_NAMES.length)]);
        }, 2200);
      }
    }
  }

  function selectCoat(key) {
    cfg.coat = key;
    api.setConfig({ coat: key });
    for (const el of document.querySelectorAll('.pet-card')) {
      el.classList.toggle('selected', el.dataset.coat === key);
    }
    setPreviewCoat(hero, key === 'random' ? S.COAT_NAMES[Math.floor(Math.random() * S.COAT_NAMES.length)] : key);
  }

  /* ---- chips ---------------------------------------------------------- */
  function chips(host, options, current, onPick) {
    host.innerHTML = '';
    for (const opt of options) {
      const b = document.createElement('button');
      b.className = 'chip' + (opt.value === current ? ' on' : '');
      b.textContent = opt.label;
      b.addEventListener('click', () => onPick(opt.value));
      host.appendChild(b);
    }
  }

  function renderSettings() {
    chips($('lead'), [5, 10, 15, 30, 60].map((m) => ({ value: m, label: m + ' min' })), cfg.leadMinutes,
      (v) => { cfg.leadMinutes = v; api.setConfig({ leadMinutes: v }); renderSettings(); });
    chips($('scale'), [2, 3, 4, 5].map((s) => ({ value: s, label: s + '×' })), cfg.scale,
      (v) => { cfg.scale = v; api.setConfig({ scale: v }); renderSettings(); });
    chips($('clickMode'), [
      { value: false, label: 'Pet it' },
      { value: true, label: 'Mark it done' }
    ], !!cfg.clickBodyToComplete, (v) => { cfg.clickBodyToComplete = v; api.setConfig({ clickBodyToComplete: v }); renderSettings(); });

    $('sound').checked = !!cfg.sound;
    $('volume').value = Math.round((cfg.volume || 0) * 100);
    $('volume').disabled = !cfg.sound;
    $('login').checked = !!status.loginItem;
  }

  function renderLists() {
    const host = $('lists');
    host.innerHTML = '';
    if (!status.lists.length) {
      host.innerHTML = '<span class="sub" style="color:var(--muted)">No lists yet — once Mimi can read Reminders they show up here.</span>';
      return;
    }
    for (const name of status.lists) {
      const on = cfg.lists.includes(name);
      const b = document.createElement('button');
      b.className = 'list-chip' + (on ? ' on' : '');
      b.textContent = name;
      b.addEventListener('click', () => {
        const set = new Set(cfg.lists);
        if (set.has(name)) set.delete(name); else set.add(name);
        cfg.lists = [...set];
        api.setConfig({ lists: cfg.lists });
        renderLists();
      });
      host.appendChild(b);
    }
  }

  function timeLabel(dueAt) {
    const m = Math.round((dueAt - Date.now()) / 60000);
    if (m > 1) return 'in ' + m + ' min';
    if (m === 1) return 'in a minute';
    if (m === 0) return 'now';
    if (m > -60) return -m + ' min late';
    return Math.round(-m / 60) + 'h late';
  }

  function renderStatus() {
    const dot = $('dot');
    const text = $('statusText');
    const fix = $('fixPerms');
    dot.className = 'dot';
    fix.classList.add('hidden');

    if (status.error) {
      dot.classList.add('bad');
      text.textContent = status.error;
      fix.classList.remove('hidden');
    } else if (status.pets.length) {
      dot.classList.add('ok');
      text.textContent = status.pets.length + (status.pets.length === 1 ? ' cat on duty' : ' cats on duty');
    } else {
      dot.classList.add('ok');
      text.textContent = 'All quiet — nothing due yet';
    }

    const list = $('petList');
    list.innerHTML = '';
    for (const p of status.pets) {
      const row = document.createElement('div');
      row.className = 'pet-row';
      const tick = document.createElement('div');
      tick.className = 'tick';
      tick.textContent = '✓';
      tick.title = 'Mark complete';
      tick.addEventListener('click', () => api.complete(p.id));
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = p.title;
      const when = document.createElement('div');
      when.className = 'when' + (p.dueAt < Date.now() ? ' late' : '');
      when.textContent = timeLabel(p.dueAt);
      row.append(tick, name, when);
      list.appendChild(row);
    }
    $('version').textContent = 'Mimi ' + (status.version || '') + ' \u2014 your task list got paws';
  }

  /* ---- boot ------------------------------------------------------------ */
  let hero = null;

  async function boot() {
    cfg = await api.getConfig();
    status = await api.getStatus();

    hero = makePreview($('logo'), cfg.coat && cfg.coat !== 'random' ? cfg.coat : 'orange', 5);
    buildGallery();
    renderSettings();
    renderLists();
    renderStatus();
    requestAnimationFrame(loop);

    $('summon').addEventListener('click', () => api.summon());
    $('refresh').addEventListener('click', () => api.refresh());
    $('fixPerms').addEventListener('click', () => api.openPrivacy());
    $('quit').addEventListener('click', () => api.quit());
    $('sound').addEventListener('change', (e) => {
      cfg.sound = e.target.checked;
      api.setConfig({ sound: cfg.sound });
      $('volume').disabled = !cfg.sound;
    });
    $('volume').addEventListener('input', (e) => {
      cfg.volume = Number(e.target.value) / 100;
      saveSoon({ volume: cfg.volume });
    });
    $('login').addEventListener('change', (e) => api.setLoginItem(e.target.checked));

    api.onStatus((s) => {
      status = s;
      renderStatus();
      renderLists();
      $('login').checked = !!s.loginItem;
    });

    window.addEventListener('resize', () => previews.forEach(sizePreview));
    setInterval(renderStatus, 20000);
  }

  boot();
})();
