window.BK = window.BK || {};

/* ============================================================================
   超级杆（外挂模式）

   判定"这个袋口必定能进"需要同时满足五个条件，缺一不可：

     1. 幽灵球位在台面内
        白球撞到目标球时球心应该停的位置：G = B - unit(P - B) * 2R
        G 跑出台面就说明这个角度白球根本站不住。

     2. 切角不过薄
        白球前进方向与本球去袋方向的夹角。切角越大，传给本球的速度越小
        （只剩 cos 分量），超过阈值就变成"理论能进、实际推不动"。

     3. 力度够本球滚到袋口
        本球初速 ≈ 杆速 × cos(切角) × (1 + 弹性) / 2，
        摩擦是恒定减速度，所以需要 v ≥ √(2·DECEL·距离)，再留 15% 余量。

     4. 两段路径都不被挡
        白球→幽灵球、本球→袋口，任一被别的球挡住就不算必进。

     5. 白球不会半路自己滚进袋
        白球线路要是从别的袋口中间碾过去，那叫送分。

   只要存在任意一颗本球满足全部条件，这个袋口就高亮。
   多颗本球、多个袋口同时满足时全部高亮。
   ========================================================================== */

(function () {
  'use strict';

  var C = BK.CFG;
  var U = BK.U;

  // 切角上限。72° 时 cos≈0.31，本球只能拿到三成速度，
  // 再薄下去就不是"必进"而是"看运气"了。
  var MAX_CUT = 72 * Math.PI / 180;
  var MIN_COS = Math.cos(MAX_CUT);

  // 与 physics.checkPockets 里的落袋半径保持一致
  var POT_CAP = C.POCKET_R - C.BALL_R * 0.3;

  // 力度余量：算出刚好够的力，再多给 15% 抵消滚动阻力和库边损耗
  var POWER_MARGIN = 1.15;

  /**
   * 线段 (x1,y1)-(x2,y2) 之间是否有球挡路
   * ignoreA / ignoreB：这两颗球不参与判定（通常是白球和目标球自己）
   */
  function blockedBy(x1, y1, x2, y2, balls, ignoreA, ignoreB) {
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.hypot(dx, dy);
    if (len < 1e-6) return false;
    var ux = dx / len, uy = dy / len;

    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (!b.active || b === ignoreA || b === ignoreB) continue;

      var px = b.x - x1, py = b.y - y1;
      var t = px * ux + py * uy;
      // 球心投影落在段外时，只要端点距离够远就不算挡
      if (t < -C.BALL_R || t > len + C.BALL_R) continue;

      var cx = px - ux * t, cy = py - uy * t;
      // 两颗球贴着走需要 2R 的净空，留 0.6px 容差免得擦边误判
      if (Math.hypot(cx, cy) < C.BALL_R * 2 - 0.6) return true;
    }
    return false;
  }

  /** 线段是否从某个袋口正中碾过去（白球会自己掉进去） */
  function crossesPocket(x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.hypot(dx, dy);
    if (len < 1e-6) return false;
    var ux = dx / len, uy = dy / len;

    for (var i = 0; i < C.POCKETS.length; i++) {
      var p = C.POCKETS[i];
      var px = p.x - x1, py = p.y - y1;
      var t = U.clamp(px * ux + py * uy, 0, len);
      if (Math.hypot(px - ux * t, py - uy * t) < POT_CAP) return true;
    }
    return false;
  }

  /** 检查某一颗本球能不能必进某个袋口；能就返回方案，不能返回 null */
  function planFor(world, cue, ball, pocket, vmax) {
    var dx = pocket.x - ball.x;
    var dy = pocket.y - ball.y;
    var distBP = Math.hypot(dx, dy);
    if (distBP < C.BALL_R) return null;

    var ux = dx / distBP, uy = dy / distBP;

    // 1) 幽灵球位
    var gx = ball.x - ux * C.BALL_R * 2;
    var gy = ball.y - uy * C.BALL_R * 2;
    if (gx < C.PX0 + C.BALL_R || gx > C.PX1 - C.BALL_R) return null;
    if (gy < C.PY0 + C.BALL_R || gy > C.PY1 - C.BALL_R) return null;

    // 白球到幽灵球的方向
    var cdx = gx - cue.x, cdy = gy - cue.y;
    var distCG = Math.hypot(cdx, cdy);
    if (distCG < C.BALL_R * 0.8) return null;   // 已经贴死了，构不成击球
    var nux = cdx / distCG, nuy = cdy / distCG;

    // 2) 切角
    var cosCut = nux * ux + nuy * uy;
    if (cosCut < MIN_COS) return null;

    // 3) 力度够不够
    var need = Math.sqrt(2 * C.DECEL * distBP) * POWER_MARGIN;
    var full = vmax * cosCut * (1 + C.BALL_REST) / 2;
    if (full < need) return null;

    // 4) 两段线路
    if (blockedBy(cue.x, cue.y, gx, gy, world.balls, cue, ball)) return null;
    if (blockedBy(ball.x, ball.y, pocket.x, pocket.y, world.balls, ball, cue)) return null;

    // 5) 白球别把自己送进袋
    if (crossesPocket(cue.x, cue.y, gx, gy)) return null;

    return {
      pocket: pocket,
      ball: ball,
      ghost: { x: gx, y: gy },
      aim: Math.atan2(nuy, nux),
      cosCut: cosCut,
      cutDeg: Math.acos(U.clamp(cosCut, -1, 1)) * 180 / Math.PI,
      distBP: distBP,
      // 打这个袋口至少需要多少力度（0~1），蓄力时用来判断"现在这杆够不够"
      powerNeeded: U.clamp(need / full, 0, 1)
    };
  }

  /**
   * 扫描全部袋口。返回按"可行性"排序的方案数组，每个袋口最多一条（最优的那条）。
   * 杆是外挂杆时还没选中的情况下调用它没有意义，调用方自己判断。
   */
  function find(world, cueCfg) {
    var cue = world.cue();
    if (!cue || !cue.active) return [];

    // 杆速上限：与 doShoot() 里的换算和封顶保持一致
    var vmax = Math.min(C.MAX_POWER * (cueCfg.power || 1), C.MAX_POWER * 1.45);
    var out = [];

    for (var pi = 0; pi < C.POCKETS.length; pi++) {
      var pocket = C.POCKETS[pi];
      var best = null;

      for (var bi = 1; bi < world.balls.length; bi++) {
        var ball = world.balls[bi];
        if (!ball.active) continue;

        var plan = planFor(world, cue, ball, pocket, vmax);
        if (!plan) continue;

        // 同一个袋口有多条路线时，取切角最正的那条（余量最大，最稳）
        if (!best || plan.cosCut > best.cosCut) best = plan;
      }

      if (best) {
        best.index = pi;
        out.push(best);
      }
    }

    // 好打的排前面，渲染和"当前瞄准的袋口"判断都依赖这个顺序
    out.sort(function (a, b) { return b.cosCut - a.cosCut; });
    return out;
  }

  /** 当前瞄准方向最贴近哪个高亮袋口（用于把那一条路线画出来） */
  function focused(list, aimAngle, tolerance) {
    if (!list || !list.length || aimAngle == null) return null;
    var tol = tolerance || (6 * Math.PI / 180);
    var pick = null, bestD = tol;
    for (var i = 0; i < list.length; i++) {
      var d = Math.abs(aimDelta(aimAngle, list[i].aim));
      if (d < bestD) { bestD = d; pick = list[i]; }
    }
    return pick;
  }

  function aimDelta(a, b) {
    var d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  BK.superCue = {
    find: find,
    focused: focused,
    aimDelta: aimDelta,
    MAX_CUT: MAX_CUT,
    POT_CAP: POT_CAP
  };
})();
