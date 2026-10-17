window.BK = window.BK || {};

(function () {
  'use strict';

  var FRAME = 30;
  var CUSHION = 26;
  var PLAY_W = 900;
  var PLAY_H = 450;
  var PAD = FRAME + CUSHION;

  var C = BK.CFG = {
    FRAME: FRAME,
    CUSHION: CUSHION,
    PLAY_W: PLAY_W,
    PLAY_H: PLAY_H,
    W: PLAY_W + PAD * 2,
    H: PLAY_H + PAD * 2,

    PX0: PAD,
    PY0: PAD,
    PX1: PAD + PLAY_W,
    PY1: PAD + PLAY_H,

    BALL_R: 11.5,
    POCKET_R: 22,

    DECEL: 230,
    DRAG: 0.997,
    STOP_V: 6,
    BALL_REST: 0.955,
    CUSH_REST: 0.72,
    CUSH_TANGENT: 0.92,
    MAX_POWER: 1400,
    SUBSTEP_RATIO: 0.35,

    SPIN_MAX: 1,
    SPIN_DECAY: 0.988,
    SPIN_CUSHION: 0.20,
    SPIN_FOLLOW: 0.32,
    SPIN_TRANSFER: 0.30,

    MAX_DT: 1 / 30
  };

  C.MID_X = C.PX0 + PLAY_W / 2;
  C.MID_Y = C.PY0 + PLAY_H / 2;
  C.HEAD_X = C.PX0 + PLAY_W * 0.25;
  C.FOOT_X = C.PX0 + PLAY_W * 0.75;

  C.POCKETS = [
    { x: C.PX0, y: C.PY0, corner: true },
    { x: C.MID_X, y: C.PY0 - 3, corner: false },
    { x: C.PX1, y: C.PY0, corner: true },
    { x: C.PX0, y: C.PY1, corner: true },
    { x: C.MID_X, y: C.PY1 + 3, corner: false },
    { x: C.PX1, y: C.PY1, corner: true }
  ];

  // 球杆分档：power 力度倍率，depth 辅助线深度
  // depth 1 = 仅到首次碰撞
  // depth 2 = 目标球撞库反弹一层 + 白球分离方向线
  // depth 3 = 目标球两层反弹 + 白球分离撞库反弹
  C.CUES = [
    { name: '练习木杆', power: 1.0, depth: 1, star: '★☆☆', skin: 0 },
    { name: '进阶碳杆', power: 1.2, depth: 2, star: '★★☆', skin: 1 },
    { name: '大师金杆', power: 1.42, depth: 3, star: '★★★', skin: 2 }
  ];

  C.COLORS = {
    1: '#f0c419', 2: '#2059b8', 3: '#cc2f26', 4: '#6d3fa8',
    5: '#e8721c', 6: '#1f8a48', 7: '#8a3428', 8: '#161616',
    9: '#f0c419', 10: '#2059b8', 11: '#cc2f26', 12: '#6d3fa8',
    13: '#e8721c', 14: '#1f8a48', 15: '#8a3428'
  };

  BK.U = {
    clamp: function (v, a, b) { return v < a ? a : (v > b ? b : v); },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    dist: function (ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); },
    rand: function (a, b) { return a + Math.random() * (b - a); },

    norm: function (x, y) {
      var l = Math.hypot(x, y) || 1;
      return { x: x / l, y: y / l };
    },

    // 射线与圆求最近正交点参数 t（t<0 表示无交点）
    rayCircle: function (ox, oy, dx, dy, cx, cy, r) {
      var fx = ox - cx, fy = oy - cy;
      var a = dx * dx + dy * dy;
      if (a < 1e-12) return -1;
      var b = 2 * (fx * dx + fy * dy);
      var c = fx * fx + fy * fy - r * r;
      var disc = b * b - 4 * a * c;
      if (disc < 0) return -1;
      disc = Math.sqrt(disc);
      var t1 = (-b - disc) / (2 * a);
      var t2 = (-b + disc) / (2 * a);
      if (t1 > 1e-6) return t1;
      if (t2 > 1e-6) return t2;
      return -1;
    },

    // 射线与轴对齐线段求交
    raySeg: function (ox, oy, dx, dy, x1, y1, x2, y2) {
      if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return -1;
      var t, p;
      if (Math.abs(x1 - x2) < 1e-9) {
        t = (x1 - ox) / dx;
        if (t <= 1e-6) return -1;
        p = oy + dy * t;
        return (p >= Math.min(y1, y2) && p <= Math.max(y1, y2)) ? t : -1;
      } else {
        t = (y1 - oy) / dy;
        if (t <= 1e-6) return -1;
        p = ox + dx * t;
        return (p >= Math.min(x1, x2) && p <= Math.max(x1, x2)) ? t : -1;
      }
    },

    // 路径是否被其它球阻挡
    pathClear: function (x1, y1, x2, y2, skip, balls, R) {
      var dx = x2 - x1, dy = y2 - y1;
      var len = Math.hypot(dx, dy);
      if (len < 1e-6) return true;
      var ux = dx / len, uy = dy / len;
      for (var i = 0; i < balls.length; i++) {
        var b = balls[i];
        if (!b.active || b === skip || b.isCue) continue;
        var px = b.x - x1, py = b.y - y1;
        var t = px * ux + py * uy;
        if (t < -R || t > len + R) continue;
        var cx = px - ux * t, cy = py - uy * t;
        if (Math.hypot(cx, cy) < R * 2) return false;
      }
      return true;
    },

    shade: function (hex, amt) {
      var n = parseInt(hex.slice(1), 16);
      var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      if (amt > 0) {
        r = Math.round(r + (255 - r) * amt);
        g = Math.round(g + (255 - g) * amt);
        b = Math.round(b + (255 - b) * amt);
      } else {
        r = Math.round(r * (1 + amt));
        g = Math.round(g * (1 + amt));
        b = Math.round(b * (1 + amt));
      }
      return 'rgb(' + r + ',' + g + ',' + b + ')';
    }
  };
})();
