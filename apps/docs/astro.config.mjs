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
          items: [
            {
              label: '应用与路由',
              items: [
                'framework/core/app',
                'framework/core/router',
                'framework/core/context',
                'framework/core/middleware',
                'framework/core/lifecycle',
                'framework/core/plugins',
                'framework/core/module',
                'framework/core/auto-bind',
              ]
            },
            {
              label: '请求处理',
              items: [
                'framework/core/validator',
                'framework/core/content-negotiation',
                'framework/core/upload',
                'framework/core/client-ip',
                'framework/core/interceptor',
                'framework/core/hooks',
              ]
            },
            {
              label: '配置管理',
              items: [
                'framework/core/config',
                'framework/core/config-watch',
                'framework/core/config-encryption',
                'framework/core/yaml-config',
                'framework/core/twelve-factor',
              ]
            },
            {
              label: '安全防护',
              items: [
                'framework/core/csrf',
                'framework/core/xss',
                'framework/core/ssrf',
                'framework/core/hmac',
                'framework/core/ip-filter',
                'framework/core/cors',
                'framework/core/https',
                'framework/core/rate-limit',
                'framework/core/timeout',
                'framework/core/errors',
                'framework/core/circuit-breaker',
              ]
            },
            {
              label: '基础设施',
              items: [
                'framework/core/tenant',
                'framework/core/ab-testing',
                'framework/core/feature-toggle',
                'framework/core/worker-pool',
                'framework/core/pool-manager',
                'framework/core/hot-restart',
                'framework/core/instance-coordinator',
              ]
            },
            {
              label: '网络协议',
              items: [
                'framework/core/websocket',
                'framework/core/grpc',
                'framework/core/rpc',
                'framework/core/request-id',
                'framework/core/static',
                'framework/core/logger',
              ]
            },
          ]
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
          label: 'Webhook 模块',
          autogenerate: { directory: 'framework/webhook' }
        },
        {
          label: 'CLI 工具',
          autogenerate: { directory: 'framework/cli' }
        },

        // ===== 平台层 =====
        {
          label: '平台启动',
          autogenerate: { directory: 'platform/boot' }
        },
        {
          label: '认证授权',
          autogenerate: { directory: 'platform/auth' }
        },
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
          label: '工作流',
          autogenerate: { directory: 'platform/workflow' }
        },
        {
          label: '国际化',
          autogenerate: { directory: 'platform/i18n' }
        },
        {
          label: '系统监控',
          autogenerate: { directory: 'platform/monitor' }
        },
        {
          label: '消息中心',
          autogenerate: { directory: 'platform/notification' }
        },
        {
          label: 'AI 模块',
          autogenerate: { directory: 'platform/ai' }
        },
        {
          label: '第三方集成',
          autogenerate: { directory: 'platform/integration' }
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
