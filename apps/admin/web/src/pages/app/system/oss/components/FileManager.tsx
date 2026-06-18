import { client } from "@/api";
import type { OSSFile } from "@/api/types";
import { OSS_API } from "@/constants";
import { getAccessToken } from "@/store/token";
import { useUploadStore } from "@/store/upload";
import {
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileExcelOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  FileUnknownOutlined,
  FileWordOutlined,
  FileZipOutlined,
  FolderAddOutlined,
  FolderOutlined,
  HomeOutlined,
  MoreOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { Breadcrumb, Button, Dropdown, Empty, Input, Modal, Tooltip, message } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import DragOverlay from "./DragOverlay";
// UnoCSS classes used directly — no separate CSS file needed

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

const getFileIcon = (file: OSSFile) => {
  if (file.isDirectory) return <FolderOutlined className="text-[48px] text-[#faad14]" />;

  const ext = (file.originalName || "").split(".").pop()?.toLowerCase();
  const mime = file.mimeType || "";

  if (mime?.startsWith("image/")) return <FileImageOutlined className="text-[48px] text-[#52c41a]" />;
  if (ext === "pdf") return <FilePdfOutlined className="text-[48px] text-[#ff4d4f]" />;
  if (["doc", "docx"].includes(ext || "")) return <FileWordOutlined className="text-[48px] text-[#1890ff]" />;
  if (["xls", "xlsx", "csv"].includes(ext || ""))
    return <FileExcelOutlined className="text-[48px] text-[#52c41a]" />;
  if (["txt", "md", "json", "xml", "yaml", "yml"].includes(ext || ""))
    return <FileTextOutlined className="text-[48px] text-[#8c8c8c]" />;
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext || ""))
    return <FileZipOutlined className="text-[48px] text-[#722ed1]" />;

  return <FileUnknownOutlined className="text-[48px] text-[#bfbfbf]" />;
};

interface FileManagerProps {
  onNavigate?: (file: OSSFile) => void;
}

export default function FileManager({ onNavigate }: FileManagerProps) {
  const [files, setFiles] = useState<OSSFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<OSSFile[]>([]);
  const [searchText, setSearchText] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [newFolderModal, setNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [previewFile, setPreviewFile] = useState<OSSFile | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const uploadStore = useUploadStore();

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await client.get(OSS_API.LIST, {
        query: {
          parentId: currentFolder || "null",
          pageSize: 1000,
        },
      });
      if (data?.list) {
        setFiles(data.list as OSSFile[]);
      }
    } catch (error) {
      console.error("Failed to fetch files:", error);
    } finally {
      setLoading(false);
    }
  }, [currentFolder]);

  const fetchBreadcrumb = useCallback(async () => {
    if (!currentFolder) {
      setBreadcrumb([]);
      return;
    }
    try {
      const { data } = await client.get(OSS_API.BREADCRUMB, {
        params: { id: currentFolder },
      });
      if (data?.items) {
        setBreadcrumb(data.items as OSSFile[]);
      }
    } catch (error) {
      console.error("Failed to fetch breadcrumb:", error);
    }
  }, [currentFolder]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  useEffect(() => {
    fetchBreadcrumb();
  }, [fetchBreadcrumb]);

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    for (const file of Array.from(fileList)) {
      const taskId = uploadStore.addTask(file, currentFolder);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("bucket", "default");
      if (currentFolder) {
        formData.append("parentId", currentFolder);
      }

      try {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            uploadStore.updateProgress(taskId, progress);
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status === 200) {
            uploadStore.completeTask(taskId, true);
            fetchFiles();
          } else {
            uploadStore.completeTask(taskId, false, "上传失败");
          }
        });

        xhr.addEventListener("error", () => {
          uploadStore.completeTask(taskId, false, "网络错误");
        });

        xhr.open("POST", OSS_API.UPLOAD);
        xhr.setRequestHeader("Authorization", `Bearer ${getAccessToken()}`);
        xhr.send(formData);
      } catch (error) {
        uploadStore.completeTask(taskId, false, "上传失败");
      }
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      message.warning("请输入目录名称");
      return;
    }

    try {
      const { error } = await client.post(OSS_API.DIRECTORY, {
        body: {
          name: newFolderName.trim(),
          parentId: currentFolder,
        },
      });

      if (!error) {
        message.success("创建成功");
        setNewFolderModal(false);
        setNewFolderName("");
        fetchFiles();
      }
    } catch (err) {
      message.error("创建失败");
    }
  };

  const handleDelete = async (file: OSSFile) => {
    try {
      const { error } = await client.delete(OSS_API.DELETE, {
        params: { id: file.id },
      });
      if (!error) {
        message.success("删除成功");
        fetchFiles();
      }
    } catch (err) {
      message.error("删除失败");
    }
  };

  const handleDownload = async (file: OSSFile) => {
    try {
      const { data } = await client.get(OSS_API.SIGNED_URL, {
        params: { id: file.id },
      });
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (err) {
      message.error("获取下载链接失败");
    }
  };

  const handlePreview = async (file: OSSFile) => {
    if (file.isDirectory) {
      setCurrentFolder(file.id);
      if (onNavigate) onNavigate(file);
      return;
    }

    if (file.mimeType?.startsWith("image/")) {
      try {
        const { data } = await client.get(OSS_API.SIGNED_URL, {
          params: { id: file.id },
        });
        if (data?.url) {
          setPreviewUrl(data.url);
          setPreviewFile(file);
        }
      } catch (err) {
        message.error("获取预览链接失败");
      }
    } else {
      handleDownload(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const items = e.dataTransfer.items;
    if (items) {
      const files: File[] = [];
      const processEntry = (entry: FileSystemEntry) => {
        if (entry.isFile) {
          (entry as FileSystemFileEntry).file((file) => {
            files.push(file);
            if (files.length === Array.from(items).length) {
              handleUpload(files as unknown as FileList);
            }
          });
        }
      };

      for (const item of Array.from(items)) {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          processEntry(entry);
        }
      }
    } else {
      handleUpload(e.dataTransfer.files);
    }
  };

  const filteredFiles = files.filter((f) =>
    (f.originalName || "").toLowerCase().includes(searchText.toLowerCase()),
  );

  const handleSelectFile = (fileId: string, ctrlKey: boolean) => {
    if (ctrlKey) {
      const newSelected = new Set(selectedFiles);
      if (newSelected.has(fileId)) {
        newSelected.delete(fileId);
      } else {
        newSelected.add(fileId);
      }
      setSelectedFiles(newSelected);
    } else {
      setSelectedFiles(new Set([fileId]));
    }
  };

  const getMenuItems = (file: OSSFile) => [
    {
      key: "preview",
      icon: <EyeOutlined />,
      label: file.isDirectory ? "打开" : "预览",
      onClick: () => handlePreview(file),
    },
    ...(!file.isDirectory
      ? [
          {
            key: "download",
            icon: <DownloadOutlined />,
            label: "下载",
            onClick: () => handleDownload(file),
          },
        ]
      : []),
    {
      key: "delete",
      icon: <DeleteOutlined />,
      label: "删除",
      danger: true,
      onClick: () => {
        Modal.confirm({
          title: "确认删除",
          content: `确定要删除 "${file.originalName}" 吗？`,
          onOk: () => handleDelete(file),
        });
      },
    },
  ];

  return (
    <div
      ref={containerRef}
      className={`flex flex-col h-full min-h-[500px] relative ${isDragOver ? "border-2 border-dashed border-[#1890ff] bg-[rgba(24,144,255,0.05)]" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Toolbar */}
      <div className="flex justify-between items-center px-4 py-3 border-b border-[#f0f0f0] bg-white">
        <div className="flex gap-2">
          <Button
            icon={<UploadOutlined />}
            type="primary"
            onClick={() => fileInputRef.current?.click()}
          >
            上传文件
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
          <Button icon={<FolderAddOutlined />} onClick={() => setNewFolderModal(true)}>
            新建目录
          </Button>
        </div>
        <div className="flex gap-2">
          <Input.Search
            placeholder="搜索文件..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-[200px]"
          />
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="px-4 py-2 border-b border-[#f0f0f0] bg-white">
        <Breadcrumb
          items={[
            {
              title: (
                <a
                  onClick={() => {
                    setCurrentFolder(null);
                    if (onNavigate) onNavigate(null!);
                  }}
                >
                  <HomeOutlined /> 根目录
                </a>
              ),
            },
            ...breadcrumb.map((item, index) => ({
              title:
                index === breadcrumb.length - 1 ? (
                  item.originalName
                ) : (
                  <a
                    onClick={() => {
                      setCurrentFolder(item.id);
                      if (onNavigate) onNavigate(item);
                    }}
                  >
                    {item.originalName}
                  </a>
                ),
            })),
          ]}
        />
      </div>

      {/* File Grid */}
      <div className="flex-1 overflow-y-auto p-4 bg-[#fafafa]">
        {filteredFiles.length === 0 ? (
          <Empty description={searchText ? "未找到匹配的文件" : "暂无文件，拖拽文件到此处上传"} />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
            {filteredFiles.map((file) => (
              <div
                key={file.id}
                className={`flex flex-col items-center px-2 py-3 rounded-lg cursor-pointer transition-all duration-200 relative bg-white border-2 border-transparent hover:bg-[#f0f7ff] hover:border-[#bae0ff] group ${
                  selectedFiles.has(file.id) ? "bg-[#e6f7ff] border-[#1890ff]" : ""
                } ${file.isDirectory ? "bg-[#fffbe6] hover:bg-[#fff7cc] hover:border-[#ffe58f]" : ""}`}
                onClick={(e) => handleSelectFile(file.id, e.ctrlKey || e.metaKey)}
                onDoubleClick={() => handlePreview(file)}
              >
                <div className="text-[48px] mb-2 flex items-center justify-center w-16 h-16">{getFileIcon(file)}</div>
                <div className="text-center w-full">
                  <Tooltip title={file.originalName}>
                    <div className="text-xs text-[#262626] break-all overflow-hidden text-ellipsis line-clamp-2 leading-[1.4] max-h-[2.8em]">{file.originalName}</div>
                  </Tooltip>
                  {!file.isDirectory && (
                    <div className="text-[11px] text-[#8c8c8c] mt-1">{formatFileSize(file.size)}</div>
                  )}
                </div>
                <Dropdown menu={{ items: getMenuItems(file) }} trigger={["click"]}>
                  <Button
                    type="text"
                    size="small"
                    icon={<MoreOutlined />}
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                  />
                </Dropdown>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Drag Overlay */}
      <DragOverlay visible={isDragOver} />

      {/* New Folder Modal */}
      <Modal
        title="新建目录"
        open={newFolderModal}
        onOk={handleCreateFolder}
        onCancel={() => {
          setNewFolderModal(false);
          setNewFolderName("");
        }}
      >
        <Input
          placeholder="请输入目录名称"
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          onPressEnter={handleCreateFolder}
        />
      </Modal>

      {/* Image Preview */}
      <Modal
        open={!!previewFile}
        footer={null}
        onCancel={() => {
          setPreviewFile(null);
          setPreviewUrl("");
        }}
        width="80%"
        centered
      >
        {previewUrl && (
          <img
            src={previewUrl}
            alt={previewFile?.originalName}
            className="w-full object-contain" style={{ maxHeight: "80vh" }}
          />
        )}
      </Modal>
    </div>
  );
}
