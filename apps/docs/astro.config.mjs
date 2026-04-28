import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'

import cloudflare from '@astrojs/cloudflare';
import node from '@astrojs/node';

// 本地开发时可通过 SKIP_CF_ADAPTER=true 切换到 Node adapter，
// 避免 wrangler 远程认证失败。部署时保持默认 Cloudflare adapter。
const useCloudflare = process.env.SKIP_CF_ADAPTER !== 'true';

export default defineConfig({
  output: 'server',
  integrations: [
    starlight({
      title: 'VentoStack',
      description: 'Bun 原生全栈框架文档',
      defaultLocale: 'root',
      locales: {
        root: {
          label: '简体中文',
          lang: 'zh-CN'
        }
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/Ventorium/VentoStack' }
      ],
      editLink: {
        baseUrl: 'https://github.com/Ventorium/VentoStack/edit/main/apps/docs/'
      },
      components: {
        Header: './src/components/Header.astro',
        Sidebar: './src/components/Sidebar.astro',
        Search: './src/components/SearchDialog.astro',
      },
      sidebar: [
        // ===== 框架层 =====
        {
          label: '入门指南',
          autogenerate: { directory: 'framework/guides' }
        },
        {
          label: '核心模块',
          autogenerate: { directory: 'framework/core' }
        },
        {
          label: '数据库模块',
          autogenerate: { directory: 'framework/database' }
        },
        {
          label: '缓存模块',
          autogenerate: { directory: 'framework/cache' }
        },
        {
          label: '认证模块',
          autogenerate: { directory: 'framework/auth' }
        },
        {
          label: '事件模块',
          autogenerate: { directory: 'framework/events' }
        },
        {
          label: '可观测性',
          autogenerate: { directory: 'framework/observability' }
        },
        {
          label: 'OpenAPI',
          autogenerate: { directory: 'framework/openapi' }
        },
        {
          label: '测试工具',
          autogenerate: { directory: 'framework/testing' }
        },
        {
          label: 'AI 模块',
          autogenerate: { directory: 'framework/ai' }
        },

        // ===== 平台层 =====
        {
          label: '系统管理',
          autogenerate: { directory: 'platform/system' }
        },
        {
          label: '文件存储',
          autogenerate: { directory: 'platform/oss' }
        },
        {
          label: '任务调度',
          autogenerate: { directory: 'platform/scheduler' }
        },
        {
          label: '代码生成',
          autogenerate: { directory: 'platform/gen' }
        },
        {
          label: '系统监控',
          autogenerate: { directory: 'platform/monitor' }
        },
        {
          label: '消息中心',
          autogenerate: { directory: 'platform/notification' }
        }
      ]
    })
  ],

  adapter: useCloudflare
    ? cloudflare({
        prerenderEnvironment: 'node',
        remoteBindings: false,
      })
    : node({ mode: 'standalone' })
})
