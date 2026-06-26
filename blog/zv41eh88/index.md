---
url: /blog/zv41eh88/index.md
---
一种较快且稳定安装 CUDA 及 cuDNN 的方法。

## 安装 nVidia 显卡驱动

首先需要确保安装了 nVidia 的驱动，安装方法在此不赘述。
如果安装了可以在终端中查看显卡信息，包括支持的 CUDA 最大版本

```shell
nvidia-smi
```

## 安装 CUDA

在 nVidia 官网选择需要下载的版本，为了兼容 PyTorch 我选择了11.8：
<https://developer.nvidia.com/cuda-11-8-0-download-archive>
Ubuntu 版官方给出了三种安装方式：deb(local), deb(network), runfile(local)
在此推荐使用 runfile，因为 deb 会自动覆盖安装显卡驱动，而 runfile 在安装过程中可以选择是否安装显卡驱动。
**CUDA 安装包自带的显卡驱动不一定能完美适配你的显卡，故可能带来一些问题，故建议如果当前安装的驱动没明显问题不随意更换驱动**
**在 Ubuntu 的附加驱动上安装显卡驱动可能会导致安装的 CUDA 失效(?)，在安装完CUDA后也不建议随意更换驱动**

```shell
wget https://developer.download.nvidia.com/compute/cuda/11.8.0/local_installers/cuda_11.8.0_520.61.05_linux.run
sudo sh cuda_11.8.0_520.61.05_linux.run
```

## 检测 CUDA 安装

终端中输入

```shell
nvcc -V
```

如果正常显示 CUDA 版本等信息则说明安装成功

如果不显示，也可能只是环境变量未配置，根据 CUDA 的安装目录，在`~/.bashrc`文件中添加环境变量：

```shell
export PATH="/usr/local/cuda-11.8/bin:$PATH"
export LD_LIBRARY_PATH="/usr/local/cuda-11.8/lib64:$LD_LIBRARY_PATH"
```

使用`source ~/.bashrc`刷新环境变量，或者重启终端后再尝试即可

## 安装 cuDNN

在如下链接可以下载历史版本的 cuDNN，需要登录 nVidia账号：
<https://developer.nvidia.com/rdp/cudnn-archive>
安装方法可以参考官方的文档：
<https://docs.nvidia.com/deeplearning/cudnn/install-guide/index.html>

1.下载所需版本的 Deb 文件

2.使用 dpkg 安装所得 Deb文件

```shell
sudo dpkg -i cudnn-local-repo-${distro}-8.x.x.x_1.0-1_amd64.deb
```

3.前往/var/cudnn-local-repo-${distro}-8.x.x.x/目录，安装相关库文件

```shell
sudo dpkg -i libcudnn8_8.x.x.x-1+cudaX.Y_amd64.deb 
sudo dpkg -i libcudnn8-dev_8.x.x.x-1+cudaX.Y_amd64.deb 
sudo dpkg -i libcudnn8-samples_8.x.x.x-1+cudaX.Y_amd64.deb   
```

## 测试 cuDNN 安装

```shell
cp -r /usr/src/cudnn_samples_v8/ $HOME
cd  $HOME/cudnn_samples_v8/mnistCUDNN
make clean && make
./mnistCUDNN
```

在 make 时可能会存在库缺失的报错，这不一定是 cuDNN 的问题。

例如我在验证时报错：

```text
test.c:1:10: fatal error: FreeImage.h: 没有那个文件或目录
    1 | #include "FreeImage.h"
      |          ^~~~~~~~~~~~~
compilation terminated.
>>> WARNING - FreeImage is not set up correctly. Please ensure FreeImage is set up correctly. <<<
```

解决方案是安装 FreeImage 库就行

```shell
sudo apt-get update
sudo apt-get install libfreeimage-dev
```

如果成果安装 cuDNN，最后运行 mnistCUDNN 时最后一行输出

```text
Test passed!
```
