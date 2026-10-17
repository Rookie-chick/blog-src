window.BK = window.BK || {};

(function () {
  'use strict';

  var C = BK.CFG;
  var U = BK.U;

  function cushionLines() {
    var R = C.BALL_R;
    return [
      { x1: C.PX0 + R, y1: C.PY0 + R, x2: C.PX1 - R, y2: C.PY0 + R, nx: 0, ny: 1 },
      { x1: C.PX0 + R, y1: C.PY1 - R, x2: C.PX1 - R, y2: C.PY1 - R, nx: 0, ny: -1 },
      { x1: C.PX0 + R, y1: C.PY0 + R, x2: C.PX0 + R, y2: C.PY1 - R, nx: 1, ny: 0 },
      { x1: C.PX1 - R, y1: C.PY0 + R, x2: C.PX1 - R, y2: C.PY1 - R, nx: -1, ny: 0 }
    ];
  }

  function rayToCushion(ox, oy, dx, dy) {
    var lines = cushionLines();
    var best = null;
    for (var i = 0; i < lines.length; i++) {
      var c = lines[i];
      var t = U.raySeg(ox, oy, dx, dy, c.x1, c.y1, c.x2, c.y2);
      if (t > 1e-6 && (!best || t < best.t)) {
        best = { x: ox + dx * t, y: oy + dy * t, t: t, nx: c.nx, ny: c.ny };
      }
    }
    return best;
  }

  function reflect(dx, dy, nx, ny) {
    var d = dx * nx + dy * ny;
    return { x: dx - 2 * d * nx, y: dy - 2 * d * ny };
  }

  // 追踪一条射线，最多反弹 maxBounce 次，总长度不超过 maxLen
  function tracePath(ox, oy, dx, dy, maxLen, maxBounce) {
    var pts = [{ x: ox, y: oy }];
    var remaining = maxLen;
    for (var b = 0; b <= maxBounce && remaining > 0; b++) {
      var hit = rayToCushion(ox, oy, dx, dy);
      if (!hit || hit.t > remaining) {
        pts.push({ x: ox + dx * remaining, y: oy + dy * remaining });
        break;
      }
      pts.push({ x: hit.x, y: hit.y });
      remaining -= hit.t;
      var r = reflect(dx, dy, hit.nx, hit.ny);
      dx = r.x;
      dy = r.y;
      ox = hit.x;
      oy = hit.y;
    }
    return pts;
  }

  BK.aim = {
    predict: function (world, angle, depth) {
      depth = depth || 1;
      var R = C.BALL_R;
      var cue = world.cue();
      var dx = Math.cos(angle), dy = Math.sin(angle);
      var ox = cue.x, oy = cue.y;

      var bestT = Infinity;
      var bestType = 'cushion';
      var bestBall = null;

      var i, t;

      for (i = 1; i < world.balls.length; i++) {
        var b = world.balls[i];
        if (!b.active) continue;
        t = U.rayCircle(ox, oy, dx, dy, b.x, b.y, R * 2);
        if (t > 0 && t < bestT) { bestT = t; bestType = 'ball'; bestBall = b; }
      }

      var cap = C.POCKET_R - R * 0.3;
      for (i = 0; i < C.POCKETS.length; i++) {
        t = U.rayCircle(ox, oy, dx, dy, C.POCKETS[i].x, C.POCKETS[i].y, cap);
        if (t > 0 && t < bestT) { bestT = t; bestType = 'pocket'; }
      }

      var lines = cushionLines();
      var cushionHit = null;
      for (i = 0; i < lines.length; i++) {
        t = U.raySeg(ox, oy, dx, dy, lines[i].x1, lines[i].y1, lines[i].x2, lines[i].y2);
        if (t > 0 && t < bestT) { bestT = t; bestType = 'cushion'; cushionHit = lines[i]; }
      }

      if (!isFinite(bestT)) {
        return {
          type: 'none',
          depth: depth,
          path: [{ x: ox, y: oy }, { x: ox + dx * 300, y: oy + dy * 300 }],
          scratch: false
        };
      }

      var hx = ox + dx * bestT;
      var hy = oy + dy * bestT;

      var res = {
        type: bestType,
        depth: depth,
        path: [{ x: ox, y: oy }, { x: hx, y: hy }],
        hit: { x: hx, y: hy },
        scratch: bestType === 'pocket'
      };

      if (bestType === 'ball') {
        var tb = bestBall;
        var ghost = { x: hx, y: hy };
        var td = U.norm(tb.x - ghost.x, tb.y - ghost.y);

        var px = -td.y, py = td.x;
        var side = (dx * px + dy * py) >= 0 ? 1 : -1;
        var cd = { x: px * side, y: py * side };

        res.ball = tb;
        res.ghost = ghost;
        res.targetDir = td;
        res.cueDir = cd;

        // 目标球去向：杆越好，能预判的行程越长、反弹层数越多
        var tLen = depth >= 3 ? 680 : (depth >= 2 ? 340 : 150);
        var tBounce = depth >= 3 ? 2 : (depth >= 2 ? 1 : 0);
        res.targetPath = tracePath(tb.x, tb.y, td.x, td.y, tLen, tBounce);

        // 白球分离方向：只有中高档杆才显示
        if (depth >= 2) {
          var cLen = depth >= 3 ? 260 : 130;
          var cBounce = depth >= 3 ? 1 : 0;
          res.cuePath = tracePath(ghost.x, ghost.y, cd.x, cd.y, cLen, cBounce);
        }

        // 目标球是否会被预测入袋
        var potted = null;
        for (var k = 0; k < C.POCKETS.length; k++) {
          var pk = C.POCKETS[k];
          var vx = pk.x - tb.x, vy = pk.y - tb.y;
          var proj = vx * td.x + vy * td.y;
          if (proj <= 0) continue;
          var cx = td.x * proj, cy = td.y * proj;
          if (Math.hypot(vx - cx, vy - cy) < cap * 0.85) { potted = pk; break; }
        }
        res.willPot = !!potted;
        res.potPocket = potted;   // 预判会进的那个袋口，渲染层在袋口画光圈

      } else if (bestType === 'cushion') {
        // 主瞄准线撞库后的反弹：高档杆看得更远
        var r = reflect(dx, dy, cushionHit.nx, cushionHit.ny);
        var bLen = depth >= 3 ? 280 : (depth >= 2 ? 200 : 140);
        res.path.push({ x: hx + r.x * bLen, y: hy + r.y * bLen });
      }

      return res;
    }
  };
})();
