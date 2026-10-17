/* myblog 交互脚本：移动端菜单 / 返回顶部 / 雪花特效 —— 无任何第三方依赖 */
(function () {
  'use strict';

  /* ---------- 移动端菜单 ---------- */
  var toggle = document.querySelector('.menu-toggle');
  var menu = document.querySelector('.menu');
  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      menu.classList.toggle('open');
    });
    document.addEventListener('click', function (e) {
      if (!menu.contains(e.target) && !toggle.contains(e.target)) {
        menu.classList.remove('open');
      }
    });
  }

  /* ---------- 返回顶部 ---------- */
  var gotop = document.getElementById('gotop');
  if (gotop) {
    var onScroll = function () {
      if (window.pageYOffset > 300) { gotop.classList.add('show'); }
      else { gotop.classList.remove('show'); }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    gotop.addEventListener('click', function (e) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ---------- 雪花特效 ---------- */
  var canvas = document.getElementById('snow-canvas');
  if (canvas && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var ctx = canvas.getContext('2d');
    var flakes = [];
    var COUNT = 120;
    var W = 0, H = 0;

    var resize = function () {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    for (var i = 0; i < COUNT; i++) {
      flakes.push({
        x: Math.random() * 2000 - 1000,
        y: Math.random() * 2000,
        r: Math.random() * 2 + 1,
        vy: Math.random() * 0.6 + 0.3,
        vx: Math.random() * 0.4 - 0.2,
        a: Math.random() * 0.4 + 0.15,
        swing: Math.random() * Math.PI * 2
      });
    }

    var tick = function () {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#ffffff';
      for (var i = 0; i < flakes.length; i++) {
        var f = flakes[i];
        f.swing += 0.01;
        f.x += f.vx + Math.sin(f.swing) * 0.3;
        f.y += f.vy;
        if (f.y > H + 5) { f.y = -5; f.x = Math.random() * W; }
        if (f.x > W + 5) { f.x = -5; }
        if (f.x < -5) { f.x = W + 5; }
        ctx.globalAlpha = f.a;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
})();
