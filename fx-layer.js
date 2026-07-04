/* fx-layer.js — 粒子与信息可视化组件（量子光学器材库）
   自定义元素：
   fx-layer  全站背景粒子（drift 漂浮 / network 连线网络 / wave 干涉波纹 / optics 光路粒子流 / off）
   fx-qubit  量子态粒子云（logo）
   fx-graph  器材关系力导向图谱
   fx-burst  统计数字粒子汇聚
   全部主题自适应（跟随 data-theme CSS 变量）、prefers-reduced-motion 降级、移动端降密度。 */
(function () {
  'use strict';
  if (window.__fxLayerDefined) return;
  window.__fxLayerDefined = true;

  var REDUCED = function () { return matchMedia('(prefers-reduced-motion: reduce)').matches; };

  function cssVar(name, fb) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fb;
  }
  function palette() {
    return {
      accent: cssVar('--accent', '#7c87ee'),
      accent2: cssVar('--accent-2', '#4b9ed1'),
      ok: cssVar('--ok', '#43ad86'),
      warn: cssVar('--warn', '#d79839'),
      faint: cssVar('--faint', '#777c85'),
      soft: cssVar('--soft', '#a7abb3'),
      text: cssVar('--text', '#f0f1f3'),
      raised: cssVar('--raised', '#15171b'),
      sunken: cssVar('--sunken', '#101216'),
      dark: document.documentElement.getAttribute('data-theme') === 'dark'
    };
  }
  function watchTheme(cb) {
    var mo = new MutationObserver(cb);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return mo;
  }
  function fitCanvas(canvas, w, h) {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  /* ============================== fx-layer 背景 ============================== */
  var FxLayer = /** @class */ (function () {
    class FxLayer extends HTMLElement {
      static get observedAttributes() { return ['mode']; }
      connectedCallback() {
        if (this._init) return;
        this._init = true;
        this.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;display:block;contain:strict';
        this.canvas = document.createElement('canvas');
        this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
        this.appendChild(this.canvas);
        this.mouse = { x: -9e3, y: -9e3 };
        this.raf = 0;
        this.last = 0;
        this.t = 0;
        this.C = palette();
        this._onResize = this.resize.bind(this);
        this._onMove = function (e) { this.mouse.x = e.clientX; this.mouse.y = e.clientY; }.bind(this);
        this._onLeave = function () { this.mouse.x = -9e3; this.mouse.y = -9e3; }.bind(this);
        this._onVis = function () { if (!document.hidden) this.kick(); }.bind(this);
        window.addEventListener('resize', this._onResize);
        window.addEventListener('pointermove', this._onMove, { passive: true });
        window.addEventListener('blur', this._onLeave);
        document.addEventListener('visibilitychange', this._onVis);
        this.mo = watchTheme(function () { this.C = palette(); this.staticDrawn = false; this.kick(); }.bind(this));
        this.resize();
        this.kick();
      }
      disconnectedCallback() {
        window.removeEventListener('resize', this._onResize);
        window.removeEventListener('pointermove', this._onMove);
        window.removeEventListener('blur', this._onLeave);
        document.removeEventListener('visibilitychange', this._onVis);
        if (this.mo) this.mo.disconnect();
        if (this.raf) cancelAnimationFrame(this.raf);
        this.raf = 0;
        this._init = false;
      }
      attributeChangedCallback() {
        if (!this._init) return;
        this.staticDrawn = false;
        this.buildFlow();
        this.kick();
      }
      get mode() { return this.getAttribute('mode') || 'network'; }
      resize() {
        this.w = window.innerWidth;
        this.h = window.innerHeight;
        this.ctx = fitCanvas(this.canvas, this.w, this.h);
        this.seed();
        this.buildFlow();
        this.staticDrawn = false;
        this.kick();
      }
      seed() {
        var w = this.w, h = this.h;
        var density = w < 760 ? 30000 : 16000;
        var n = Math.max(24, Math.min(130, Math.round(w * h / density)));
        this.pts = [];
        for (var i = 0; i < n; i++) {
          this.pts.push({
            x: Math.random() * w, y: Math.random() * h,
            vx: (Math.random() - .5) * 14, vy: (Math.random() - .5) * 14,
            r: .8 + Math.random() * 1.6, ph: Math.random() * Math.PI * 2
          });
        }
      }
      buildFlow() {
        // 光路：主光束 + 两个分束器节点分出的支路
        var w = this.w || window.innerWidth, h = this.h || window.innerHeight;
        var yMain = h * .6, n1 = { x: w * .3, y: yMain }, n2 = { x: w * .66, y: yMain };
        this.nodes = [n1, n2];
        this.routes = [
          [{ x: -40, y: yMain }, { x: w + 40, y: yMain }],
          [{ x: -40, y: yMain }, n1, { x: n1.x, y: h * .22 }, { x: w + 40, y: h * .22 }],
          [{ x: -40, y: yMain }, n2, { x: n2.x, y: h * .88 }, { x: w + 40, y: h * .88 }]
        ].map(function (pts) {
          var segs = [], total = 0;
          for (var i = 0; i < pts.length - 1; i++) {
            var dx = pts[i + 1].x - pts[i].x, dy = pts[i + 1].y - pts[i].y, len = Math.hypot(dx, dy);
            segs.push({ a: pts[i], dx: dx, dy: dy, len: len, from: total });
            total += len;
          }
          return { pts: pts, segs: segs, total: total };
        });
        var count = w < 760 ? 26 : 54;
        this.flow = [];
        for (var i = 0; i < count; i++) {
          this.flow.push({
            route: this.routes[i % 3 === 0 ? 0 : (i % 3 === 1 ? 1 : 2)],
            d: Math.random() * this.routes[0].total,
            v: 70 + Math.random() * 110,
            r: 1 + Math.random() * 1.6
          });
        }
      }
      posOn(route, d) {
        d = d % route.total;
        for (var i = 0; i < route.segs.length; i++) {
          var s = route.segs[i];
          if (d <= s.from + s.len) {
            var k = (d - s.from) / s.len;
            return { x: s.a.x + s.dx * k, y: s.a.y + s.dy * k };
          }
        }
        var lastPt = route.pts[route.pts.length - 1];
        return { x: lastPt.x, y: lastPt.y };
      }
      kick() {
        if (this.raf || !this._init) return;
        this.last = 0;
        this.raf = requestAnimationFrame(this.loop.bind(this));
      }
      loop(ts) {
        this.raf = 0;
        if (!this._init || !this.ctx) return;
        var mode = this.mode;
        if (mode === 'off') { this.ctx.clearRect(0, 0, this.w, this.h); return; }
        if (REDUCED()) {
          if (!this.staticDrawn) { this.draw(0); this.staticDrawn = true; }
          return;
        }
        if (document.hidden) return;
        var dt = this.last ? Math.min(.05, (ts - this.last) / 1000) : .016;
        this.last = ts;
        this.t += dt;
        this.draw(dt);
        this.raf = requestAnimationFrame(this.loop.bind(this));
      }
      draw(dt) {
        var ctx = this.ctx, mode = this.mode;
        ctx.clearRect(0, 0, this.w, this.h);
        if (mode === 'wave') return this.drawWave(ctx);
        if (mode === 'optics') return this.drawOptics(ctx, dt);
        this.drawParticles(ctx, dt, mode === 'network');
      }
      drawParticles(ctx, dt, network) {
        var w = this.w, h = this.h, C = this.C, m = this.mouse, pts = this.pts;
        var baseA = C.dark ? 1 : .8;
        for (var i = 0; i < pts.length; i++) {
          var p = pts[i];
          // 鼠标交互：network 轻微吸引，drift 轻微排斥
          var dx = m.x - p.x, dy = m.y - p.y, d2 = dx * dx + dy * dy;
          if (d2 < 160 * 160 && d2 > 1) {
            var d = Math.sqrt(d2), f = (1 - d / 160) * (network ? 12 : -18);
            p.vx += dx / d * f * dt;
            p.vy += dy / d * f * dt;
          }
          p.vx *= .995; p.vy *= .995;
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.x < -10) p.x = w + 10; if (p.x > w + 10) p.x = -10;
          if (p.y < -10) p.y = h + 10; if (p.y > h + 10) p.y = -10;
        }
        if (network) {
          var maxD = 110;
          ctx.lineWidth = 1;
          ctx.strokeStyle = C.accent;
          for (var i = 0; i < pts.length; i++) {
            for (var j = i + 1; j < pts.length; j++) {
              var a = pts[i], b = pts[j];
              var dx2 = a.x - b.x; if (dx2 > maxD || dx2 < -maxD) continue;
              var dy2 = a.y - b.y; if (dy2 > maxD || dy2 < -maxD) continue;
              var dd = Math.hypot(dx2, dy2);
              if (dd < maxD) {
                ctx.globalAlpha = (1 - dd / maxD) * (C.dark ? .22 : .18);
                ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
              }
            }
            // 鼠标连线
            var md = Math.hypot(pts[i].x - m.x, pts[i].y - m.y);
            if (md < 150) {
              ctx.globalAlpha = (1 - md / 150) * .3;
              ctx.strokeStyle = C.accent2;
              ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(m.x, m.y); ctx.stroke();
              ctx.strokeStyle = C.accent;
            }
          }
        }
        for (var i = 0; i < pts.length; i++) {
          var p = pts[i];
          var tw = .45 + .55 * Math.abs(Math.sin(this.t * 1.1 + p.ph));
          ctx.globalAlpha = tw * .55 * baseA;
          ctx.fillStyle = i % 5 === 0 ? C.accent2 : C.accent;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      drawWave(ctx) {
        var w = this.w, h = this.h, C = this.C, t = this.t;
        var rows = Math.max(6, Math.round(h / 90));
        var k1 = .012, k2 = .021;
        ctx.lineWidth = 1;
        for (var r = 0; r < rows; r++) {
          var y0 = (r + .5) * h / rows;
          var phase = r * .7;
          ctx.globalAlpha = (C.dark ? .16 : .13) * (0.5 + 0.5 * Math.sin(r * 1.3 + t * .4));
          ctx.strokeStyle = r % 2 ? C.accent2 : C.accent;
          ctx.beginPath();
          for (var x = 0; x <= w; x += 6) {
            // 双波叠加 → 干涉包络
            var y = y0 + Math.sin(x * k1 + t * .9 + phase) * 11 + Math.sin(x * k2 - t * 1.3 + phase) * 8;
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        // 波节亮点
        ctx.fillStyle = C.accent;
        for (var r = 0; r < rows; r++) {
          var y0 = (r + .5) * h / rows;
          for (var x = 30; x < w; x += 160) {
            var env = Math.abs(Math.sin(x * (k2 - k1) / 2 + t * 1.1 + r * .7));
            ctx.globalAlpha = env * (C.dark ? .3 : .22);
            ctx.beginPath(); ctx.arc(x, y0, 1.4, 0, 6.2832); ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
      }
      drawOptics(ctx, dt) {
        var C = this.C;
        // 光束轨迹
        ctx.lineWidth = 1;
        ctx.strokeStyle = C.accent;
        ctx.globalAlpha = C.dark ? .14 : .12;
        for (var r = 0; r < this.routes.length; r++) {
          var pts = this.routes[r].pts;
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.stroke();
        }
        // 分束器节点（菱形）
        ctx.globalAlpha = C.dark ? .4 : .32;
        ctx.strokeStyle = C.accent2;
        for (var i = 0; i < this.nodes.length; i++) {
          var n = this.nodes[i], s = 9 + Math.sin(this.t * 2 + i) * 1.5;
          ctx.beginPath();
          ctx.moveTo(n.x, n.y - s); ctx.lineTo(n.x + s, n.y); ctx.lineTo(n.x, n.y + s); ctx.lineTo(n.x - s, n.y);
          ctx.closePath(); ctx.stroke();
        }
        // 光子
        for (var i = 0; i < this.flow.length; i++) {
          var f = this.flow[i];
          f.d += f.v * dt;
          if (f.d > f.route.total) f.d -= f.route.total;
          var pos = this.posOn(f.route, f.d);
          ctx.globalAlpha = C.dark ? .8 : .55;
          ctx.fillStyle = i % 4 === 0 ? C.ok : (i % 2 ? C.accent : C.accent2);
          ctx.beginPath(); ctx.arc(pos.x, pos.y, f.r, 0, 6.2832); ctx.fill();
          // 拖尾
          var tail = this.posOn(f.route, Math.max(0, f.d - 14));
          ctx.globalAlpha *= .3;
          ctx.strokeStyle = ctx.fillStyle;
          ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(pos.x, pos.y); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }
    return FxLayer;
  })();
  customElements.define('fx-layer', FxLayer);

  /* ============================== fx-qubit 量子云 logo ============================== */
  class FxQubit extends HTMLElement {
    connectedCallback() {
      if (this._init) return;
      this._init = true;
      var size = this.clientWidth || 34;
      this.size = size;
      this.style.cssText += ';display:block;width:' + size + 'px;height:' + size + 'px;border-radius:10px;overflow:hidden;background:color-mix(in srgb,var(--accent) 14%,transparent);box-shadow:0 6px 20px color-mix(in srgb,var(--accent) 40%,transparent);flex:none';
      this.canvas = document.createElement('canvas');
      this.canvas.style.cssText = 'width:100%;height:100%;display:block';
      this.appendChild(this.canvas);
      this.ctx = fitCanvas(this.canvas, size, size);
      this.C = palette();
      this.mo = watchTheme(function () { this.C = palette(); }.bind(this));
      // 斐波那契球面点
      this.dots = [];
      var N = 46, ga = Math.PI * (3 - Math.sqrt(5));
      for (var i = 0; i < N; i++) {
        var y = 1 - (i / (N - 1)) * 2, rad = Math.sqrt(1 - y * y), th = ga * i;
        this.dots.push({ x: Math.cos(th) * rad, y: y, z: Math.sin(th) * rad });
      }
      this.t = Math.random() * 10;
      this.raf = 0;
      this._vis = function () { if (!document.hidden) this.kick(); }.bind(this);
      document.addEventListener('visibilitychange', this._vis);
      this.kick();
    }
    disconnectedCallback() {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      document.removeEventListener('visibilitychange', this._vis);
      if (this.mo) this.mo.disconnect();
      this._init = false;
    }
    kick() { if (!this.raf && this._init) this.raf = requestAnimationFrame(this.loop.bind(this)); }
    loop() {
      this.raf = 0;
      if (!this._init) return;
      this.t += .016;
      this.draw();
      if (!REDUCED() && !document.hidden) this.raf = requestAnimationFrame(this.loop.bind(this));
    }
    draw() {
      var ctx = this.ctx, s = this.size, c = s / 2, R = s * .36, C = this.C, t = this.t;
      ctx.clearRect(0, 0, s, s);
      var cy = Math.cos(t * .7), sy = Math.sin(t * .7);
      var tilt = .45, ct = Math.cos(tilt), st = Math.sin(tilt);
      // 赤道轨道环
      ctx.strokeStyle = C.accent2;
      ctx.globalAlpha = .5;
      ctx.lineWidth = .8;
      ctx.beginPath();
      ctx.ellipse(c, c, R, R * Math.abs(st), 0, 0, 6.2832);
      ctx.stroke();
      for (var i = 0; i < this.dots.length; i++) {
        var d = this.dots[i];
        var x = d.x * cy + d.z * sy, z1 = -d.x * sy + d.z * cy, y = d.y;
        var y2 = y * ct - z1 * st, z2 = y * st + z1 * ct;
        var depth = (z2 + 1) / 2;
        ctx.globalAlpha = .25 + .75 * depth;
        ctx.fillStyle = i % 3 === 0 ? C.ok : (i % 2 ? C.accent : C.accent2);
        ctx.beginPath();
        ctx.arc(c + x * R, c + y2 * R, .7 + depth * 1.1, 0, 6.2832);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
  customElements.define('fx-qubit', FxQubit);

  /* ============================== fx-graph 力导向图谱 ============================== */
  class FxGraph extends HTMLElement {
    static get observedAttributes() { return ['items']; }
    connectedCallback() {
      if (this._init) return;
      this._init = true;
      this.style.cssText += ';display:block;position:relative;width:100%;height:100%;min-height:300px;touch-action:none';
      this.canvas = document.createElement('canvas');
      this.canvas.style.cssText = 'width:100%;height:100%;display:block;border-radius:12px';
      this.appendChild(this.canvas);
      this.nodes = [];
      this.links = [];
      this.hover = null;
      this.drag = null;
      this.raf = 0;
      this.C = palette();
      this.mo = watchTheme(function () { this.C = palette(); this.kick(); }.bind(this));
      this.ro = new ResizeObserver(this.resize.bind(this));
      this.ro.observe(this);
      this._down = this.onDown.bind(this);
      this._move = this.onMove.bind(this);
      this._up = this.onUp.bind(this);
      this.canvas.addEventListener('pointerdown', this._down);
      this.canvas.addEventListener('pointermove', this._move);
      window.addEventListener('pointerup', this._up);
      this._vis = function () { if (!document.hidden) this.kick(); }.bind(this);
      document.addEventListener('visibilitychange', this._vis);
      this.resize();
      this.build();
      this.kick();
    }
    disconnectedCallback() {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      if (this.ro) this.ro.disconnect();
      if (this.mo) this.mo.disconnect();
      window.removeEventListener('pointerup', this._up);
      document.removeEventListener('visibilitychange', this._vis);
      this._init = false;
    }
    attributeChangedCallback() { if (this._init) { this.build(); this.kick(); } }
    resize() {
      this.w = this.clientWidth || 600;
      this.h = this.clientHeight || 340;
      this.ctx = fitCanvas(this.canvas, this.w, this.h);
      this.kick();
    }
    build() {
      var data = { cats: [], devices: [] };
      try { data = JSON.parse(this.getAttribute('items') || '{}') || data; } catch (e) { }
      var old = {};
      (this.nodes || []).forEach(function (n) { old[n.uid] = n; });
      var w = this.w || 600, h = this.h || 340;
      var nodes = [], links = [], byKey = {};
      var cats = data.cats || [];
      cats.forEach(function (c, i) {
        var ang = i / Math.max(1, cats.length) * Math.PI * 2;
        var prev = old['c:' + c.key];
        var n = prev || { x: w / 2 + Math.cos(ang) * Math.min(w, h) * .27, y: h / 2 + Math.sin(ang) * Math.min(w, h) * .27, vx: 0, vy: 0 };
        n.uid = 'c:' + c.key; n.kind = 'cat'; n.key = c.key; n.label = c.label; n.r = 20;
        byKey[c.key] = n;
        nodes.push(n);
      });
      (data.devices || []).forEach(function (d) {
        var hub = byKey[d.cat] || byKey['uncategorized'];
        var prev = old['d:' + d.id];
        var n = prev || {
          x: (hub ? hub.x : w / 2) + (Math.random() - .5) * 90,
          y: (hub ? hub.y : h / 2) + (Math.random() - .5) * 90, vx: 0, vy: 0
        };
        n.uid = 'd:' + d.id; n.kind = 'dev'; n.id = d.id; n.label = d.label; n.status = d.status; n.r = 8;
        nodes.push(n);
        if (hub) links.push({ a: hub, b: n });
      });
      this.nodes = nodes;
      this.links = links;
      this.heat = 1;
      if (REDUCED()) { for (var i = 0; i < 260; i++) this.tick(.016); }
    }
    statusColor(s) {
      var C = this.C;
      return s === 'online' ? C.ok : s === 'maintenance' ? C.warn : C.faint;
    }
    tick(dt) {
      var nodes = this.nodes, w = this.w, h = this.h;
      var i, j;
      for (i = 0; i < nodes.length; i++) {
        var a = nodes[i];
        for (j = i + 1; j < nodes.length; j++) {
          var b = nodes[j];
          var dx = a.x - b.x, dy = a.y - b.y;
          var d2 = dx * dx + dy * dy + 40;
          var k = (a.kind === 'cat' && b.kind === 'cat' ? 26000 : 5200) / d2;
          var d = Math.sqrt(d2);
          var fx = dx / d * k, fy = dy / d * k;
          a.vx += fx * dt; a.vy += fy * dt;
          b.vx -= fx * dt; b.vy -= fy * dt;
        }
        // 向心
        a.vx += (w / 2 - a.x) * (a.kind === 'cat' ? .5 : .08) * dt;
        a.vy += (h / 2 - a.y) * (a.kind === 'cat' ? .5 : .08) * dt;
      }
      for (i = 0; i < this.links.length; i++) {
        var l = this.links[i];
        var dx2 = l.b.x - l.a.x, dy2 = l.b.y - l.a.y;
        var d3 = Math.hypot(dx2, dy2) || 1;
        var f = (d3 - 74) * 3.2;
        var fx2 = dx2 / d3 * f * dt, fy2 = dy2 / d3 * f * dt;
        l.a.vx += fx2; l.a.vy += fy2;
        l.b.vx -= fx2; l.b.vy -= fy2;
      }
      var energy = 0;
      for (i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (this.drag && this.drag.node === n) { n.vx = 0; n.vy = 0; continue; }
        n.vx *= .86; n.vy *= .86;
        n.x += n.vx * dt * 3;
        n.y += n.vy * dt * 3;
        n.x = Math.max(n.r + 2, Math.min(w - n.r - 2, n.x));
        n.y = Math.max(n.r + 2, Math.min(h - n.r - 2, n.y));
        energy += Math.abs(n.vx) + Math.abs(n.vy);
      }
      return energy;
    }
    kick() { this.cool = 0; if (!this.raf && this._init) this.raf = requestAnimationFrame(this.loop.bind(this)); }
    loop() {
      this.raf = 0;
      if (!this._init || !this.ctx) return;
      var energy = REDUCED() && !this.drag ? 0 : this.tick(.016);
      this.draw();
      // 静止后停止渲染，交互时唤醒
      if (document.hidden) return;
      if (energy > 2 || this.drag || this.cool < 60) {
        this.cool++;
        this.raf = requestAnimationFrame(this.loop.bind(this));
      }
    }
    draw() {
      var ctx = this.ctx, C = this.C, w = this.w, h = this.h;
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;
      ctx.strokeStyle = C.faint;
      for (var i = 0; i < this.links.length; i++) {
        var l = this.links[i];
        ctx.globalAlpha = this.hover && (this.hover === l.a || this.hover === l.b) ? .6 : .22;
        ctx.beginPath(); ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); ctx.stroke();
      }
      for (var i = 0; i < this.nodes.length; i++) {
        var n = this.nodes[i];
        var isHover = this.hover === n;
        if (n.kind === 'cat') {
          ctx.globalAlpha = 1;
          ctx.fillStyle = C.raised;
          ctx.strokeStyle = C.accent;
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, 6.2832); ctx.fill();
          ctx.globalAlpha = isHover ? .9 : .55;
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.fillStyle = C.text;
          ctx.font = '600 11px "Noto Sans SC",sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          var lbl = n.label.length > 6 ? n.label.slice(0, 5) + '…' : n.label;
          ctx.fillText(lbl, n.x, n.y);
        } else {
          var col = this.statusColor(n.status);
          ctx.globalAlpha = isHover ? 1 : .9;
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(n.x, n.y, isHover ? n.r + 2 : n.r, 0, 6.2832); ctx.fill();
          ctx.globalAlpha = .8;
          ctx.fillStyle = C.faint;
          ctx.font = '500 9px "IBM Plex Mono",monospace';
          ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          ctx.fillText(n.id, n.x, n.y + n.r + 4);
        }
      }
      // 悬停提示
      if (this.hover && this.hover.kind === 'dev') {
        var n = this.hover;
        ctx.font = '600 12px "Noto Sans SC",sans-serif';
        var tw = ctx.measureText(n.label).width + 18;
        var tx = Math.max(6, Math.min(w - tw - 6, n.x - tw / 2));
        var ty = Math.max(6, n.y - n.r - 34);
        ctx.globalAlpha = .96;
        ctx.fillStyle = C.raised;
        ctx.strokeStyle = C.accent;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(tx, ty, tw, 24, 7); else ctx.rect(tx, ty, tw, 24);
        ctx.fill(); ctx.globalAlpha = .5; ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = C.text;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(n.label, tx + tw / 2, ty + 12);
      }
      ctx.globalAlpha = 1;
    }
    pick(e) {
      var rect = this.canvas.getBoundingClientRect();
      var x = e.clientX - rect.left, y = e.clientY - rect.top;
      var best = null, bd = 1e9;
      for (var i = 0; i < this.nodes.length; i++) {
        var n = this.nodes[i];
        var d = Math.hypot(n.x - x, n.y - y);
        if (d < n.r + 7 && d < bd) { best = n; bd = d; }
      }
      return { node: best, x: x, y: y };
    }
    onDown(e) {
      var p = this.pick(e);
      if (p.node) {
        this.drag = { node: p.node, moved: 0, ox: p.x - p.node.x, oy: p.y - p.node.y };
        this.canvas.setPointerCapture(e.pointerId);
      }
      this.kick();
    }
    onMove(e) {
      var p = this.pick(e);
      if (this.drag) {
        this.drag.moved += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
        this.drag.node.x = p.x - this.drag.ox;
        this.drag.node.y = p.y - this.drag.oy;
      } else {
        this.hover = p.node;
        this.canvas.style.cursor = p.node ? (p.node.kind === 'dev' ? 'pointer' : 'grab') : 'default';
      }
      this.kick();
    }
    onUp() {
      if (this.drag) {
        var d = this.drag;
        this.drag = null;
        if (d.moved < 5 && d.node.kind === 'dev') {
          this.dispatchEvent(new CustomEvent('fx-open-device', { bubbles: true, composed: true, detail: d.node.id }));
        }
      }
      this.kick();
    }
  }
  customElements.define('fx-graph', FxGraph);

  /* ============================== fx-burst 数字粒子汇聚 ============================== */
  class FxBurst extends HTMLElement {
    static get observedAttributes() { return ['value']; }
    connectedCallback() {
      if (this._init) return;
      this._init = true;
      this.style.cssText += ';position:absolute;inset:0;pointer-events:none;display:block';
      this.canvas = document.createElement('canvas');
      this.canvas.style.cssText = 'width:100%;height:100%;display:block';
      this.appendChild(this.canvas);
      this.raf = 0;
      setTimeout(this.burst.bind(this), 80 + Math.random() * 300);
    }
    disconnectedCallback() {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      this._init = false;
    }
    attributeChangedCallback(_n, oldV, newV) {
      if (this._init && oldV != null && oldV !== newV) this.burst();
    }
    burst() {
      if (!this._init || REDUCED()) return;
      var w = this.clientWidth || 200, h = this.clientHeight || 120;
      this.w = w; this.h = h;
      this.ctx = fitCanvas(this.canvas, w, h);
      var C = palette();
      var target = { x: w * .22, y: h * .52 };
      this.parts = [];
      for (var i = 0; i < 26; i++) {
        var edge = Math.random();
        var sx, sy;
        if (edge < .25) { sx = Math.random() * w; sy = -4; }
        else if (edge < .5) { sx = w + 4; sy = Math.random() * h; }
        else if (edge < .75) { sx = Math.random() * w; sy = h + 4; }
        else { sx = -4; sy = Math.random() * h; }
        this.parts.push({
          sx: sx, sy: sy,
          tx: target.x + (Math.random() - .5) * 26, ty: target.y + (Math.random() - .5) * 18,
          delay: Math.random() * .25, r: .8 + Math.random() * 1.4,
          col: i % 3 === 0 ? C.accent2 : C.accent
        });
      }
      this.t0 = performance.now();
      if (!this.raf) this.raf = requestAnimationFrame(this.loop.bind(this));
    }
    loop(ts) {
      this.raf = 0;
      if (!this._init || !this.ctx) return;
      var T = (ts - this.t0) / 1000, dur = .9;
      var ctx = this.ctx;
      ctx.clearRect(0, 0, this.w, this.h);
      var alive = false;
      for (var i = 0; i < this.parts.length; i++) {
        var p = this.parts[i];
        var k = Math.max(0, Math.min(1, (T - p.delay) / dur));
        if (k < 1) alive = true;
        if (k <= 0) continue;
        var e = 1 - Math.pow(1 - k, 3); // ease-out
        var x = p.sx + (p.tx - p.sx) * e, y = p.sy + (p.ty - p.sy) * e;
        ctx.globalAlpha = k < .8 ? .7 : .7 * (1 - (k - .8) / .2);
        ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.arc(x, y, p.r, 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (alive) this.raf = requestAnimationFrame(this.loop.bind(this));
      else ctx.clearRect(0, 0, this.w, this.h);
    }
  }
  customElements.define('fx-burst', FxBurst);
})();
