/** 生成 UUID（兼容非安全上下文） */
function genId(): string {
  return "n" + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
}

/** 流程设计器 — 可视化编辑流程图 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  type Connection,
  type Edge,
  type Node,
  type ReactFlowInstance,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button, Space, message, Spin, Typography } from "antd";
import { SaveOutlined, CheckCircleOutlined, ArrowLeftOutlined } from "@ant-design/icons";
import { client } from "@/api";
import { customNodeTypes } from "./components/CustomNodes";
import NodePalette from "./components/NodePalette";
import NodePropertyPanel from "./components/NodePropertyPanel";
import type { FlowNodeData, FlowNodeType } from "./components/types";

const { Title } = Typography;

/** 从 API graph 数据转为 ReactFlow nodes/edges */
function toFlowElements(graph: {
  nodes: Array<{ id: string; name: string; type: string; config?: unknown; position_x?: number; position_y?: number }>;
  edges: Array<{ id: string; source_node_id: string; target_node_id: string; name?: string }>;
}) {
  const nodes: Node[] = graph.nodes.map((n) => ({
    id: n.id, type: n.type,
    position: { x: n.position_x ?? 0, y: n.position_y ?? 0 },
    data: { label: n.name, nodeType: n.type, config: n.config ?? null } as FlowNodeData,
  }));
  const edges: Edge[] = graph.edges.map((e) => ({
    id: e.id, source: e.source_node_id, target: e.target_node_id,
    label: e.name ?? undefined, type: "smoothstep",
  }));
  return { nodes, edges };
}

/** 从 ReactFlow nodes/edges 转为 API graph 数据 */
function toGraphData(nodes: Node[], edges: Edge[]) {
  return {
    nodes: nodes.map((n, i) => ({
      id: n.id,
      name: (n.data as unknown as FlowNodeData).label,
      type: (n.data as unknown as FlowNodeData).nodeType,
      config: (n.data as unknown as FlowNodeData).config,
      position_x: Math.round(n.position.x),
      position_y: Math.round(n.position.y),
      sort: i,
    })),
    edges: edges.map((e, i) => ({
      id: e.id,
      source_node_id: e.source,
      target_node_id: e.target,
      name: (e.label as string) ?? null,
      sort: i,
    })),
  };
}

/** 本地校验（不依赖后端保存） */
function validateLocal(nodes: Node[], edges: Edge[]): string[] {
  const errors: string[] = [];
  const hasStart = nodes.some((n) => (n.data as unknown as FlowNodeData).nodeType === "start");
  const hasEnd = nodes.some((n) => (n.data as unknown as FlowNodeData).nodeType === "end");
  if (!hasStart) errors.push("缺少开始节点");
  if (!hasEnd) errors.push("缺少结束节点");

  for (const n of nodes) {
    const d = n.data as unknown as FlowNodeData;
    const outEdges = edges.filter((e) => e.source === n.id);
    const inEdges = edges.filter((e) => e.target === n.id);
    if (d.nodeType !== "start" && inEdges.length === 0) errors.push(`节点「${d.label}」无入边`);
    if (d.nodeType !== "end" && outEdges.length === 0) errors.push(`节点「${d.label}」无出边`);
    if (d.nodeType === "condition") {
      if (outEdges.length < 2) errors.push(`条件网关「${d.label}」至少需要 2 条出边`);
      if (!d.config?.defaultNodeId) errors.push(`条件网关「${d.label}」需设置默认路径`);
    }
  }
  return errors;
}

export default function WorkflowDesignerPage() {
  const { id: defId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const rfInstance = useRef<ReactFlowInstance | null>(null);

  // 当节点被删除（包括键盘 Delete）时，清除右侧面板
  useEffect(() => {
    if (selectedNode && !nodes.find((n) => n.id === selectedNode.id)) {
      setSelectedNode(null);
    }
  }, [nodes, selectedNode]);

  /** 加载图数据 */
  useEffect(() => {
    if (!defId) return;
    setLoading(true);
    client
      .get("/api/workflow/definitions/:id/graph", { params: { id: defId } })
      .then(({ error, data }) => {
        if (!error && data) {
          const graph = data as { nodes: unknown[]; edges: unknown[] };
          if (graph.nodes.length > 0) {
            const { nodes: n, edges: e } = toFlowElements(graph as Parameters<typeof toFlowElements>[0]);
            setNodes(n);
            setEdges(e);
            setTimeout(() => rfInstance.current?.fitView({ maxZoom: 0.7, padding: 0.2 }), 50);
          } else {
            initDefaultGraph();
          }
        } else {
          initDefaultGraph();
        }
      })
      .finally(() => setLoading(false));
  }, [defId]);

  const initDefaultGraph = () => {
    const startId = genId();
    const endId = genId();
    setNodes([
      { id: startId, type: "start", position: { x: 400, y: 80 }, data: { label: "开始", nodeType: "start", config: null } as FlowNodeData },
      { id: endId, type: "end", position: { x: 400, y: 500 }, data: { label: "结束", nodeType: "end", config: null } as FlowNodeData },
    ]);
    setEdges([]);
    setTimeout(() => rfInstance.current?.fitView({ maxZoom: 0.7, padding: 0.2 }), 50);
  };

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({ ...params, id: genId(), type: "smoothstep", interactionWidth: 20 }, eds));
    },
    [setEdges],
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => setSelectedNode(node), []);
  const onPaneClick = useCallback(() => setSelectedNode(null), []);

  /** 拖拽放置 */
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const nodeType = e.dataTransfer.getData("application/reactflow") as FlowNodeType;
      if (!nodeType || !rfInstance.current) return;
      const position = rfInstance.current.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNodeAt(nodeType, position.x, position.y);
    },
    [setNodes],
  );

  /** 添加节点（点击或拖拽） */
  const addNodeAt = useCallback(
    (type: FlowNodeType, x: number, y: number) => {
      const id = genId();
      const newNode: Node = {
        id, type,
        position: { x, y },
        data: {
          label: type === "approve" ? "审批节点" : type === "cc" ? "抄送节点" : "条件网关",
          nodeType: type,
          config: type === "approve"
            ? { strategy: "sequential", assignee: { mode: "fixed" }, rejectAction: "terminate" }
            : type === "condition"
              ? { conditions: [], defaultNodeId: "" }
              : null,
        } as FlowNodeData,
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes],
  );

  const handleAddNode = useCallback(
    (type: FlowNodeType) => {
      const cx = (rfInstance.current?.getViewport().x ?? 0) * -1 + 300;
      const cy = (rfInstance.current?.getViewport().y ?? 0) * -1 + 250;
      addNodeAt(type, cx + Math.random() * 60 - 30, cy + Math.random() * 60 - 30);
    },
    [addNodeAt],
  );

  const handleUpdateNode = useCallback(
    (nodeId: string, data: Partial<FlowNodeData>) => {
      setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, ...data } as FlowNodeData } : n));
      if (selectedNode?.id === nodeId) setSelectedNode((prev) => (prev ? { ...prev, data: { ...prev.data, ...data } } : prev));
    },
    [setNodes, selectedNode],
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    },
    [setNodes, setEdges],
  );

  /** 保存图 */
  const handleSave = async () => {
    if (!defId) return;
    // 先本地校验
    const errors = validateLocal(nodes, edges);
    if (errors.length > 0) {
      message.warning(`请先修复：${errors.join("；")}`);
      return;
    }
    setSaving(true);
    try {
      const graphData = toGraphData(nodes, edges);
      const { error } = await client.put("/api/workflow/definitions/:id/graph", {
        params: { id: defId },
        body: graphData,
      });
      if (!error) message.success("保存成功");
    } catch (e) {
      message.error("保存失败：" + (e instanceof Error ? e.message : "未知错误"));
    } finally {
      setSaving(false);
    }
  };

  /** 校验（纯本地，不依赖后端） */
  const handleValidate = () => {
    const errors = validateLocal(nodes, edges);
    if (errors.length === 0) {
      message.success("流程图校验通过 ✓");
    } else {
      message.warning(`校验失败：${errors.join("；")}`);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Spin size="large" description="加载中..." />
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-[#f5f5f5]" style={{ height: "calc(100vh - 56px)" }}>
      <div className="flex items-center justify-between bg-[#fff]" style={{ padding: "8px 16px", borderBottom: "1px solid #e8e8e8" }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/app/workflow/definitions")}>返回列表</Button>
          <Title level={5} className="m-0">流程设计器</Title>
        </Space>
        <Space>
          <Button onClick={handleValidate} icon={<CheckCircleOutlined />}>校验</Button>
          <Button type="primary" onClick={handleSave} loading={saving} icon={<SaveOutlined />}>保存</Button>
        </Space>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="p-3 overflow-y-auto bg-[#fafafa]" style={{ borderRight: "1px solid #e8e8e8" }}>
          <NodePalette onAddNode={handleAddNode} />
        </div>

        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onDragOver={onDragOver}
            onDrop={onDrop}
            nodeTypes={customNodeTypes}
            onInit={(instance) => {
              rfInstance.current = instance;
            }}
            defaultEdgeOptions={{ type: "smoothstep", interactionWidth: 20 }}
            connectionLineStyle={{ strokeWidth: 2, stroke: "#1677ff" }}
          >
            <Controls />
            <MiniMap nodeStrokeWidth={3} zoomable pannable />
            <Background gap={16} size={1} />
          </ReactFlow>
        </div>

        <div className="p-3 overflow-y-auto bg-[#fafafa]" style={{ borderLeft: "1px solid #e8e8e8" }}>
          <NodePropertyPanel
            node={selectedNode}
            allNodes={nodes}
            onUpdate={handleUpdateNode}
            onDelete={handleDeleteNode}
            onClose={() => setSelectedNode(null)}
          />
        </div>
      </div>
    </div>
  );
}
