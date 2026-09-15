import {
  RotateLeftOutlined,
  RotateRightOutlined,
  UndoOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from "@ant-design/icons";
import { Button, Modal, Tooltip } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";

export interface AvatarCropperProps {
  file: File;
  open: boolean;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}

/** 将 crop 区域绘制到 canvas 并导出 blob */
async function getCroppedImg(imageSrc: string, crop: Area, rotation = 0): Promise<Blob> {
  const image = await createImage(imageSrc);
  const radians = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));
  const w = image.width;
  const h = image.height;
  const canvasW = Math.floor(w * cos + h * sin);
  const canvasH = Math.floor(w * sin + h * cos);

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(canvasW / 2, canvasH / 2);
  ctx.rotate(radians);
  ctx.drawImage(image, -w / 2, -h / 2);

  const croppedCanvas = document.createElement("canvas");
  croppedCanvas.width = crop.width;
  croppedCanvas.height = crop.height;
  const croppedCtx = croppedCanvas.getContext("2d")!;
  croppedCtx.drawImage(
    canvas,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height,
  );

  return new Promise((resolve, reject) => {
    croppedCanvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("图片处理失败"));
    }, "image/png");
  });
}

function createImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

const iconStyle = { fontSize: 18 };

const AvatarCropper = ({ file, open, onConfirm, onCancel }: AvatarCropperProps) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 对象 URL 每个 file 只能创建一次：写在组件体会让每次渲染生成新 URL，
  // Cropper 收到新 image 就重新加载图片，拖拽时形成请求风暴并泄漏 blob URL
  const [imageUrl, setImageUrl] = useState<string>("");
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // 预览防抖：拖拽时 onCropComplete 高频触发，全量 canvas 重绘 + toBlob 开销大
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, []);

  // 打开时生成初始预览
  useEffect(() => {
    if (!open || !imageUrl) return;
    let revoked = false;
    const generate = async () => {
      const img = await createImage(imageUrl);
      if (revoked) return;
      const size = Math.min(img.width, img.height);
      const initialCrop: Area = {
        x: (img.width - size) / 2,
        y: (img.height - size) / 2,
        width: size,
        height: size,
      };
      setCroppedAreaPixels(initialCrop);
      const blob = await getCroppedImg(imageUrl, initialCrop, 0);
      if (revoked) return;
      setPreviewUrl(URL.createObjectURL(blob));
    };
    generate();
    return () => {
      revoked = true;
    };
  }, [open, imageUrl]);

  const onCropComplete = useCallback(
    (_croppedArea: Area, croppedAreaPixels: Area) => {
      setCroppedAreaPixels(croppedAreaPixels);
      if (previewTimer.current) clearTimeout(previewTimer.current);
      previewTimer.current = setTimeout(() => {
        getCroppedImg(imageUrl, croppedAreaPixels, rotation).then((blob) => {
          const url = URL.createObjectURL(blob);
          setPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
        });
      }, 200);
    },
    [imageUrl, rotation],
  );

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    setLoading(true);
    try {
      const blob = await getCroppedImg(imageUrl, croppedAreaPixels, rotation);
      onConfirm(blob);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    // imageUrl 由挂载 effect 的 cleanup 统一回收，这里只处理预览
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    onCancel();
  };

  return (
    <Modal
      title="裁剪头像"
      open={open}
      onOk={handleConfirm}
      onCancel={handleCancel}
      confirmLoading={loading}
      okText="确定"
      cancelText="取消"
      destroyOnHidden
      width={640}
    >
      <div className="flex gap-4">
        {/* 左：裁剪区域 */}
        <div className="flex-1">
          <div
            className="relative w-full h-[340px] bg-[#1a1a1a] rounded-lg"
          >
            <Cropper
              image={imageUrl || undefined}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={onCropComplete}
            />
          </div>
        </div>

        {/* 右：预览 + 操作按钮 */}
        <div
          className="w-[140px] flex flex-col items-center gap-4 pt-2"
        >
          {/* 预览 */}
          <div
            className="w-[80px] h-[80px] overflow-hidden bg-[#f5f5f5]" style={{ borderRadius: "50%", border: "2px solid #d9d9d9" }}
          >
            {previewUrl && (
              <img
                src={previewUrl}
                alt="预览"
                className="w-full h-full object-cover"
              />
            )}
          </div>

          {/* 缩放按钮 */}
          <div className="flex gap-2 justify-center">
            <Tooltip title="缩小">
              <Button
                icon={<ZoomOutOutlined style={iconStyle} />}
                onClick={() => setZoom((z) => Math.max(1, z - 0.1))}
              />
            </Tooltip>
            <Tooltip title="放大">
              <Button
                icon={<ZoomInOutlined style={iconStyle} />}
                onClick={() => setZoom((z) => Math.min(3, z + 0.1))}
              />
            </Tooltip>
          </div>

          {/* 旋转按钮 */}
          <div className="flex gap-2 justify-center">
            <Tooltip title="左旋90°">
              <Button
                icon={<RotateLeftOutlined style={iconStyle} />}
                onClick={() => setRotation((r) => r - 90)}
              />
            </Tooltip>
            <Tooltip title="右旋90°">
              <Button
                icon={<RotateRightOutlined style={iconStyle} />}
                onClick={() => setRotation((r) => r + 90)}
              />
            </Tooltip>
          </div>

          {/* 重置 */}
          <Tooltip title="重置">
            <Button
              icon={<UndoOutlined style={iconStyle} />}
              onClick={() => {
                setZoom(1);
                setRotation(0);
                setCrop({ x: 0, y: 0 });
              }}
            >
              重置
            </Button>
          </Tooltip>
        </div>
      </div>
    </Modal>
  );
};

export default AvatarCropper;
