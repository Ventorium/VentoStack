import { useState, useCallback } from 'react'
import { Modal, Slider, Space, Button } from 'antd'
import { RotateLeftOutlined, RotateRightOutlined, ZoomInOutlined, ZoomOutOutlined } from '@ant-design/icons'
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
  // 旋转后画布尺寸
  const canvasW = Math.floor(w * cos + h * sin)
  const canvasH = Math.floor(w * sin + h * cos)

  const canvas = document.createElement('canvas')
  canvas.width = crop.width
  canvas.height = crop.height
  const ctx = canvas.getContext('2d')!

  // 将原图旋转后绘制到临时画布
  ctx.translate(canvasW / 2, canvasH / 2)
  ctx.rotate(radians)
  ctx.drawImage(image, -w / 2, -h / 2)
  ctx.setTransform(1, 0, 0, 1, 0, 0)

  // 裁剪
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

const AvatarCropper = ({ file, open, onConfirm, onCancel }: AvatarCropperProps) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const imageUrl = URL.createObjectURL(file)

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels)
    // 生成预览
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
      width={480}
    >
      <div style={{ display: 'flex', gap: 16 }}>
        {/* 裁剪区域 */}
        <div style={{ flex: 1 }}>
          <div style={{ position: 'relative', width: '100%', height: 280, background: '#1a1a1a', borderRadius: 8 }}>
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
          <Space style={{ marginTop: 12, width: '100%' }} orientation="vertical" size={4}>
            <Space size={4} align="center" style={{ width: '100%' }}>
              <ZoomOutOutlined />
              <Slider
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={setZoom}
                style={{ flex: 1 }}
              />
              <ZoomInOutlined />
            </Space>
            <Space size={4} align="center" style={{ width: '100%' }}>
              <RotateLeftOutlined />
              <Slider
                min={0}
                max={360}
                step={1}
                value={rotation}
                onChange={setRotation}
                style={{ flex: 1 }}
              />
              <RotateRightOutlined />
            </Space>
          </Space>
        </div>

        {/* 圆形预览 */}
        <div style={{ width: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
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
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="预览"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb' }}>
                预览
              </div>
            )}
          </div>
          <span style={{ fontSize: 12, color: '#999' }}>圆形预览</span>
          <Button
            size="small"
            onClick={() => { setZoom(1); setRotation(0); setCrop({ x: 0, y: 0 }) }}
          >
            重置
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default AvatarCropper
