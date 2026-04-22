---
title: 在终端中将文本文件内容复制到系统剪贴板
tags:
  - 终端
createTime: 2025/04/22 11:03:14
permalink: /blog/p46jp1i4/
---

## 在终端中将文本文件内容复制到系统剪贴板

对于不同的系统，需要使用不同工具实现

### Linux 系统

在 Linux 上，通常需要使用 `xclip` 或 `xsel` 等外部工具。

::: code-tabs
@tab Arch Linux

```bash
sudo pacman -S xclip
```

@tab Ubuntu/Debian

```bash
sudo apt install xclip
```

:::

使用以下命令将文件内容复制到剪贴板：

```bash
xclip -selection clipboard < README.md
```

### macOS 系统

macOS 自带了 `pbcopy` 命令

```bash
pbcopy < README.md
```

### Windows 系统

在 Windows 10 (1803版本) 及更高版本中，可以使用内置的 `clip` 命令。

```cmd
clip < README.md
```
