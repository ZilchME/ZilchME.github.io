---
url: /blog/zh4c3f22/index.md
---
旧版本博客使用 Hexo + NexT 主题搭建，新版迁移至 VuePress + Plume 主题搭建。
再次记录下 Hexo 的安装及个人初始化过程。

## 部署静态网页至 GitHub

1. 安装 [hexo-deployer-git](https://github.com/hexojs/hexo-deployer-git)

```shell
npm install hexo-deployer-git --save
```

2. 在 `_config.yml` 中配置：

```yml
deploy:
  type: git
  repo: <repository url> # https://bitbucket.org/JohnSmith/johnsmith.bitbucket.io
  branch: [branch]
  message: [message]
```

3. 使用 `hexo clean && hexo deploy` 部署至 GitHub

## 配置 NexT 主题

NexT 主题仓库 https://github.com/theme-next/hexo-theme-next

### 安装主题

直接将仓库克隆至 `themes/next` 即可：

```shell
git clone https://github.com/theme-next/hexo-theme-next themes/next
```

随后在  `_config.yml` 中启用主题：

```yaml
theme: next
```

### 更新主题

直接拉取最新仓库即可更新主题：

```shell
cd themes/next
git pull
```

## 个性化设置

### 网站描述

在 `_config.yml` 中配置：

```yaml
# Site
title: 未知领域
subtitle: ''
description: 摸了
keywords:
author: Danny Lee
language: zh-CN
timezone: Asia/Shanghai
```

### 建站时间

在主题配置文件 `themes/next/_config.yml` 中配置：

```yaml
footer:
  # Specify the date when the site was setup. If not defined, current year will be used.
  since: 2023   #建站时间
```

### 显示文章字数和阅读时长

安装插件：

```shell
npm install hexo-symbols-count-time
```

在 `_config.yml` 中添加：

```yaml
symbols_count_time:
  symbols: true
  time: true
  total_symbols: true
  total_time: true
  exclude_codeblock: false
  awl: 4
  wpm: 275
  suffix: "mins."
```

在主题配置文件 `themes/next/_config.yml` 中配置：

```yaml
# Post wordcount display settings
# Dependencies: https://github.com/theme-next/hexo-symbols-count-time
symbols_count_time:
 separated_meta: true
 item_text_post: true
 item_text_total: true
```

### canvas 背景彩带

参见 https://github.com/theme-next/theme-next-canvas-ribbon

### mathjax 公式

在主题配置文件 `themes/next/_config.yml` 中配置：

```yaml
mathjax:
    enable: true
    mhchem: false  # 用来写化学方程式
```

### 透明背景

站点根目录创建文件 `/source/_data/styles.styl` 并填入如下配置：

```stylus
:root {
  --content-bg-color:rgba(255, 255, 255, 0.8);
}
```

并在主题配置文件 `themes/next/_config.yml` 中配置：

```yaml
# Define custom file paths.
# Create your custom files in site directory `source/_data` and uncomment needed files below.
custom_file_path:
  style: source/_data/styles.styl
```

### 圆角边框

站点根目录创建文件 `/source/_data/variables.styl` 并填入如下配置：

```stylus
$border-radius-inner     = 10px;
$border-radius           = 10px;
```

同时在 `/source/_data/styles.styl` 添加如下配置：

```stylus
.sidebar {
  border-radius: 10px;
}
```

并在主题配置文件 `themes/next/_config.yml` 中配置：

```yaml
# Define custom file paths.
# Create your custom files in site directory `source/_data` and uncomment needed files below.
custom_file_path:
  variable: source/_data/variables.styl
  style: source/_data/styles.styl
```

### 边框阴影

将 `themes/next/source/css/_common/components/post/post.styl` 的 `.use-motion` 中的

```stylus
  if (hexo-config('motion.transition.post_block')) {
    .post-block, .pagination, .comments {
      opacity: 0;
    }
  }
```

改为:

```stylus
  if (hexo-config('motion.transition.post_block')) {
    .post-block {
      opacity: 0;
      margin-top: 60px;
      margin-bottom: 60px;
      padding: 25px;
      background:rgba(255,255,255,0.9) none repeat scroll !important;
      -webkit-box-shadow: 0 0 5px rgba(156, 156, 156, 0.5);
      -moz-box-shadow: 0 0 5px rgba(104, 104, 104, 0.5);
    }
    .pagination, .comments{
      opacity: 0;
    }
  }
```

### 本地搜索

安装插件：

```shell
npm install hexo-generator-searchdb
```

并在主题配置文件 `themes/next/_config.yml` 中配置：

```yaml
# Local Search
# Dependencies: https://github.com/theme-next/hexo-generator-searchdb
local_search:
  enable: true
  # If auto, trigger search by changing input.
  # If manual, trigger search by pressing enter key or search button.
  trigger: auto
  # Show top n results per article, show all results by setting to -1
  top_n_per_article: 1
  # Unescape html strings to the readable one.
  unescape: false
  # Preload the search data when the page loads.
  preload: false
```

### 配置代码块

根据注释提示以及实际需求在主题配置文件 `themes/next/_config.yml` 中配置：

```yaml
codeblock:
  # Code Highlight theme
  # Available values: normal | night | night eighties | night blue | night bright | solarized | solarized dark | galactic
  # See: https://github.com/chriskempson/tomorrow-theme
  highlight_theme: night eighties 
  # Add copy button on codeblock
  copy_button:
    enable: true
    # Show text copy result.
    show_result: true
    # Available values: default | flat | mac
    style: mac
```

### 配置文章置顶

Hexo 本身并没有内置文章置顶功能，但有一个默认的对文章排序的组件 `hexo-generator-index`，也就是在站点配置文件内的 `index_generator` 选项，置顶功能本质上是一个排序组件，故需要替换依赖项：

```shell
npm uninstall hexo-generator-index --save
npm install hexo-generator-index-pin-top --save
```

插件安装完之后，只需要在文章头部信息栏内设置 `top` 属性即可：

```markdown
---
title: 写在最前面
hide: false
top: true
---
```

为了能有个比较突出的标志，可以在 `themes/next/layout/_macro/post.swig` 文件中找到 `<div class="post-meta">` 并添加代码：

```html
{% if post.top %}
<span class="post-meta-item-icon">
    <i class="fa fa-thumbtack" style="color: #165C91"></i>
</span>
<font color=#165C91 ><b>置顶</b></font>
<span class="post-meta-divider">|</span>
{% endif %}
```

### 配置超链接颜色

在 `themes/next/source/css/_common/components/post/post.styl` 最后添加：

```stylus
.post-body p a{
  color: #0593d3;
  border-bottom: none;
  &:hover {
    color: #0477ab;
    text-decoration: underline;
  }
}
```
