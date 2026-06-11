import type { Thread, ChatMessage, Skill, ModelOption } from "./types";

export const MOCK_THREADS: Thread[] = [
  {
    id: "1",
    title: "线上服务器系统查询",
    lastMessage: "Ubuntu 26.04 LTS, Proxmox VE",
    updatedAt: "2 分钟前",
    agentName: "新助手",
    unread: 0,
  },
  {
    id: "2",
    title: "数据库性能优化方案",
    lastMessage: "已给出索引优化建议",
    updatedAt: "1 小时前",
    agentName: "新助手",
  },
  {
    id: "3",
    title: "Dockerfile 构建排查",
    lastMessage: "多阶段构建已完成",
    updatedAt: "3 小时前",
    agentName: "新助手",
  },
  {
    id: "4",
    title: "前端路由配置问题",
    lastMessage: "vite-plugin-pages 配置已修复",
    updatedAt: "昨天",
  },
  {
    id: "5",
    title: "Nginx 反向代理配置",
    lastMessage: "HTTPS 已配置完成",
    updatedAt: "2 天前",
  },
  {
    id: "6",
    title: "Redis 缓存策略设计",
    lastMessage: "多级缓存方案已确认",
    updatedAt: "3 天前",
  },
];

export const MOCK_MESSAGES: ChatMessage[] = [
  {
    id: "u1",
    role: "user",
    content: "线上服务器是什么系统？",
    timestamp: "14:32",
  },
  {
    id: "a1",
    role: "assistant",
    content:
      "你的线上服务器（10.0.4.1）运行的是：\n\n• **系统**：Linux\n• **发行版**：Ubuntu 26.04 LTS（Resolute Raccoon）\n• **内核**：7.0.2-4-pve（Proxmox 内核，x86_64 架构）\n• **内核版本**：#1 SMP PREEMPT_DYNAMIC PMX 7.0.2-4（2026-05-15）\n\n简单来说，是一台运行 Ubuntu 26.04 LTS 的 Linux 服务器，宿主机用的是 Proxmox VE。",
    timestamp: "14:33",
    model: "DeepSeek V4 Flash",
    tokensUsed: { input: 28560, output: 22144 },
    steps: [
      { id: "s1", type: "thinking", name: "已思考", description: "理解用户意图", durationMs: 1000, status: "completed" },
      { id: "s2", type: "skill", name: "Skill - terminal:ssh", description: "加载 SSH 终端技能", durationMs: 268, status: "completed" },
      { id: "s3", type: "thinking", name: "已思考", description: "规划执行步骤", durationMs: 5000, status: "completed" },
      { id: "s4", type: "bash", name: "Bash", description: "List configured SSH servers", durationMs: 313, status: "completed" },
      { id: "s5", type: "thinking", name: "已思考", description: "分析 SSH 配置", durationMs: 800, status: "completed" },
      { id: "s6", type: "bash", name: "Bash", description: "Check remote server OS via uname -a", durationMs: 694, status: "completed" },
      { id: "s7", type: "bash", name: "Bash", description: "Check Linux distribution details", durationMs: 741, status: "completed" },
    ],
  },
  {
    id: "u2",
    role: "user",
    content: "能看一下服务器的内存使用情况吗？",
    timestamp: "14:35",
  },
  {
    id: "a2",
    role: "assistant",
    content:
      "已查看服务器内存使用情况：\n\n| 项目 | 数值 |\n|------|------|\n| 总内存 | 32 GB |\n| 已使用 | 18.7 GB (58.4%) |\n| 可用 | 13.3 GB |\n| Swap | 8 GB (未使用) |\n\n内存使用率处于正常范围，无需特别关注。",
    timestamp: "14:36",
    model: "DeepSeek V4 Flash",
    tokensUsed: { input: 6200, output: 167000 },
    steps: [
      { id: "s8", type: "thinking", name: "已思考", description: "理解任务", durationMs: 800, status: "completed" },
      { id: "s9", type: "skill", name: "Skill - terminal:ssh", description: "使用 SSH 技能", durationMs: 120, status: "completed" },
      { id: "s10", type: "bash", name: "Bash", description: "free -h", durationMs: 450, status: "completed" },
      { id: "s11", type: "bash", name: "Bash", description: "cat /proc/meminfo | head -20", durationMs: 230, status: "completed" },
    ],
  },
];

export const MOCK_SKILLS: Skill[] = [
  {
    id: "terminal",
    name: "Terminal",
    icon: "terminal",
    color: "#FF7A1A",
    description: "Tokimo Terminal — 本地与远程终端管理",
    enabledCount: 1,
    totalCount: 5,
    capabilities: [
      { id: "terminal:ssh", name: "terminal:ssh", description: "Manage SSH servers and run remote commands.", enabled: true, readonly: true },
      { id: "terminal:local", name: "terminal:local", description: "Execute local terminal commands.", enabled: false },
      { id: "terminal:logs", name: "terminal:logs", description: "View and search system logs.", enabled: false },
      { id: "terminal:process", name: "terminal:process", description: "Manage system processes.", enabled: false },
      { id: "terminal:network", name: "terminal:network", description: "Network diagnostics and configuration.", enabled: false },
    ],
  },
  {
    id: "finder",
    name: "Finder",
    icon: "folder",
    color: "#3B82F6",
    description: "文件搜索与管理",
    enabledCount: 0,
    totalCount: 3,
    capabilities: [
      { id: "finder:search", name: "finder:search", description: "Search files by name or content.", enabled: false },
      { id: "finder:read", name: "finder:read", description: "Read file contents.", enabled: false },
      { id: "finder:write", name: "finder:write", description: "Write or modify files.", enabled: false },
    ],
  },
  {
    id: "mail",
    name: "Mail",
    icon: "mail",
    color: "#22C55E",
    description: "邮件收发与管理",
    enabledCount: 0,
    totalCount: 2,
    capabilities: [
      { id: "mail:send", name: "mail:send", description: "Send emails via SMTP.", enabled: false },
      { id: "mail:read", name: "mail:read", description: "Read and search mailbox.", enabled: false },
    ],
  },
  {
    id: "apple-music",
    name: "Apple Music",
    icon: "music",
    color: "#EC4899",
    description: "Apple Music 播放控制",
    enabledCount: 0,
    totalCount: 2,
    capabilities: [
      { id: "music:play", name: "music:play", description: "Play, pause, skip tracks.", enabled: false },
      { id: "music:search", name: "music:search", description: "Search songs and playlists.", enabled: false },
    ],
  },
  {
    id: "home-assistant",
    name: "Home Assistant",
    icon: "home",
    color: "#F59E0B",
    description: "智能家居设备控制",
    enabledCount: 0,
    totalCount: 3,
    capabilities: [
      { id: "ha:devices", name: "ha:devices", description: "List and control smart devices.", enabled: false },
      { id: "ha:automations", name: "ha:automations", description: "Manage automations.", enabled: false },
      { id: "ha:scenes", name: "ha:scenes", description: "Activate scenes.", enabled: false },
    ],
  },
];

export const MOCK_MODELS: ModelOption[] = [
  { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", provider: "DeepSeek", contextWindow: 167000 },
  { id: "deepseek-v4", name: "DeepSeek V4", provider: "DeepSeek", contextWindow: 128000 },
  { id: "gpt-4.1-mini", name: "GPT-4.1 Mini", provider: "OpenAI", contextWindow: 1000000 },
  { id: "claude-sonnet-4", name: "Claude Sonnet 4", provider: "Anthropic", contextWindow: 200000 },
];
