/** 右侧节点属性面板 — 用户/角色/部门选择器 + 条件网关配置 */

import { useEffect, useState } from "react";
import { Card, Form, Input, Select, Switch, InputNumber, Button, Space, Divider, Tag, Tooltip } from "antd";
import { DeleteOutlined, PlusOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import type { Node } from "@xyflow/react";
import { client } from "@/api";
import { NODE_TYPE_META, type FlowNodeData, type NodeConfig, type ConditionItem } from "./types";

interface Props {
  node: Node | null;
  allNodes: Node[];
  onUpdate: (nodeId: string, data: Partial<FlowNodeData>) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
}

/** 通用选项 hook — 拉取用户/角色/部门列表 */
function useApiOptions() {
  const [users, setUsers] = useState<Array<{ value: string; label: string }>>([]);
  const [roles, setRoles] = useState<Array<{ value: string; label: string }>>([]);
  const [depts, setDepts] = useState<Array<{ value: string; label: string }>>([]);
  const [tags, setTags] = useState<Array<{ value: string; label: string }>>([]);

  useEffect(() => {
    client.get("/api/system/users", { query: { pageSize: 200 } }).then(({ data }) => {
      const list = (data as { list?: Array<{ id: string; nickname: string; username: string }> })?.list ?? [];
      setUsers(list.map((u) => ({ value: u.id, label: `${u.nickname || u.username}` })));
    }).catch(() => {});
    client.get("/api/system/roles", { query: { pageSize: 200 } }).then(({ data }) => {
      const list = (data as { list?: Array<{ id: string; name: string }> })?.list ?? [];
      setRoles(list.map((r) => ({ value: r.id, label: r.name })));
    }).catch(() => {});
    client.get("/api/system/depts/tree").then(({ data }) => {
      const flatten = (items: Array<{ id: string; name: string; children?: typeof items }>): Array<{ value: string; label: string }> =>
        items.flatMap((d) => [{ value: d.id, label: d.name }, ...(d.children ? flatten(d.children) : [])]);
      setDepts(flatten((data as Array<{ id: string; name: string; children?: typeof data }>) ?? []));
    }).catch(() => {});
    client.get("/api/system/tags/all").then(({ data }) => {
      const list = (data as Array<{ id: string; name: string }> | undefined) ?? [];
      setTags(list.map((t) => ({ value: t.id, label: t.name })));
    }).catch(() => {});
  }, []);

  return { users, roles, depts, tags };
}

export default function NodePropertyPanel({ node, allNodes, onUpdate, onDelete, onClose }: Props) {
  const [form] = Form.useForm();
  const d = (node?.data ?? null) as unknown as FlowNodeData | null;
  const { users, roles, depts, tags } = useApiOptions();

  useEffect(() => {
    if (!d || !node) return;
    form.setFieldsValue({
      label: d.label,
      strategy: d.config?.strategy ?? "sequential",
      percentage: d.config?.percentage ?? 50,
      assigneeMode: d.config?.assignee?.mode ?? "fixed",
      assigneeUserIds: d.config?.assignee?.userIds ?? [],
      assigneeRoleId: d.config?.assignee?.roleId ?? undefined,
      assigneeDeptId: d.config?.assignee?.deptId ?? undefined,
      assigneeLookupKey: d.config?.assignee?.lookupKey ?? "",
      assigneeFormField: d.config?.assignee?.formField ?? "",
      assigneeTagId: d.config?.assignee?.tagId ?? undefined,
      rejectAction: d.config?.rejectAction ?? "terminate",
      counterSign: d.config?.counterSign ?? false,
      conditions: d.config?.conditions ?? [],
      defaultNodeId: d.config?.defaultNodeId ?? undefined,
    });
  }, [node?.id, d]);

  if (!node || !d) {
    return (
      <Card size="small" className="w-[300px] rounded-lg">
        <div className="text-[#999] text-center p-10">点击节点查看属性</div>
      </Card>
    );
  }

  const meta = NODE_TYPE_META[d.nodeType];
  const isStart = d.nodeType === "start";
  const isEnd = d.nodeType === "end";
  const isCondition = d.nodeType === "condition";
  const isApprove = d.nodeType === "approve";

  /** 可选的目标节点（用于条件默认路径） */
  const otherNodes = allNodes
    .filter((n) => n.id !== node.id)
    .map((n) => ({ value: n.id, label: ((n.data as unknown as FlowNodeData)?.label) ?? n.id }));

  const handleSave = () => {
    const v = form.getFieldsValue();
    const config: NodeConfig = d.config ? { ...d.config } : {};

    if (isApprove || d.nodeType === "cc") {
      config.strategy = v.strategy;
      config.percentage = v.percentage;
      config.rejectAction = v.rejectAction;
      config.counterSign = v.counterSign;
      config.assignee = {
        mode: v.assigneeMode,
        userIds: v.assigneeUserIds?.length > 0 ? v.assigneeUserIds : undefined,
        roleId: v.assigneeRoleId || undefined,
        deptId: v.assigneeDeptId || undefined,
        lookupKey: v.assigneeLookupKey || undefined,
        formField: v.assigneeFormField || undefined,
        tagId: v.assigneeTagId || undefined,
      };
    }

    if (isCondition) {
      config.conditions = (v.conditions ?? []).filter((c: ConditionItem) => c.field && c.targetNodeId);
      config.defaultNodeId = v.defaultNodeId || undefined;
    }

    onUpdate(node.id, { label: v.label, config: Object.keys(config).length > 0 ? config : null });
  };

  return (
    <Card
      size="small"
      className="w-[340px] rounded-lg"
      title={
        <Space>
          <Tag color={meta.color}>{meta.icon} {meta.label}</Tag>
          <span className="text-[13px]">属性配置</span>
        </Space>
      }
      extra={
        !isStart && !isEnd && (
          <Button type="text" danger size="small" icon={<DeleteOutlined />}
            onClick={() => { onDelete(node.id); onClose(); }} />
        )
      }
    >
      <Form form={form} layout="vertical" size="small">
        <Form.Item name="label" label="节点名称">
          <Input />
        </Form.Item>

        {/* ===== 审批/抄送节点配置 ===== */}
        {!isStart && !isEnd && !isCondition && (
          <>
            <Divider className="my-[8px]">审批人配置</Divider>
            <Form.Item name="assigneeMode" label="指定方式">
              <Select
                options={[
                  { value: "fixed", label: "指定用户" },
                  { value: "role", label: "按角色" },
                  { value: "department", label: "按部门" },
                  { value: "lookup", label: "自动查找（上级/领导）" },
                  { value: "form_field", label: "表单字段指定" },
                ]}
              />
            </Form.Item>

            <Form.Item noStyle shouldUpdate={(prev, cur) => prev.assigneeMode !== cur.assigneeMode}>
              {({ getFieldValue }) => {
                const mode = getFieldValue("assigneeMode");
                if (mode === "fixed") return (
                  <Form.Item name="assigneeUserIds" label="审批人">
                    <Select mode="multiple" placeholder="选择用户" options={users} showSearch
                      filterOption={(input, option) => (option?.label ?? "").toLowerCase().includes(input.toLowerCase())} />
                  </Form.Item>
                );
                if (mode === "role") return (
                  <Form.Item name="assigneeRoleId" label="角色">
                    <Select placeholder="选择角色" options={roles} showSearch allowClear
                      filterOption={(input, option) => (option?.label ?? "").toLowerCase().includes(input.toLowerCase())} />
                  </Form.Item>
                );
                if (mode === "department") return (
                  <Form.Item name="assigneeDeptId" label="部门">
                    <Select placeholder="选择部门" options={depts} showSearch allowClear
                      filterOption={(input, option) => (option?.label ?? "").toLowerCase().includes(input.toLowerCase())} />
                  </Form.Item>
                );
                if (mode === "lookup") return (
                  <Form.Item name="assigneeLookupKey" label="查找类型">
                    <Select options={[
                      { value: "initiator_superior", label: "发起人的直属上级" },
                      { value: "initiator_dept_leader", label: "发起人部门领导" },
                      { value: "initiator_dept_hr", label: "发起人部门 HR" },
                    ]} />
                  </Form.Item>
                );
                if (mode === "form_field") return (
                  <Form.Item name="assigneeFormField" label="表单字段名" extra="流程启动时，该字段值作为审批人用户 ID">
                    <Input placeholder="如 approverId" />
                  </Form.Item>
                );
                return null;
              }}
            </Form.Item>

            {isApprove && (
              <>
                <Divider className="my-[8px]">审批策略</Divider>
                <Form.Item name="strategy" label="审批方式">
                  <Select options={[
                    { value: "sequential", label: "依次审批（按顺序逐个审批）" },
                    { value: "parallel_and", label: "会签（全部通过才通过）" },
                    { value: "parallel_or", label: "或签（任一通过即通过）" },
                    { value: "percentage", label: "百分比（按比例通过）" },
                  ]} />
                </Form.Item>
                <Form.Item noStyle shouldUpdate={(prev, cur) => prev.strategy !== cur.strategy}>
                  {({ getFieldValue }) =>
                    getFieldValue("strategy") === "percentage" && (
                      <Form.Item name="percentage" label="通过百分比">
                        <InputNumber min={1} max={100} addonAfter="%" className="w-full" />
                      </Form.Item>
                    )
                  }
                </Form.Item>
                <Form.Item name="rejectAction" label="拒绝动作">
                  <Select options={[
                    { value: "terminate", label: "直接终止流程" },
                    { value: "return_to_previous", label: "退回上一审批节点" },
                    { value: "return_to_start", label: "退回到发起人重新填写" },
                  ]} />
                </Form.Item>
                <Form.Item
                  name="counterSign"
                  label={
                    <Space>
                      允许加签
                      <Tooltip title="加签：审批人在处理任务时，可以临时增加其他审批人一起审批。适用于审批人拿不准、需要征求他人意见的场景。">
                        <QuestionCircleOutlined />
                      </Tooltip>
                    </Space>
                  }
                  valuePropName="checked"
                >
                  <Switch />
                </Form.Item>
              </>
            )}
          </>
        )}

        {/* ===== 条件网关配置 ===== */}
        {isCondition && (
          <>
            <Divider className="my-[8px]">条件规则</Divider>
            <Form.List name="conditions">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name }) => (
                    <div key={key} className="rounded-md p-2 mb-2" style={{ border: "1px solid #f0f0f0" }}>
                      <Space className="w-full" direction="vertical" size={4}>
                        <Space>
                          <Form.Item name={[name, "field"]} noStyle>
                            <Input placeholder="字段 如 formData.days" className="w-[140px]" />
                          </Form.Item>
                          <Form.Item name={[name, "operator"]} noStyle>
                            <Select className="w-[70px]" placeholder="运算" options={[
                              { value: "==", label: "==" },
                              { value: "!=", label: "!=" },
                              { value: ">", label: ">" },
                              { value: "<", label: "<" },
                              { value: ">=", label: ">=" },
                              { value: "<=", label: "<=" },
                            ]} />
                          </Form.Item>
                          <Form.Item name={[name, "value"]} noStyle>
                            <Input placeholder="值" className="w-[80px]" />
                          </Form.Item>
                          <Button type="text" danger size="small" onClick={() => remove(name)}>删</Button>
                        </Space>
                        <Form.Item name={[name, "targetNodeId"]} label="满足时走向" className="mb-0">
                          <Select placeholder="选择目标节点" options={otherNodes} allowClear className="w-full" />
                        </Form.Item>
                      </Space>
                    </div>
                  ))}
                  <Button type="dashed" size="small" block icon={<PlusOutlined />} onClick={() => add({ field: "", operator: "==", value: "", targetNodeId: "" })}>
                    添加条件
                  </Button>
                </>
              )}
            </Form.List>
            <Form.Item name="defaultNodeId" label="默认路径（不满足任何条件时）" className="mt-2">
              <Select placeholder="选择默认目标节点" options={otherNodes} allowClear />
            </Form.Item>
          </>
        )}

        <Divider className="my-[8px]" />
        <Space>
          <Button type="primary" size="small" onClick={handleSave}>保存</Button>
          <Button size="small" onClick={onClose}>取消</Button>
        </Space>
      </Form>
    </Card>
  );
}
