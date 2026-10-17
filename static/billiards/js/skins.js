window.BK = window.BK || {};

/* ============================================================================
   皮肤系统：球桌贴图 + 球杆贴图

   素材包给的几何参数（球桌原图 2048×1152）：

     台面    左上 (256,192)  右下 (1792,960)   尺寸 1536×768（2:1）
     袋口    (242,178) (1024,172) (1806,178)
             (242,974) (1024,980) (1806,974)
     球杆    杆头 x=1988，杆尾 x=61，中心线 y=64，有效长度 1927

   游戏画布 1012×562，台面 900×450，也是 2:1 —— 比例正好一致。

   **球桌贴图已预先裁切**：按上面的映射算下来，画布只能看到原图的
   (160,96)-(1888,1056) 这一块，其余 40% 永远在画布外。裁掉既省体积，
   也避免把 JPEG 压缩痕迹花在看不见的地方。所以这里直接铺满画布即可。

   裁切后 (1728×960) 映射到画布 1012×562，台面误差 < 0.5px，
   库边与物理边界严丝合缝。

   注意：素材的袋口中心在台面角点**外侧** 14px（原图像素），而游戏里的袋口
   就在台面角点上，两者差约 8 个画布像素。这里选择**对齐台面而不是对齐袋口** ——
   袋口偏 8px 还在直径 44px 的黑洞里看不出来，但库边偏 8px 会让球提前弹回，
   一眼就能发现。
   ========================================================================== */

(function () {
  'use strict';

  var C = BK.CFG;

  // 原图几何（像素）
  var ART = {
    canvasW: 2048,
    canvasH: 1152,
    fieldX: 256,
    fieldY: 192,
    fieldW: 1536,
    fieldH: 768,
    cueCanvasW: 2048,
    cueCanvasH: 128,
    cueTipX: 1988,
    cueCenterY: 64,
    cueVisibleLen: 1927
  };

  // 贴图是裁切版（已经等于"画布可见区域"），直接铺满就行
  var TABLE_SCALE = C.PLAY_W / ART.fieldW;                       // 保留：900 / 1536

  // 球杆：视觉长度（画布像素）。素材有效长 1927 → 缩放系数
  var CUE_LEN = 252;
  var CUE_SCALE = CUE_LEN / ART.cueVisibleLen;

  function loadImage(src) {
    var img = new Image();
    img.ready = false;
    img.failed = false;
    img.onload = function () { img.ready = true; };
    img.onerror = function () { img.failed = true; };
    img.src = src;
    return img;
  }

  var tables = [];
  var cueImgByPath = {};
  var booted = false;

  function init() {
    if (booted) return;
    booted = true;

    (C.TABLES || []).forEach(function (t) {
      tables.push({ id: t.id, name: t.name, img: loadImage(t.file) });
    });

    (C.CUES || []).forEach(function (c) {
      if (c.img && !cueImgByPath[c.img]) {
        cueImgByPath[c.img] = loadImage(c.img);
      }
    });
  }

  function tableById(id) {
    for (var i = 0; i < tables.length; i++) {
      if (tables[i].id === id) return tables[i];
    }
    return tables[0] || null;
  }

  function cueImage(cue) {
    if (!cue || !cue.img) return null;
    var img = cueImgByPath[cue.img];
    return (img && img.ready) ? img : null;
  }

  function tableImage(id) {
    var t = tableById(id);
    return (t && t.img.ready) ? t.img : null;
  }

  /** 画球桌贴图（裁切版，铺满画布；台面与库边已对齐物理边界） */
  function drawTableImage(ctx, img) {
    ctx.drawImage(img, 0, 0, C.W, C.H);

    // 素材袋口比物理袋口偏外约 8px，这里在真实袋位补一层柔和的暗坑，
    // 让"球消失的地方"和"看着像洞的地方"对得上
    for (var i = 0; i < C.POCKETS.length; i++) {
      var p = C.POCKETS[i];
      var g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, C.POCKET_R * 1.05);
      g.addColorStop(0, 'rgba(0, 0, 0, .55)');
      g.addColorStop(0.6, 'rgba(0, 0, 0, .28)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, C.POCKET_R * 1.05, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * 画球杆贴图。tipX/tipY 是杆头位置，angle 是出杆方向（+x 为前）。
   * 贴图里杆头在右端，所以旋转后把杆头锚到原点，杆身自然朝后延伸。
   */
  function drawCueImage(ctx, img, tipX, tipY, angle) {
    var s = CUE_SCALE;
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(angle);
    ctx.drawImage(
      img,
      -ART.cueTipX * s,
      -ART.cueCenterY * s,
      ART.cueCanvasW * s,
      ART.cueCanvasH * s
    );
    ctx.restore();
  }

  BK.skins = {
    init: init,
    tables: tables,
    tableById: tableById,
    tableImage: tableImage,
    cueImage: cueImage,
    drawTableImage: drawTableImage,
    drawCueImage: drawCueImage,
    TABLE_SCALE: TABLE_SCALE,
    CUE_SCALE: CUE_SCALE
  };
})();
