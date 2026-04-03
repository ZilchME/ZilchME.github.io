---
title: 在 Linux 中让 matplotlib 能正常显示中文的一种方式
tags:
    - matplotlib
    - Linux
createTime: 2023/04/16 18:11:16
permalink: /blog/wwjev5pu/
---

记录一个实测成功且较为简单的方法。

## 安装 simhei.ttf 字体

从 Windows 上拷贝 simhei.ttf 字体，位置：```C:/Windows/Fonts/simhei.ttf```
然后安装到 Linux，如果是 GUI 可以直接打开 ttf 文件点击安装

刷新字体：

```shell
sudo fc-cache -f -v
```

## 清除 matplotlib 字体缓存

查看 matplotlib 字体缓存目录

```python
import matplotlib as plt
plt.get_cachedir()
```

删除该目录，下次使用时就会自动刷新缓存

```shell
rm -rf /home/xxx/.cache/matplotlib
```

## 指定使用字体

每次使用时在 python 中指定字体，即可正常显示中文

```python
import matplotlib.pyplot as plt
plt.rcParams['font.sans-serif'] = ['SimHei']
```