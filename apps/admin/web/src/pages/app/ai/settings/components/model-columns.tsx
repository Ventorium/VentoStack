/**
 * AI 设置页 — 模型表格列定义
 *
 * 依赖较多，故以工厂函数接收外部状态，避免模块级隐式捕获。
 */
import { StarFilled } from "@ant-design/icons";
import { Space, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import ActionColumn from "@/components/ActionColumn";
import CapIcons from "./cap-icons";
import type { ModelItem, ProviderItem } from "../types";

const { Text } = Typography;

export interface ModelColumnHandlers {
  modelsProvider: ProviderItem | null;
  modelTestResults: Record<string, { status: string; elapsed?: number; message?: string }>;
  testingModels: Set<string>;
  isDefaultModel: (providerName: string, modelId: string) => boolean;
  handleSetDefault: (providerName: string, modelId: string) => void;
  handleClearDefault: () => void;
  handleDeleteModel: (modelId: string) => void;
  handleTestModel: (modelId: string) => void;
  openEditModel: (model: ModelItem) => void;
}

export function createModelColumns(handlers: ModelColumnHandlers): ColumnsType<ModelItem> {
  const {
    handleClearDefault, handleDeleteModel, handleSetDefault, handleTestModel,
    isDefaultModel, modelTestResults, modelsProvider, openEditModel, testingModels,
  } = handlers;

  return [
    {
      title: '模型 ID',
      dataIndex: 'modelId',
      key: 'modelId',
      // width: 'min-content',
      fixed: 'left',
      sorter: (a, b) => {
        const aDefault = isDefaultModel(modelsProvider?.name ?? '', a.modelId) ? 0 : 1;
        const bDefault = isDefaultModel(modelsProvider?.name ?? '', b.modelId) ? 0 : 1;
        if (aDefault !== bDefault) return aDefault - bDefault;
        return (a.displayName || a.modelId).localeCompare(b.displayName || b.modelId);
      },
      defaultSortOrder: 'ascend',
      render: (text: string, r) => {
        const isDefault = isDefaultModel(modelsProvider?.name ?? '', r.modelId);
        return (
          <Space>
            {isDefault && <StarFilled className="text-[#faad14] text-sm" />}
            <Text strong>{r.displayName || text}</Text>
            {isDefault && <Tag color="gold">默认</Tag>}
            {r.autoFetched && (
              <Tag color="blue" className="text-[10px]">
                自动
              </Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: '上下文',
      dataIndex: 'contextLength',
      key: 'contextLength',
      width: 90,
      render: (v: number) =>
        v >= 1000000 ? `${(v / 1000000).toFixed(0)}M` : `${(v / 1000).toFixed(0)}K`,
    },
    {
      title: '输出上限',
      dataIndex: 'maxOutputTokens',
      key: 'maxOutputTokens',
      width: 90,
      render: (v: number) =>
        v >= 1000000
          ? `${(v / 1000000).toFixed(0)}M`
          : v >= 1000
            ? `${(v / 1000).toFixed(0)}K`
            : String(v),
    },
    {
      title: '能力',
      key: 'caps',
      width: 110,
      render: (_, r) => <CapIcons model={r} />,
    },
    {
      title: '价格 ($/M)',
      key: 'price',
      width: 120,
      render: (_, r) =>
        r.pricingInput != null && r.pricingInput > 0 ? (
          <Text type="secondary" className="text-xs">
            ${r.pricingInput} / ${r.pricingOutput}
          </Text>
        ) : (
          <Tooltip title="点击编辑按钮手动填写价格">
            <Text type="secondary" className="cursor-pointer text-[11px]">
              未设置
            </Text>
          </Tooltip>
        ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 70,
      render: (v: number) => (
        <Tag color={v === 1 ? 'green' : 'red'}>{v === 1 ? '启用' : '禁用'}</Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 'min-content',
      fixed: 'right',
      render: (_, r) => {
        const isDefault = isDefaultModel(modelsProvider?.name ?? '', r.modelId);
        return (() => {
          const testResult = modelTestResults[r.id];
          const testLabel = testingModels.has(r.id)
            ? '测试中...'
            : testResult?.status === 'ok'
              ? `✓ ${testResult.elapsed}ms`
              : testResult?.status === 'error'
                ? '✗ 失败'
                : '测试';
          const items: Array<{
            label: string;
            onClick: () => void;
            danger?: boolean;
            confirm?: string;
          }> = [
            isDefault
              ? { label: '取消默认', onClick: handleClearDefault }
              : {
                  label: '设为默认',
                  onClick: () => handleSetDefault(modelsProvider?.name ?? '', r.modelId),
                },
            { label: testLabel, onClick: () => handleTestModel(r.id) },
            { label: '编辑', onClick: () => openEditModel(r) },
            {
              label: '删除',
              onClick: () => handleDeleteModel(r.id),
              danger: true,
              confirm: '确定删除此模型？',
            },
          ];
          return <ActionColumn items={items} maxInline={3} />;
        })();
      },
    },  ];
}
