---
title: "Self-built Node(vps -> vpn)"
date: 2026-05-11
categories: [未分类]
slug: self-built-nodevps-vpn
wordpress_id: 119
---

## First Step

choose VPS (servise) preferably from abroad [传家宝VPS监控 - 实时库存补货与优惠码 | 搬瓦工/DMIT/RackNerd/NetCup](<https://legacyvps.com/scanidc>) https://legacyvps.com/scanidc https://d.m123.org control panel from racknerd https://nerdvm.racknerd.com/login.php 

## second

open shell (win + r, input cmd) 
    
    
    ssh root@23.95.245.137 -p 22

23.95.245.137 is your vps ip that recive at email then input yes when first coming input password 123456 

## third

install s-ui 
    
    
    VERSION=1.3.10 && bash <(curl -Ls https://raw.githubusercontent.com/bulianglin/demo/main/s-ui-install.sh) $VERSION

done that save username and password , ip [![](/images/2026/05/55-150x150.png)](</images/2026/05/55.png>) later input to select minimum latency to test handsnake and select DNS 
    
    
    for d in go.microsoft.com consent.trustarc.com apps.apple.com intelcorp.scene7.com cdn.bizibly.com ms-vscode.gallerycdn.vsassets.io digitalassets.tesla.com r.bing.com configuration.ls.apple.com iosapps.itunes.apple.com ; do t1=$(date +%s%3N); timeout 1 openssl s_client -connect $d:443 -servername $d </dev/null &>/dev/null && t2=$(date +%s%3N) && echo "$d: $((t2 - t1)) ms" || echo "$d: timeout"; done save dns :rum.hlx.page

input exit

then connect VPS
    
    
    ssh -L 2095:127.0.0.1:2095 root@23.95.245.137

later input http://127.0.0.1:2095/app/ at browser

## Final [![](/images/2026/05/57-150x150.png)](</images/2026/05/57.png>)

then select TLS setting [![](/images/2026/05/58-150x150.png)](</images/2026/05/58.png>) add VLESS AND TUIC proctol [![](/images/2026/05/59-150x150.png)](</images/2026/05/59.png>) [![](/images/2026/05/60-150x150.png)](</images/2026/05/60.png>)   then click inbound management [![](/images/2026/05/61-150x150.png)](</images/2026/05/61.png>) all select port 433 finial [![](/images/2026/05/62-150x150.png)](</images/2026/05/62.png>) then load into v2ray https://github.com/2dust/v2rayN/releases/tag/7.12.7 done reference [【零基础】2026最新保姆级纯小白节点搭建教程，人人都能学会，目前最简单、最安全、最稳定的专属节点搭建方法，手把手自建节点搭建教学，晚高峰高速稳定，4K秒开的科学上网线路体验](<https://www.youtube.com/watch?v=MgtOAVOXBWo>) https://www.youtube.com/watch?v=MgtOAVOXBWo
