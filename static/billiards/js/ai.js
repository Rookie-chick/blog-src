window.BK = window.BK || {};

(function () {
  'use strict';

  var C = BK.CFG;
  var U = BK.U;

  // errPx：落点横向偏差（像素）。角度误差 = errPx / 距离，
  // 这样远球不会因为固定角度误差被放大成几十像素的离谱偏移
  var LEVELS = [
    { name: '新手', errPx: 12, cut: 66, spin: false },
    { name: '普通', errPx: 4.5, cut: 78, spin: true },
    { name: '高手', errPx: 1.5, cut: 85, spin: true }
  ];

  function safety(world, rules, p) {
    var cue = world.cue();
    var R = C.BALL_R;
    var targets = rules.legalTargets(world, p);
    var best = null, i, d;

    for (i = 0; i < targets.length; i++) {
      var b = world.balls[targets[i]];
      if (!b || !b.active) continue;
      if (!U.pathClear(cue.x, cue.y, b.x, b.y, b, world.balls, R)) continue;
      d = U.dist(cue.x, cue.y, b.x, b.y);
      if (!best || d < best.d) best = { b: b, d: d };
    }

    if (best) {
      return {
        angle: Math.atan2(best.b.y - cue.y, best.b.x - cue.x) +
          U.rand(-6, 6) / Math.max(50, best.d),
        need: best.d,
        num: best.b.num,
        legal: true
      };
    }

    var any = null;
    for (i = 1; i < world.balls.length; i++) {
      var q = world.balls[i];
      if (!q.active) continue;
      d = U.dist(cue.x, cue.y, q.x, q.y);
      if (!any || d < any.d) any = { b: q, d: d };
    }
    if (any) {
      return {
        angle: Math.atan2(any.b.y - cue.y, any.b.x - cue.x) +
          U.rand(-14, 14) / Math.max(50, any.d),
        need: any.d,
        num: any.b.num,
        legal: false
      };
    }
    return { angle: U.rand(0, Math.PI * 2), need: 200, num: -1, legal: false };
  }

  BK.AI = {
    levels: LEVELS,

    think: function (world, rules, levelIdx, p) {
      if (p === undefined) p = 1;
      var L = LEVELS[levelIdx] || LEVELS[1];
      var cue = world.cue();
      var R = C.BALL_R;

      // 开球：全力炸球堆
      if (rules.phase === 'breaking') {
        return {
          angle: U.rand(-0.012, 0.012),
          power: U.rand(0.9, 1),
          spinSide: 0,
          spinTop: 0,
          _dbg: { mode: 'break', target: 1, legal: true }
        };
      }

      var targets = rules.legalTargets(world, p);
      var best = null;

      for (var ti = 0; ti < targets.length; ti++) {
        var b = world.balls[targets[ti]];
        if (!b || !b.active) continue;

        for (var pi = 0; pi < C.POCKETS.length; pi++) {
          var pk = C.POCKETS[pi];
          var pd = U.norm(pk.x - b.x, pk.y - b.y);
          var gx = b.x - pd.x * R * 2;
          var gy = b.y - pd.y * R * 2;

          if (gx < C.PX0 + R || gx > C.PX1 - R) continue;
          if (gy < C.PY0 + R || gy > C.PY1 - R) continue;

          if (!U.pathClear(cue.x, cue.y, gx, gy, b, world.balls, R)) continue;
          if (!U.pathClear(b.x, b.y, pk.x, pk.y, b, world.balls, R)) continue;

          var tg = U.norm(gx - cue.x, gy - cue.y);
          var cos = tg.x * pd.x + tg.y * pd.y;
          var cut = Math.acos(U.clamp(cos, -1, 1));
          if (cut > L.cut * Math.PI / 180) continue;

          var dCue = U.dist(cue.x, cue.y, b.x, b.y);
          var dPocket = U.dist(b.x, b.y, pk.x, pk.y);

          var score = 100
            - (cut * 180 / Math.PI) * 1.15
            - dCue * 0.018
            - dPocket * 0.022;
          if (!pk.corner) score -= 7;

          if (!best || score > best.score) {
            best = {
              score: score, gx: gx, gy: gy, cut: cut,
              dCue: dCue, dPocket: dPocket, ball: b
            };
          }
        }
      }

      var angle, power, spinSide = 0, spinTop = 0;

      if (best) {
        angle = Math.atan2(best.gy - cue.y, best.gx - cue.x) +
          U.rand(-L.errPx, L.errPx) / Math.max(50, best.dCue);
        // 由所需行程反推初速：d ≈ v²/736  →  v = sqrt(736 d)，power = v / MAX_POWER
        // 白球走到接触点 + 目标球走到袋口，能量可加；留 20% 余量保证落袋
        var need = best.dCue + best.dPocket * 1.2;
        var base = Math.sqrt(need) / 44;
        power = base / (0.62 + 0.38 * Math.cos(best.cut));
        power = U.clamp(power * U.rand(0.97, 1.03), 0.22, 1);

        if (L.spin) {
          spinTop = U.clamp(0.5 - best.cut * 0.5, 0, 0.7);
          spinSide = U.rand(-0.1, 0.1);
        }
      } else {
        // 安全球：白球够到目标球之后，目标球还得走到库边，
        // 否则"击球后无球进袋且无球碰库"直接判犯规
        var s = safety(world, rules, p);
        angle = s.angle;
        var needSafe = s.need + 380;
        power = U.clamp(Math.sqrt(needSafe) / 44, 0.28, 0.9);
        if (L.spin) spinTop = -0.25;
        var dbg = { mode: 'safe', target: s.num, legal: s.legal };
        return {
          angle: angle,
          power: U.clamp(power, 0.16, 1),
          spinSide: spinSide,
          spinTop: spinTop,
          _dbg: dbg
        };
      }

      return {
        angle: angle,
        power: U.clamp(power, 0.16, 1),
        spinSide: spinSide,
        spinTop: spinTop,
        _dbg: { mode: 'pot', target: best.ball.num, legal: true }
      };
    }
  };
})();
