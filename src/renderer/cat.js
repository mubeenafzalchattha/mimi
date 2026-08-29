/* One cat: a little state machine that walks, sits, wiggles, meows and leaves. */
(function () {
  'use strict';
  const S = window.SPRITES;

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  class Cat {
    constructor(pet, world) {
      this.id = pet.id;
      this.title = pet.title || 'Something';
      this.list = pet.list || '';
      this.dueAt = pet.dueAt;
      this.demo = !!pet.demo;
      this.coat = pet.coat && S.COATS[pet.coat] ? pet.coat : pick(S.COAT_NAMES);
      this.world = world;

      this.dir = Math.random() < 0.5 ? 1 : -1;
      this.x = this.dir === 1 ? -this.w - 10 : world.width + 10;
      this.lane = Math.round(rand(0, 10));
      this.targetX = rand(30, Math.max(60, world.width - this.w - 30));
      this.baseSpeed = rand(16, 26);
      this.pitch = rand(0.82, 1.3);

      this.state = 'enter';
      this.t = 0;
      this.stateFor = rand(1.5, 3);
      this.anim = rand(0, 10);
      this.tailT = rand(0, 10);
      this.blinkIn = rand(1.5, 5);
      this.blinkFor = 0;
      this.meowIn = rand(1.5, 5);
      this.yOff = 0;
      this.fx = [];
      this.hover = false;
      this.hoverT = 0;
      this.gone = false;
      this.leaving = false;
      this.frozen = false;
      this.error = null;
      this.errorT = 0;
    }

    get scale() { return this.world.scale; }
    get w() { return S.WIDTH * this.scale; }
    get h() { return S.HEIGHT * this.scale; }
    get groundY() { return this.world.height - 2 - this.lane; }
    get top() { return this.groundY - this.h - this.yOff; }
    get overdue() { return Date.now() > this.dueAt; }
    get pan() { return this.world.width ? ((this.x + this.w / 2) / this.world.width) * 2 - 1 : 0; }
    get minutesLeft() { return (this.dueAt - Date.now()) / 60000; }

    box() { return { x: this.x, y: this.top, w: this.w, h: this.h }; }

    contains(pt) {
      const b = this.box();
      return pt.x >= b.x - 2 && pt.x <= b.x + b.w + 2 && pt.y >= b.y - 2 && pt.y <= b.y + b.h + 2;
    }

    /* ---- actions from the outside world ---------------------------- */

    celebrate() {
      if (this.leaving) return;
      this.leaving = true;
      this.setState('happy', 1.2);
      window.PetAudio.yay(this.pitch, this.pan);
      for (let i = 0; i < 10; i++) {
        this.fx.push({
          kind: 'spark', x: rand(0, this.w), y: rand(-6, this.h * 0.6),
          vx: rand(-30, 30), vy: rand(-70, -20), life: rand(0.6, 1.1), age: 0
        });
      }
    }

    pet() {
      window.PetAudio.purr(this.pitch, this.pan);
      if (this.state !== 'happy' && !this.leaving) this.setState('tuck', rand(1.5, 3));
      for (let i = 0; i < 3; i++) {
        this.fx.push({
          kind: 'heart', x: rand(this.w * 0.3, this.w * 0.8), y: rand(-4, 6),
          vx: rand(-10, 10), vy: rand(-40, -22), life: rand(0.8, 1.3), age: 0
        });
      }
    }

    failed(msg) {
      this.leaving = false;
      this.error = msg || 'could not tick that off';
      this.errorT = 4;
      window.PetAudio.grumble(this.pitch, this.pan);
      this.setState('idle', 2);
    }

    setState(state, forSeconds) {
      this.state = state;
      this.t = 0;
      this.stateFor = forSeconds;
      if (state === 'meow') window.PetAudio.meow(this.pitch, this.overdue ? 1 : 0, this.pan);
    }

    /* ---- update ----------------------------------------------------- */

    update(dt, cursor) {
      this.t += dt;
      this.anim += dt;
      this.tailT += dt * (this.overdue ? 3.2 : 2);
      if (this.errorT > 0) this.errorT -= dt;

      // blinking
      this.blinkIn -= dt;
      if (this.blinkIn <= 0) { this.blinkFor = 0.12; this.blinkIn = rand(2, 6); }
      if (this.blinkFor > 0) this.blinkFor -= dt;

      // meowing
      const cfg = this.world.cfg;
      this.meowIn -= dt;
      if (this.meowIn <= 0 && !this.leaving && this.state !== 'happy') {
        const base = this.overdue ? cfg.overdueMeowEverySeconds : cfg.meowEverySeconds;
        this.meowIn = Math.max(3, base * rand(0.7, 1.4));
        this.setState('meow', 0.55);
      }

      // being inspected: stand still and look at the pointer. Without this the cat
      // walks out from under the cursor, hover flickers, and the bubble strobes.
      this.frozen = (this.hover || this.hoverT > 0.5) &&
        !this.leaving && this.state !== 'happy' && this.state !== 'leave';
      if (this.frozen) {
        if (this.state === 'walk' || this.state === 'enter') this.setState('idle', 4);
        if (this.state === 'idle' || this.state === 'tuck') {
          this.stateFor = Math.max(this.stateFor, 4);
          if (this.t > this.stateFor) this.t = 0;   // stay parked, but let a meow finish
        }
        if (cursor) {
          const cx = this.x + this.w / 2;
          if (Math.abs(cursor.x - cx) > 30) this.dir = cursor.x > cx ? 1 : -1;
        }
      }

      const speed = this.baseSpeed * this.scale * (this.overdue ? 1.7 : 1) * (this.state === 'leave' ? 3.2 : 1);

      switch (this.state) {
        case 'enter': {
          if (this.frozen) break;
          this.dir = this.targetX > this.x ? 1 : -1;
          this.x += this.dir * speed * 1.6 * dt;
          if (Math.abs(this.x - this.targetX) < 12 || this.t > 12) this.setState('walk', rand(2, 5));
          break;
        }
        case 'walk': {
          if (this.frozen) break;
          this.x += this.dir * speed * dt;
          if (this.x < 4) { this.x = 4; this.dir = 1; }
          if (this.x > this.world.width - this.w - 4) { this.x = this.world.width - this.w - 4; this.dir = -1; }
          if (this.t > this.stateFor) this.nextIdea();
          break;
        }
        case 'idle':
        case 'tuck':
          if (this.t > this.stateFor) this.nextIdea();
          break;
        case 'meow':
          if (this.t > this.stateFor) this.setState(this.overdue ? 'walk' : pick(['idle', 'walk']), rand(2, 4));
          break;
        case 'happy': {
          // little hop
          const k = Math.min(1, this.t / 0.45);
          this.yOff = Math.sin(k * Math.PI) * 10 * this.scale * 0.4;
          if (this.t > this.stateFor) { this.yOff = 0; this.setState('leave', 10); }
          break;
        }
        case 'leave': {
          const goRight = this.x + this.w / 2 > this.world.width / 2;
          this.dir = goRight ? 1 : -1;
          this.x += this.dir * speed * dt;
          if (this.x < -this.w - 40 || this.x > this.world.width + 40) this.gone = true;
          break;
        }
      }

      // chase the cursor a bit when it is close (cats are nosy)
      if (cursor && !this.leaving && !this.frozen && this.state === 'walk') {
        const cx = this.x + this.w / 2;
        const dx = cursor.x - cx;
        const near = Math.abs(dx) < 160 && Math.abs(dx) > 45 && Math.abs(cursor.y - this.groundY) < 220;
        if (near) this.dir = dx > 0 ? 1 : -1;
      }

      // cats dislike standing inside each other
      if (this.world.cats && !this.leaving && !this.frozen) {
        for (const other of this.world.cats.values()) {
          if (other === this || other.gone) continue;
          const gap = (other.x + other.w / 2) - (this.x + this.w / 2);
          if (Math.abs(gap) < this.w * 0.9) {
            this.x -= Math.sign(gap || 1) * 20 * dt * this.scale;
          }
        }
      }

      // hover bubble fade
      const target = this.hover ? 1 : 0;
      this.hoverT += (target - this.hoverT) * Math.min(1, dt * 12);

      // fx
      for (const f of this.fx) {
        f.age += dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.vy += 30 * dt;
      }
      this.fx = this.fx.filter((f) => f.age < f.life);
    }

    nextIdea() {
      if (this.leaving) return;
      if (this.overdue) {
        // no lounging around when you are late
        this.setState(pick(['walk', 'walk', 'meow', 'idle']), rand(1.5, 3.5));
        if (Math.random() < 0.4) this.dir *= -1;
        return;
      }
      const idea = pick(['walk', 'walk', 'idle', 'tuck', 'idle']);
      if (idea === 'walk' && Math.random() < 0.5) this.dir *= -1;
      this.setState(idea, idea === 'tuck' ? rand(3, 7) : rand(2, 5));
    }

    /* ---- drawing ----------------------------------------------------- */

    legsFrame() {
      if (this.state === 'tuck') return S.LEGS.tuck;
      if (this.state === 'walk' || this.state === 'enter' || this.state === 'leave') {
        const speedish = this.state === 'leave' ? 14 : 8;
        return S.LEGS.walk[Math.floor(this.anim * speedish) % S.LEGS.walk.length];
      }
      return S.LEGS.stand;
    }

    tailFrame() {
      if (this.state === 'tuck') return 2;
      if (this.overdue) return [0, 1, 0, 3][Math.floor(this.tailT) % 4];
      return [0, 1, 0, 2][Math.floor(this.tailT) % 4];
    }

    draw(ctx) {
      const sc = this.scale;
      const colors = S.COATS[this.coat];
      const px = Math.round(this.x);
      const py = Math.round(this.top);
      const walking = this.state === 'walk' || this.state === 'enter' || this.state === 'leave';
      const bob = walking && Math.floor(this.anim * 8) % 2 === 0 ? sc : 0;

      ctx.save();
      if (this.dir < 0) { ctx.translate(px + this.w, py + bob); ctx.scale(-1, 1); }
      else ctx.translate(px, py + bob);

      // soft shadow so the cat sits on the desktop instead of floating
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#000';
      ctx.fillRect(2 * sc, (S.HEIGHT - 1) * sc - bob, 12 * sc, sc);
      ctx.restore();

      S.drawGrid(ctx, S.TAILS[this.tailFrame()], -4 * sc, 4 * sc, sc, colors);
      S.drawGrid(ctx, S.BODY, 0, 0, sc, colors);
      S.drawGrid(ctx, this.legsFrame(), 0, 11 * sc, sc, colors);

      const dot = (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(x * sc, y * sc, sc, sc); };
      const closed = this.blinkFor > 0 || this.state === 'happy';
      if (closed) {
        dot(9, 4, colors.o); dot(10, 4, colors.o);
        dot(12, 4, colors.o); dot(13, 4, colors.o);
      }
      if (this.overdue && !closed) { dot(11, 3, colors.o); dot(12, 3, colors.o); }
      if (this.state === 'meow' || this.state === 'happy') {
        dot(11, 6, colors.o); dot(12, 6, colors.P); dot(13, 6, colors.o); dot(12, 7, colors.P);
      }
      ctx.restore();

      // fx are drawn unflipped, in world space
      for (const f of this.fx) {
        const alpha = Math.max(0, 1 - f.age / f.life);
        const grid = f.kind === 'heart' ? S.HEART : S.SPARK;
        const color = f.kind === 'heart' ? '#ff6b8b' : '#ffc93c';
        S.drawBlob(ctx, grid, px + f.x, py + f.y, Math.max(2, sc - 1), color, alpha);
      }

      if (this.overdue && !this.leaving) {
        const blinkOn = Math.floor(this.anim * 2) % 2 === 0;
        if (blinkOn) S.drawBlob(ctx, S.BANG, px + this.w - 2 * sc, py - 9 * sc, Math.max(2, sc - 1), '#d64545', 0.95);
      }
    }
  }

  window.Cat = Cat;
})();
