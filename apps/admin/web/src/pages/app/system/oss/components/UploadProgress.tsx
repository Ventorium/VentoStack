import { useUploadStore } from "@/store/upload";
import {
  CheckCircleOutlined,
  CloseOutlined,
  DownOutlined,
  ExclamationCircleOutlined,
  UpOutlined,
} from "@ant-design/icons";
import { Badge, Button, Progress } from "antd";
import { useState } from "react";

export default function UploadProgress() {
  const { tasks, isVisible, setVisible, removeTask, clearCompleted } = useUploadStore();
  const [isExpanded, setIsExpanded] = useState(true);

  if (!isVisible || tasks.length === 0) return null;

  const uploadingCount = tasks.filter((t) => t.status === "uploading").length;
  const successCount = tasks.filter((t) => t.status === "success").length;
  const errorCount = tasks.filter((t) => t.status === "error").length;

  return (
    <div className="fixed bottom-6 right-6 w-[360px] max-h-[400px] bg-white rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.15)] z-999 flex flex-col overflow-hidden">
      <div className="flex justify-between items-center px-4 py-3 border-b border-[#f0f0f0] bg-[#fafafa]">
        <div className="font-medium flex items-center">
          <Badge count={uploadingCount} className="bg-[#1890ff]">
            <span>上传任务</span>
          </Badge>
          {successCount > 0 && (
            <Badge count={successCount} className="bg-[#52c41a] ml-2" />
          )}
          {errorCount > 0 && (
            <Badge count={errorCount} className="bg-[#ff4d4f] ml-2" />
          )}
        </div>
        <div className="flex gap-1">
          <Button
            type="text"
            size="small"
            icon={isExpanded ? <DownOutlined /> : <UpOutlined />}
            onClick={() => setIsExpanded(!isExpanded)}
          />
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            onClick={() => {
              clearCompleted();
              if (tasks.filter((t) => t.status === "uploading").length === 0) {
                setVisible(false);
              }
            }}
          />
        </div>
      </div>

      {isExpanded && (
        <div className="overflow-y-auto p-2 max-h-[300px]">
          {tasks.map((task) => (
            <div
              key={task.id}
              className={`px-3 py-2 rounded-md mb-1 flex items-center gap-2 transition-all duration-300 ${
                task.status === "success" ? "bg-[#f6ffed]" : task.status === "error" ? "bg-[#fff2f0]" : ""
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-[#262626] overflow-hidden text-ellipsis whitespace-nowrap">
                  {task.filename}
                </div>
                <div className="text-[11px] mt-0.5">
                  {task.status === "pending" && "等待中..."}
                  {task.status === "uploading" && `${task.progress}%`}
                  {task.status === "success" && (
                    <span className="text-[#52c41a]">
                      <CheckCircleOutlined /> 完成
                    </span>
                  )}
                  {task.status === "error" && (
                    <span className="text-[#ff4d4f]">
                      <ExclamationCircleOutlined /> {task.error || "失败"}
                    </span>
                  )}
                </div>
              </div>
              <div className="w-20 shrink-0">
                <Progress
                  percent={task.progress}
                  size="small"
                  status={
                    task.status === "error"
                      ? "exception"
                      : task.status === "success"
                        ? "success"
                        : "active"
                  }
                  showInfo={false}
                />
              </div>
              {task.status !== "uploading" && (
                <Button
                  type="text"
                  size="small"
                  icon={<CloseOutlined />}
                  onClick={() => removeTask(task.id)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
