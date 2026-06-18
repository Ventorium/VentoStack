import { useState } from "react";
import { Card, Table, Button, Form, Input, Space, Tag, Modal, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { client } from "@/api";
import type { PaginatedData, WorkflowTaskItem } from "@/api/types";
import { useTable } from "@/hooks/useTable";
import ActionColumn from "@/components/ActionColumn";
import { fmtDate } from "@/utils/fmtDate";

const fetcher = (params: Record<string, unknown>) =>
  client.get("/api/workflow/tasks", { query: params }) as Promise<{
    error?: unknown;
    data?: PaginatedData<WorkflowTaskItem>;
  }>;

const TaskStatusMap: Record<number, { label: string; color: string }> = {
  0: { label: "待审批", color: "processing" },
  1: { label: "已通过", color: "green" },
  2: { label: "已驳回", color: "red" },
  3: { label: "已转办", color: "orange" },
  5: { label: "已作废", color: "default" },
};

const WorkflowTasksPage = () => {
  const { loading, data, total, page, pageSize, refresh, onSearch, onReset, onPageChange } =
    useTable<WorkflowTaskItem>(fetcher);
  const [searchForm] = Form.useForm();
  const [commentModal, setCommentModal] = useState<{ taskId: string; action: "approve" | "reject" } | null>(null);
  const [comment, setComment] = useState("");

  const handleAction = async () => {
    if (!commentModal) return;
    const { taskId, action } = commentModal;
    const { error } = await client.post(`/api/workflow/tasks/:id/${action}`, {
      params: { id: taskId },
      body: { comment },
    });
    if (!error) {
      message.success(action === "approve" ? "审批通过" : "已驳回");
      setCommentModal(null);
      setComment("");
      refresh();
    }
  };

  const columns: ColumnsType<WorkflowTaskItem> = [
    { title: "任务ID", dataIndex: "id", key: "id", width: 280, ellipsis: true },
    { title: "实例ID", dataIndex: "instanceId", key: "instanceId", width: 280, ellipsis: true },
    {
      title: "状态", dataIndex: "status", key: "status", width: 90,
      render: (_: unknown, r: WorkflowTaskItem) => {
        const s = TaskStatusMap[r.status] ?? { label: "未知", color: "default" };
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    { title: "审批意见", dataIndex: "comment", key: "comment", width: 160, ellipsis: true },
    {
      title: "创建时间", dataIndex: "createdAt", key: "createdAt", width: 180,
      render: (_: unknown, r: WorkflowTaskItem) => fmtDate(r.createdAt),
    },
    {
      title: "操作", key: "action", width: 160, fixed: "right" as const,
      render: (_: unknown, r: WorkflowTaskItem) => (
        <ActionColumn
          items={[
            ...(r.status === 0
              ? [
                  { label: "通过", onClick: () => setCommentModal({ taskId: r.id, action: "approve" }) },
                  { label: "驳回", onClick: () => setCommentModal({ taskId: r.id, action: "reject" }), danger: true },
                ]
              : []),
          ]}
        />
      ),
    },
  ];

  return (
    <Card>
      <Form form={searchForm} layout="inline" className="mb-4"
        onFinish={() => onSearch({})}>
        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">搜索</Button>
            <Button onClick={() => { searchForm.resetFields(); onReset(); }}>重置</Button>
          </Space>
        </Form.Item>
      </Form>

      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={data}
        pagination={{
          current: page, pageSize, total,
          showSizeChanger: true, showTotal: (t) => `共 ${t} 条`, onChange: onPageChange,
        }}
        scroll={{ x: 1100 }}
      />

      <Modal
        title={commentModal?.action === "approve" ? "审批通过" : "驳回"}
        open={!!commentModal}
        onOk={handleAction}
        onCancel={() => { setCommentModal(null); setComment(""); }}
        destroyOnClose
      >
        <Input.TextArea
          rows={3}
          placeholder="请输入审批意见（可选）"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </Modal>
    </Card>
  );
};

export default WorkflowTasksPage;
