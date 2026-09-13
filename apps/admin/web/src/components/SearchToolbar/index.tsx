import { ReloadOutlined } from '@ant-design/icons';
import { Button, Form, Space } from 'antd';
import type { FormInstance, FormItemProps } from 'antd';
import clsx from 'clsx';
import type { ReactNode } from 'react';

export type SearchFieldWidth = 'compact' | 'normal' | 'wide' | 'fluid';

const FIELD_WIDTH_CLASS: Record<SearchFieldWidth, string> = {
  compact: 'w-full sm:w-32',
  normal: 'w-full sm:w-40',
  wide: 'w-full sm:w-64 lg:w-72',
  fluid: 'w-full sm:min-w-48 sm:flex-1',
};

interface SearchToolbarProps {
  form: FormInstance;
  children: ReactNode;
  onSearch: () => void;
  onReset: () => void;
  extraActions?: ReactNode;
  searchText?: string;
  resetText?: string;
}

/** 后台列表页统一查询栏：内容宽度优先、固定间距、空间不足时整项换行。 */
export function SearchToolbar({
  form,
  children,
  onSearch,
  onReset,
  extraActions,
  searchText = '搜索',
  resetText = '重置',
}: SearchToolbarProps) {
  return (
    <Form form={form} onFinish={onSearch}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {children}
        <Space wrap size={8}>
          <Button type="primary" htmlType="submit">
            {searchText}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={onReset}>
            {resetText}
          </Button>
          {extraActions}
        </Space>
      </div>
    </Form>
  );
}

interface SearchFieldProps extends FormItemProps {
  width?: SearchFieldWidth;
}

/** 查询字段宽度使用语义档位，避免页面散落固定像素值。 */
export function SearchField({ width = 'normal', className, children, ...props }: SearchFieldProps) {
  return (
    <Form.Item {...props} className={clsx('!mb-0', FIELD_WIDTH_CLASS[width], className)}>
      {children}
    </Form.Item>
  );
}
