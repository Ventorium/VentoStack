import { client } from "@/api";
import type { DeptItem } from "@/api/types";
import ActionColumn from "@/components/ActionColumn";
import DictSelect from "@/components/DictSelect";
import { msg } from "@/components/GlobalMessage";
import { fmtDate } from "@/utils/fmtDate";
import { PlusOutlined } from "@ant-design/icons";
import { ExpandAltOutlined, ShrinkOutlined } from "@ant-design/icons";
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  TreeSelect,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function toTreeSelectData(items: DeptItem[]): any[] {
  return items.map((item) => ({
    value: item.id,
    title: item.name,
    children: item.children?.length ? toTreeSelectData(item.children) : undefined,
  }));
}

interface UserOption {
  id: string;
  nickname: string | null;
  username: string;
}

/** 负责人用户远程搜索选择（按用户名/昵称模糊查询） */
function LeaderSelect({
  value,
  onChange,
  initialLabel,
}: {
  value?: string | null;
  onChange?: (v: string | null) => void;
  /** 编辑回填时显示的初始 label（负责人昵称） */
  initialLabel?: string;
}) {
  const [options, setOptions] = useState<UserOption[]>([]);
  const [fetching, setFetching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 用初始 label 构造回填选项
  useEffect(() => {
    if (value && initialLabel && !options.some((o) => o.id === value)) {
      setOptions([{ id: value, nickname: initialLabel, username: "" }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, initialLabel]);

  const handleSearch = useCallback((keyword: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!keyword.trim()) return;
    timerRef.current = setTimeout(async () => {
      setFetching(true);
      try {
        const { data } = await client.get("/api/system/users", {
          query: { page: 1, pageSize: 20, username: keyword.trim() },
        });
        setOptions((data as { list?: UserOption[] } | undefined)?.list ?? []);
      } finally {
        setFetching(false);
      }
    }, 300);
  }, []);

  return (
    <Select
      showSearch
      allowClear
      filterOption={false}
      placeholder="搜索并选择用户"
      notFoundContent={fetching ? "搜索中…" : "暂无匹配用户"}
      value={value ?? undefined}
      labelInValue={false}
      onSearch={handleSearch}
      onChange={(v) => onChange?.(v ?? null)}
      options={options.map((u) => ({
        value: u.id,
        label: u.nickname
          ? u.username
            ? `${u.nickname}（${u.username}）`
            : u.nickname
          : u.username,
      }))}
    />
  );
}

const DeptPage = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DeptItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<DeptItem | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [form] = Form.useForm();
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [selectedRows, setSelectedRows] = useState<DeptItem[]>([]);
  const hasSelected = selectedRowKeys.length > 0;
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);

  /** 收集树中所有节点的 key */
  const collectAllKeys = (items: DeptItem[]): React.Key[] => {
    const keys: React.Key[] = [];
    const walk = (nodes: DeptItem[]) => {
      for (const node of nodes) {
        keys.push(node.id);
        if (node.children?.length) walk(node.children);
      }
    };
    walk(items);
    return keys;
  };

  const allKeys = useMemo(() => collectAllKeys(data), [data]);
  const allExpanded = expandedKeys.length >= allKeys.length && allKeys.length > 0;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { error, data } = (await client.get("/api/system/depts/tree")) as {
        error?: unknown;
        data?: DeptItem[];
      };
      if (!error) {
        const tree = data ?? [];
        setData(tree);
        setExpandedKeys(collectAllKeys(tree));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openCreate = (parent?: DeptItem) => {
    setEditingDept(null);
    form.resetFields();
    form.setFieldsValue({ sort: 0, status: 1, parentId: parent?.id });
    setModalOpen(true);
  };

  const openEdit = (r: DeptItem) => {
    setEditingDept(r);
    form.setFieldsValue({
      parentId: r.parentId,
      name: r.name,
      sort: r.sort,
      leaderUserId: r.leaderUserId,
      status: r.status,
    });
    setModalOpen(true);
  };

  const handleOk = async () => {
    const values = await form.validateFields();
    setModalLoading(true);
    try {
      if (editingDept) {
        const { error } = await client.put("/api/system/depts/:id", {
          params: { id: editingDept.id },
          body: values,
        });
        if (!error) {
          msg.success("更新成功");
          setModalOpen(false);
          fetchData();
        }
      } else {
        const { error } = await client.post("/api/system/depts", { body: values });
        if (!error) {
          msg.success("创建成功");
          setModalOpen(false);
          fetchData();
        }
      }
    } finally {
      setModalLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await client.delete("/api/system/depts/:id", { params: { id } });
    if (!error) {
      msg.success("删除成功");
      fetchData();
    }
  };

  const handleBatchDelete = () => {
    const names = selectedRows.map((r) => r.name).join("、");
    Modal.confirm({
      title: "批量删除",
      content: `确定要删除以下 ${selectedRowKeys.length} 个部门吗？此操作不可恢复。\n${names}`,
      okType: "danger",
      okText: "确定删除",
      onOk: async () => {
        const { error, data } = await client.post("/api/system/depts/batch-delete", {
          body: { ids: selectedRowKeys as string[] },
        });
        if (!error) {
          const result = data as { success: number; skipped: number };
          if (result.skipped > 0) {
            msg.success(`删除完成：成功 ${result.success} 项，跳过 ${result.skipped} 项`);
          } else {
            msg.success(`删除成功，共 ${result.success} 项`);
          }
          setSelectedRowKeys([]);
          setSelectedRows([]);
          fetchData();
        }
      },
    });
  };

  const columns: ColumnsType<DeptItem> = [
    { title: "部门名称", dataIndex: "name", key: "name" },
    { title: "负责人", dataIndex: "leaderName", key: "leaderName", width: 120 },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 80,
      render: (_: unknown, r: DeptItem) => (
        <Tag color={r.status === 1 ? "green" : "red"}>{r.status === 1 ? "正常" : "禁用"}</Tag>
      ),
    },
    { title: "排序", dataIndex: "sort", key: "sort", width: 60 },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 180,
      render: (_: unknown, r: DeptItem) => fmtDate(r.createdAt),
    },
    {
      title: "操作",
      key: "action",
      width: 180,
      fixed: "right" as const,
      render: (_: unknown, r: DeptItem) => (
        <ActionColumn
          items={[
            { label: "编辑", onClick: () => openEdit(r) },
            { label: "新增子部门", onClick: () => openCreate(r) },
            {
              label: "删除",
              onClick: () => handleDelete(r.id),
              danger: true,
              confirm: "确定删除该部门？",
            },
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">部门管理</h3>
      <Card
        title={
          <Space>
            <span>部门列表</span>
            <Button
              type="link"
              size="small"
              icon={allExpanded ? <ShrinkOutlined /> : <ExpandAltOutlined />}
              onClick={() => setExpandedKeys(allExpanded ? [] : allKeys)}
            >
              {allExpanded ? "收起所有" : "展开所有"}
            </Button>
          </Space>
        }
        extra={
          <Space>
            {hasSelected && (
              <Button size="small" danger onClick={handleBatchDelete}>
                批量删除
              </Button>
            )}
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate()}>
              新增部门
            </Button>
          </Space>
        }
      >
        {hasSelected && (
          <div className="mb-2 text-sm text-gray-500 dark:text-gray-400">
            已选 {selectedRowKeys.length} 项{" "}
            <Button
              type="link"
              size="small"
              onClick={() => {
                setSelectedRowKeys([]);
                setSelectedRows([]);
              }}
            >
              取消选择
            </Button>
          </div>
        )}
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          pagination={false}
          scroll={{ x: 1100 }}
          expandable={{
            expandedRowKeys: expandedKeys,
            onExpandedRowsChange: (keys) => setExpandedKeys(keys),
          }}
          size="small"
          rowSelection={{
            selectedRowKeys,
            onChange: (keys, rows) => {
              setSelectedRowKeys(keys);
              setSelectedRows(rows as DeptItem[]);
            },
          }}
        />
      </Card>
      <Modal
        title={editingDept ? "编辑部门" : "新增部门"}
        open={modalOpen}
        onOk={handleOk}
        onCancel={() => setModalOpen(false)}
        confirmLoading={modalLoading}
        destroyOnHidden
        width={640}
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="parentId" label="上级部门">
            <TreeSelect
              allowClear
              treeDefaultExpandAll
              placeholder="留空为顶级部门"
              treeData={toTreeSelectData(data)}
            />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="部门名称" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="leaderUserId" label="负责人">
                <LeaderSelect initialLabel={editingDept?.leaderName ?? undefined} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="status" label="状态" initialValue={1}>
                <DictSelect typeCode="sys_status" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="sort" label="排序" initialValue={0}>
                <InputNumber className="w-full" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
};

export default DeptPage;
