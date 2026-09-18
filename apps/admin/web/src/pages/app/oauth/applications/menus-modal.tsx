import { oauthApi } from '@/api/oauth';
import type { OAuthApplicationItem, OAuthApplicationMenu, RoleItem } from '@/api/types';
import ActionColumn from '@/components/ActionColumn';
import { msg } from '@/components/GlobalMessage';
import { PlusOutlined } from '@ant-design/icons';
import { Button, Col, Form, Input, InputNumber, Modal, Row, Select, Switch, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';

function flatten(items: OAuthApplicationMenu[]): OAuthApplicationMenu[] {
  return items.flatMap((item) => [item, ...flatten(item.children ?? [])]);
}

export function MenusModal(props: {
  application: OAuthApplicationItem | null;
  onClose: () => void;
}) {
  const { application, onClose } = props;
  const [menus, setMenus] = useState<OAuthApplicationMenu[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [editing, setEditing] = useState<OAuthApplicationMenu | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const load = useCallback(async () => {
    if (!application) return;
    setLoading(true);
    const [menuResult, roleResult] = await Promise.all([
      oauthApi.menus(application.id),
      oauthApi.roles(),
    ]);
    if (menuResult.data) setMenus(menuResult.data);
    if (roleResult.data) setRoles(roleResult.data.list);
    setLoading(false);
  }, [application]);
  useEffect(() => {
    void load();
  }, [load]);
  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ type: 2, sort: 0, visible: true, status: 1, roleIds: [] });
    setFormOpen(true);
  };
  const openEdit = (item: OAuthApplicationMenu) => {
    setEditing(item);
    form.setFieldsValue({
      parentId: item.parent_id,
      name: item.name,
      path: item.path,
      component: item.component,
      type: item.type,
      permission: item.permission,
      icon: item.icon,
      sort: item.sort,
      visible: item.visible,
      status: item.status,
      roleIds: item.role_ids,
    });
    setFormOpen(true);
  };
  const save = async () => {
    if (!application) return;
    const values = await form.validateFields();
    setLoading(true);
    const result = editing
      ? await oauthApi.updateMenu(application.id, editing.id, values)
      : await oauthApi.createMenu(application.id, values);
    setLoading(false);
    if (!result.error) {
      msg.success(editing ? '菜单已更新' : '菜单已创建');
      setFormOpen(false);
      load();
    }
  };
  const remove = async (id: string) => {
    if (!application) return;
    const result = await oauthApi.deleteMenu(application.id, id);
    if (!result.error) {
      msg.success('菜单已删除');
      load();
    }
  };
  const columns: ColumnsType<OAuthApplicationMenu> = [
    { title: '名称', dataIndex: 'name', width: 180 },
    { title: '路径', dataIndex: 'path', ellipsis: true },
    { title: '权限', dataIndex: 'permission', ellipsis: true },
    {
      title: '类型',
      dataIndex: 'type',
      width: 70,
      render: (value) => ({ 1: '目录', 2: '菜单', 3: '按钮' })[value as 1] ?? value,
    },
    { title: '排序', dataIndex: 'sort', width: 70 },
    {
      title: '操作',
      width: 120,
      render: (_, item) => (
        <ActionColumn
          items={[
            { label: '编辑', onClick: () => openEdit(item) },
            {
              label: '删除',
              danger: true,
              confirm: '确定删除该菜单？',
              onClick: () => remove(item.id),
            },
          ]}
        />
      ),
    },
  ];
  const parentOptions = flatten(menus)
    .filter((item) => item.id !== editing?.id && item.type !== 3)
    .map((item) => ({ label: item.name, value: item.id }));
  return (
    <>
      <Modal
        title={application ? `应用菜单：${application.name}` : '应用菜单'}
        open={!!application}
        onCancel={onClose}
        footer={null}
        width={900}
        destroyOnHidden
      >
        <div className="flex justify-end mb-3">
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新增菜单
          </Button>
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={menus}
          loading={loading}
          pagination={false}
          size="small"
          scroll={{ x: 800 }}
        />
      </Modal>
      <Modal
        title={editing ? '编辑应用菜单' : '新增应用菜单'}
        open={formOpen}
        onCancel={() => setFormOpen(false)}
        onOk={save}
        confirmLoading={loading}
        width={680}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="名称" rules={[{ required: true }]}>
                <Input maxLength={64} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="parentId" label="父菜单">
                <Select allowClear options={parentOptions} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="path" label="路径">
                <Input maxLength={256} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="component" label="组件">
                <Input maxLength={256} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="permission" label="权限标识">
                <Input maxLength={128} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="icon" label="Icon">
                <Input maxLength={64} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="roleIds" label="可见角色">
            <Select
              mode="multiple"
              options={roles.map((role) => ({ label: role.name, value: role.id }))}
            />
          </Form.Item>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="type" label="类型" rules={[{ required: true }]}>
                <Select
                  options={[
                    { label: '目录', value: 1 },
                    { label: '菜单', value: 2 },
                    { label: '按钮', value: 3 },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="sort" label="排序">
                <InputNumber min={0} max={9999} className="w-full" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="visible" label="可见" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item
                name="status"
                label="启用"
                valuePropName="checked"
                getValueFromEvent={(checked) => (checked ? 1 : 0)}
                getValueProps={(value) => ({ checked: value === 1 })}
              >
                <Switch />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
}
