(function () {
  'use strict';

  var C = BK.CFG;
  var U = BK.U;

  var world = new BK.World();
  var rules = new BK.Rules();
  var renderer = new BK.Renderer(document.getElementById('table'));
  var spinCanvas = document.getElementById('spin');
  var spinCtx = spinCanvas.getContext('2d');

  var el = {
    msg: document.getElementById('msg'),
    hint: document.getElementById('hint'),
    typeP1: document.getElementById('typeP1'),
    typeP2: document.getElementById('typeP2'),
    rowP1: document.getElementById('rowP1'),
    rowP2: document.getElementById('rowP2'),
    cardP1: document.getElementById('cardP1'),
    cardP2: document.getElementById('cardP2'),
    powerFill: document.getElementById('powerFill'),
    powerVal: document.getElementById('powerVal'),
    overlay: document.getElementById('overlay'),
    ovTitle: document.getElementById('ovTitle'),
    ovText: document.getElementById('ovText'),
    btnSound: document.getElementById('btnSound'),
    btnAim: document.getElementById('btnAim'),
    btnLevel: document.getElementById('btnLevel'),
    btnRestart: document.getElementById('btnRestart'),
    ovBtn: document.getElementById('ovBtn')
  };

  var S = {
    phase: 'aim',
    aimAngle: 0,
    aimBase: 0,     // 实际采用的基准角（平滑追随目标角）
    aimTarget: 0,   // 鼠标指向的原始目标角
    aimNear: false, // 鼠标当前是否贴近白球（近处平滑系数更低）
    aimNudge: 0,    // 滚轮累计的微调量（叠加在基准角上，出杆才清零）
    power: 0,
    charging: false,
    showAim: true,
    sound: true,
    level: 1,
    cueIdx: 1,
    spinX: 0,
    spinY: 0,
    spinDirty: true,
    pred: null,
    lastTs: 0,
    strike: 0,       // 击球瞬间球杆前推动画剩余时间
    strikeFrom: 0    // 前推起始拉距
  };

  var lastHitT = 0;
  var lastCushT = 0;

  // 滚轮微调限幅（正负各 8°，再多不如直接动鼠标）
  var NUDGE_MAX = 8 * Math.PI / 180;
  // 鼠标离白球太近时 1px 就是好几度，手抖会让瞄准线疯狂跳。
  // 但不能直接冻结——那样白球附近的方向就永远选不到了（用户实测踩坑）。
  // 改成低通平滑：方向永远跟得上，只是近处追随得更缓，把抖动滤掉。
  var AIM_NEAR_DIST = 46;

  function lerpAngle(a, b, t) {
    var d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  function nudgeText() {
    var d = S.aimNudge * 180 / Math.PI;
    return (d >= 0 ? '+' : '') + d.toFixed(1) + '°';
  }

  // 底部操作提示随阶段变化；微调量非零时显示具体数值
  function updateHint() {
    if (S.phase === 'ballinhand') {
      el.hint.textContent = '移动鼠标摆放白球 · 点击确认位置';
    } else if (S.phase === 'ai') {
      el.hint.textContent = '电脑瞄准中，看它的杆';
    } else if (S.aimNudge !== 0) {
      el.hint.textContent = '微调 ' + nudgeText() +
        ' · 滚轮 ±0.3°（Shift ±0.05°）· 按 R 归零';
    } else if (S.phase === 'charging') {
      el.hint.textContent = '按住鼠标蓄力 · 松开击球 · Esc 取消';
    } else {
      el.hint.textContent = '鼠标瞄准 · 滚轮微调 · 按住蓄力 · 松开击球 · Esc 取消';
    }
  }

  /* ---------------- 音效回调 ---------------- */

  world.onPocket = function (b) {
    BK.Audio.pocket();
    renderer.addPot(b);
  };

  world.onHit = function (impact) {
    if (impact < 28) return;
    var now = performance.now();
    if (now - lastHitT < 24) return;
    lastHitT = now;
    BK.Audio.hit(impact);
  };

  world.onCushion = function (v) {
    if (v < 30) return;
    var now = performance.now();
    if (now - lastCushT < 30) return;
    lastCushT = now;
    BK.Audio.cushion(v);
  };

  /* ---------------- 辅助 ---------------- */

  function setMsg(t) { el.msg.textContent = t; }

  function validCuePos(x, y) {
    var R = C.BALL_R;
    if (x < C.PX0 + R || x > C.PX1 - R) return false;
    if (y < C.PY0 + R || y > C.PY1 - R) return false;
    // 不允许摆进袋口：否则白球刚放下就自己掉进去了
    for (var pk = 0; pk < C.POCKETS.length; pk++) {
      if (U.dist(x, y, C.POCKETS[pk].x, C.POCKETS[pk].y) < C.POCKET_R * 1.45) return false;
    }
    for (var i = 1; i < world.balls.length; i++) {
      var b = world.balls[i];
      if (!b.active) continue;
      if (U.dist(x, y, b.x, b.y) < R * 2 + 1.5) return false;
    }
    return true;
  }

  function placeCueAuto() {
    var cue = world.cue();
    var spots = [[C.HEAD_X, C.MID_Y]];
    for (var r = 24; r <= 420; r += 24) {
      for (var a = 0; a < 16; a++) {
        var ang = a * Math.PI / 8;
        spots.push([C.HEAD_X + Math.cos(ang) * r, C.MID_Y + Math.sin(ang) * r]);
      }
    }
    for (var i = 0; i < spots.length; i++) {
      if (validCuePos(spots[i][0], spots[i][1])) {
        cue.x = spots[i][0];
        cue.y = spots[i][1];
        return;
      }
    }
  }

  function buildRow(node, p) {
    node.innerHTML = '';
    var g = rules.assign[p];
    if (!g) return;
    var list = g === 'solid' ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
    for (var i = 0; i < list.length; i++) {
      var n = list[i];
      var d = document.createElement('div');
      d.className = 'bdot' + (world.balls[n].active ? '' : ' potted');
      var col = C.COLORS[n];
      d.style.background = n >= 9
        ? 'linear-gradient(#f7f4ea 0 28%, ' + col + ' 28% 72%, #f7f4ea 72% 100%)'
        : col;
      d.textContent = String(n);
      node.appendChild(d);
    }
  }

  function updateHUD() {
    el.typeP1.textContent = rules.typeText(0);
    el.typeP2.textContent = rules.typeText(1);
    buildRow(el.rowP1, 0);
    buildRow(el.rowP2, 1);

    var live = !rules.gameOver;
    el.cardP1.className = 'player-card' + (live && rules.turn === 0 ? ' active' : '');
    el.cardP2.className = 'player-card right' + (live && rules.turn === 1 ? ' active' : '');
  }

  function resetSpin() {
    S.spinX = 0;
    S.spinY = 0;
    S.spinDirty = true;
  }

  /* ---------------- 回合流转 ---------------- */

  function doShoot(power, angle, sx, sy) {
    power = Math.max(0.06, power);
    // 球杆力度倍率只作用于玩家的杆；AI 不吃玩家装备加成
    var mult = C.CUES[S.cueIdx].power;
    var v = power * C.MAX_POWER * mult;
    if (v > C.MAX_POWER * 1.45) v = C.MAX_POWER * 1.45;
    world.shootRaw(angle, v, sx, sy);
    BK.Audio.cue(power);
    // 击球动画：球杆从当前拉距快速冲向白球再消失
    S.strikeFrom = power * 26;
    S.strike = 0.12;
    S.phase = 'shooting';
    S.power = 0;
    // 每杆打完塞点自动回中，防止带着忘掉的杆法打下一杆
    resetSpin();
    // 出杆方向成为新一杆的基准，微调量清零
    S.aimBase = angle;
    S.aimNudge = 0;
  }

  function onShotEnd() {
    var p = rules.turn;
    var wasBreak = (rules.phase === 'breaking');
    var r = rules.resolve(world, p);

    // 白球复位（若落袋）
    if (world.ev.cueScratch) {
      var cue = world.cue();
      cue.active = true;
      cue.potted = false;
      cue.vx = 0;
      cue.vy = 0;
      cue.x = C.HEAD_X;
      cue.y = C.MID_Y;
    }

    // 开球打进黑八：重新开局，不判胜负
    if (r.rebreak) {
      world.reset();
      rules.reset();
      S.phase = 'aim';
      S.charging = false;
      S.ballInHand = false;
      resetSpin();
    S.aimAngle = 0;
    S.aimBase = 0;
    S.aimTarget = 0;
    S.aimNear = false;
    S.aimNudge = 0;
    setMsg('开球打进黑八 · 重新开局，你继续开球');
      updateHUD();
      return;
    }

    if (r.over) {
      S.phase = 'over';
      updateHUD();
      showResult(r.winner === 0);
      return;
    }

    if (r.foul) {
      rules.turn = 1 - p;
      S.ballInHand = true;
      var who = p === 0 ? '你犯规' : '电脑犯规';
      if (rules.turn === 1) {
        setMsg(who + '：' + r.msg + ' · 电脑获得自由球');
        S.phase = 'ai';
        setTimeout(aiPlaceAndShoot, 560);
      } else {
        setMsg(who + '：' + r.msg + ' · 你获得自由球');
        S.phase = 'ballinhand';
        updateHint();
      }
    } else if (r.cont) {
      if (rules.turn === 0) {
        if (rules.groupCleared(world, 0)) {
          setMsg('清台完成 · 该打黑八了，别手抖');
        } else if (wasBreak) {
          setMsg('开球成功 · 继续进攻');
        } else {
          setMsg(r.msg || '继续进攻');
        }
        S.phase = 'aim';
        updateHint();
      } else {
        setMsg(rules.groupCleared(world, 1) ? '电脑清台 · 它要打黑八了' : (r.msg || '电脑继续'));
        S.phase = 'ai';
        setTimeout(aiShoot, 560);
      }
    } else {
      rules.turn = 1 - p;
      if (rules.turn === 1) {
        setMsg('换电脑出杆');
        S.phase = 'ai';
        setTimeout(aiShoot, 560);
      } else {
        setMsg('轮到你了');
        S.phase = 'aim';
        updateHint();
      }
    }

    updateHUD();
  }

  function aiShoot() {
    if (rules.gameOver) return;
    S.phase = 'ai';
    el.hint.textContent = '电脑瞄准中，看它的杆';
    var plan = BK.AI.think(world, rules, S.level, 1);
    // AI 的瞄准角直接成为基准（微调量在上一杆已清零）
    S.aimBase = plan.angle;
    S.aimNudge = 0;
    setTimeout(function () {
      if (rules.gameOver) return;
      doShoot(plan.power, plan.angle, plan.spinSide, plan.spinTop);
    }, 400);
  }

  function aiPlaceAndShoot() {
    if (rules.gameOver) return;
    placeCueAuto();
    S.ballInHand = false;
    setTimeout(aiShoot, 450);
  }

  function showResult(win) {
    el.ovTitle.textContent = win ? '胜 利' : '失 败';
    el.ovText.textContent = win ? '漂亮的清台，收下这场胜利' : '再来一局，这次别急着开球';
    el.overlay.classList.remove('hidden');
    BK.Audio.fanfare(win);
  }

  function restart() {
    world.reset();
    rules.reset();
    S.phase = 'aim';
    S.power = 0;
    S.charging = false;
    S.ballInHand = false;
    resetSpin();
    S.aimAngle = 0;
    S.aimBase = 0;
    S.aimTarget = 0;
    S.aimNear = false;
    S.aimNudge = 0;
    S.strike = 0;
    el.overlay.classList.add('hidden');
    setMsg('开球吧 · 按住鼠标蓄力');
    updateHint();
    updateHUD();
  }

  /* ---------------- 输入 ---------------- */

  var canvas = renderer.canvas;

  canvas.addEventListener('mousemove', function (e) {
    var p = renderer.toLocal(e);
    var cue = world.cue();
    if (S.phase === 'ballinhand') {
      cue.x = U.clamp(p.x, C.PX0 + C.BALL_R, C.PX1 - C.BALL_R);
      cue.y = U.clamp(p.y, C.PY0 + C.BALL_R, C.PY1 - C.BALL_R);
      // 摆球时瞄准方向直接同步，确认后球杆不会突然跳向旧角度
      S.aimBase = S.aimTarget = Math.atan2(p.y - cue.y, p.x - cue.x);
      S.aimNear = false;
    } else if (S.phase === 'aim' || S.phase === 'charging') {
      // 鼠标永远决定目标方向——近处（贴白球）不做冻结，只标记近距，
      // 由主循环用更低的平滑系数慢慢跟过去，抖得慢但每个方向都选得到。
      var dx = p.x - cue.x, dy = p.y - cue.y;
      if (dx !== 0 || dy !== 0) {
        S.aimTarget = Math.atan2(dy, dx);
        S.aimNear = Math.hypot(dx, dy) < AIM_NEAR_DIST;
      }
    }
  });

  canvas.addEventListener('mousedown', function (e) {
    e.preventDefault();
    BK.Audio.init();
    if (S.phase === 'ballinhand') {
      if (validCuePos(world.cue().x, world.cue().y)) {
        S.ballInHand = false;
        S.phase = 'aim';
        setMsg('摆放完成 · 瞄准击球');
        updateHint();
      } else {
        setMsg('这里不能放 · 找个空位（红圈变绿就行）');
      }
      return;
    }
    if (S.phase === 'aim') {
      S.charging = true;
      S.power = 0;
      S.phase = 'charging';
    }
  });

  window.addEventListener('mouseup', function () {
    if (S.phase === 'charging') {
      S.charging = false;
      doShoot(S.power, S.aimAngle, S.spinX, S.spinY);
    }
  });

  window.addEventListener('keydown', function (e) {
    if (e.code === 'Escape') {
      if (S.phase === 'charging') {
        S.charging = false;
        S.power = 0;
        S.phase = 'aim';
        setMsg('已取消蓄力，重新瞄准');
      }
      return;
    }
    // R：清零滚轮攒下的微调量
    if (e.code === 'KeyR') {
      if ((S.phase === 'aim' || S.phase === 'charging') && S.aimNudge !== 0) {
        S.aimNudge = 0;
        setMsg('微调已归零');
        updateHint();
      }
      return;
    }
    if (e.code !== 'Space') return;
    e.preventDefault();
    BK.Audio.init();
    if (S.phase === 'ballinhand') {
      if (validCuePos(world.cue().x, world.cue().y)) {
        S.ballInHand = false;
        S.phase = 'aim';
        setMsg('摆放完成 · 瞄准击球');
        updateHint();
      }
      return;
    }
    if (S.phase === 'aim') {
      S.charging = true;
      S.power = 0;
      S.phase = 'charging';
    }
  });

  window.addEventListener('keyup', function (e) {
    if (e.code !== 'Space') return;
    e.preventDefault();
    if (S.phase === 'charging') {
      S.charging = false;
      doShoot(S.power, S.aimAngle, S.spinX, S.spinY);
    }
  });

  /* ---------------- 滚轮微调瞄准 ---------------- */

  // 微调是"偏移量"而不是"锁定"：鼠标动只改基准角，滚轮攒的偏移一直叠加在上面，
  // 直到出杆或按 R 归零。这样无论鼠标怎么动，都能感觉到拧过的量一直在生效。
  canvas.addEventListener('wheel', function (e) {
    if (S.phase !== 'aim' && S.phase !== 'charging') return;
    e.preventDefault();
    var step = (e.shiftKey ? 0.05 : 0.3) * Math.PI / 180;
    S.aimNudge = U.clamp(S.aimNudge + (e.deltaY > 0 ? -step : step), -NUDGE_MAX, NUDGE_MAX);
    updateHint();
  }, { passive: false });

  /* ---------------- 击球点（加塞） ---------------- */

  var spinDrag = false;
  var SPIN_PAD = 46 * 0.62;

  function setSpin(e) {
    var r = spinCanvas.getBoundingClientRect();
    var x = (e.clientX - r.left) / r.width * 120 - 60;
    var y = (e.clientY - r.top) / r.height * 120 - 60;
    var d = Math.hypot(x, y) / SPIN_PAD;
    if (d > 1) { x /= d; y /= d; }
    S.spinX = U.clamp(x / SPIN_PAD, -1, 1);
    S.spinY = U.clamp(-y / SPIN_PAD, -1, 1);
    S.spinDirty = true;
  }

  spinCanvas.addEventListener('mousedown', function (e) {
    e.preventDefault();
    e.stopPropagation();
    spinDrag = true;
    setSpin(e);
  });

  window.addEventListener('mousemove', function (e) {
    if (spinDrag) setSpin(e);
  });

  // 关键修复：松开鼠标必须结束拖动。
  // 之前漏了这一行，spinDrag 永远为 true，鼠标在全屏任何移动
  // 都会把塞点改到"鼠标相对圆盘的方向"——表现就是塞点乱跳、加塞失效
  window.addEventListener('mouseup', function () {
    spinDrag = false;
  });

  spinCanvas.addEventListener('dblclick', function () {
    resetSpin();
    setMsg('击球点已回中');
  });

  // 按钮
  el.btnSound.addEventListener('click', function () {
    S.sound = !S.sound;
    BK.Audio.enabled = S.sound;
    this.textContent = '音效 ' + (S.sound ? '开' : '关');
  });

  el.btnAim.addEventListener('click', function () {
    S.showAim = !S.showAim;
    this.textContent = '辅助线 ' + (S.showAim ? '开' : '关');
  });

  el.btnLevel.addEventListener('click', function () {
    S.level = (S.level + 1) % 3;
    this.textContent = '难度 ' + BK.AI.levels[S.level].name;
  });

  el.btnRestart.addEventListener('click', restart);
  el.ovBtn.addEventListener('click', restart);

  /* ---------------- 球杆选择 ---------------- */

  // 与 render.js 的 CUE_SKINS.shaft 保持一致，卡片色块就是台上那根杆的颜色
  var SWATCH = ['#e2c48d', '#424750', '#f2d08a'];

  function buildCueCards() {
    var host = document.getElementById('cueCards');
    host.innerHTML = '';
    for (var i = 0; i < C.CUES.length; i++) {
      (function (idx) {
        var cue = C.CUES[idx];
        var card = document.createElement('div');
        card.className = 'cue-card' + (S.cueIdx === idx ? ' active' : '');
        card.innerHTML =
          '<div class="cue-swatch" style="background:linear-gradient(90deg,' +
            SWATCH[idx] + ' 0 55%, #3f2614 55% 100%)"></div>' +
          '<div class="cue-meta">' +
            '<div class="cue-name">' + cue.name + '</div>' +
            '<div class="cue-desc">力度 ×' + cue.power.toFixed(1) + ' · 准线 ' +
              (idx === 0 ? '基础' : idx === 1 ? '撞库反弹' : '双段反弹') + '</div>' +
          '</div>' +
          '<div class="cue-star">' + cue.star + '</div>';
        card.addEventListener('click', function () {
          S.cueIdx = idx;
          buildCueCards();
          setMsg('已换 ' + cue.name);
        });
        host.appendChild(card);
      })(i);
    }
  }

  /* ---------------- 主循环 ---------------- */

  function loop(ts) {
    var dt = S.lastTs ? (ts - S.lastTs) / 1000 : 1 / 60;
    S.lastTs = ts;
    if (dt > 0.05) dt = 0.05;

    if (S.charging) S.power = Math.min(1, S.power + dt * 0.85);
    if (S.strike > 0) S.strike -= dt;

    if (S.phase === 'shooting') {
      world.step(dt);
      if (world.allStopped()) onShotEnd();
    }

    var cue = world.cue();
    var aiming = (S.phase === 'aim' || S.phase === 'charging' || S.phase === 'ballinhand');
    // 基准角低通平滑地追随鼠标目标角：远处接近跟手，贴近白球时放缓滤抖。
    // 每个方向都选得到，只是快慢不同——绝不再有"冻结选不到"的死区。
    if (S.phase === 'aim' || S.phase === 'charging') {
      S.aimBase = lerpAngle(S.aimBase, S.aimTarget, S.aimNear ? 0.14 : 0.6);
    }
    if (S.phase !== 'ai' && S.phase !== 'shooting') {
      S.aimAngle = S.aimBase + S.aimNudge;
    }
    S.pred = aiming ? BK.aim.predict(world, S.aimAngle, C.CUES[S.cueIdx].depth) : null;

    // 球杆拉距：蓄力时后退；AI 瞄准时小幅预备；击球瞬间冲向白球
    var pull = 0;
    if (S.charging) pull = S.power * 26;
    else if (S.phase === 'ai') pull = 9;
    if (S.strike > 0) {
      var k = 1 - Math.max(0, S.strike) / 0.12;
      pull = S.strikeFrom + (-10 - S.strikeFrom) * k;
    }

    var showCue = cue.active &&
      (S.phase === 'aim' || S.phase === 'charging' || S.phase === 'ai' ||
       (S.phase === 'shooting' && S.strike > 0));

    renderer.draw(world, {
      aimAngle: S.aimAngle,
      pull: pull,
      showAim: S.showAim,
      pred: S.pred,
      canShoot: (S.phase === 'aim' || S.phase === 'charging') && !S.ballInHand,
      showCue: showCue,
      cueSkin: C.CUES[S.cueIdx].skin,
      ballInHand: S.phase === 'ballinhand',
      ballInHandValid: validCuePos(cue.x, cue.y)
    });

    var pct = Math.round(S.power * 100);
    el.powerFill.style.width = pct + '%';
    el.powerVal.textContent = pct + '%';

    if (S.spinDirty) {
      renderer.drawSpinPad(spinCtx, S.spinX, S.spinY);
      S.spinDirty = false;
    }

    requestAnimationFrame(loop);
  }

  buildCueCards();
  restart();
  requestAnimationFrame(loop);
})();
