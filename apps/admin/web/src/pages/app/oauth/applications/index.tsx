import { oauthApi } from '@/api/oauth';
import type { OAuthApplicationItem, OAuthApplicationSecret } from '@/api/types';
import ActionColumn from '@/components/ActionColumn';
import AvatarCropper from '@/components/AvatarCropper';
import { msg } from '@/components/GlobalMessage';
import { SearchField, SearchToolbar } from '@/components/SearchToolbar';
import { useTable } from '@/hooks/useTable';
import { cleanParams } from '@/utils/cleanParams';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import {
  Button,
  Card,
  Checkbox,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Switch,
  Table,
  Tag,
  Upload,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { APPLICATION_SCOPES } from './application-scopes';
import { GrantsModal } from './grants-modal';
import { IntegrationDocsModal } from './integration-docs-modal';
import { MenusModal } from './menus-modal';
import { SecretModal } from './secret-modal';

const fetcher = (params: Record<string, unknown>) => oauthApi.list(cleanParams(params));

export default function OAuthApplicationsPage() {
  const table = useTable<OAuthApplicationItem>(fetcher);
  const [searchForm] = Form.useForm();
  const [form] = Form.useForm();
  const [editing, setEditing] = useState<OAuthApplicationItem | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [secret, setSecret] = useState<OAuthApplicationSecret | null>(null);
  const [grantApplication, setGrantApplication] = useState<OAuthApplicationItem | null>(null);
  const [menuApplication, setMenuApplication] = useState<OAuthApplicationItem | null>(null);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [docsOpen, setDocsOpen] = useState(false);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setIconFile(null);
    setIconPreview(null);
    form.setFieldsValue({
      enabled: true,
      sort: 0,
      allowedScopes: ['openid', 'profile', 'context'],
    });
    setOpen(true);
  };
  const openEdit = (item: OAuthApplicationItem) => {
    setEditing(item);
    setIconFile(null);
    setIconPreview(item.iconUrl || null);
    form.setFieldsValue(item);
    setOpen(true);
  };
  const handleCropConfirm = (blob: Blob) => {
    setCropFile(null);
    const file = new File([blob], 'icon.png', { type: 'image/png' });
    if (iconPreview?.startsWith('blob:')) URL.revokeObjectURL(iconPreview);
    setIconFile(file);
    setIconPreview(URL.createObjectURL(file));
  };
  const save = async () => {
    const values = await form.validateFields();
    const requestValues = editing
      ? Object.fromEntries(Object.entries(values).filter(([key]) => key !== 'identifier'))
      : values;
    setSaving(true);
    try {
      const result = editing
        ? await oauthApi.update(editing.id, requestValues)
        : await oauthApi.create(requestValues);
      if (!result.error) {
        const applicationId = editing?.id ?? result.data?.id;
        if (applicationId && iconFile) {
          const iconResult = await oauthApi.uploadIcon(applicationId, iconFile);
          if (iconResult.error) return;
        }
        setOpen(false);
        table.refresh();
        if (!editing && result.data) setSecret(result.data);
        else msg.success('更新成功');
      }
    } finally {
      setSaving(false);
    }
  };
  const regenerate = async (item: OAuthApplicationItem) => {
    const result = await oauthApi.regenerateSecret(item.id);
    if (!result.error && result.data) setSecret({ ...result.data, clientId: item.clientId });
  };
  const remove = async (id: string) => {
    const result = await oauthApi.remove(id);
    if (!result.error) {
      msg.success('Application 已永久删除');
      table.refresh();
    }
  };
  const columns: ColumnsType<OAuthApplicationItem> = [
    {
      title: '应用',
      dataIndex: 'name',
      width: 180,
      render: (_, item) => (
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded bg-gray-100 flex items-center justify-center overflow-hidden">
            {item.iconUrl ? (
              <img src={item.iconUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              item.name.slice(0, 1)
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium">{item.name}</div>
            <div className="truncate text-xs text-gray-400">{item.identifier}</div>
          </div>
        </div>
      ),
    },
    {
      title: 'Client ID',
      dataIndex: 'clientId',
      width: 320,
      render: (value: string) => <span className="font-mono text-xs">{value}</span>,
    },
    { title: '首页', dataIndex: 'homepageUrl', ellipsis: true },
    { title: '排序', dataIndex: 'sort', width: 70 },
    {
      title: '状态',
      dataIndex: 'enabled',
      width: 80,
      render: (value: boolean) => (
        <Tag color={value ? 'green' : 'default'}>{value ? '启用' : '禁用'}</Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      fixed: 'right',
      render: (_, item) => (
        <ActionColumn
          items={[
            { label: '编辑', onClick: () => openEdit(item) },
            { label: '访问授权', onClick: () => setGrantApplication(item) },
            { label: '应用菜单', onClick: () => setMenuApplication(item) },
            {
              label: '重置 Secret',
              onClick: () => regenerate(item),
              confirm: '重置后旧 Secret 立即失效，是否继续？',
            },
            {
              label: '永久删除',
              danger: true,
              onClick: () => remove(item.id),
              confirm: `确定永久删除“${item.name}”？标识符和 Client ID 将永久保留且不可复用。`,
            },
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <Card className="mb-4">
        <SearchToolbar
          form={searchForm}
          onSearch={() => table.onSearch(cleanParams(searchForm.getFieldsValue()))}
          onReset={() => {
            searchForm.resetFields();
            table.onReset();
          }}
        >
          <SearchField name="name" width="wide">
            <Input prefix={<SearchOutlined />} placeholder="应用名称" />
          </SearchField>
        </SearchToolbar>
      </Card>
      <Card
        title={`应用列表（${table.total}）`}
        extra={
          <div className="flex items-center gap-3">
            <Button type="link" onClick={() => setDocsOpen(true)}>
              接入文档
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              注册应用
            </Button>
          </div>
        }
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={table.data}
          loading={table.loading}
          size="small"
          scroll={{ x: 1100 }}
          pagination={{
            current: table.page,
            pageSize: table.pageSize,
            total: table.total,
            showSizeChanger: true,
            onChange: table.onPageChange,
          }}
        />
      </Card>
      <Modal
        title={editing ? '编辑应用' : '注册应用'}
        open={open}
        onOk={save}
        onCancel={() => setOpen(false)}
        confirmLoading={saving}
        width={760}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="应用名称" rules={[{ required: true }]}>
                <Input maxLength={128} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="identifier"
                label="标识符"
                rules={[{ required: true }, { pattern: /^[a-z][a-z0-9_-]*$/ }]}
              >
                <Input disabled={!!editing} maxLength={64} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="描述">
            <Input.TextArea maxLength={512} rows={2} />
          </Form.Item>
          <Form.Item label="Icon">
            <div className="flex items-center gap-3">
              <Upload
                accept="image/png,image/jpeg,image/gif,image/webp"
                listType="picture-card"
                showUploadList={false}
                maxCount={1}
                customRequest={({ file }) => setCropFile(file as File)}
              >
                {iconPreview ? (
                  <img src={iconPreview} alt="icon" className="w-full h-full object-cover" />
                ) : (
                  <div>
                    <PlusOutlined />
                    <div className="mt-1 text-xs">上传 Icon</div>
                  </div>
                )}
              </Upload>
              {iconPreview && (
                <Button
                  size="small"
                  onClick={() => {
                    if (iconPreview.startsWith('blob:')) URL.revokeObjectURL(iconPreview);
                    setIconFile(null);
                    setIconPreview(editing?.iconUrl || null);
                  }}
                >
                  移除
                </Button>
              )}
              <span className="text-xs text-gray-400">建议正方形图片，最大 2MB</span>
            </div>
          </Form.Item>
          <Form.Item
            name="homepageUrl"
            label="首页 URL"
            rules={[{ required: true }, { type: 'url' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="redirectUri"
            label="Redirect URI"
            rules={[{ required: true }, { type: 'url' }]}
          >
            <Input />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="postLogoutRedirectUri"
                label="退出回调 URI"
                tooltip="全局退出完成后浏览器回跳的地址（RP-Initiated Logout），必须与注册值精确匹配"
              >
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="backchannelLogoutUri"
                label="后端退出 URI"
                tooltip="全局退出时认证中心向该地址服务端到服务端 POST Logout Token，用于子应用清除本地 Session"
              >
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="allowedScopes"
            label="允许 Scope"
            rules={[{ required: true }]}
            tooltip="该应用可请求的 Scope 白名单；offline_access 只有同时开启「允许离线访问」才会签发 Refresh Token"
          >
            <Checkbox.Group options={APPLICATION_SCOPES} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="offlineAccessEnabled"
                label="允许离线访问"
                valuePropName="checked"
                tooltip="开启后，授权请求包含 offline_access 且 scope 含 openid 时才签发 Refresh Token（默认 7 天，轮换使用，重放将撤销整个 Token 家族）"
              >
                <Switch />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="enabled" label="启用" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="sort" label="排序">
                <InputNumber min={0} max={9999} className="w-full" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
      <SecretModal secret={secret} onClose={() => setSecret(null)} />
      <GrantsModal application={grantApplication} onClose={() => setGrantApplication(null)} />
      <MenusModal application={menuApplication} onClose={() => setMenuApplication(null)} />
      <IntegrationDocsModal open={docsOpen} onClose={() => setDocsOpen(false)} />
      {cropFile && (
        <AvatarCropper
          file={cropFile}
          open
          onConfirm={handleCropConfirm}
          onCancel={() => setCropFile(null)}
        />
      )}
    </div>
  );
}
