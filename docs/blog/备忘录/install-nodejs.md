---
title: Linux 中安装 Nodejs
tags:
  - Node.js
  - Linux
  - 安装
createTime: 2024/02/04 16:09:28
permalink: /blog/e0ngjhov/
---

安装 Nodejs 的一种方法。在 Linux 中安装编译好的程序大抵都是如此。

在 Node.js 官网中可下载源码或编译完成的包：

> <https://nodejs.org/en>

在此以编译完成的压缩包 `node-v20.11.0-linux-x64.tar.xz` 为例

1. 解压缩文件：

    ```shell
    tar -xf node-v20.11.0-linux-x64.tar.xz
    ```

2. 移动文件：

    为了方便管理，将它移动到一个合适的位置，比如 `/usr/local/`。

    ```shell
    sudo mv node-v20.11.0-linux-x64 /usr/local/
    ```

3. 设置环境变量：

    为了能够在终端中直接使用 `node` 和 `npm` 命令，将 `bin` 目录添加到系统的 `PATH` 环境变量中。在 `shell` 配置文件 `.bashrc` 添加：

    ```shell
    export PATH=/usr/local/node-v20.11.0-linux-x64/bin:$PATH
    ```

    重启终端或运行以下命令使配置生效：

    ```shell
    source ~/.bashrc
    ```

4. 验证安装：

    运行以下命令来验证 `Node.js` 和 `npm` 是否成功安装：

    ```shell
    node -v
    npm -v
    ```

    如果安装成功，你将看到对应的版本号信息。