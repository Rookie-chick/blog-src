window.BK = window.BK || {};

(function () {
  'use strict';

  var C = BK.CFG;
  var U = BK.U;

  function Ball(num, x, y) {
    this.num = num;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.spinSide = 0;
    this.spinTop = 0;
    this.isCue = (num === 0);
    this.isStriped = num >= 9;
    this.active = true;
    this.potted = false;
    this.color = num === 0 ? '#f6f4ee' : C.COLORS[num];
    // 滚动姿态：roll 是累计转过的弧度，rollX/rollY 是滚动方向（渲染画球面用）
    this.roll = Math.random() * Math.PI * 2;
    this.rollX = 1;
    this.rollY = 0;
  }

  Ball.prototype.speed = function () {
    return Math.hypot(this.vx, this.vy);
  };

  Ball.prototype.moving = function () {
    return this.active && (this.vx !== 0 || this.vy !== 0);
  };

  function World() {
    this.balls = [];
    this.ev = null;
    this.onPocket = null;
    this.onHit = null;
    this.onCushion = null;
    this.reset();
  }

  World.prototype.reset = function () {
    var rows = [[1], [9, 2], [10, 8, 3], [11, 7, 14, 4], [12, 6, 15, 5, 13]];
    var gap = C.BALL_R * 2 + 0.6;
    var rowGap = gap * 0.866;

    var made = [new Ball(0, C.HEAD_X, C.MID_Y)];
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      var y0 = C.MID_Y - (row.length - 1) * gap / 2;
      for (var i = 0; i < row.length; i++) {
        made.push(new Ball(row[i], C.FOOT_X + r * rowGap, y0 + i * gap));
      }
    }

    // 关键：按球号重排，保证 balls[n].num === n。
    // 规则、AI、HUD 全部依赖这个约定（三角摆球顺序是 1,9,2,10,8,3...，直接用会错位）
    this.balls = new Array(16);
    for (var k = 0; k < made.length; k++) this.balls[made[k].num] = made[k];

    this.clearEvents();
  };

  World.prototype.clearEvents = function () {
    this.ev = {
      firstContact: null,
      potted: [],
      cushionAfterContact: false,
      anyCushion: false,
      cueScratch: false
    };
  };

  World.prototype.cue = function () {
    return this.balls[0];
  };

  World.prototype.activeBalls = function () {
    var out = [];
    for (var i = 0; i < this.balls.length; i++) {
      if (this.balls[i].active) out.push(this.balls[i]);
    }
    return out;
  };

  World.prototype.allStopped = function () {
    for (var i = 0; i < this.balls.length; i++) {
      if (this.balls[i].moving()) return false;
    }
    return true;
  };

  World.prototype.shoot = function (angle, power, spinSide, spinTop) {
    this.shootRaw(angle, power * C.MAX_POWER, spinSide, spinTop);
  };

  // 直接以像素/秒初速出杆（球杆倍率换算由调用方完成）
  World.prototype.shootRaw = function (angle, v, spinSide, spinTop) {
    var cue = this.cue();
    if (!cue.active) return;
    cue.vx = Math.cos(angle) * v;
    cue.vy = Math.sin(angle) * v;
    cue.spinSide = U.clamp(spinSide || 0, -1, 1);
    cue.spinTop = U.clamp(spinTop || 0, -1, 1);
    this.clearEvents();
  };

  World.prototype.step = function (dt) {
    dt = Math.min(dt, C.MAX_DT);
    var maxV = 0, i;
    for (i = 0; i < this.balls.length; i++) {
      if (this.balls[i].moving()) {
        var s = this.balls[i].speed();
        if (s > maxV) maxV = s;
      }
    }
    var maxStep = C.BALL_R * C.SUBSTEP_RATIO;
    var n = Math.max(1, Math.ceil(maxV * dt / maxStep));
    if (n > 64) n = 64;
    var h = dt / n;
    for (var k = 0; k < n; k++) this.substep(h);
  };

  World.prototype.substep = function (h) {
    var i, b;
    var drag = Math.pow(C.DRAG, h * 60);
    var spinDecay = Math.pow(C.SPIN_DECAY, h * 60);
    var dec = C.DECEL * h;

    for (i = 0; i < this.balls.length; i++) {
      b = this.balls[i];
      if (!b.moving()) continue;

      var mdx = b.vx * h, mdy = b.vy * h;
      b.x += mdx;
      b.y += mdy;

      // 纯滚动姿态：转过的角度 = 走过的弧长 / 半径。
      // 没有它的话球只是"贴着台面滑"，看起来非常僵。
      var md = Math.hypot(mdx, mdy);
      if (md > 1e-6) {
        b.roll += md / C.BALL_R;
        b.rollX = mdx / md;
        b.rollY = mdy / md;
        if (b.roll > Math.PI * 2) b.roll -= Math.PI * 2;
      }

      // 库仑摩擦为主：恒定减速度，配合轻微指数阻力
      var sp = Math.hypot(b.vx, b.vy);
      var ns = sp * drag - dec;
      if (ns <= C.STOP_V) {
        b.vx = 0;
        b.vy = 0;
      } else {
        var k = ns / sp;
        b.vx *= k;
        b.vy *= k;
      }

      b.spinSide *= spinDecay;
      b.spinTop *= spinDecay;
    }

    this.collideBalls();
    this.collideCushion();
    this.checkPockets();
  };

  World.prototype.collideBalls = function () {
    var R = C.BALL_R, D = R * 2;
    var balls = this.balls;

    for (var i = 0; i < balls.length; i++) {
      var a = balls[i];
      if (!a.active) continue;
      for (var j = i + 1; j < balls.length; j++) {
        var b = balls[j];
        if (!b.active) continue;

        var dx = b.x - a.x, dy = b.y - a.y;
        var d = Math.hypot(dx, dy);
        if (d >= D || d < 1e-9) continue;

        var nx = dx / d, ny = dy / d;
        var overlap = D - d;
        a.x -= nx * overlap / 2;
        a.y -= ny * overlap / 2;
        b.x += nx * overlap / 2;
        b.y += ny * overlap / 2;

        var rvx = b.vx - a.vx, rvy = b.vy - a.vy;
        var vn = rvx * nx + rvy * ny;
        if (vn > 0) continue;

        var impact = -vn;
        var jimp = -(1 + C.BALL_REST) * vn / 2;
        a.vx -= jimp * nx;
        a.vy -= jimp * ny;
        b.vx += jimp * nx;
        b.vy += jimp * ny;

        // 白球高低杆：撞后沿撞击方向附加速度（高杆跟进 / 低杆缩回）
        if (a.isCue || b.isCue) {
          var cue = a.isCue ? a : b;
          var other = a.isCue ? b : a;
          var sgn = a.isCue ? 1 : -1;

          // 注意：撞击不向目标球传递侧旋。真实物理中碰撞传递的是速度而非角动量，
          // 之前这里给目标球加了塞，会让它打出去莫名拐弯（玩家会以为游戏坏了）
          if (!this.ev.firstContact) this.ev.firstContact = other;

          var cnx = nx * sgn, cny = ny * sgn;
          var mag = cue.spinTop * impact * C.SPIN_FOLLOW;
          var lim = impact * 0.55;
          if (mag > lim) mag = lim;
          if (mag < -lim) mag = -lim;
          cue.vx += cnx * mag;
          cue.vy += cny * mag;
          cue.spinTop *= 0.3;
          cue.spinSide *= 0.45;

          if (this.onHit) this.onHit(impact);
        } else if (this.onHit) {
          this.onHit(impact * 0.7);
        }
      }
    }
  };

  World.prototype.collideCushion = function () {
    var R = C.BALL_R;
    var mouth = C.POCKET_R * 1.3;

    for (var i = 0; i < this.balls.length; i++) {
      var b = this.balls[i];
      if (!b.moving()) continue;

      var inMouth = false;
      for (var p = 0; p < C.POCKETS.length; p++) {
        if (U.dist(b.x, b.y, C.POCKETS[p].x, C.POCKETS[p].y) < mouth) {
          inMouth = true;
          break;
        }
      }
      if (inMouth) continue;

      var hit = false;
      if (b.y - R < C.PY0) {
        b.y = C.PY0 + R;
        b.vy = -b.vy * C.CUSH_REST;
        b.vx = b.vx * C.CUSH_TANGENT + b.spinSide * Math.abs(b.vy) * C.SPIN_CUSHION;
        hit = true;
      } else if (b.y + R > C.PY1) {
        b.y = C.PY1 - R;
        b.vy = -b.vy * C.CUSH_REST;
        b.vx = b.vx * C.CUSH_TANGENT - b.spinSide * Math.abs(b.vy) * C.SPIN_CUSHION;
        hit = true;
      }

      if (b.x - R < C.PX0) {
        b.x = C.PX0 + R;
        b.vx = -b.vx * C.CUSH_REST;
        b.vy = b.vy * C.CUSH_TANGENT - b.spinSide * Math.abs(b.vx) * C.SPIN_CUSHION;
        hit = true;
      } else if (b.x + R > C.PX1) {
        b.x = C.PX1 - R;
        b.vx = -b.vx * C.CUSH_REST;
        b.vy = b.vy * C.CUSH_TANGENT + b.spinSide * Math.abs(b.vx) * C.SPIN_CUSHION;
        hit = true;
      }

      if (hit) {
        b.spinSide *= 0.5;
        this.ev.anyCushion = true;
        if (this.ev.firstContact) this.ev.cushionAfterContact = true;
        if (this.onCushion) this.onCushion(b.speed());
      }
    }

    // 安全网：任何球都不允许逃出球桌
    var lim = C.POCKET_R;
    for (var k = 0; k < this.balls.length; k++) {
      var q = this.balls[k];
      if (!q.active) continue;
      if (q.x < C.PX0 - lim) { q.x = C.PX0 - lim; q.vx = Math.abs(q.vx) * 0.5; }
      if (q.x > C.PX1 + lim) { q.x = C.PX1 + lim; q.vx = -Math.abs(q.vx) * 0.5; }
      if (q.y < C.PY0 - lim) { q.y = C.PY0 - lim; q.vy = Math.abs(q.vy) * 0.5; }
      if (q.y > C.PY1 + lim) { q.y = C.PY1 + lim; q.vy = -Math.abs(q.vy) * 0.5; }
    }
  };

  World.prototype.checkPockets = function () {
    var cap = C.POCKET_R - C.BALL_R * 0.3;
    for (var i = 0; i < this.balls.length; i++) {
      var b = this.balls[i];
      if (!b.active) continue;

      var inPocket = false;
      for (var p = 0; p < C.POCKETS.length; p++) {
        var pk = C.POCKETS[p];
        if (U.dist(b.x, b.y, pk.x, pk.y) < cap) { inPocket = true; break; }
      }

      // 兜底：袋口附近会临时关闭库边碰撞，若球心已经越过库线，
      // 说明它确实掉进袋里了。否则球会卡在袋口外，变成打不到的幽灵球。
      if (!inPocket &&
          (b.x < C.PX0 || b.x > C.PX1 || b.y < C.PY0 || b.y > C.PY1)) {
        inPocket = true;
      }

      if (inPocket) {
        b.active = false;
        b.potted = true;
        b.vx = 0;
        b.vy = 0;
        this.ev.potted.push(b);
        if (b.isCue) this.ev.cueScratch = true;
        if (this.onPocket) this.onPocket(b);
      }
    }
  };

  BK.Ball = Ball;
  BK.World = World;
})();
