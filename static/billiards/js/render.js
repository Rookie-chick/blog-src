window.BK = window.BK || {};

(function () {
  'use strict';

  var C = BK.CFG;
  var U = BK.U;
  var PI = Math.PI;

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.resize();
    this.rings = [];
    this.pots = [];
    this.lastT = 0;
  }

  Renderer.prototype.resize = function () {
    var dpr = this.dpr;
    this.canvas.width = C.W * dpr;
    this.canvas.height = C.H * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  Renderer.prototype.toLocal = function (evt) {
    var r = this.canvas.getBoundingClientRect();
    return {
      x: (evt.clientX - r.left) * (C.W / r.width),
      y: (evt.clientY - r.top) * (C.H / r.height)
    };
  };

  Renderer.prototype.addRing = function (x, y, color) {
    this.rings.push({ x: x, y: y, r: 4, a: 0.85, color: color || '#ffe9a8' });
  };

  // 落袋动画：球已标记为 inactive，这里单独留一份"正在掉下去"的残像
  Renderer.prototype.addPot = function (b) {
    this.pots.push({
      x: b.x, y: b.y, num: b.num, color: b.color,
      isCue: b.isCue, isStriped: b.isStriped, t: 0
    });
    this.addRing(b.x, b.y, b.isCue ? '#dfe8f2' : '#ffe9a8');
  };

  Renderer.prototype.updateFx = function (dt) {
    var i;
    for (i = this.rings.length - 1; i >= 0; i--) {
      var g = this.rings[i];
      g.r += dt * 150;
      g.a -= dt * 2.1;
      if (g.a <= 0 || g.r > 70) this.rings.splice(i, 1);
    }
    for (i = this.pots.length - 1; i >= 0; i--) {
      this.pots[i].t += dt * 3.4;
      if (this.pots[i].t >= 1) this.pots.splice(i, 1);
    }
  };

  Renderer.prototype.drawFx = function (ctx) {
    var i, r = C.BALL_R;

    for (i = 0; i < this.rings.length; i++) {
      var g = this.rings[i];
      ctx.save();
      ctx.globalAlpha = Math.max(0, g.a);
      ctx.strokeStyle = g.color;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r, 0, PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (i = 0; i < this.pots.length; i++) {
      var p = this.pots[i];
      var s = Math.max(0, 1 - p.t);
      ctx.save();
      ctx.globalAlpha = s * s;
      ctx.translate(p.x, p.y + p.t * 5);
      ctx.rotate(p.t * 3.2);
      ctx.scale(s, s);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      if (!p.isCue) {
        ctx.fillStyle = '#fbf8ee';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.44, 0, PI * 2);
        ctx.fill();
        ctx.fillStyle = '#20201c';
        ctx.font = 'bold ' + (r * 0.62).toFixed(1) + 'px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(p.num), 0, 0.6);
      }
      ctx.restore();
    }
  };

  /* ---------------- 球桌 ---------------- */

  Renderer.prototype.drawTable = function (ctx) {
    var W = C.W, H = C.H;

    // 木框
    var wood = ctx.createLinearGradient(0, 0, W, H);
    wood.addColorStop(0, '#6d4626');
    wood.addColorStop(0.35, '#573517');
    wood.addColorStop(0.7, '#43280f');
    wood.addColorStop(1, '#5c3a1c');
    ctx.fillStyle = wood;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(255, 215, 140, .22)';
    ctx.lineWidth = 1;
    ctx.strokeRect(6.5, 6.5, W - 13, H - 13);

    // 台呢（含库边区域）
    var cx0 = C.FRAME, cy0 = C.FRAME;
    var cw = W - C.FRAME * 2, ch = H - C.FRAME * 2;
    var cloth = ctx.createRadialGradient(W / 2, H / 2 - 20, 40, W / 2, H / 2, cw * 0.62);
    cloth.addColorStop(0, '#2b8f57');
    cloth.addColorStop(0.55, '#1f7a48');
    cloth.addColorStop(1, '#175e38');
    ctx.fillStyle = cloth;
    ctx.fillRect(cx0, cy0, cw, ch);

    // 库边（play 区之外的一圈，压暗形成凸起感）
    ctx.fillStyle = 'rgba(0, 0, 0, .16)';
    ctx.beginPath();
    ctx.rect(cx0, cy0, cw, ch);
    ctx.rect(C.PX0, C.PY0, C.PLAY_W, C.PLAY_H);
    ctx.fill('evenodd');

    // 台呢纹理：极细的横向条纹
    ctx.save();
    ctx.beginPath();
    ctx.rect(C.PX0, C.PY0, C.PLAY_W, C.PLAY_H);
    ctx.clip();
    ctx.globalAlpha = 0.035;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    for (var y = C.PY0; y < C.PY1; y += 4) {
      ctx.beginPath();
      ctx.moveTo(C.PX0, y);
      ctx.lineTo(C.PX1, y);
      ctx.stroke();
    }
    ctx.restore();

    // play 区边界高光
    ctx.strokeStyle = 'rgba(255, 255, 255, .13)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(C.PX0 + 0.5, C.PY0 + 0.5, C.PLAY_W - 1, C.PLAY_H - 1);
    ctx.strokeStyle = 'rgba(0, 0, 0, .28)';
    ctx.lineWidth = 2;
    ctx.strokeRect(C.PX0 - 1, C.PY0 - 1, C.PLAY_W + 2, C.PLAY_H + 2);

    // 置球点
    ctx.fillStyle = 'rgba(255, 255, 255, .30)';
    var dot = function (x, y) {
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, PI * 2);
      ctx.fill();
    };
    dot(C.HEAD_X, C.MID_Y);
    dot(C.FOOT_X, C.MID_Y);
    dot(C.MID_X, C.MID_Y);

    // 袋口
    for (var i = 0; i < C.POCKETS.length; i++) {
      var p = C.POCKETS[i];
      var g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, C.POCKET_R);
      g.addColorStop(0, '#000000');
      g.addColorStop(0.72, '#0a0a0a');
      g.addColorStop(1, 'rgba(10,10,10,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, C.POCKET_R, 0, PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(0, 0, 0, .55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, C.POCKET_R * 0.92, 0, PI * 2);
      ctx.stroke();
    }
  };

  /* ---------------- 球 ---------------- */

  Renderer.prototype.drawBall = function (ctx, b, alpha) {
    if (!b.active) return;
    var r = C.BALL_R;
    var x = b.x, y = b.y;
    var op = (alpha === undefined ? 1 : alpha);

    ctx.save();
    ctx.globalAlpha = op;

    // 投影（速度越快拖得越长，制造贴地飞行的速度感）
    var sp = Math.hypot(b.vx, b.vy);
    var stretch = 1 + Math.min(0.5, sp / 2600);
    ctx.fillStyle = 'rgba(0, 0, 0, .30)';
    ctx.save();
    ctx.translate(x + 2.2, y + 3);
    if (sp > 40) ctx.rotate(Math.atan2(b.vy, b.vx));
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.94 * stretch, r * 0.74, 0, 0, PI * 2);
    ctx.fill();
    ctx.restore();

    // 高速拖影：只平移不拖影的话，球看起来像贴纸在滑
    if (sp > 300) {
      var ux = b.vx / sp, uy = b.vy / sp;
      var tail = Math.min(6.5, sp * 0.0072);
      ctx.fillStyle = b.isCue ? '#ffffff' : b.color;
      for (var t = 3; t >= 1; t--) {
        ctx.globalAlpha = op * 0.09 / (4 - t);
        ctx.beginPath();
        ctx.arc(x - ux * tail * t, y - uy * tail * t, r * (1 - t * 0.07), 0, PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = op;
    }

    // ---- 球面内容：随滚动一起翻 ----
    // 球滚动时图案沿滚动方向做"经度"移动，转到背面就压扁消失再从另一侧转回来。
    // 少了这一步，球永远是一个不动的贴图，画面会很僵。
    var ang = Math.atan2(b.rollY, b.rollX);
    var facing = Math.cos(b.roll);
    var shift = Math.sin(b.roll) * r * 0.72;

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, PI * 2);
    ctx.clip();
    ctx.translate(x, y);
    ctx.rotate(ang);            // 局部 X 轴 = 滚动前进方向

    var base = b.isCue ? '#f6f3e8' : (b.isStriped ? '#f7f4ea' : b.color);
    ctx.fillStyle = base;
    ctx.fillRect(-r, -r, r * 2, r * 2);

    if (b.isStriped) {
      // 条纹带在球面上绕滚动轴转：带的延伸方向垂直于前进方向
      var gb = ctx.createLinearGradient(0, -r, 0, r);
      gb.addColorStop(0, U.shade(b.color, -0.18));
      gb.addColorStop(0.5, U.shade(b.color, 0.12));
      gb.addColorStop(1, U.shade(b.color, -0.32));
      ctx.fillStyle = gb;
      ctx.fillRect(shift * 0.62 - r * 0.56, -r, r * 1.12, r * 2);
    }

    if (facing > 0.06) {
      ctx.save();
      ctx.translate(shift, 0);
      ctx.scale(Math.max(0.1, facing), 1);   // 转到边缘时压扁，像球面透视
      if (b.isCue) {
        // 白球没号码，用两枚标记点让滚动看得出来
        ctx.fillStyle = 'rgba(198, 74, 62, .5)';
        ctx.beginPath();
        ctx.arc(-r * 0.44, 0, r * 0.13, 0, PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(r * 0.44, 0, r * 0.13, 0, PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#fbf8ee';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.44, 0, PI * 2);
        ctx.fill();
        ctx.fillStyle = '#20201c';
        ctx.font = 'bold ' + (r * 0.62).toFixed(1) + 'px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(b.num), 0, 0.6);
      }
      ctx.restore();
    }
    ctx.restore();

    // 球面明暗：光源是固定的，不跟着球转
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, PI * 2);
    ctx.clip();
    var sg = ctx.createRadialGradient(x - r * 0.32, y - r * 0.38, r * 0.08, x, y, r * 1.06);
    sg.addColorStop(0, 'rgba(255,255,255,.42)');
    sg.addColorStop(0.42, 'rgba(255,255,255,0)');
    sg.addColorStop(0.82, 'rgba(0,0,0,.22)');
    sg.addColorStop(1, 'rgba(0,0,0,.48)');
    ctx.fillStyle = sg;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();

    // 高光点
    ctx.fillStyle = 'rgba(255, 255, 255, .8)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.33, y - r * 0.4, r * 0.16, r * 0.11, -0.6, 0, PI * 2);
    ctx.fill();

    ctx.restore();
  };

  /* ---------------- 球杆 ---------------- */

  // 球杆皮肤：0 练习木杆 / 1 进阶碳杆 / 2 大师金杆
  var CUE_SKINS = [
    { shaft: '#e2c48d', butt: '#3f2614', tip: '#2f5f8a', ring: '#8a6a3b' },
    { shaft: '#424750', butt: '#1c1f24', tip: '#3784d4', ring: '#9aa7b5' },
    { shaft: '#f2d08a', butt: '#2b1708', tip: '#a83224', ring: '#ffd24d' }
  ];

  Renderer.prototype.drawCue = function (ctx, cx, cy, angle, pull, skin) {
    var sk = CUE_SKINS[skin] || CUE_SKINS[0];
    var len = 250, w = 6.5;
    var back = angle + PI;
    var gap = 13 + pull;
    var ux = Math.cos(back), uy = Math.sin(back);

    var x0 = cx + ux * gap, y0 = cy + uy * gap;
    var xm = cx + ux * (gap + len * 0.46), ym = cy + uy * (gap + len * 0.46);
    var x1 = cx + ux * (gap + len), y1 = cy + uy * (gap + len);

    // 杆影
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 0, 0, .26)';
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0 + 3.5, y0 + 4.5);
    ctx.lineTo(x1 + 3.5, y1 + 4.5);
    ctx.stroke();
    ctx.restore();

    ctx.lineCap = 'round';

    // 前段
    ctx.strokeStyle = sk.shaft;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(xm, ym);
    ctx.stroke();

    // 前段高光
    ctx.strokeStyle = skin === 1 ? 'rgba(255, 255, 255, .25)' : 'rgba(255, 255, 255, .35)';
    ctx.lineWidth = w * 0.32;
    ctx.beginPath();
    ctx.moveTo(x0 - uy * 1.4, y0 + ux * 1.4);
    ctx.lineTo(xm - uy * 1.4, ym + ux * 1.4);
    ctx.stroke();

    // 后段（握把）
    ctx.strokeStyle = sk.butt;
    ctx.lineWidth = w * 1.12;
    ctx.beginPath();
    ctx.moveTo(xm, ym);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    // 分段装饰环
    ctx.strokeStyle = sk.ring;
    ctx.lineWidth = w * 1.16;
    var rx = cx + ux * (gap + len * 0.44), ry = cy + uy * (gap + len * 0.44);
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx + ux * 5, ry + uy * 5);
    ctx.stroke();

    // 接箍 + 皮头
    ctx.strokeStyle = '#f3ead8';
    ctx.lineWidth = w * 0.98;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + ux * 7, y0 + uy * 7);
    ctx.stroke();

    ctx.strokeStyle = sk.tip;
    ctx.lineWidth = w * 0.92;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + ux * 3, y0 + uy * 3);
    ctx.stroke();
  };

  /* ---------------- 瞄准线 ---------------- */

  // 辅助线设计学自 zhou-tao/billiards（3D动感台球）：
  // 观感"平滑、不断断续续"的关键不是把线画长，而是——
  //   ① 主瞄准线用极细密的虚线（dashSize≈gapSize，近乎连续的一条线）；
  //   ② 目标球去向 / 白球分离用干脆的实心短箭头表达；
  //   ③ 撞库反弹预判用细淡虚线轻描，不再让三条长虚线满台跑。
  Renderer.prototype.drawAim = function (ctx, pred) {
    if (!pred || pred.type === 'none') return;

    var dash = function (pts, color, width, dashArr) {
      if (!pts || pts.length < 2) return;
      ctx.save();
      ctx.setLineDash(dashArr || [7, 6]);
      // 虚线沿弹道缓缓流动，瞄准画面才有"活"的感觉
      ctx.lineDashOffset = -(Date.now() * 0.03) % 60;
      ctx.strokeStyle = color;
      ctx.lineWidth = width || 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      ctx.restore();
    };

    // 实心短箭头：方向类辅助信息一律用它，短促、实心、不碎
    var arrow = function (x, y, dx, dy, len, color, glow) {
      if (len < 6) return;
      var head = Math.min(9, Math.max(4, len * 0.3));
      ctx.save();
      if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 8; }
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(dy, dx));
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(len - head, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(len, 0);
      ctx.lineTo(len - head, -head * 0.55);
      ctx.lineTo(len - head, head * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    // 主瞄准线：从白球表面出发的细密虚线
    var path = pred.path;
    if (path && path.length >= 2) {
      var dx0 = path[1].x - path[0].x, dy0 = path[1].y - path[0].y;
      var l0 = Math.hypot(dx0, dy0) || 1;
      var mainPts = [{ x: path[0].x + dx0 / l0 * C.BALL_R, y: path[0].y + dy0 / l0 * C.BALL_R }];
      for (var mi = 1; mi < path.length; mi++) mainPts.push(path[mi]);
      dash(mainPts, pred.scratch ? 'rgba(255, 120, 110, .9)' : 'rgba(255, 255, 255, .75)',
        1.5, [2.5, 3.5]);
    }

    if (pred.type === 'ball') {
      // 虚拟球：半透明填充 + 轮廓
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, .14)';
      ctx.beginPath();
      ctx.arc(pred.ghost.x, pred.ghost.y, C.BALL_R, 0, PI * 2);
      ctx.fill();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(255, 255, 255, .8)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(pred.ghost.x, pred.ghost.y, C.BALL_R, 0, PI * 2);
      ctx.stroke();
      ctx.restore();

      var tColor = pred.willPot ? 'rgba(255, 214, 92, .95)' : 'rgba(255, 236, 170, .8)';
      var tDim = pred.willPot ? 'rgba(255, 214, 92, .38)' : 'rgba(255, 236, 170, .3)';

      // 目标球去向：实心箭头，杆越好箭头越长（55 / 85 / 120px）
      var tp = pred.targetPath;
      if (tp && tp.length >= 2) {
        var aLen = pred.depth >= 3 ? 120 : (pred.depth === 2 ? 85 : 55);
        var adx = tp[1].x - tp[0].x, ady = tp[1].y - tp[0].y;
        var al = Math.hypot(adx, ady) || 1;
        adx /= al; ady /= al;
        var use = Math.min(aLen, al);
        arrow(tp[0].x, tp[0].y, adx, ady, use, tColor, pred.willPot);
        // 箭头之后的行程（含撞库反弹段）：细淡虚线轻描
        var rest = [{ x: tp[0].x + adx * use, y: tp[0].y + ady * use }];
        for (var ti = 1; ti < tp.length; ti++) rest.push(tp[ti]);
        dash(rest, tDim, 1.2, [2, 3]);
      }

      // 白球分离方向：蓝色短箭头（碳杆/金杆才显示）
      if (pred.cuePath && pred.cuePath.length >= 2) {
        var cp = pred.cuePath;
        var cdx = cp[1].x - cp[0].x, cdy = cp[1].y - cp[0].y;
        var cl = Math.hypot(cdx, cdy) || 1;
        cdx /= cl; cdy /= cl;
        var cu = Math.min(40, cl);
        arrow(cp[0].x, cp[0].y, cdx, cdy, cu, 'rgba(120, 200, 255, .78)', false);
        var crest = [{ x: cp[0].x + cdx * cu, y: cp[0].y + cdy * cu }];
        for (var ci = 1; ci < cp.length; ci++) crest.push(cp[ci]);
        dash(crest, 'rgba(120, 200, 255, .3)', 1.1, [2, 3]);
      }

      // 预判入袋：直接在袋口画脉动光圈，比在线尾画圈直观
      if (pred.potPocket) {
        var pk2 = pred.potPocket;
        var pulse = 1 + Math.sin(Date.now() * 0.006) * 0.14;
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 214, 92, .9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pk2.x, pk2.y, 10 * pulse, 0, PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(pk2.x, pk2.y, 16 * pulse, 0, PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  };

  /* ---------------- 击球点面板 ---------------- */

  Renderer.prototype.drawSpinPad = function (ctx, sx, sy) {
    var w = 120, cx = w / 2, cy = w / 2, r = 46;
    ctx.clearRect(0, 0, w, w);

    var g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.34, r * 0.1, cx, cy, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.7, '#eceadf');
    g.addColorStop(1, '#c8c5b8');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0, 0, 0, .28)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.62, 0, PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0, 0, 0, .18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.72, cy); ctx.lineTo(cx + r * 0.72, cy);
    ctx.moveTo(cx, cy - r * 0.72); ctx.lineTo(cx, cy + r * 0.72);
    ctx.stroke();

    var px = cx + sx * r * 0.62, py = cy - sy * r * 0.62;
    ctx.fillStyle = '#e2483c';
    ctx.beginPath();
    ctx.arc(px, py, 6.5, 0, PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, .8)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  };

  /* ---------------- 主绘制 ---------------- */

  Renderer.prototype.draw = function (world, view) {
    var ctx = this.ctx;
    var now = Date.now();
    var dt = this.lastT ? Math.min(0.05, (now - this.lastT) / 1000) : 1 / 60;
    this.lastT = now;

    ctx.clearRect(0, 0, C.W, C.H);
    this.drawTable(ctx);

    var i;
    // 先画静止的球，再画白球
    for (i = 1; i < world.balls.length; i++) this.drawBall(ctx, world.balls[i]);

    this.updateFx(dt);
    this.drawFx(ctx);

    if (view.showAim && view.pred && view.canShoot) this.drawAim(ctx, view.pred);

    // 白球（自由球时跟随鼠标）
    var cue = world.cue();
    if (view.ballInHand) {
      this.drawBall(ctx, cue, 0.55);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = view.ballInHandValid ? 'rgba(120, 230, 160, .9)' : 'rgba(255, 110, 100, .9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cue.x, cue.y, C.BALL_R + 4, 0, PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (cue.active) {
      this.drawBall(ctx, cue);
    }

    if (view.showCue && cue.active && !view.ballInHand) {
      this.drawCue(ctx, cue.x, cue.y, view.aimAngle, view.pull || 0, view.cueSkin || 0);
    }
  };

  BK.Renderer = Renderer;
})();
