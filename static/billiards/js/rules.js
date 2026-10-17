window.BK = window.BK || {};

(function () {
  'use strict';

  var SOLIDS = [1, 2, 3, 4, 5, 6, 7];
  var STRIPES = [9, 10, 11, 12, 13, 14, 15];

  function Rules() {
    this.reset();
  }

  Rules.prototype.reset = function () {
    this.turn = 0;
    this.phase = 'breaking';
    this.assign = [null, null];
    this.gameOver = false;
    this.winner = -1;
  };

  Rules.prototype.groupBalls = function (p) {
    if (!this.assign[p]) return SOLIDS.concat(STRIPES);
    return this.assign[p] === 'solid' ? SOLIDS : STRIPES;
  };

  // 判定时必须区分"击球前在台上"和"这一杆刚被打进"。
  // pottedNums 是本杆落袋的球号，它们这一杆之前还在台上，必须算作存在，
  // 否则打进自己最后一颗球的那杆会被误判成"首先碰到的不是自己的球"。
  Rules.prototype.onTableBefore = function (world, n, pottedNums) {
    if (world.balls[n].active) return true;
    return !!pottedNums && pottedNums.indexOf(n) >= 0;
  };

  Rules.prototype.groupCleared = function (world, p, pottedNums) {
    var nums = this.groupBalls(p);
    if (!this.assign[p]) return false;
    for (var i = 0; i < nums.length; i++) {
      if (this.onTableBefore(world, nums[i], pottedNums)) return false;
    }
    return true;
  };

  Rules.prototype.legalTargets = function (world, p, pottedNums) {
    if (this.groupCleared(world, p, pottedNums)) return [8];
    return this.groupBalls(p);
  };

  Rules.prototype.remaining = function (world, p) {
    var nums = this.groupBalls(p);
    var out = [];
    for (var i = 0; i < nums.length; i++) {
      if (world.balls[nums[i]].active) out.push(nums[i]);
    }
    return out;
  };

  Rules.prototype.resolve = function (world, p) {
    var ev = world.ev;
    var eight = world.balls[8];
    var res = {
      foul: false, msg: '', cont: false,
      ballInHand: false, over: false, winner: -1
    };

    var wasBreak = (this.phase === 'breaking');
    var eightPotted = ev.potted.indexOf(eight) >= 0;
    var fc = ev.firstContact;
    var i, n;

    // 本杆落袋的球号：后面所有"击球前是否在台上"的判断都要用到
    var pottedNums = [];
    for (i = 0; i < ev.potted.length; i++) pottedNums.push(ev.potted[i].num);

    // ---- 黑八结算 ----
    if (eightPotted) {
      // 开球打进黑八：不判胜负，重新开局（标准处理，直接判负太苛刻）
      if (wasBreak) {
        res.rebreak = true;
        res.msg = '开球打进黑八，重新开局';
        return res;
      }
      // 用击球前的清台状态判断：最后一颗球和黑八同杆落下时不算清台，仍判负
      var canShootEight = this.groupCleared(world, p, pottedNums);
      var clean = canShootEight && !ev.cueScratch && fc === eight;
      res.over = true;
      if (clean) {
        res.winner = p;
        res.msg = p === 0 ? '黑八入袋，你赢了！' : '电脑打进黑八';
      } else {
        res.winner = 1 - p;
        res.msg = p === 0 ? '黑八处理失误，你输了' : '电脑黑八失误，你赢了！';
      }
      this.gameOver = true;
      this.winner = res.winner;
      return res;
    }

    // ---- 犯规判定 ----
    if (ev.cueScratch) {
      res.foul = true;
      res.msg = '白球落袋';
    } else if (!fc) {
      res.foul = true;
      res.msg = '空杆，未碰到任何球';
    } else {
      // 关键：用击球前的目标集合判定首触，否则打进自己最后一颗球会被误判犯规
      var targets = this.legalTargets(world, p, pottedNums);
      if (targets.indexOf(fc.num) < 0) {
        res.foul = true;
        res.msg = '首先碰到的不是自己的球';
      } else if (ev.potted.length === 0 && !ev.cushionAfterContact) {
        res.foul = true;
        res.msg = '击球后无球进袋且无球碰库';
      }
    }

    // ---- 定球 ----
    var pottedNormal = [];
    for (i = 0; i < ev.potted.length; i++) {
      n = ev.potted[i].num;
      if (n !== 0 && n !== 8) pottedNormal.push(n);
    }

    if (wasBreak) {
      this.phase = 'open';
    } else if (!res.foul && this.phase === 'open' && pottedNormal.length > 0) {
      var s = 0, t = 0, first = pottedNormal[0] < 8 ? 'solid' : 'striped';
      for (i = 0; i < pottedNormal.length; i++) {
        if (pottedNormal[i] < 8) s++; else t++;
      }
      var g = (s === t) ? first : (s > t ? 'solid' : 'striped');
      this.assign[p] = g;
      this.assign[1 - p] = (g === 'solid' ? 'striped' : 'solid');
      this.phase = 'assigned';
      res.msg = (p === 0 ? '你' : '电脑') + '定球：' + (g === 'solid' ? '全色' : '花色');
    }

    // ---- 是否继续 ----
    if (!res.foul) {
      if (this.phase === 'assigned') {
        var mine = this.groupBalls(p);
        for (i = 0; i < pottedNormal.length; i++) {
          if (mine.indexOf(pottedNormal[i]) >= 0) { res.cont = true; break; }
        }
      } else {
        res.cont = pottedNormal.length > 0;
      }
      if (!res.cont && !res.msg) res.msg = '未进球，换手';
    }

    if (res.foul) {
      res.cont = false;
      res.ballInHand = true;
    }

    return res;
  };

  Rules.prototype.typeText = function (p) {
    if (!this.assign[p]) return '未定球';
    return this.assign[p] === 'solid' ? '全色球 1-7' : '花色球 9-15';
  };

  BK.Rules = Rules;
})();
