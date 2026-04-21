import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'

export default defineConfig({
  integrations: [
    starlight({
      title: 'Aeron Framework',
      description: 'Bun 原生全栈后端框架文档',
      defaultLocale: 'root',
      locales: {
        root: {
          label: '简体中文',
          lang: 'zh-CN'
        }
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/your-org/aeron' }
      ],
      sidebar: [
        {
          label: '入门指南',
          items: [
            { label: '简介', slug: 'guides/introduction' },
            { label: '快速开始', slug: 'guides/getting-started' },
            { label: '项目结构', slug: 'guides/project-structure' }
          ]
        },
        {
          label: '核心模块',
          items: [
            { label: '应用创建', slug: 'core/app' },
            { label: '路由系统', slug: 'core/router' },
            { label: '中间件', slug: 'core/middleware' },
            { label: '请求上下文', slug: 'core/context' },
            { label: '错误处理', slug: 'core/errors' },
            { label: '配置管理', slug: 'core/config' },
            { label: '生命周期', slug: 'core/lifecycle' },
            { label: '健康检查', slug: 'core/health' },
            { label: '限流', slug: 'core/rate-limit' },
            { label: 'A/B 测试', slug: 'core/ab-testing' },
            { label: '插件系统', slug: 'core/plugins' }
          ]
        },
        {
          label: '数据库模块',
          items: [
            { label: '连接池', slug: 'database/connection' },
            { label: '查询构建器', slug: 'database/query-builder' },
            { label: '迁移系统', slug: 'database/migrations' },
            { label: '事务管理', slug: 'database/transactions' },
            { label: '分页', slug: 'database/pagination' }
          ]
        },
        {
          label: '缓存模块',
          items: [
            { label: '缓存层', slug: 'cache/overview' },
            { label: '内存适配器', slug: 'cache/memory' },
            { label: 'Redis 适配器', slug: 'cache/redis' }
          ]
        },
        {
          label: '认证模块',
          items: [
            { label: 'JWT 认证', slug: 'auth/jwt' },
            { label: 'RBAC 权限', slug: 'auth/rbac' },
            { label: 'OAuth 2.0', slug: 'auth/oauth' },
            { label: '会话管理', slug: 'auth/session' },
            { label: 'MFA 多因素认证', slug: 'auth/mfa' },
            { label: 'API 密钥', slug: 'auth/api-keys' }
          ]
        },
        {
          label: '事件模块',
          items: [
            { label: '事件总线', slug: 'events/event-bus' },
            { label: '消息队列', slug: 'events/message-queue' },
            { label: '事件溯源', slug: 'events/event-sourcing' },
            { label: '定时任务', slug: 'events/scheduler' },
            { label: 'Webhook', slug: 'events/webhook' }
          ]
        },
        {
          label: '可观测性',
          items: [
            { label: '结构化日志', slug: 'observability/logging' },
            { label: '指标收集', slug: 'observability/metrics' },
            { label: '分布式追踪', slug: 'observability/tracing' },
            { label: '告警系统', slug: 'observability/alerts' }
          ]
        },
        {
          label: 'OpenAPI',
          items: [
            { label: 'Schema 定义', slug: 'openapi/schema' },
            { label: '请求验证', slug: 'openapi/validation' }
          ]
        },
        {
          label: '测试工具',
          items: [
            { label: '测试应用', slug: 'testing/test-app' },
            { label: 'Mock 工具', slug: 'testing/mocks' }
          ]
        },
        {
          label: 'AI 模块',
          items: [
            { label: 'LLM 适配器', slug: 'ai/llm' },
            { label: 'RAG 流水线', slug: 'ai/rag' },
            { label: '流式响应', slug: 'ai/streaming' }
          ]
        }
      ]
    })
  ]
})
