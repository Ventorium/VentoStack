import { client } from '@/api';
import type { DeptItem, MenuItem, PaginatedData, RoleItem } from '@/api/types';
import ActionColumn from '@/components/ActionColumn';
import DictSelect from '@/components/DictSelect';
import { msg } from '@/components/GlobalMessage';
import { useTable } from '@/hooks/useTable';
import { cleanParams } from '@/utils/cleanParams';
import { fmtDate } from '@/utils/fmtDate';
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Card, Col, Form, Input, Modal, Radio, Row, Space, Table, Tag, Tree } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DataNode, TreeProps } from 'antd/es/tree';
import { useState } from 'react';

const fetcher = (params: Record<string, unknown>) =>
  client.get('/api/system/roles', { query: cleanParams(params) }) as Promise<{
    error?: unknown;
    data?: PaginatedData<RoleItem>;
  }>;

// schema.ts 由运行中的 admin API 通过 o2t 生成；新增 GET 路由在下次生成后会自动纳入。
const getRoleDataScope = (id: string) =>
  (
    client.get as unknown as (
      path: string,
      options: { params: { id: string } },
    ) => Promise<{ error?: unknown; data?: { scope: number; deptIds: string[] } }>
  )('/api/system/roles/:id/data-scope', { params: { id } });

/** 将 MenuItem[] 转为 Ant Design TreeData */
function toTreeData(items: MenuItem[]): DataNode[] {
  return items.map((item) => ({
    key: item.id,
    title: item.name,
    children: item.children?.length ? toTreeData(item.children) : undefined,
  }));
}

function toDeptTreeData(items: DeptItem[]): DataNode[] {
  return items.map((item) => ({
    key: item.id,
    title: item.name,
    children: item.children?.length ? toDeptTreeData(item.children) : undefined,
  }));
}

const DATA_SCOPE_LABELS: Record<number, string> = {
  1: '全部数据',
  2: '本部门',
  3: '本部门及以下',
  4: '仅本人',
  5: '自定义部门',
};

function normalizeCheckedKeys(value: unknown): string[] {
  const keys = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && 'checked' in value && Array.isArray(value.checked)
      ? value.checked
      : [];
  return keys.map(String);
}

/** 收集所有节点 key（含子级） */
function collectAllKeys(items: MenuItem[]): string[] {
  const keys: string[] = [];
  for (const item of items) {
    keys.push(item.id);
    if (item.children?.length) keys.push(...collectAllKeys(item.children));
  }
  return keys;
}

/** 获取某 key 的所有子孙 key */
function getDescendantKeys(items: MenuItem[], targetKey: string): string[] {
  for (const item of items) {
    if (item.id === targetKey) {
      return collectAllKeys(item.children ?? []);
    }
    if (item.children?.length) {
      const found = getDescendantKeys(item.children, targetKey);
      if (found.length) return found;
    }
  }
  return [];
}

const RolePage = () => {
  const {
    loading,
    data,
    total,
    page,
    pageSize,
    refresh,
    onSearch,
    onReset,
    onPageChange,
    selectedRowKeys,
    selectedRows,
    rowSelection,
    clearSelection,
    hasSelected,
  } = useTable<RoleItem>(fetcher);
  const [searchForm] = Form.useForm();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [form] = Form.useForm();
  const [menuModalOpen, setMenuModalOpen] = useState(false);
  const [menuTree, setMenuTree] = useState<MenuItem[]>([]);
  const [checkedKeys, setCheckedKeys] = useState<string[]>([]);
  const [assignRoleId, setAssignRoleId] = useState('');
  const [assignRoleCode, setAssignRoleCode] = useState('');
  const [scopeModalOpen, setScopeModalOpen] = useState(false);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [scopeRole, setScopeRole] = useState<RoleItem | null>(null);
  const [dataScope, setDataScope] = useState(1);
  const [scopeDeptIds, setScopeDeptIds] = useState<string[]>([]);
  const [deptTree, setDeptTree] = useState<DeptItem[]>([]);

  const handleSearch = () => {
    const values = searchForm.getFieldsValue();
    onSearch(cleanParams(values));
  };
  const handleReset = () => {
    searchForm.resetFields();
    onReset();
  };

  const openCreate = () => {
    setEditingRole(null);
    form.resetFields();
    setModalOpen(true);
  };
  const openEdit = (r: RoleItem) => {
    setEditingRole(r);
    form.setFieldsValue({
      name: r.name,
      code: r.code,
      sort: r.sort,
      dataScope: r.dataScope,
      remark: r.remark,
      status: r.status,
    });
    setModalOpen(true);
  };

  const handleOk = async () => {
    const values = await form.validateFields();
    setModalLoading(true);
    try {
      if (editingRole) {
        const { error } = await client.put('/api/system/roles/:id', {
          params: { id: editingRole.id },
          body: {
            name: values.name,
            sort: values.sort,
            remark: values.remark,
            status: values.status,
          },
        });
        if (!error) {
          msg.success('更新成功');
          setModalOpen(false);
          refresh();
        }
      } else {
        const { error } = await client.post('/api/system/roles', {
          body: {
            name: values.name,
            code: values.code,
            sort: values.sort,
            remark: values.remark,
            status: values.status,
          },
        });
        if (!error) {
          msg.success('创建成功');
          setModalOpen(false);
          refresh();
        }
      }
    } finally {
      setModalLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await client.delete('/api/system/roles/:id', { params: { id } });
    if (!error) {
      msg.success('删除成功');
      refresh();
    }
  };

  const openAssignMenus = async (r: RoleItem) => {
    setAssignRoleId(r.id);
    setAssignRoleCode(r.code);
    // 并行加载菜单树和角色已有菜单
    const [menuRes, roleMenuRes] = await Promise.all([
      client.get('/api/system/menus/tree') as Promise<{
        error?: unknown;
        data?: MenuItem[];
      }>,
      isBuiltInRole(r.code)
        ? Promise.resolve({ data: { menuIds: [] as string[] } })
        : (client.get('/api/system/roles/:id/menus', {
            params: { id: r.id },
          }) as Promise<{ error?: unknown; data?: { menuIds?: string[] } }>),
    ]);
    const tree = menuRes.data ?? [];
    setMenuTree(tree);
    // admin 角色全选，否则用已有菜单 ID
    const existingKeys = isBuiltInRole(r.code)
      ? collectAllKeys(tree)
      : (roleMenuRes.data?.menuIds ?? []);
    setCheckedKeys(existingKeys);
    setMenuModalOpen(true);
  };

  const handleCheck: NonNullable<TreeProps['onCheck']> = (checked, info) => {
    const keys = normalizeCheckedKeys(checked);
    const currentKey = typeof info.node?.key === 'string' ? info.node.key : '';
    if (info.checked && currentKey) {
      // 勾选父级时自动勾选所有子级
      const descKeys = getDescendantKeys(menuTree, currentKey);
      if (descKeys.length > 0) {
        const merged = new Set([...keys, ...descKeys]);
        setCheckedKeys([...merged]);
        return;
      }
    }
    setCheckedKeys(keys);
  };

  const handleAssignMenus = async () => {
    const { error } = await client.put('/api/system/roles/:id/menus', {
      params: { id: assignRoleId },
      body: { menuIds: checkedKeys },
    });
    if (!error) {
      msg.success('菜单权限分配成功');
      setMenuModalOpen(false);
    }
  };

  const isBuiltInRole = (code: string) => code === 'admin';

  const openDataScope = async (role: RoleItem) => {
    setScopeRole(role);
    setScopeLoading(true);
    try {
      const [scopeRes, deptRes] = await Promise.all([
        getRoleDataScope(role.id),
        client.get('/api/system/depts/tree') as Promise<{ error?: unknown; data?: DeptItem[] }>,
      ]);
      if (scopeRes.error || deptRes.error) return;
      setDataScope(scopeRes.data?.scope ?? 1);
      setScopeDeptIds(scopeRes.data?.deptIds ?? []);
      setDeptTree(deptRes.data ?? []);
      setScopeModalOpen(true);
    } finally {
      setScopeLoading(false);
    }
  };

  const saveDataScope = async () => {
    if (!scopeRole) return;
    if (dataScope === 5 && scopeDeptIds.length === 0) {
      msg.error('自定义数据权限至少选择一个部门');
      return;
    }
    setScopeLoading(true);
    try {
      const { error } = await client.put('/api/system/roles/:id/data-scope', {
        params: { id: scopeRole.id },
        body: dataScope === 5 ? { scope: dataScope, deptIds: scopeDeptIds } : { scope: dataScope },
      });
      if (!error) {
        msg.success('数据权限设置成功');
        setScopeModalOpen(false);
        refresh();
      }
    } finally {
      setScopeLoading(false);
    }
  };

  const handleBatchDelete = () => {
    const names = selectedRows.map((r) => r.name).join('、');
    Modal.confirm({
      title: '批量删除',
      content: `确定要删除以下 ${selectedRowKeys.length} 个角色吗？此操作不可恢复。\n${names}`,
      okType: 'danger',
      okText: '确定删除',
      onOk: async () => {
        const { error, data } = await client.post('/api/system/roles/batch-delete', {
          body: { ids: selectedRowKeys as string[] },
        });
        if (!error) {
          const result = data as { success: number; skipped: number };
          if (result.skipped > 0) {
            msg.success(`删除完成：成功 ${result.success} 项，跳过 ${result.skipped} 项`);
          } else {
            msg.success(`删除成功，共 ${result.success} 项`);
          }
          clearSelection();
          refresh();
        }
      },
    });
  };

  const columns: ColumnsType<RoleItem> = [
    { title: '角色名称', dataIndex: 'name', key: 'name', width: 160 },
    { title: '角色标识', dataIndex: 'code', key: 'code', width: 160 },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (_: unknown, r: RoleItem) => (
        <Tag color={r.status === 1 ? 'green' : 'red'}>{r.status === 1 ? '正常' : '禁用'}</Tag>
      ),
    },
    { title: '排序', dataIndex: 'sort', key: 'sort', width: 60 },
    {
      title: '数据权限',
      dataIndex: 'dataScope',
      key: 'dataScope',
      width: 140,
      render: (value: number) => DATA_SCOPE_LABELS[value] ?? '未配置',
    },
    { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (_: unknown, r: RoleItem) => fmtDate(r.createdAt),
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      fixed: 'right' as const,
      render: (_: unknown, r: RoleItem) => {
        const builtIn = isBuiltInRole(r.code);
        return (
          <ActionColumn
            items={[
              { label: '编辑', onClick: () => openEdit(r), disabled: builtIn },
              { label: '分配菜单', onClick: () => openAssignMenus(r) },
              { label: '数据权限', onClick: () => openDataScope(r), disabled: builtIn },
              {
                label: '删除',
                onClick: () => handleDelete(r.id),
                danger: true,
                confirm: '确定删除该角色？',
                disabled: builtIn,
              },
            ]}
          />
        );
      },
    },
  ];

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">角色管理</h3>
      <Card className="mb-4">
        <Form form={searchForm} layout="inline">
          <Form.Item name="name">
            <Input placeholder="角色名称" prefix={<SearchOutlined />} />
          </Form.Item>
          <Form.Item name="status">
            <DictSelect typeCode="sys_status" placeholder="状态" allowClear className="w-[100px]" />
          </Form.Item>
          <Space>
            <Button type="primary" onClick={handleSearch}>
              搜索
            </Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>
              重置
            </Button>
          </Space>
        </Form>
      </Card>
      <Card
        title={`角色列表（${total}）`}
        extra={
          <Space>
            {hasSelected && (
              <Button size="small" danger onClick={handleBatchDelete}>
                批量删除
              </Button>
            )}
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新增角色
            </Button>
          </Space>
        }
      >
        {hasSelected && (
          <div className="mb-2 text-sm text-gray-500 dark:text-gray-400">
            已选 {selectedRowKeys.length} 项{' '}
            <Button type="link" size="small" onClick={clearSelection}>
              取消选择
            </Button>
          </div>
        )}
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          size="small"
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: onPageChange,
          }}
          scroll={{ x: 1000 }}
          rowSelection={rowSelection}
        />
      </Card>
      <Modal
        title={editingRole ? '编辑角色' : '新增角色'}
        open={modalOpen}
        onOk={handleOk}
        onCancel={() => setModalOpen(false)}
        confirmLoading={modalLoading}
        destroyOnHidden
        width={640}
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="角色名称" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="code" label="角色标识" rules={[{ required: true }]}>
                <Input disabled={!!editingRole} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="状态" initialValue={1}>
                <DictSelect typeCode="sys_status" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="sort" label="排序" initialValue={0}>
                <Input type="number" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="remark" label="备注">
                <Input.TextArea rows={3} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
      <Modal
        title={`设置数据权限${scopeRole ? ` - ${scopeRole.name}` : ''}`}
        open={scopeModalOpen}
        onOk={saveDataScope}
        onCancel={() => setScopeModalOpen(false)}
        confirmLoading={scopeLoading}
        destroyOnHidden
        width={560}
      >
        <Radio.Group
          value={dataScope}
          onChange={(event) => setDataScope(event.target.value as number)}
          className="flex flex-col gap-3"
        >
          {Object.entries(DATA_SCOPE_LABELS).map(([value, label]) => (
            <Radio key={value} value={Number(value)}>
              {label}
            </Radio>
          ))}
        </Radio.Group>
        {dataScope === 5 && (
          <div className="mt-4 max-h-[360px] overflow-y-auto rounded border border-gray-200 p-3 dark:border-gray-700">
            <Tree
              checkable
              defaultExpandAll
              selectable={false}
              checkedKeys={scopeDeptIds}
              onCheck={(keys) => setScopeDeptIds(normalizeCheckedKeys(keys))}
              treeData={toDeptTreeData(deptTree)}
            />
          </div>
        )}
      </Modal>
      <Modal
        title="分配菜单权限"
        open={menuModalOpen}
        onOk={isBuiltInRole(assignRoleCode) ? () => setMenuModalOpen(false) : handleAssignMenus}
        onCancel={() => setMenuModalOpen(false)}
        okText={isBuiltInRole(assignRoleCode) ? '关闭' : '确定'}
        destroyOnHidden
        width={480}
      >
        {isBuiltInRole(assignRoleCode) && (
          <p className="text-gray-500 dark:text-gray-400 mb-2">内置超级管理员角色拥有所有权限</p>
        )}
        {menuTree.length > 0 && (
          <div className="overflow-y-auto" style={{ maxHeight: '60vh' }}>
            <Tree
              checkable
              defaultExpandAll
              checkedKeys={checkedKeys}
              onCheck={isBuiltInRole(assignRoleCode) ? () => {} : handleCheck}
              selectable={false}
              treeData={toTreeData(menuTree)}
            />
          </div>
        )}
      </Modal>
    </div>
  );
};

export default RolePage;
