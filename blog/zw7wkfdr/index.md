---
url: /blog/zw7wkfdr/index.md
---
在 WSL2 上安装的 MySQL 无法在 Windows 上直接由 127.0.0.1 访问，在此记录配置 MySQL 远程连接使得 Windows 的 SQL 管理软件可以直接管理 WSL2 里的 MySQL的方法。

首先开启 WSL2 的 systemd：

```shell
vim /etc/wsl.conf
```

然后在其中添加如下内容：

```Ini
[boot]
systemd=true
```

上述也可以用如下指令实现：

```shell
echo -e "[boot]\nsystemd=true" | sudo tee -a /etc/wsl.conf
```

退出 WSL2，使用 `wsl --shutdown` 关闭 WSL2

再次启动 WSL2，安装 MySQL：

```shell
sudo apt install mysql-server
```

修改 `/etc/mysql/mysql.conf.d/mysqld.cnf` 中的 `bind-address` 为 `0.0.0.0`，使得 MySQL 允许外部访问

重启 MySQL，并初始化 MySQL：

```shell
sudo /etc/init.d/mysql restart
sudo mysql_secure_installation
```

进入MySQL，开放外部权限：

```shell
sudo mysql -u root -p
```

```sql
use mysql;
update user set host="%" where user="root";
```

最后更改 iptable 防火墙规则并保存：

```shell
sudo iptables -A INPUT -p tcp -m tcp --dport 3306 -j ACCEPT
sudo iptables-save -c
```

至此便可以让 Windows 通过本地 127.0.0.1:3306 访问 WSL2 的 MySQL Server
