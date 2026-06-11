/** 工作流状态横幅 — 可嵌入任何业务页面 */

import { Tag, Steps, Timeline, Spin, Space, Button, Modal, Input } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { useWorkflowStatus } from "./useWorkflowStatus";
import { useState } from "react";
import { client } from "@/api";
import { msg } from "@/components/GlobalMessage";

const StatusMap: Record<number, { label: string; color: string }> = {
  0: { label: "审批中", color: "processing" },
  1: { label: "已通过", color: "green" },
  2: { label: "已拒绝", color: "red" },
  3: { label: "已撤回", color: "orange" },
  4: { label: "已终止", color: "default" },
};

const TaskStatusMap: Record<number, { label: string; color: string }> = {
  0: { label: "待处理", color: "blue" },
  1: { label: "已通过", color: "green" },
  2: { label: "已拒绝", color: "red" },
  3: { label: "已转办", color: "orange" },
  4: { label: "已加签", color: "purple" },
  5: { label: "已作废", color: "default" },
};

const ActionLabel: Record<string, string> = {
  start: "发起审批",
  approve: "审批通过",
  reject: "审批拒绝",
  withdraw: "撤回申请",
  transfer: "转办",
  add_sign: "加签",
  cancel: "管理员终止",
  node_completed: "节点完成",
  complete: "流程结束",
};

interface Props {
  businessType: string;
  businessId: string | null | undefined;
  currentUserId?: string;
  onStatusChange?: () => void;
}

export default function WorkflowBanner({ businessType, businessId, currentUserId, onStatusChange }: Props) {
  const { data, loading, refresh } = useWorkflowStatus(businessType, businessId);
  const [approving, setApproving] = useState(false);
  const [commentModal, setCommentModal] = useState<{ taskId: string; action: "approve" | "reject" } | null>(null);
  const [comment, setComment] = useState("");

  if (!businessId) return null;
  if (loading) return <Spin size="small" />;
  if (!data) return null;

  const status = StatusMap[data.status] ?? { label: "未知", color: "default" };

  /** 当前用户可操作的待处理任务 */
  const myPendingTasks = data.tasks.filter(
    (t) => t.status === 0 && currentUserId && t.assigneeId === currentUserId,
  );

  const handleAction = async (taskId: string, action: "approve" | "reject", cmt?: string) => {
    setApproving(true);
    try {
      const { error } = await client.post(`/api/workflow/tasks/:id/${action}`, {
        params: { id: taskId },
        body: { comment: cmt ?? null },
      });
      if (!error) {
        msg.success(action === "approve" ? "审批通过" : "已拒绝");
        refresh();
        onStatusChange?.();
      }
    } finally {
      setApproving(false);
      setCommentModal(null);
      setComment("");
    }
  };

  return (
    <div style={{ padding: "8px 12px", background: "#fafafa", borderRadius: 6, border: "1px solid #e8e8e8", marginBottom: 12 }}>
      <Space style={{ marginBottom: 8 }}>
        <Tag color={status.color}>{status.label}</Tag>
        {data.title && <span style={{ fontSize: 13, color: "#666" }}>{data.title}</span>}
        <Button type="text" size="small" icon={<ReloadOutlined />} onClick={refresh} />
      </Space>

      {/* 审批节点状态 */}
      {data.tasks.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <Space wrap size={[4, 4]}>
            {data.tasks.map((t) => {
              const ts = TaskStatusMap[t.status] ?? { label: "未知", color: "default" };
              return (
                <Tag key={t.id} color={ts.color} style={{ fontSize: 11 }}>
                  {t.assigneeName || t.assigneeId}: {ts.label}
                  {t.comment ? ` (${t.comment})` : ""}
                </Tag>
              );
            })}
          </Space>
        </div>
      )}

      {/* 操作历史 */}
      {data.history.length > 0 && (
        <Timeline
          style={{ marginTop: 4, fontSize: 12 }}
          items={data.history.map((h) => ({
            color: h.action === "approve" ? "green" : h.action === "reject" ? "red" : h.action === "start" ? "blue" : "gray",
            children: (
              <span style={{ fontSize: 12 }}>
                {ActionLabel[h.action] ?? h.action}
                {h.comment ? ` — ${h.comment}` : ""}
                <span style={{ color: "#999", marginLeft: 8 }}>{new Date(h.createdAt).toLocaleString()}</span>
              </span>
            ),
          }))}
        />
      )}

      {/* 当前用户可操作 */}
      {myPendingTasks.length > 0 && (
        <Space style={{ marginTop: 8 }}>
          {myPendingTasks.map((t) => (
            <Space key={t.id}>
              <Button
                type="primary"
                size="small"
                loading={approving}
                onClick={() => setCommentModal({ taskId: t.id, action: "approve" })}
              >
                通过
              </Button>
              <Button
                danger
                size="small"
                loading={approving}
                onClick={() => setCommentModal({ taskId: t.id, action: "reject" })}
              >
                拒绝
              </Button>
            </Space>
          ))}
        </Space>
      )}

      {/* 审批意见弹窗 */}
      <Modal
        title={commentModal?.action === "approve" ? "审批通过" : "拒绝"}
        open={!!commentModal}
        onCancel={() => { setCommentModal(null); setComment(""); }}
        onOk={() => commentModal && handleAction(commentModal.taskId, commentModal.action, comment)}
        confirmLoading={approving}
        destroyOnClose
      >
        <Input.TextArea
          rows={3}
          placeholder="审批意见（可选）"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </Modal>
    </div>
  );
}
