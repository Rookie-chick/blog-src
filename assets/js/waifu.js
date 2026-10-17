/* ==========================================================================
   看板娘（Live2D）交互脚本
   移植自原 WordPress 主题 kratos-pjax-master / static/js/waifu-tips.js
   差异说明：
     1. 模型配置原本由 inc/model/api.php 动态生成（PHP），这里改成预生成的静态
        JSON：assets/live2d/<人物>-<服装序号>.json
     2. 去掉了一处向 icanhazip.com 查询访客公网 IP 的请求（会泄露访客信息）
     3. 一言（hitokoto.cn）保留，但请求失败时回退到本地文案
   依赖：jQuery + assets/js/live2d.js（都随站点一起托管，无 CDN）
   ========================================================================== */
(function () {
  'use strict';

  var CFG = window.__WAIFU__ || {};
  // BASE 是"当前页面到站点根目录"的相对前缀：根目录页面为 ''，posts/ 下为 '../'
  var BASE = CFG.base || '';
  var OUTFITS = 21;                       // 服装总数，与 assets/live2d/*.json 一一对应
  var HOME = BASE || './';
  var MODEL_DIR = BASE + 'assets/live2d/';

  /* 小屏不加载看板娘（原主题也是移动端关闭） */
  if (window.innerWidth < 993) { return; }
  /* 直接用 file:// 双击打开时，浏览器不允许读取本地 JSON，看板娘会加载失败。
     这种情况安静跳过，页面其他部分照常。想看她就用 preview.bat 起本地服务。 */
  if (window.location.protocol === 'file:') { return; }
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { return; }

  var ismove = false;
  var model_p = localStorage.getItem('waifu-person') || CFG.person || '33';
  if (model_p !== '22' && model_p !== '33') { model_p = '33'; }

  var waifu_display = localStorage.getItem('waifu-display');
  if (waifu_display === 'none') {
    $('.waifu').hide();
    $('.waifu-btn').show();
  }

  function getModelId() {
    var k = model_p === '22' ? 'waifu-22' : 'waifu-33';
    var v = parseInt(localStorage.getItem(k), 10);
    if (isNaN(v) || v < 0) {
      v = Math.floor(Math.random() * OUTFITS);
      localStorage.setItem(k, v);
    }
    return ((v % OUTFITS) + OUTFITS) % OUTFITS;
  }

  function setModelId(id) {
    var m_id = id > 100000 ? 0 : ((id % OUTFITS) + OUTFITS) % OUTFITS;
    localStorage.setItem(model_p === '22' ? 'waifu-22' : 'waifu-33', m_id);
  }

  function loadModel(id) {
    window.loadlive2d('live2d', MODEL_DIR + model_p + '-' + id + '.json');
  }

  /* ---------- 气泡提示 ---------- */
  function showMessage(a, b) {
    if (b == null) { b = 10000; }
    jQuery('.waifu-tips').hide().stop();
    jQuery('.waifu-tips').html(a);
    jQuery('.waifu-tips').fadeTo('10', 1);
    jQuery('.waifu-tips').fadeOut(b);
  }

  var LOCAL_QUOTES = [
    '愿你出走半生，归来仍是少年',
    '把今天该做的事做完，明天才轻松',
    '别急，慢慢来，比较快',
    '代码写完了吗？就来看我了',
    '休息一下眼睛吧，已经盯屏幕很久了'
  ];
  function showHitokoto() {
    $.ajax({ url: 'https://v1.hitokoto.cn/?encode=text', dataType: 'text', timeout: 5000 })
      .done(function (r) { showMessage(r); })
      .fail(function () {
        showMessage(LOCAL_QUOTES[Math.floor(Math.random() * LOCAL_QUOTES.length)]);
      });
  }

  /* ---------- 工具按钮 ---------- */
  $('.waifu-btn').click(function () {
    localStorage.removeItem('waifu-display');
    $('.waifu').show();
    $('.waifu-btn').hide();
    showMessage('你的小可爱突然出现~', 4000);
  });

  $('.waifu-tool .fa-home').click(function () {
    window.location = HOME;
  });

  $('.waifu-tool .fa-comments').click(function () { showHitokoto(); });

  $('.waifu-tool .fa-info-circle').click(function () {
    showMessage('本站是纯静态站点，没有后台也没有数据库，很安全的~', 5000);
  });

  $('.waifu-tool .fa-camera').click(function () {
    showMessage('照好了嘛，是不是很可爱呢？', 5000);
    window.Live2D.captureName = model_p + '.png';
    window.Live2D.captureFrame = true;
  });

  $('.waifu-tool .fa-close').click(function () {
    localStorage.setItem('waifu-display', 'none');
    showMessage('愿你有一天能与重要的人重逢', 2000);
    window.setTimeout(function () {
      $('.waifu').hide();
      $('.waifu-btn').show();
    }, 1000);
  });

  /* 换人：22 ↔ 33 */
  $('.waifu-tool .fa-drivers-license-o').click(function () {
    model_p = model_p === '22' ? '33' : '22';
    localStorage.setItem('waifu-person', model_p);
    loadModel(getModelId());
    showMessage(model_p === '22' ? '33有点累了，现在该我上场了' : '我又回来了！', 4000);
  });

  /* 换装：下一套衣服 */
  $('.waifu-tool .fa-street-view').click(function () {
    var id = getModelId() + 1;
    setModelId(id);
    loadModel(id);
    showMessage('我的新衣服好看嘛', 4000);
  });

  $(document).on('copy', function () {
    showMessage('你都复制了些什么呀，转载要记得加上出处哦', 8000);
  });

  $(window).resize(function () {
    $('.waifu').css('top', window.innerHeight - 250);
  });

  /* ---------- 启动 ---------- */
  loadModel(getModelId());

  /* ---------- 首次问候 ---------- */
  (function () {
    var text;
    var SiteIndexUrl = window.location.protocol + '//' + window.location.hostname + '/';
    if (window.location.href === SiteIndexUrl || window.location.pathname === HOME) {
      var now = (new Date()).getHours();
      if (now > 23 || now <= 5) { text = '你是夜猫子呀？这么晚还不睡觉，明天起的来嘛'; }
      else if (now > 5 && now <= 7) { text = '早上好！一日之计在于晨，美好的一天就要开始了'; }
      else if (now > 7 && now <= 11) { text = '上午好！工作顺利嘛，不要久坐，多起来走动走动哦！'; }
      else if (now > 11 && now <= 14) { text = '中午了，工作了一个上午，现在是午餐时间！'; }
      else if (now > 14 && now <= 17) { text = '午后很容易犯困呢，今天的运动目标完成了吗？'; }
      else if (now > 17 && now <= 19) { text = '傍晚了！窗外夕阳的景色很美丽呢，最美不过夕阳红~'; }
      else if (now > 19 && now <= 21) { text = '晚上好，今天过得怎么样？'; }
      else if (now > 21 && now <= 23) { text = '已经这么晚了呀，早点休息吧，晚安~'; }
      else { text = '嗨~ 快来逗我玩吧！'; }
    } else {
      var title = document.title.split(' - ')[0];
      if (document.referrer !== '') {
        var a = document.createElement('a');
        a.href = document.referrer;
        var host = a.hostname;
        var domain = host.split('.')[1];
        if (window.location.hostname === host) {
          text = '欢迎阅读<span style="color:#0099cc;">『' + title + '』</span>';
        } else if (domain === 'baidu') {
          text = 'Hello! 来自 百度搜索 的朋友';
        } else if (domain === 'so') {
          text = 'Hello! 来自 360搜索 的朋友';
        } else if (domain === 'google') {
          text = 'Hello! 来自 谷歌搜索 的朋友<br>欢迎阅读<span style="color:#0099cc;">『' + title + '』</span>';
        } else {
          text = 'Hello! 来自 <span style="color:#0099cc;">' + host + '</span> 的朋友';
        }
      } else {
        text = '欢迎阅读<span style="color:#0099cc;">『' + title + '』</span>';
      }
    }
    $('.waifu').animate({ top: $(window).height() - 250, left: 0 }, 800);
    showMessage(text, 8000);
  })();

  /* ---------- 摸头 ---------- */
  var stat_click = 0;
  $('#live2d').mouseover(function () {
    var msgs = ['你要干嘛呀？', '鼠…鼠标放错地方了！', '喵喵喵？', '萝莉控是什么呀？', '怕怕', '你看到我的小熊了吗'];
    showMessage(msgs[Math.floor(Math.random() * msgs.length)]);
  });

  $('#live2d').click(function () {
    if (ismove) { ismove = false; return; }
    stat_click++;
    var msgs;
    if (stat_click > 6) {
      msgs = ['你有完没完呀？', '你已经摸我' + stat_click + '次了', '非礼呀！救命！',
              'OH，My ladygaga', '110吗，这里有个变态一直在摸我(ó﹏ò｡)'];
    } else {
      msgs = ['是…是不小心碰到了吧', '我跑呀跑呀跑！~~', '再摸的话我可要报警了！⌇●﹏●⌇',
              '别摸我，有什么好摸的！', '惹不起你，我还躲不起你么？',
              '不要摸我了，我会告诉老婆来打你的！', '干嘛动我呀！小心我咬你！'];
    }
    var s = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.75, -0.1, -0.2, -0.3, -0.4, -0.5, -0.6, -0.7, -0.75];
    var m = msgs[Math.floor(Math.random() * msgs.length)];
    var i1 = Math.floor(Math.random() * s.length);
    var i2 = Math.floor(Math.random() * s.length);
    $('.waifu').animate({
      left: (document.body.offsetWidth - 210) / 2 * (1 + s[i1]),
      top: (window.innerHeight - 240) - (window.innerHeight - 240) / 2 * (1 - s[i2])
    }, { duration: 500, complete: function () { showMessage(m); } });
  });

  /* ---------- 拖动 ---------- */
  jQuery(document).ready(function ($) {
    var box = $('.waifu')[0];
    if (!box) { return; }
    var topCount = 20;
    box.onmousedown = function (e) {
      var Ocx = e.clientX, Ocy = e.clientY;
      var Oboxx = parseInt(box.style.left, 10) || 0;
      var Oboxy = parseInt(box.style.top, 10) || 0;
      var Ch = document.documentElement.clientHeight;
      var Cw = document.documentElement.clientWidth;
      document.onmousemove = function (e) {
        box.style.left = Oboxx + e.clientX - Ocx + 'px';
        box.style.top = Oboxy + e.clientY - Ocy + 'px';
        if (box.offsetLeft < 0) { box.style.left = 0; }
        else if (box.offsetLeft + box.offsetWidth > Cw) { box.style.left = Cw - box.offsetWidth + 'px'; }
        if (box.offsetTop - topCount < 0) { box.style.top = topCount + 'px'; }
        else if (box.offsetTop + box.offsetHeight - topCount > Ch) {
          box.style.top = Ch - (box.offsetHeight - topCount) + 'px';
        }
        ismove = true;
      };
      document.onmouseup = function () {
        document.onmousemove = null;
        document.onmouseup = null;
      };
    };
  });

  /* ---------- 悬停彩蛋 ---------- */
  jQuery(document).ready(function ($) {
    $('.gotop').mouseover(function () { showMessage('要回到开始的地方么？'); });
    $('.waifu-tool .fa-comments').mouseover(function () { showMessage('猜猜我要说些什么？'); });
    $('.waifu-tool .fa-drivers-license-o').mouseover(function () {
      showMessage(model_p === '33' ? '要见见我的姐姐嘛' : '什么？我的服务不好，要33回来？');
    });
    $('.waifu-tool .fa-street-view').mouseover(function () { showMessage('喜欢换装play吗？'); });
    $('.waifu-tool .fa-camera').mouseover(function () { showMessage('你要给我拍照呀？一二三～茄子～'); });
    $('.waifu-tool .fa-info-circle').mouseover(function () { showMessage('想知道更多关于我的事么？'); });
    $('.waifu-tool .fa-close').mouseover(function () { showMessage('到了要说再见的时候了吗'); });

    $(document).on('mouseover', '.card-title a, .post-title a', function () {
      showMessage('要看看<span style="color:#0099cc;">' + $(this).text() + '</span>么？');
    });
    $(document).on('click', '.card-title a', function () {
      showMessage('加载<span style="color:#0099cc;">' + $(this).text() + '</span>中...请稍候', 600);
    });
    $(document).on('mouseover', '.pn.prev', function () { showMessage('要翻到上一篇吗?'); });
    $(document).on('mouseover', '.pn.next', function () { showMessage('要翻到下一篇吗?'); });
    $(document).on('mouseover', '.post-content a', function () {
      showMessage('去 <span style="color:#0099cc;">' + $(this).text() + '</span> 逛逛吧');
    });
    $('.brand').mouseover(function () { showMessage('点它就可以回到首页啦！'); });

    /* 每 25 秒来一句 */
    window.setInterval(function () { showHitokoto(); }, 25000);
  });
})();
