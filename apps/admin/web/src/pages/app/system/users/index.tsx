import { client } from "@/api";
import type { DeptItem, PaginatedData, RoleItem, TagItem, UserItem } from "@/api/types";
import ActionColumn from "@/components/ActionColumn";
import DictSelect from "@/components/DictSelect";
import { msg } from "@/components/GlobalMessage";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import { useTable } from "@/hooks/useTable";
import { cleanParams } from "@/utils/cleanParams";
import { fmtDate } from "@/utils/fmtDate";
import { emailRules, getPasswordRules, phoneRules, usernameRules } from "@/utils/validators";
import {
  ApartmentOutlined,
  AppstoreOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tree,
  TreeSelect,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const fetcher = (params: Record<string, unknown>) =>
  client.get("/api/system/users", { query: cleanParams(params) }) as Promise<{
    error?: unknown;
    data?: PaginatedData<UserItem>;
  }>;

/** Flatten dept tree into antd TreeSelect data format */
const buildTreeSelectData = (
  items: DeptItem[],
): Array<{ value: string; label: string; children?: any[] }> =>
  items.map((item) => ({
    value: item.id,
    label: item.name,
    children: item.children?.length ? buildTreeSelectData(item.children) : undefined,
  }));

/** Flatten dept tree into antd Tree data format */
const buildTreeData = (
  items: DeptItem[],
): Array<{ key: string; title: string; children?: any[] }> =>
  items.map((item) => ({
    key: item.id,
    title: item.name,
    children: item.children?.length ? buildTreeData(item.children) : undefined,
  }));

const UserPage = () => {
  const navigate = useNavigate();
  const deptEnabled = usePublicConfig((s) => s.config.deptEnabled);
  const passwordMinLength = usePublicConfig((s) => s.config.passwordMinLength);
  const passwordComplexity = usePublicConfig((s) => s.config.passwordComplexity);
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
  } = useTable<UserItem>(fetcher);
  const [searchForm] = Form.useForm();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [form] = Form.useForm();

  const [resetPwdOpen, setResetPwdOpen] = useState(false);
  const [resetPwdLoading, setResetPwdLoading] = useState(false);
  const [resetPwdUserId, setResetPwdUserId] = useState("");
  const [resetPwdForm] = Form.useForm();

  // Dept tree state (for left panel Tree: key/title)
  const [deptTreeData, setDeptTreeData] = useState<
    Array<{ key: string; title: string; children?: any[] }>
  >([]);
  // Dept select state (for modal TreeSelect: value/label)
  const [deptSelectData, setDeptSelectData] = useState<
    Array<{ value: string; label: string; children?: any[] }>
  >([]);
  const [deptLoading, setDeptLoading] = useState(false);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [deptPanelVisible, setDeptPanelVisible] = useState(true);

  // Role list state
  const [roleOptions, setRoleOptions] = useState<Array<{ label: string; value: string }>>([]);

  // Tag list state
  const [tagOptions, setTagOptions] = useState<Array<{ label: string; value: string }>>([]);

  // Fetch roles for selector
  useEffect(() => {
    const fetchRoles = async () => {
      const { error, data } = (await client.get("/api/system/roles", {
        query: { pageSize: 999 },
      })) as { error?: unknown; data?: PaginatedData<RoleItem> };
      if (!error && data?.list) {
        setRoleOptions(data.list.map((r) => ({ label: r.name, value: r.id })));
      }
    };
    fetchRoles();
  }, []);

  // Fetch tags for selector
  useEffect(() => {
    const fetchTags = async () => {
      const { data } = (await client.get("/api/system/tags/all" as any)) as {
        data?: TagItem[];
      };
      if (data) {
        setTagOptions(data.map((t) => ({ label: t.name, value: t.id })));
      }
    };
    fetchTags();
  }, []);

  // Fetch dept tree
  const fetchDeptTree = useCallback(async () => {
    setDeptLoading(true);
    try {
      const { data: result } = (await client.get("/api/system/depts/tree")) as {
        error?: unknown;
        data?: DeptItem[];
      };
      if (result) {
        setDeptTreeData(buildTreeData(result));
        setDeptSelectData(buildTreeSelectData(result));
      }
    } finally {
      setDeptLoading(false);
    }
  }, []);

  useEffect(() => {
    if (deptEnabled) fetchDeptTree();
  }, [fetchDeptTree, deptEnabled]);

  const handleDeptSelect = (selectedKeys: React.Key[]) => {
    const rawKey = selectedKeys[0] as string | undefined;
    if (!rawKey) return;
    setSelectedDeptId(rawKey);
    // "__all__" = 所有部门（不传 deptId），"__none__" = 无部门用户
    let deptId: string | undefined;
    if (rawKey === "__all__") {
      deptId = undefined;
    } else if (rawKey === "__none__") {
      deptId = "__none__";
    } else {
      deptId = rawKey;
    }
    onSearch({ ...searchForm.getFieldsValue(), deptId });
  };

  const handleSearch = () => {
    const values = searchForm.getFieldsValue();
    const deptId =
      selectedDeptId === "__all__" || !selectedDeptId
        ? undefined
        : selectedDeptId === "__none__"
          ? "__none__"
          : selectedDeptId;
    onSearch(cleanParams({ ...values, deptId }));
  };
  const handleReset = () => {
    searchForm.resetFields();
    setSelectedDeptId("__all__");
    onSearch({});
  };

  const openCreate = () => {
    setEditingUser(null);
    form.resetFields();
    // 自动选中左侧当前选中的部门（排除 __all__ 和 __none__）
    const preselectedDeptId =
      selectedDeptId && selectedDeptId !== "__all__" && selectedDeptId !== "__none__"
        ? selectedDeptId
        : undefined;
    form.setFieldsValue({ status: 1, deptId: preselectedDeptId });
    setModalOpen(true);
  };
  const openEdit = async (r: UserItem) => {
    setEditingUser(r);
    // 加载用户标签
    let tagIds: string[] = [];
    try {
      const { data: userTags } = (await client.get(`/api/system/users/${r.id}/tags` as any)) as {
        data?: Array<{ id: string }>;
      };
      if (userTags) tagIds = userTags.map((t) => t.id);
    } catch {
      // ignore
    }
    form.setFieldsValue({
      username: r.username,
      nickname: r.nickname,
      email: r.email,
      phone: r.phone,
      status: r.status,
      deptId: r.deptId,
      roleIds: r.roles?.map((role) => role.id) ?? [],
      tagIds,
    });
    setModalOpen(true);
  };

  const handleOk = async () => {
    const values = await form.validateFields();
    setModalLoading(true);
    try {
      if (editingUser) {
        const { error } = await client.put("/api/system/users/:id", {
          params: { id: editingUser.id },
          body: {
            nickname: values.nickname,
            email: values.email,
            phone: values.phone,
            status: values.status,
            deptId: values.deptId,
            roleIds: values.roleIds,
          },
        });
        if (!error) {
          // 保存标签（始终调用，支持清空）
          const { error: tagError } = await client.put(`/api/system/users/${editingUser.id}/tags` as any, {
            body: { tagIds: values.tagIds ?? [] },
          });
          if (tagError) {
            msg.warning("用户信息已更新，但标签保存失败");
          } else {
            msg.success("更新成功");
          }
          setModalOpen(false);
          refresh();
        }
      } else {
        const { error, data } = await client.post("/api/system/users", {
          body: {
            username: values.username,
            password: values.password,
            nickname: values.nickname,
            email: values.email,
            phone: values.phone,
            status: values.status,
            deptId: values.deptId,
            roleIds: values.roleIds,
          },
        });
        if (!error) {
          // 新建用户后保存标签
          const newUserId = (data as { id?: string })?.id;
          if (newUserId && values.tagIds?.length) {
            const { error: tagError } = await client.put(`/api/system/users/${newUserId}/tags` as any, {
              body: { tagIds: values.tagIds },
            });
            if (tagError) {
              msg.warning("用户已创建，但标签保存失败");
            }
          }
          msg.success("创建成功");
          setModalOpen(false);
          refresh();
        }
      }
    } finally {
      setModalLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await client.delete("/api/system/users/:id", { params: { id } });
    if (!error) {
      msg.success("删除成功");
      refresh();
    }
  };

  const handleStatus = async (id: string, status: number) => {
    const newStatus = status === 1 ? 0 : 1;
    const { error } = await client.put("/api/system/users/:id/status", {
      params: { id },
      body: { status: newStatus },
    });
    if (!error) {
      msg.success(newStatus === 1 ? "已启用" : "已禁用");
      refresh();
    }
  };

  const showBatchResult = (result: { success: number; skipped: number }, action: string) => {
    if (result.skipped > 0) {
      msg.success(`${action}完成：成功 ${result.success} 项，跳过 ${result.skipped} 项`);
    } else {
      msg.success(`${action}成功，共 ${result.success} 项`);
    }
  };

  const handleBatchDisable = () => {
    const names = selectedRows.map((r) => r.username).join("、");
    Modal.confirm({
      title: "批量禁用",
      content: `确定要禁用以下 ${selectedRowKeys.length} 个用户吗？\n${names}`,
      onOk: async () => {
        const { error, data } = await client.post("/api/system/users/batch-status", {
          body: { ids: selectedRowKeys as string[], status: 0 },
        });
        if (!error) {
          showBatchResult(data as { success: number; skipped: number }, "禁用");
          clearSelection();
          refresh();
        }
      },
    });
  };

  const handleBatchEnable = () => {
    const names = selectedRows.map((r) => r.username).join("、");
    Modal.confirm({
      title: "批量启用",
      content: `确定要启用以下 ${selectedRowKeys.length} 个用户吗？\n${names}`,
      onOk: async () => {
        const { error, data } = await client.post("/api/system/users/batch-status", {
          body: { ids: selectedRowKeys as string[], status: 1 },
        });
        if (!error) {
          showBatchResult(data as { success: number; skipped: number }, "启用");
          clearSelection();
          refresh();
        }
      },
    });
  };

  const handleBatchDelete = () => {
    const names = selectedRows.map((r) => r.username).join("、");
    Modal.confirm({
      title: "批量删除",
      content: `确定要删除以下 ${selectedRowKeys.length} 个用户吗？此操作不可恢复。\n${names}`,
      okType: "danger",
      okText: "确定删除",
      onOk: async () => {
        const { error, data } = await client.post("/api/system/users/batch-delete", {
          body: { ids: selectedRowKeys as string[] },
        });
        if (!error) {
          showBatchResult(data as { success: number; skipped: number }, "删除");
          clearSelection();
          refresh();
        }
      },
    });
  };

  const handleBatchResetPwd = () => {
    const names = selectedRows.map((r) => r.username).join("、");
    Modal.confirm({
      title: "批量重置密码",
      content: `确定要将以下 ${selectedRowKeys.length} 个用户的密码重置为系统默认初始密码吗？\n${names}`,
      onOk: async () => {
        const { error, data } = await client.post("/api/system/users/batch-reset-pwd", {
          body: { ids: selectedRowKeys as string[] },
        });
        if (!error) {
          showBatchResult(data as { success: number; skipped: number }, "重置密码");
          clearSelection();
          refresh();
        }
      },
    });
  };

  const openResetPwd = (id: string) => {
    setResetPwdUserId(id);
    resetPwdForm.resetFields();
    setResetPwdOpen(true);
  };

  const handleResetPwdOk = async () => {
    const values = await resetPwdForm.validateFields();
    setResetPwdLoading(true);
    try {
      const { error } = await client.put("/api/system/users/:id/reset-pwd", {
        params: { id: resetPwdUserId },
        body: { newPassword: values.newPassword },
      });
      if (!error) {
        msg.success("密码重置成功");
        setResetPwdOpen(false);
      }
    } finally {
      setResetPwdLoading(false);
    }
  };

  const columns: ColumnsType<UserItem> = [
    { title: "用户名", dataIndex: "username", key: "username", width: 120 },
    { title: "昵称", dataIndex: "nickname", key: "nickname", width: 120 },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 80,
      render: (_: unknown, r: UserItem) => (
        <Tag color={r.status === 1 ? "green" : "red"}>{r.status === 1 ? "正常" : "禁用"}</Tag>
      ),
    },
    {
      title: "标签",
      key: "tags",
      width: 200,
      render: (_: unknown, r: UserItem) =>
        r.tags?.length
          ? r.tags.map((t) => (
              <Tag key={t.id} color="blue">
                {t.name}
              </Tag>
            ))
          : "-",
    },
    { title: "邮箱", dataIndex: "email", key: "email", width: 200 },
    { title: "手机号", dataIndex: "phone", key: "phone", width: 140 },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 180,
      render: (_: unknown, r: UserItem) => fmtDate(r.createdAt),
    },
    {
      title: "操作",
      key: "action",
      width: 136,
      fixed: "right" as const,
      render: (_: unknown, r: UserItem) => (
        <ActionColumn
          items={[
            { label: "编辑", onClick: () => openEdit(r) },
            { label: "重置密码", onClick: () => openResetPwd(r.id) },
            {
              label: r.status === 1 ? "禁用" : "启用",
              onClick: () => handleStatus(r.id, r.status),
            },
            {
              label: "删除",
              onClick: () => handleDelete(r.id),
              danger: true,
              confirm: "确定删除该用户？",
            },
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">用户管理</h3>
      <div className="flex gap-4">
        {/* Dept tree sidebar */}
        {deptEnabled && deptPanelVisible && (
          <Card
            className="shrink-0 w-[240px]"
            
            styles={{ body: { padding: "12px 16px" } }}
          >
            <div className="flex items-center mb-2">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">部门筛选</span>
              <Button
                type="link"
                size="small"
                icon={<ApartmentOutlined />}
                onClick={() => navigate("/app/system/depts")}
                className="ml-4 mr-auto text-xs p-0"
              >
                管理部门
              </Button>
              <Button
                type="text"
                size="small"
                icon={<MenuFoldOutlined />}
                onClick={() => setDeptPanelVisible(false)}
              />
            </div>
            <Spin spinning={deptLoading}>
              {deptTreeData.length > 0 ? (
                <Tree
                  treeData={[
                    {
                      key: "__all__",
                      title: (
                        <span>
                          <AppstoreOutlined className="mr-1 color-inherit"  />
                          所有部门
                        </span>
                      ),
                    },
                    {
                      key: "__none__",
                      title: (
                        <span>
                          <StopOutlined className="mr-1 color-inherit"  />
                          无部门
                        </span>
                      ),
                    },
                    ...deptTreeData,
                  ]}
                  selectedKeys={[selectedDeptId ?? "__all__"]}
                  onSelect={handleDeptSelect}
                  defaultExpandAll
                  showLine={{ showLeafIcon: false }}
                  className="text-sm"
                />
              ) : (
                <div className="text-xs text-gray-400 dark:text-gray-500 py-4 text-center">暂无部门数据</div>
              )}
            </Spin>
          </Card>
        )}

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <Card className="mb-4">
            <Form form={searchForm} layout="inline">
              {deptEnabled && !deptPanelVisible && (
                <Form.Item>
                  <Button icon={<MenuUnfoldOutlined />} onClick={() => setDeptPanelVisible(true)} />
                </Form.Item>
              )}
              <Form.Item name="username">
                <Input placeholder="用户名" prefix={<SearchOutlined />} />
              </Form.Item>
              <Form.Item name="status">
                <DictSelect
                  typeCode="sys_status"
                  placeholder="状态"
                  allowClear
                  className="w-[100px]"
                />
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
            title={`用户列表（${total}）`}
            extra={
              <Space>
                {hasSelected && (
                  <>
                    <Button size="small" onClick={handleBatchEnable}>
                      批量启用
                    </Button>
                    <Button size="small" onClick={handleBatchDisable}>
                      批量禁用
                    </Button>
                    <Button size="small" onClick={handleBatchResetPwd}>
                      批量重置密码
                    </Button>
                    <Button size="small" danger onClick={handleBatchDelete}>
                      批量删除
                    </Button>
                  </>
                )}
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                  新增用户
                </Button>
              </Space>
            }
          >
            {hasSelected && (
              <div className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                已选 {selectedRowKeys.length} 项{" "}
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
              scroll={{ x: 1400 }}
              rowSelection={rowSelection}
            />
          </Card>
        </div>
      </div>
      <Modal
        title={editingUser ? "编辑用户" : "新增用户"}
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
              <Form.Item
                name="username"
                label="用户名"
                rules={usernameRules}
              >
                <Input disabled={!!editingUser} />
              </Form.Item>
            </Col>
            {!editingUser && (
              <Col span={12}>
                <Form.Item
                  name="password"
                  label="密码"
                  rules={getPasswordRules(passwordMinLength, passwordComplexity)}
                >
                  <Input.Password />
                </Form.Item>
              </Col>
            )}
            <Col span={12}>
              <Form.Item name="nickname" label="昵称">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="状态" initialValue={1}>
                <DictSelect typeCode="sys_status" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="email"
                label="邮箱"
                rules={emailRules}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="phone"
                label="手机号"
                rules={phoneRules}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="deptId" label="部门">
                <TreeSelect
                  treeData={deptSelectData}
                  placeholder="选择部门"
                  allowClear
                  treeDefaultExpandAll
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="roleIds" label="角色">
                <Select mode="multiple" placeholder="选择角色" options={roleOptions} allowClear />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="tagIds" label="标签">
                <Select mode="multiple" placeholder="选择标签" options={tagOptions} allowClear />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
      <Modal
        title="重置密码"
        open={resetPwdOpen}
        onOk={handleResetPwdOk}
        onCancel={() => setResetPwdOpen(false)}
        confirmLoading={resetPwdLoading}
        destroyOnHidden
        width={480}
      >
        <Form form={resetPwdForm} layout="vertical" preserve={false}>
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={getPasswordRules(passwordMinLength, passwordComplexity)}
          >
            <Input.Password placeholder="请输入新密码" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认密码"
            dependencies={["newPassword"]}
            rules={[
              { required: true, message: "请确认密码" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("newPassword") === value) return Promise.resolve();
                  return Promise.reject(new Error("两次输入的密码不一致"));
                },
              }),
            ]}
          >
            <Input.Password placeholder="请再次输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UserPage;
