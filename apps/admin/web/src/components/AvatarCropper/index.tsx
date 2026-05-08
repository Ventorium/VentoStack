import { useState, useCallback, useEffect } from 'react'
import { Modal, Button, Tooltip } from 'antd'
import { RotateLeftOutlined, RotateRightOutlined, ZoomInOutlined, ZoomOutOutlined, UndoOutlined } from '@ant-design/icons'
import Cropper from 'react-easy-crop'
import type { Area } from 'react-easy-crop'

export interface AvatarCropperProps {
  file: File
  open: boolean
  onConfirm: (blob: Blob) => void
  onCancel: () => void
}

/** 将 crop 区域绘制到 canvas 并导出 blob */
async function getCroppedImg(imageSrc: string, crop: Area, rotation = 0): Promise<Blob> {
  const image = await createImage(imageSrc)
  const radians = (rotation * Math.PI) / 180
  const sin = Math.abs(Math.sin(radians))
  const cos = Math.abs(Math.cos(radians))
  const w = image.width
  const h = image.height
  const canvasW = Math.floor(w * cos + h * sin)
  const canvasH = Math.floor(w * sin + h * cos)

  const canvas = document.createElement('canvas')
  canvas.width = canvasW
  canvas.height = canvasH
  const ctx = canvas.getContext('2d')!
  ctx.translate(canvasW / 2, canvasH / 2)
  ctx.rotate(radians)
  ctx.drawImage(image, -w / 2, -h / 2)

  const croppedCanvas = document.createElement('canvas')
  croppedCanvas.width = crop.width
  croppedCanvas.height = crop.height
  const croppedCtx = croppedCanvas.getContext('2d')!
  croppedCtx.drawImage(
    canvas,
    crop.x, crop.y, crop.width, crop.height,
    0, 0, crop.width, crop.height,
  )

  return new Promise((resolve, reject) => {
    croppedCanvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Canvas toBlob failed'))
    }, 'image/png')
  })
}

function createImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

const iconStyle = { fontSize: 18 }

const AvatarCropper = ({ file, open, onConfirm, onCancel }: AvatarCropperProps) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const imageUrl = URL.createObjectURL(file)

  // 打开时生成初始预览
  useEffect(() => {
    if (!open) return
    let revoked = false
    const generate = async () => {
      const img = await createImage(imageUrl)
      if (revoked) return
      const size = Math.min(img.width, img.height)
      const initialCrop: Area = {
        x: (img.width - size) / 2,
        y: (img.height - size) / 2,
        width: size,
        height: size,
      }
      setCroppedAreaPixels(initialCrop)
      const blob = await getCroppedImg(imageUrl, initialCrop, 0)
      if (revoked) return
      setPreviewUrl(URL.createObjectURL(blob))
    }
    generate()
    return () => { revoked = true }
  }, [open, imageUrl])

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels)
    getCroppedImg(imageUrl, croppedAreaPixels, rotation).then((blob) => {
      const url = URL.createObjectURL(blob)
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return url
      })
    })
  }, [imageUrl, rotation])

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return
    setLoading(true)
    try {
      const blob = await getCroppedImg(imageUrl, croppedAreaPixels, rotation)
      onConfirm(blob)
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    URL.revokeObjectURL(imageUrl)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    onCancel()
  }

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
      <div style={{ display: 'flex', gap: 16 }}>
        {/* 左：裁剪区域 */}
        <div style={{ flex: 1 }}>
          <div style={{ position: 'relative', width: '100%', height: 340, background: '#1a1a1a', borderRadius: 8 }}>
            <Cropper
              image={imageUrl}
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
        <div style={{ width: 140, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, paddingTop: 8 }}>
          {/* 预览 */}
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              overflow: 'hidden',
              border: '2px solid #d9d9d9',
              background: '#f5f5f5',
            }}
          >
            {previewUrl && (
              <img src={previewUrl} alt="预览" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )}
          </div>

          {/* 缩放按钮 */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <Tooltip title="缩小">
              <Button icon={<ZoomOutOutlined style={iconStyle} />} onClick={() => setZoom(z => Math.max(1, z - 0.1))} />
            </Tooltip>
            <Tooltip title="放大">
              <Button icon={<ZoomInOutlined style={iconStyle} />} onClick={() => setZoom(z => Math.min(3, z + 0.1))} />
            </Tooltip>
          </div>

          {/* 旋转按钮 */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <Tooltip title="左旋90°">
              <Button icon={<RotateLeftOutlined style={iconStyle} />} onClick={() => setRotation(r => r - 90)} />
            </Tooltip>
            <Tooltip title="右旋90°">
              <Button icon={<RotateRightOutlined style={iconStyle} />} onClick={() => setRotation(r => r + 90)} />
            </Tooltip>
          </div>

          {/* 重置 */}
          <Tooltip title="重置">
            <Button icon={<UndoOutlined style={iconStyle} />} onClick={() => { setZoom(1); setRotation(0); setCrop({ x: 0, y: 0 }) }}>
              重置
            </Button>
          </Tooltip>
        </div>
      </div>
    </Modal>
  )
}

export default AvatarCropper
