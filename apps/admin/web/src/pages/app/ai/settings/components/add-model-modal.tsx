/**
 * AI 设置页 — 手动添加模型弹窗
 *
 * 表单内容由父页面通过 Form 实例注入，本组件只负责外壳与布局。
 */
import { Col, Divider, Form, Input, InputNumber, Modal, Row, Select, Switch } from "antd";

import type { FormInstance } from "antd";

export interface AddModelModalProps {
  open: boolean;
  providerLabel: string;
  form: FormInstance;
  submitting: boolean;
  onOk: () => void;
  onClose: () => void;
}

export default function AddModelModal({ open, providerLabel, form, submitting, onOk, onClose }: AddModelModalProps) {
  return (
<Modal
  title={`添加模型 — ${providerLabel}`}
  open={open}
  onOk={onOk}
  onCancel={onClose}
  confirmLoading={submitting}
  destroyOnHidden
  width={640}
>
  <Form form={form} layout="vertical">
    <Form.Item
      name="modelId"
      label="模型 ID"
      rules={[{ required: true, message: '请输入模型 ID' }]}
    >
      <Input placeholder="如 gpt-4o, deepseek-v4-flash, claude-sonnet-4" />
    </Form.Item>
    <Form.Item name="displayName" label="显示名称">
      <Input placeholder="留空则使用模型 ID" />
    </Form.Item>
    <Row gutter={16}>
      <Col span={12}>
        <Form.Item name="contextLength" label="上下文长度" initialValue={128000}>
          <InputNumber className="w-full" min={1} />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="maxOutputTokens" label="最大输出 Tokens" initialValue={4096}>
          <InputNumber className="w-full" min={1} />
        </Form.Item>
      </Col>
    </Row>
    <Divider className="mt-[8px] mb-[16px]">模态支持</Divider>
    <Row gutter={16}>
      <Col span={6}>
        <Form.Item name="supportsText" label="文本" valuePropName="checked" initialValue>
          <Switch />
        </Form.Item>
      </Col>
      <Col span={6}>
        <Form.Item name="supportsImage" label="图片" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Col>
      <Col span={6}>
        <Form.Item name="supportsVideo" label="视频" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Col>
      <Col span={6}>
        <Form.Item name="supportsAudio" label="语音" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Col>
    </Row>
    <Divider className="mt-[8px] mb-[16px]">能力</Divider>
    <Row gutter={16}>
      <Col span={6}>
        <Form.Item
          name="supportsFunctionCalling"
          label="函数调用"
          valuePropName="checked"
          initialValue
        >
          <Switch />
        </Form.Item>
      </Col>
      <Col span={6}>
        <Form.Item
          name="supportsStreaming"
          label="流式输出"
          valuePropName="checked"
          initialValue
        >
          <Switch />
        </Form.Item>
      </Col>
      <Col span={6}>
        <Form.Item name="supportsThinking" label="推理/思考" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Col>
      <Col span={6}>
        <Form.Item name="supportsStructuredOutput" label="结构化输出" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Col>
    </Row>
    <Form.Item
      noStyle
      shouldUpdate={(prev, cur) => prev.supportsThinking !== cur.supportsThinking}
    >
      {() => {
        const thinking = form.getFieldValue('supportsThinking');
        if (!thinking) return null;
        return (
          <div
            className="bg-[#fafafa] rounded-lg mb-4"
            style={{ padding: '8px 12px', border: '1px solid #f0f0f0' }}
          >
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="effortValues"
                  label="思考强度"
                  extra="用户可选择的推理强度级别，输入后自动转为小写"
                >
                  <Select
                    mode="tags"
                    placeholder="输入强度级别，如 low, medium, high"
                    tokenSeparators={[',']}
                    options={[
                      { value: 'minimal', label: 'minimal' },
                      { value: 'low', label: 'low' },
                      { value: 'medium', label: 'medium' },
                      { value: 'high', label: 'high' },
                      { value: 'xhigh', label: 'xhigh' },
                      { value: 'max', label: 'max' },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="budgetMin" label="Token 预算下限" extra="留空则无限制">
                  <InputNumber className="w-full" min={0} placeholder="如 1024" />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="budgetMax" label="Token 预算上限" extra="留空则无限制">
                  <InputNumber className="w-full" min={0} placeholder="如 32768" />
                </Form.Item>
              </Col>
            </Row>
          </div>
        );
      }}
    </Form.Item>
    <Divider className="mt-[8px] mb-[16px]">价格 ($/M tokens)</Divider>
    <Row gutter={16}>
      <Col span={12}>
        <Form.Item name="pricingInput" label="输入价格">
          <InputNumber className="w-full" min={0} step={0.01} />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="pricingOutput" label="输出价格">
          <InputNumber className="w-full" min={0} step={0.01} />
        </Form.Item>
      </Col>
    </Row>
    <Row gutter={16}>
      <Col span={12}>
        <Form.Item name="status" label="状态" initialValue={1}>
          <Select
            options={[
              { value: 1, label: '启用' },
              { value: 0, label: '禁用' },
            ]}
          />
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
  );
}
