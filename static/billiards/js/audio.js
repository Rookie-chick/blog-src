window.BK = window.BK || {};

(function () {
  'use strict';

  var A = BK.Audio = {
    ctx: null,
    master: null,
    enabled: true,

    init: function () {
      if (this.ctx) return;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch (e) {
        this.ctx = null;
        return;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
    },

    resume: function () {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },

    ok: function () {
      if (!this.enabled) return false;
      if (!this.ctx) this.init();
      if (!this.ctx) return false;
      this.resume();
      return true;
    },

    noiseBuf: function (dur) {
      var ctx = this.ctx;
      var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      }
      return buf;
    },

    // 击球
    cue: function (strength) {
      if (!this.ok()) return;
      var ctx = this.ctx, t = ctx.currentTime;
      var src = ctx.createBufferSource();
      src.buffer = this.noiseBuf(0.06);
      var bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1500 + strength * 1200;
      bp.Q.value = 1.1;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.55 * (0.35 + strength * 0.65), t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      src.connect(bp); bp.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + 0.08);
    },

    // 球碰球
    hit: function (impact) {
      if (!this.ok()) return;
      var v = Math.max(0.04, Math.min(1, impact / 520));
      var ctx = this.ctx, t = ctx.currentTime;
      var o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(430 + v * 620, t);
      o.frequency.exponentialRampToValueAtTime(170, t + 0.05);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.33 * v, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.075);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 0.09);
    },

    // 碰库
    cushion: function (v) {
      if (!this.ok()) return;
      var a = Math.max(0.05, Math.min(1, v / 500));
      var ctx = this.ctx, t = ctx.currentTime;
      var src = ctx.createBufferSource();
      src.buffer = this.noiseBuf(0.09);
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 380;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.3 * a, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      src.connect(lp); lp.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + 0.11);
    },

    // 落袋
    pocket: function () {
      if (!this.ok()) return;
      var ctx = this.ctx, t = ctx.currentTime;
      var o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(320, t);
      o.frequency.exponentialRampToValueAtTime(90, t + 0.22);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 0.28);
    },

    // 胜负
    fanfare: function (win) {
      if (!this.ok()) return;
      var notes = win ? [523, 659, 784, 1047] : [440, 392, 330, 247];
      var ctx = this.ctx, t0 = ctx.currentTime;
      for (var i = 0; i < notes.length; i++) {
        var o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = notes[i];
        var g = ctx.createGain();
        var t = t0 + i * 0.13;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.26, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.connect(g); g.connect(this.master);
        o.start(t); o.stop(t + 0.32);
      }
    }
  };
})();
