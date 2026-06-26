---
url: /blog/7g4bj8uj/index.md
---
由于qt版本，fcitx5-config 只能安装在 Ubuntu 20.10 以上版本，低于此版本直接用 apt 安装的话无法使用 GUI 进行配置。在此记录一次在 Ubuntu 20.04 上从 flatpak 安装 fcitx5

## 安装 flatpak

```shell
sudo add-apt-repository ppa:flatpak/stable
sudo apt update
sudo apt install flatpak
sudo apt install gnome-software-plugin-flatpak
flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
```

## 安装 fcitx5

### 添加 flatub 仓库

```shell
# 如果使用的是旧版flatpak，在安装的时候会需要显示的指定软件仓库名字: flatpak install flathub org.fcitx.Fcitx5
flatpak install org.fcitx.Fcitx5
# 安装 fcitx5 输入法引擎, 例如fcitx5-chinese-addons, or mozc
flatpak install org.fcitx.Fcitx5.Addon.ChineseAddons # 中文输入法
# flatpak install org.fcitx.Fcitx5.Addon.Mozc 
```

### 安装 fcitx5 后端

```shell
sudo apt install fcitx5-frontend-gtk2 fcitx5-frontend-gtk3 fcitx5-frontend-qt5
```

### 配置环境变量

```shell
sudo vim /etc/profile
```

在末尾添加如下内容

```shell
export XMODIFIERS=@im=fcitx
export GTK_IM_MODULE=fcitx
export QT_IM_MODULE=fcitx
```

### 设置开机启动

我是直接在 gnome-tweak 里设置的，如果懂的也可以用其他办法~~（但是我不会）~~

### 一些简单配置

#### 安装词库

下载`*.dict`文件，放置到 `~/.local/share/fcitx5/pinyin/dictionaries`目录

这里由于一些迷之原因，刚装好的时候并没有找到这个目录，后来可能是我在GUI上配置了一些东西吧它就创建了（纯猜测）

附带两个词库连接：
[萌娘百科词库](https://github.com/outloudvi/mw2fcitx/tree/20220114)
[wiki中文词库](https://github.com/felixonmars/fcitx5-pinyin-zhwiki/tree/0.2.3)

#### 安装主题

下载主题，放置到 `~/.local/share/fcitx5/themes` 目录，之后在 `配置—附加组件—经典用户界面` 中切换

## 参考链接

> <https://ouyen.github.io/fcitx5-ubuntu/>
