import { CloudUploadOutlined } from "@ant-design/icons";

interface DragOverlayProps {
  visible: boolean;
}

export default function DragOverlay({ visible }: DragOverlayProps) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-[rgba(24,144,255,0.1)] flex items-center justify-center z-100 pointer-events-none">
      <div className="bg-white p-12 px-16 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.15)] text-center border-3 border-dashed border-[#1890ff]">
        <CloudUploadOutlined className="text-6xl text-[#1890ff] mb-4 block" />
        <div className="text-lg text-[#1890ff] font-medium">释放文件以上传</div>
      </div>
    </div>
  );
}
