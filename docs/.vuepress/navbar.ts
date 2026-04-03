/**
 * @see https://theme-plume.vuejs.press/config/navigation/ 查看文档了解配置详情
 *
 * Navbar 配置文件，它在 `.vuepress/plume.config.ts` 中被导入。
 */

import { defineNavbarConfig } from 'vuepress-theme-plume'

export default defineNavbarConfig([
  { text: '首页', link: '/', icon: 'material-symbols:home' },
  {
    text: '博客',
    link: '/blog/',
    activeMatch: '^/(blog|article)/',
    icon: 'material-symbols:menu-book',
  },
  { text: '标签', link: '/blog/tags/', icon: 'material-symbols:label' },
  { text: '归档', link: '/blog/archives/', icon: 'material-symbols:archive' },
  // {
  //   text: '笔记',
  //   items: [{ text: '示例', link: '/demo/README.md' }]
  // },
])
