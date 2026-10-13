import {
  DatabaseOutlined,
  FileOutlined,
  NodeIndexOutlined,
  SoundOutlined,
} from '@ant-design/icons';
import { Space, Tabs, Tag } from 'antd';

/** 功能页签：对话输入区与侧边面板共用同一套 key（由父页面持有 activeTab 状态） */
export interface ChatTab {
  key: string;
  label: string;
  icon: React.ReactNode;
  /** 仅管理员可见的页签（上下文洞察属调试信息） */
  adminOnly?: boolean;
}

export const CHAT_TABS: ChatTab[] = [
  { key: 'chat', label: '对话', icon: <SoundOutlined /> },
  { key: 'files', label: '文件', icon: <FileOutlined /> },
  { key: 'memory', label: '记忆', icon: <DatabaseOutlined /> },
  { key: 'knowledge', label: '知识库', icon: <DatabaseOutlined /> },
  { key: 'context', label: '上下文', icon: <NodeIndexOutlined />, adminOnly: true },
];

interface FunctionTabsProps {
  activeTab: string;
  onTabChange?: (key: string) => void;
  /** 管理员 + 当前 Agent 开启上下文采集时才展示「上下文」页签 */
  canViewContext?: boolean;
  /** 工作区文件数（>0 时在「文件」页签上挂角标） */
  fileCount?: number;
  className?: string;
}

export default function FunctionTabs({
  activeTab,
  onTabChange,
  canViewContext = false,
  fileCount = 0,
  className,
}: FunctionTabsProps): React.ReactElement {
  return (
    <Tabs
      activeKey={activeTab}
      onChange={(key) => onTabChange?.(key)}
      size="small"
      items={CHAT_TABS.filter((tab) => !tab.adminOnly || canViewContext).map((tab) => ({
        key: tab.key,
        label: (
          <Space size={4}>
            {tab.icon}
            <span>{tab.label}</span>
            {tab.key === 'files' && fileCount > 0 && (
              <Tag className="m-0 px-1 py-0 text-[10px] leading-[14px]">{fileCount}</Tag>
            )}
          </Space>
        ),
      }))}
      // 顶部工具栏内使用：去掉 nav 的下外边距与底部分隔线
      className={`[&_.ant-tabs-nav]:mb-0 [&_.ant-tabs-nav]:before:border-none ${className ?? ''}`}
    />
  );
}
