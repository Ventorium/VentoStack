import { CloudUploadOutlined } from "@ant-design/icons";

interface DragOverlayProps {
  visible: boolean;
}

export default function DragOverlay({ visible }: DragOverlayProps) {
  if (!visible) return null;

  return (
    <div className="drag-overlay">
      <div className="drag-overlay-content">
        <CloudUploadOutlined className="drag-overlay-icon" />
        <div className="drag-overlay-text">释放文件以上传</div>
      </div>
    </div>
  );
}
