---
url: /blog/fp7nm9jr/index.md
---
2016年10月5日，谷歌宣布开放一个名为 cartographer 的即时定位与地图建模库，开发人员可以使用该库实现机器人在二维或三维条件下的定位及建图功能。
cartograhper 的设计目的是在计算资源有限的情况下，实时获取相对较高精度的 2D 地图。考虑到基于模拟策略的粒子滤波方法在较大环境下对内存和计算资源的需求较高，cartographer 采用基于优化方法。

本文章记录 cartographer 源码编译的安装方法。

> 安装参考 <https://google-cartographer-ros.readthedocs.io/en/latest/compilation.html>

## Building & Installation

### 安装依赖工具

ROS Noetic 使用如下命令安装依赖工具

```shell
sudo apt-get update
sudo apt-get install -y python3-wstool python3-rosdep ninja-build stow
```

对于更早的版本使用如下命令

```shell
sudo apt-get update
sudo apt-get install -y python-wstool python-rosdep ninja-build stow
```

### 创建工作空间并下载源码

```shell
mkdir cartographer_ws
cd cartographer_ws
wstool init src
wstool merge -t src https://raw.githubusercontent.com/cartographer-project/cartographer_ros/master/cartographer_ros.rosinstall
wstool update -t src
```

### 安装 cartographer\_ros 的依赖项

如果在安装 ROS 已经执行过`sudo rosdep init`，那么该命令的错误可以忽略

```shell
sudo rosdep init
rosdep update
rosdep install --from-paths src --ignore-src --rosdistro=${ROS_DISTRO} -y
```

如果在执行最后一行命令时出现如下错误：

```text
ERROR: the following packages/stacks could not have their rosdep keys resolved
to system dependencies:
cartographer: [libabsl-dev] defined as "not available" for OS version [focal]
```

解决方法是删除 cartographer package 下 package.xml 文件的 line 46 (`<depend>libabsl-dev</depend>`)

> <https://github.com/cartographer-project/cartographer_ros/issues/1726>

Cartographer 需要通过以下脚本手动安装 [abseil-cpp](https://abseil.io/) 库：

```shell
src/cartographer/scripts/install_abseil.sh
```

### Build and install

```shell
catkin_make_isolated --install --use-ninja
```

### 测试 cartographer

下载2D数据包并运行demo

```shell
wget -P ~/cartographer_ws/dataset https://storage.googleapis.com/cartographer-public-data/bags/backpack_2d/cartographer_paper_deutsches_museum.bag
source ~/cartographer_ws/install_isolated/setup.bash
roslaunch cartographer_ros demo_backpack_2d.launch bag_filename:=${HOME}/cartographer_ws/dataset/cartographer_paper_deutsches_museum.bag
```

下载3D数据包并运行demo

```shell
wget -P ~/cartographer_ws/dataset https://storage.googleapis.com/cartographer-public-data/bags/backpack_3d/with_intensities/b3-2016-04-05-14-14-00.bag
source ~/cartographer_ws/install_isolated/setup.bash
roslaunch cartographer_ros demo_backpack_3d.launch bag_filename:=${HOME}/cartographer_ws/dataset/b3-2016-04-05-14-14-00.bag
rosservice call /write_state "{filename: '${HOME}/cartographer_ws/dataset/cartographer_paper_deutsches_museum.bag.pbstream', include_unfinished_submaps: "true"}"
```
