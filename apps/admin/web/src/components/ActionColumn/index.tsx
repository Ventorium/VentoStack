import { Button, Dropdown, Popconfirm, Space } from 'antd'
import { MoreOutlined } from '@ant-design/icons'

export interface ActionItem {
  label: string
  onClick: () => void
  danger?: boolean
  confirm?: string
}

interface ActionColumnProps {
  items: ActionItem[]
  maxInline?: number
}

const ActionColumn = ({ items, maxInline = 2 }: ActionColumnProps) => {
  const inline = items.slice(0, maxInline)
  const overflow = items.slice(maxInline)

  const renderButton = (item: ActionItem, key?: string) => {
    const btn = (
      <Button key={key} type="link" size="small" danger={item.danger} onClick={item.confirm ? undefined : item.onClick}>
        {item.label}
      </Button>
    )
    if (item.confirm) {
      return (
        <Popconfirm key={key} title={item.confirm} onConfirm={item.onClick}>
          {btn}
        </Popconfirm>
      )
    }
    return btn
  }

  return (
    <Space size={0}>
      {inline.map((item, i) => renderButton(item, `inline-${i}`))}
      {overflow.length > 0 && (
        <Dropdown
          menu={{
            items: overflow.map((item, i) => ({
              key: `overflow-${i}`,
              label: item.confirm ? (
                <Popconfirm title={item.confirm} onConfirm={item.onClick} okText="确定" cancelText="取消">
                  <span style={item.danger ? { color: '#ff4d4f' } : undefined}>{item.label}</span>
                </Popconfirm>
              ) : (
                <span
                  style={item.danger ? { color: '#ff4d4f' } : undefined}
                  onClick={(e) => { e.stopPropagation(); item.onClick() }}
                >
                  {item.label}
                </span>
              ),
            })),
          }}
          trigger={['click']}
        >
          <Button type="link" size="small" icon={<MoreOutlined />} />
        </Dropdown>
      )}
    </Space>
  )
}

export default ActionColumn
