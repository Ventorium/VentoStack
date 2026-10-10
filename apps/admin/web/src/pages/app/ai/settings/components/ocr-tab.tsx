/**
 * AI 设置页 — OCR 配置 Tab
 *
 * OCR（光学字符识别）用于解析扫描版 PDF 与图片文件。配置服务地址和 Token 后即可启用。
 */
import { ApiOutlined, SaveOutlined } from "@ant-design/icons";
import { Button, Form, Input, Space } from "antd";

export interface OcrTabProps {
  ocrServerUrl: string;
  ocrToken: string;
  ocrModel: string;
  ocrSaving: boolean;
  ocrTesting: boolean;
  onServerUrlChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onSave: () => void;
  onTest: () => void;
}

export default function OcrTab(props: OcrTabProps) {
  const {
    ocrServerUrl,
    ocrToken,
    ocrModel,
    ocrSaving,
    ocrTesting,
    onServerUrlChange,
    onTokenChange,
    onModelChange,
    onSave,
    onTest,
  } = props;

  return (
    <div className="max-w-[560px]">
      <div className="mb-4 bg-[#e6f4ff] rounded-md text-[13px] py-[8px] px-[12px]">
        💡 OCR（光学字符识别）用于解析扫描版 PDF与图片文件。配置服务地址和Token 后即可启用。
      </div>
      <Form layout="vertical">
        <Form.Item label="服务地址">
          <Input
            value={ocrServerUrl}
            placeholder="https://paddleocr.aistudio-app.com/api/v2/ocr/jobs"
            onChange={(e) => onServerUrlChange(e.target.value)}
            allowClear
          />
        </Form.Item>
        <Form.Item label="Token">
          <Input.Password
            value={ocrToken}
            placeholder="识别服务访问 Token"
            onChange={(e) => onTokenChange(e.target.value)}
            allowClear
          />
        </Form.Item>
        <Form.Item label="模型">
          <Input
            value={ocrModel}
            placeholder="PaddleOCR-VL-1.6"
            onChange={(e) => onModelChange(e.target.value)}
            allowClear
          />
        </Form.Item>
        <Space>
          <Button type="primary" icon={<SaveOutlined />} loading={ocrSaving} onClick={onSave}>
            保存
          </Button>
          <Button icon={<ApiOutlined />} loading={ocrTesting} onClick={onTest}>
            测试连接
          </Button>
        </Space>
      </Form>
    </div>
  );
}