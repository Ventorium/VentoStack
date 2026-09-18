import { oauthApi } from '@/api/oauth';
import type { DeptItem, OAuthApplicationItem, RoleItem, UserItem } from '@/api/types';
import { msg } from '@/components/GlobalMessage';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Form, Modal, Select, Space } from 'antd';
import { useEffect, useState } from 'react';

function flattenDepartments(items: DeptItem[], depth = 0): Array<{ label: string; value: string }> {
  return items.flatMap((item) => [
    { label: `${'　'.repeat(depth)}${item.name}`, value: item.id },
    ...flattenDepartments(item.children ?? [], depth + 1),
  ]);
}

export function GrantsModal(props: {
  application: OAuthApplicationItem | null;
  onClose: () => void;
}) {
  const { application, onClose } = props;
  const [form] = Form.useForm();
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [departments, setDepartments] = useState<Array<{ label: string; value: string }>>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!application) return;
    setLoading(true);
    Promise.all([
      oauthApi.grants(application.id),
      oauthApi.roles(),
      oauthApi.users(),
      oauthApi.departments(),
    ])
      .then(([grants, roleResult, userResult, deptResult]) => {
        if (grants.data) form.setFieldsValue(grants.data);
        setRoles(roleResult.data?.list ?? []);
        setUsers(userResult.data?.list ?? []);
        setDepartments(flattenDepartments(deptResult.data ?? []));
      })
      .finally(() => setLoading(false));
  }, [application, form]);
  const save = async () => {
    if (!application) return;
    const values = await form.validateFields();
    setLoading(true);
    try {
      const result = await oauthApi.updateGrants(application.id, {
        roleIds: values.roleIds ?? [],
        userIds: values.userIds ?? [],
        departments: values.departments ?? [],
      });
      if (!result.error) {
        msg.success('应用授权已更新');
        onClose();
      }
    } finally {
      setLoading(false);
    }
  };
  return (
    <Modal
      title={application ? `访问授权：${application.name}` : '访问授权'}
      open={!!application}
      onCancel={onClose}
      onOk={save}
      confirmLoading={loading}
      width={720}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ roleIds: [], userIds: [], departments: [] }}
      >
        <Form.Item name="roleIds" label="角色">
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            options={roles.map((item) => ({
              label: `${item.name} (${item.code})`,
              value: item.id,
            }))}
          />
        </Form.Item>
        <Form.Item name="userIds" label="指定用户">
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            options={users.map((item) => ({
              label: `${item.nickname || item.username} (${item.username})`,
              value: item.id,
            }))}
          />
        </Form.Item>
        <Form.List name="departments">
          {(fields, { add, remove }) => (
            <div>
              <div className="mb-2 text-sm text-gray-500">部门授权</div>
              {fields.map(({ key, name }) => (
                <Space key={key} className="flex mb-2" align="baseline">
                  <Form.Item name={[name, 'deptId']} rules={[{ required: true }]} className="w-80">
                    <Select
                      showSearch
                      optionFilterProp="label"
                      placeholder="选择部门"
                      options={departments}
                    />
                  </Form.Item>
                  <Form.Item name={[name, 'scope']} rules={[{ required: true }]} className="w-48">
                    <Select
                      options={[
                        { label: '仅本部门', value: 'SELF' },
                        { label: '本部门及子部门', value: 'SELF_AND_DESCENDANTS' },
                      ]}
                    />
                  </Form.Item>
                  <Button
                    type="text"
                    danger
                    icon={<MinusCircleOutlined />}
                    onClick={() => remove(name)}
                  />
                </Space>
              ))}
              <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ scope: 'SELF' })}>
                添加部门授权
              </Button>
            </div>
          )}
        </Form.List>
      </Form>
    </Modal>
  );
}
