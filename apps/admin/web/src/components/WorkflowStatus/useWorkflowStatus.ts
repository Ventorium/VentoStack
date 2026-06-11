/** 通用工作流状态 hook — 任何业务页面复用 */

import { useCallback, useEffect, useState } from "react";
import { client } from "@/api";

export interface WorkflowTaskInfo {
  id: string;
  nodeId: string;
  nodeName?: string;
  assigneeId: string;
  assigneeName?: string;
  status: number;
  action: string | null;
  comment: string | null;
  actedAt: string | null;
  createdAt: string;
}

export interface WorkflowStatusData {
  instanceId: string;
  status: number;
  title: string | null;
  initiatorId: string;
  tasks: WorkflowTaskInfo[];
  history: Array<{
    id: string;
    action: string;
    comment: string | null;
    operatorId: string;
    createdAt: string;
    nodeId?: string;
  }>;
  createdAt: string;
}

/** 查询某条业务数据的审批状态 */
export function useWorkflowStatus(businessType: string, businessId: string | null | undefined) {
  const [data, setData] = useState<WorkflowStatusData | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    if (!businessId) { setData(null); return; }
    setLoading(true);
    client
      .get("/api/workflow/instances", { query: { businessType, businessId, pageSize: 1 } })
      .then(({ error, data: result }) => {
        if (!error && result) {
          const list = (result as { list?: Array<{ id: string; status: number; title: string | null; initiatorId: string; createdAt: string }> })?.list ?? [];
          if (list.length > 0) {
            const inst = list[0]!;
            // 获取详情（含 tasks 和 history）
            client
              .get("/api/workflow/instances/:id", { params: { id: inst.id } })
              .then(({ error: e2, data: detail }) => {
                if (!e2 && detail) {
                  const d = detail as { tasks?: WorkflowTaskInfo[]; history?: WorkflowStatusData["history"] };
                  setData({
                    instanceId: inst.id,
                    status: inst.status,
                    title: inst.title,
                    initiatorId: inst.initiatorId,
                    tasks: d.tasks ?? [],
                    history: d.history ?? [],
                    createdAt: inst.createdAt,
                  });
                }
              });
          } else {
            setData(null);
          }
        }
      })
      .finally(() => setLoading(false));
  }, [businessType, businessId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, loading, refresh };
}
