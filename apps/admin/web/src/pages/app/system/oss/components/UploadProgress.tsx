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
    <div className="upload-progress-panel">
      <div className="upload-progress-header">
        <div className="upload-progress-title">
          <Badge count={uploadingCount} style={{ backgroundColor: "#1890ff" }}>
            <span>上传任务</span>
          </Badge>
          {successCount > 0 && (
            <Badge count={successCount} style={{ backgroundColor: "#52c41a", marginLeft: 8 }} />
          )}
          {errorCount > 0 && (
            <Badge count={errorCount} style={{ backgroundColor: "#ff4d4f", marginLeft: 8 }} />
          )}
        </div>
        <div className="upload-progress-actions">
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
        <div className="upload-progress-list">
          {tasks.map((task) => (
            <div key={task.id} className={`upload-progress-item ${task.status}`}>
              <div className="upload-progress-info">
                <div className="upload-progress-filename">{task.filename}</div>
                <div className="upload-progress-status">
                  {task.status === "pending" && "等待中..."}
                  {task.status === "uploading" && `${task.progress}%`}
                  {task.status === "success" && (
                    <span className="success-text">
                      <CheckCircleOutlined /> 完成
                    </span>
                  )}
                  {task.status === "error" && (
                    <span className="error-text">
                      <ExclamationCircleOutlined /> {task.error || "失败"}
                    </span>
                  )}
                </div>
              </div>
              <div className="upload-progress-bar">
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
