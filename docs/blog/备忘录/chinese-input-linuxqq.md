---
title: 解决 Hyprland Linux QQ 中文输入法问题
tags:
  - Linux
  - Desktop
createTime: 2025/04/29 14:02:04
permalink: /blog/hqtyrlwg/
---

`Hyprland`桌面，`QQ`无法使用`fcitx5`输入中文，在此记录解决方法。

首先尝试添加如下参数打开qq

```bash
linuxqq --ozone-platform-hint=auto --enable-wayland-ime
```

打开成功且输入法使用成功的话，那么可以继续

## 方法一：修改快捷方式

找到对应的 `qq.desktop` 文件并在 `Exec` 行添加启动参数 `--ozone-platform-hint=auto --enable-wayland-ime`

```pain
Exec=linuxqq %U --ozone-platform-hint=auto --enable-wayland-ime`
```

## 方法二：修改启动脚本

缺点是以后升级版本大概率要重新修改

```bash
sudo vim /usr/bin/linuxqq
```

在中间添加环境变量，并修改最后一行：

```bash
export GTK_IM_MODULE=fcitx
export QT_IM_MODULE=fcitx
export XMODIFIERS=@im=fcitx

# exec /opt/QQ/qq ${QQ_USER_FLAGS[@]} "$@"
exec /opt/QQ/qq ${QQ_USER_FLAGS[@]} --ozone-platform-hint=auto --enable-wayland-ime "$@"
```
