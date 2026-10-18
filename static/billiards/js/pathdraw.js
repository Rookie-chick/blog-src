window.BK = window.BK || {};

/* ============================================================================
   路径绘制（超级杆）

   这套东西**完全绕开物理引擎**：玩家画什么路线，球就怎么走，
   不碰球、不减速、不撞库。为了让回合还能正常结算，执行过程中会把路径
   "翻译"成物理引擎本来会产生的事件：

     路径扫过某颗球  → world.ev.firstContact（当作碰到了它）
     路径越过库边线  → world.ev.anyCushion / cushionAfterContact
     终点落在袋口里  → world.ev.potted（当作进袋）

   这样 rules.resolve() 完全不用改，照常判犯规、判进球、换手。
   ========================================================================== */

(function () {
  'use strict';

  var C = BK.CFG;
  var U = BK.U;

  var MIN_LEN = 40;                       // 最短路径（px），太短判定为误触
  var MIN_STEP = 3;                       // 采样点最小间距，避免点太密
  var START_R = 90;                       // 起点必须离目标球多近才开始画
  var SPEED = 520;                        // 执行速度 px/s（恒定，不受摩擦影响）
  var RESAMPLE = 6;                       // 弧长重采样步长
  var CAPTURE = C.POCKET_R - C.BALL_R * 0.3;   // 与 physics.checkPockets 一致

  /* ---------------- 几何小工具 ---------------- */

  function segCircle(x0, y0, x1, y1, cx, cy, r) {
    var dx = x1 - x0, dy = y1 - y0;
    var len2 = dx * dx + dy * dy;
    var t = len2 > 1e-9 ? ((cx - x0) * dx + (cy - y0) * dy) / len2 : 0;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    return Math.hypot(cx - (x0 + dx * t), cy - (y0 + dy * t)) < r;
  }

  /** Chaikin 切角平滑，画出来的折线才不会一条条硬拐 */
  function chaikin(pts, passes) {
    var out = pts;
    for (var n = 0; n < passes; n++) {
      if (out.length < 3) return out;
      var next = [out[0]];
      for (var i = 1; i < out.length; i++) {
        var a = out[i - 1], b = out[i];
        next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
        next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
      }
      next.push(out[out.length - 1]);
      out = next;
    }
    return out;
  }

  /** 按弧长等距重采样：球才能匀速走，而不是被采样点密度带着忽快忽慢 */
  function resample(pts, step) {
    if (pts.length < 2) return { pts: pts.slice(), total: 0 };

    var cum = [0], i;
    for (i = 1; i < pts.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    }
    var total = cum[cum.length - 1];
    if (total < 1e-6) return { pts: [pts[0], pts[0]], total: 0 };

    var n = Math.max(2, Math.round(total / step));
    var out = [], j = 0;
    for (var k = 0; k <= n; k++) {
      var d = total * k / n;
      while (j < cum.length - 2 && cum[j + 1] < d) j++;
      var seg = cum[j + 1] - cum[j] || 1e-6;
      var t = (d - cum[j]) / seg;
      out.push({
        x: pts[j].x + (pts[j + 1].x - pts[j].x) * t,
        y: pts[j].y + (pts[j + 1].y - pts[j].y) * t
      });
    }
    return { pts: out, total: total };
  }

  /** 等距采样点上按距离取位置 */
  function posAt(pts, total, d) {
    if (d <= 0) return { x: pts[0].x, y: pts[0].y };
    if (d >= total) return { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y };
    var f = d / total * (pts.length - 1);
    var i = Math.floor(f), t = f - i;
    var a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)];
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  /** 沿瞄准方向找第一颗会被打到的球 */
  function pickTarget(world, angle) {
    var cue = world.cue();
    if (!cue || !cue.active) return null;
    var dx = Math.cos(angle), dy = Math.sin(angle);
    var bestT = Infinity, best = null;
    for (var i = 1; i < world.balls.length; i++) {
      var b = world.balls[i];
      if (!b.active) continue;
      var t = U.rayCircle(cue.x, cue.y, dx, dy, b.x, b.y, C.BALL_R * 2);
      if (t > 0 && t < bestT) { bestT = t; best = b; }
    }
    return best;
  }

  /* ---------------- 路径对象 ---------------- */

  function Path(ball) {
    this.ball = ball;
    this.raw = [{ x: ball.x, y: ball.y }];   // 第一个点永远是球心
    this.pts = [];                            // 平滑 + 重采样后的折线
    this.total = 0;
    this.dist = 0;
    this.state = 'drawing';                   // drawing | ready | running | done
    this.touched = [];
    this.potted = null;
  }

  Path.prototype.addPoint = function (x, y) {
    if (this.state !== 'drawing') return false;
    var last = this.raw[this.raw.length - 1];
    if (Math.hypot(x - last.x, y - last.y) < MIN_STEP) return false;
    this.raw.push({ x: x, y: y });
    this.refresh();
    return true;
  };

  /** 重新平滑 + 重采样，绘制过程中每帧都会调，保证"看到的"就是"会走的" */
  Path.prototype.refresh = function () {
    var sm = chaikin(this.raw, 2);
    var r = resample(sm, RESAMPLE);
    this.pts = r.pts;
    this.total = r.total;
  };

  Path.prototype.rawLength = function () {
    var t = 0;
    for (var i = 1; i < this.raw.length; i++) {
      t += Math.hypot(this.raw[i].x - this.raw[i - 1].x, this.raw[i].y - this.raw[i - 1].y);
    }
    return t;
  };

  Path.prototype.valid = function () {
    return this.raw.length >= 2 && this.total >= MIN_LEN;
  };

  Path.prototype.finish = function () {
    this.refresh();
    if (!this.valid()) return false;
    this.state = 'ready';
    return true;
  };

  Path.prototype.reset = function () {
    var b = this.ball;
    this.raw = [{ x: b.x, y: b.y }];
    this.pts = [];
    this.total = 0;
    this.dist = 0;
    this.touched = [];
    this.potted = null;
    this.state = 'drawing';
  };

  Path.prototype.start = function () {
    this.state = 'running';
    this.dist = 0;
    this.touched = [];
    this.potted = null;
  };

  Path.prototype.progress = function () {
    return this.total > 0 ? Math.min(1, this.dist / this.total) : 0;
  };

  /** 推进一帧；返回 true 表示走完了 */
  Path.prototype.step = function (world, dt) {
    if (this.state !== 'running') return true;

    var b = this.ball;
    var from = { x: b.x, y: b.y };
    this.dist = Math.min(this.total, this.dist + SPEED * dt);
    var to = posAt(this.pts, this.total, this.dist);

    // 滚动姿态：纯视觉，但仍按真实弧长换算，球看着才是在"滚"而不是"飘"
    var moved = Math.hypot(to.x - from.x, to.y - from.y);
    if (moved > 1e-6) {
      b.roll += moved / C.BALL_R;
      if (b.roll > Math.PI * 2) b.roll -= Math.PI * 2;
      b.rollX = (to.x - from.x) / moved;
      b.rollY = (to.y - from.y) / moved;
    }

    b.x = to.x;
    b.y = to.y;

    this.trackEvents(world, from.x, from.y, to.x, to.y);
    return this.dist >= this.total;
  };

  /**
   * 把路径"翻译"成物理事件。
   * 球本身无视碰撞照穿不误，但规则层需要知道它途中碰到了谁、有没有碰库。
   */
  Path.prototype.trackEvents = function (world, x0, y0, x1, y1) {
    var ev = world.ev;
    var R = C.BALL_R * 2;
    var i;

    for (i = 0; i < world.balls.length; i++) {
      var o = world.balls[i];
      if (!o.active || o === this.ball || o.isCue) continue;
      if (segCircle(x0, y0, x1, y1, o.x, o.y, R)) {
        if (this.touched.indexOf(o) < 0) this.touched.push(o);
        // 只有白球的路线才能产生"首触"。
        // 目标球自己飞出去擦到别人，那叫连带碰撞，不是白球碰到的第一颗球 ——
        // 之前把它记成 firstContact，会出现"画的是 1 号球，判定却说你碰到了 9 号球"。
        if (this.ball.isCue && !ev.firstContact) {
          ev.firstContact = o;
          if (world.onHit) world.onHit(90);
        }
      }
    }

    if (x1 < C.PX0 || x1 > C.PX1 || y1 < C.PY0 || y1 > C.PY1) {
      ev.anyCushion = true;
      if (ev.firstContact) ev.cushionAfterContact = true;
    }
  };

  /** 路径走完之后收尾：进袋 or 停在终点 */
  Path.prototype.finishRun = function (world) {
    this.state = 'done';
    var b = this.ball;
    var best = null, bestD = CAPTURE;
    var i;

    for (i = 0; i < C.POCKETS.length; i++) {
      var p = C.POCKETS[i];
      var d = U.dist(b.x, b.y, p.x, p.y);
      if (d < bestD) { bestD = d; best = p; }
    }

    if (best) {
      this.potted = best;
      b.active = false;
      b.potted = true;
      b.vx = 0;
      b.vy = 0;
      world.ev.potted.push(b);
      if (b.isCue) world.ev.cueScratch = true;
      if (world.onPocket) world.onPocket(b);
      return 'potted';
    }

    // 终点在台面外又没进袋：夹回台内，免得球浮在桌子外面
    var lim = C.BALL_R;
    if (b.x < C.PX0 + lim) b.x = C.PX0 + lim;
    if (b.x > C.PX1 - lim) b.x = C.PX1 - lim;
    if (b.y < C.PY0 + lim) b.y = C.PY0 + lim;
    if (b.y > C.PY1 - lim) b.y = C.PY1 - lim;
    return 'stopped';
  };

  BK.path = {
    Path: Path,
    pickTarget: pickTarget,
    chaikin: chaikin,
    resample: resample,
    posAt: posAt,
    MIN_LEN: MIN_LEN,
    START_R: START_R,
    SPEED: SPEED
  };
})();
