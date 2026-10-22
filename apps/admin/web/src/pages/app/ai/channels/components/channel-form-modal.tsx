/**
 * 渠道配置弹窗（新建 / 编辑共用）
 *
 * 表单完全由目录驱动：`configFields` + `secretFields` 逐个渲染，
 * 帮助文案、占位符、默认值、文档链接都来自目录，页面里不写死任何渠道细节。
 *
 * 凭证约定：编辑时只回「已配置」占位，留空表示不修改（后端同样按空值不覆盖处理）。
 */
import { msg } from '@/components/GlobalMessage';
import { QuestionCircleOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Switch,
  Tooltip,
  Typography,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createChannel, updateChannel } from '../api';
import type {
  ChannelCatalogEntry,
  ChannelCatalogField,
  ChannelItem,
  ChannelSetupLink,
} from '../types';

const { Text } = Typography;

/**
 * 把接入步骤里的平台名渲染成链接。
 *
 * 目录只给「文案 + 要变成链接的片段」，这里按文案匹配替换：
 * 递归处理多个链接，匹配不到的链接直接跳过（不会把步骤文案吞掉）。
 * 全部 `target="_blank"` + `rel="noreferrer"`：不要把人从配置流程里带走。
 */
function renderStepWithLinks(step: string, links: ChannelSetupLink[]): ReactNode {
  if (links.length === 0) return step;
  const [first, ...rest] = links;
  if (!first) return step;
  const index = step.indexOf(first.text);
  if (index < 0) return renderStepWithLinks(step, rest);
  return (
    <>
      {step.slice(0, index)}
      <Typography.Link href={first.href} target="_blank" rel="noreferrer">
        {first.text}
      </Typography.Link>
      {renderStepWithLinks(step.slice(index + first.text.length), rest)}
    </>
  );
}

interface ChannelFormModalProps {
  open: boolean;
  entry: ChannelCatalogEntry | null;
  /** 传入则为编辑模式 */
  channel?: ChannelItem | null;
  onClose: () => void;
  onSaved: (channel: ChannelItem) => void;
}

/** 表单值形状：config / secrets 都按字段 key 收拢 */
interface ChannelFormValues {
  name?: string;
  agentId?: string;
  config?: Record<string, unknown>;
  secrets?: Record<string, string>;
}

/** 字段标签：必填加红星，说明与文档链接放进 Tooltip */
function fieldLabel(field: ChannelCatalogField) {
  if (!field.help && !field.docsUrl) return field.label;
  return (
    <Space size={4}>
      <span>{field.label}</span>
      <Tooltip
        title={
          <div className="max-w-[280px] text-xs leading-5">
            {field.help ? <div>{field.help}</div> : null}
            {field.docsUrl ? (
              <a href={field.docsUrl} target="_blank" rel="noreferrer" className="text-xs">
                查看官方文档
              </a>
            ) : null}
          </div>
        }
      >
        <QuestionCircleOutlined className="cursor-help opacity-60" />
      </Tooltip>
    </Space>
  );
}

/** 按字段类型渲染控件 */
function renderControl(field: ChannelCatalogField, isSecret: boolean, secretConfigured: boolean) {
  const placeholder = isSecret && secretConfigured ? '已配置，留空则不修改' : field.placeholder;

  if (field.readOnly) {
    return <Input placeholder="由系统自动写入" disabled />;
  }

  switch (field.type) {
    case 'number':
      return (
        <InputNumber
          className="w-full"
          placeholder={field.placeholder}
          min={field.min}
          max={field.max}
        />
      );
    case 'boolean':
      return <Switch />;
    case 'select':
      return (
        <Select
          placeholder={placeholder ?? '请选择'}
          options={(field.options ?? []).map((option) => ({
            label: option.hint ? `${option.label}（${option.hint}）` : option.label,
            value: option.value,
          }))}
        />
      );
    case 'textarea':
      return <Input.TextArea rows={3} placeholder={placeholder} />;
    case 'password':
      return <Input.Password placeholder={placeholder} autoComplete="new-password" />;
    default:
      return <Input placeholder={placeholder} />;
  }
}

export default function ChannelFormModal({
  open,
  entry,
  channel,
  onClose,
  onSaved,
}: ChannelFormModalProps) {
  const [form] = Form.useForm<ChannelFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const isEdit = Boolean(channel);

  /** 新建时的初始值：目录默认值 + 名称 */
  const initialValues = useMemo<ChannelFormValues>(() => {
    if (channel) {
      return {
        name: channel.name,
        ...(channel.agentId ? { agentId: channel.agentId } : {}),
        config: { ...channel.config },
        secrets: {},
      };
    }
    const config: Record<string, unknown> = {};
    for (const field of entry?.configFields ?? []) {
      if (field.default !== undefined) config[field.key] = field.default;
    }
    for (const field of entry?.secretFields ?? []) {
      if (field.default !== undefined) config[field.key] = field.default;
    }
    return {
      name: entry ? `我的${entry.name}` : '',
      config,
      secrets: {},
    };
  }, [channel, entry]);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(initialValues);
  }, [open, initialValues, form]);

  const handleSubmit = async () => {
    if (!entry) return;
    const values = await form.validateFields();
    const config: Record<string, unknown> = {};
    for (const field of entry.configFields) {
      const value = values.config?.[field.key];
      if (value !== undefined && value !== '') config[field.key] = value;
    }
    const secrets: Record<string, string> = {};
    for (const field of entry.secretFields) {
      const value = values.secrets?.[field.key];
      if (typeof value === 'string' && value.trim()) secrets[field.key] = value.trim();
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        ...(values.name ? { name: values.name } : {}),
        config,
        ...(Object.keys(secrets).length > 0 ? { secrets } : {}),
        ...(values.agentId ? { agentId: values.agentId } : {}),
      };
      // 用 channel 是否存在来决定走更新还是新建，避免拼出空 id 的请求
      const saved = channel
        ? await updateChannel(channel.id, body)
        : await createChannel({ ...body, type: entry.type });
      if (!saved) return;
      msg.success(isEdit ? '已保存' : '已创建，去启用后即可收发消息');
      onSaved(saved);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const secretConfigured = (channel?.secretKeys?.length ?? 0) > 0;

  return (
    <Modal
      title={isEdit ? `配置「${channel?.name ?? ''}」` : `添加${entry?.name ?? ''}`}
      open={open}
      onCancel={onClose}
      destroyOnHidden
      width={620}
      footer={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={submitting} onClick={handleSubmit}>
            {isEdit ? '保存' : '创建'}
          </Button>
        </Space>
      }
    >
      {entry?.setupGuide?.length ? (
        <Alert
          type="info"
          showIcon
          className="mb-4"
          title="接入步骤"
          description={
            <ol className="m-0 list-decimal pl-5 text-xs leading-6">
              {entry.setupGuide.map((step) => (
                <li key={step}>{renderStepWithLinks(step, entry.setupLinks ?? [])}</li>
              ))}
            </ol>
          }
        />
      ) : null}

      {entry?.warning ? (
        <Alert type="warning" showIcon className="mb-4" title={entry.warning} />
      ) : null}

      <Form form={form} layout="vertical" preserve={false} initialValues={initialValues}>
        <Form.Item
          name="name"
          label="渠道名称"
          rules={[{ required: true, message: '给这个渠道起个名字，便于区分' }]}
        >
          <Input placeholder={entry ? `我的${entry.name}` : ''} maxLength={64} />
        </Form.Item>

        {entry?.configFields?.length ? (
          <>
            <Divider titlePlacement="start" className="!my-3">
              <Text className="text-xs">基础配置</Text>
            </Divider>
            <Row gutter={16}>
              {entry.configFields.map((field) => (
                <Col span={field.type === 'textarea' ? 24 : 12} key={field.key}>
                  <Form.Item
                    name={['config', field.key]}
                    label={fieldLabel(field)}
                    rules={
                      field.required
                        ? [{ required: true, message: `请填写${field.label}` }]
                        : undefined
                    }
                    valuePropName={field.type === 'boolean' ? 'checked' : undefined}
                  >
                    {renderControl(field, false, secretConfigured)}
                  </Form.Item>
                </Col>
              ))}
            </Row>
          </>
        ) : null}

        {entry?.secretFields?.length ? (
          <>
            <Divider titlePlacement="start" className="!my-3">
              <Text className="text-xs">凭证</Text>
            </Divider>
            <Row gutter={16}>
              {entry.secretFields.map((field) => (
                <Col span={12} key={field.key}>
                  <Form.Item
                    name={['secrets', field.key]}
                    label={fieldLabel(field)}
                    extra={
                      channel?.secretKeys?.includes(field.key) ? (
                        <Text type="success" className="text-[11px]">
                          已配置
                        </Text>
                      ) : undefined
                    }
                    rules={
                      field.required && !isEdit
                        ? [{ required: true, message: `请填写${field.label}` }]
                        : undefined
                    }
                  >
                    {renderControl(field, true, secretConfigured)}
                  </Form.Item>
                </Col>
              ))}
            </Row>
            <Text type="secondary" className="text-[11px]">
              凭证加密存储，保存后不再回显明文；留空表示沿用原值。
            </Text>
          </>
        ) : null}
      </Form>
    </Modal>
  );
}
