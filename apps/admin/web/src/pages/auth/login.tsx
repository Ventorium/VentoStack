import { Button, Divider, Form, Input, Modal, message } from 'antd'
import type { OTPRef } from 'antd/es/input/Otp'
import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, type LoginForm, type PasswordExpiredInfo, type MfaRequiredInfo } from '@/store/useAuth'
import { usePublicConfig } from '@/hooks/usePublicConfig'
import { client } from '@/api'

const LoginPage = () => {
  const navigate = useNavigate()
  const { login, completeMFALogin, passkeyLogin } = useAuth()
  const siteName = usePublicConfig(s => s.config.siteName)
  const passkeyEnabled = usePublicConfig(s => s.config.passkeyEnabled)
  const [form] = Form.useForm<LoginForm>()
  const [loading, setLoading] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [expiredInfo, setExpiredInfo] = useState<PasswordExpiredInfo | null>(null)
  const [pwdForm] = Form.useForm()
  const [pwdLoading, setPwdLoading] = useState(false)

  // MFA state
  const [mfaInfo, setMfaInfo] = useState<MfaRequiredInfo | null>(null)
  const [mfaLoading, setMfaLoading] = useState(false)
  const [mfaCode, setMfaCode] = useState('')
  const inputRef = useRef<OTPRef>(null)

  useEffect(() => {
    if (mfaInfo) {
      inputRef.current?.focus()
    }
  }, [mfaInfo])

  const onFinish = async (values: LoginForm) => {
    setLoading(true)
    const result = await login(values)
    setLoading(false)
    if (result && 'id' in result) {
      message.success('登录成功')
      const user = result as { id: string; mfaSetupRequired?: boolean }
      if (user.mfaSetupRequired) {
        message.warning('请尽快在个人中心设置多因素认证')
      }
      navigate('/app', { replace: true })
    } else if (result && 'code' in result && result.code === 'mfa_required') {
      setMfaInfo(result as MfaRequiredInfo)
    } else if (result && 'code' in result && result.code === 'password_expired') {
      setExpiredInfo(result as PasswordExpiredInfo)
    } else {
      message.error('用户名或密码错误')
    }
  }

  const handleMfaSubmit = async () => {
    if (!mfaInfo || !mfaCode) return
    setMfaLoading(true)
    const result = await completeMFALogin(mfaInfo.mfaToken, mfaCode)
    setMfaLoading(false)
    if (result && 'id' in result) {
      message.success('登录成功')
      setMfaInfo(null)
      setMfaCode('')
      navigate('/app', { replace: true })
    } else {
      message.error('验证码错误，请重试')
      setMfaCode('')
      inputRef.current?.focus()
    }
  }

  const handlePasswordChange = async () => {
    const values = await pwdForm.validateFields()
    if (values.newPassword !== values.confirmPassword) {
      message.error('两次密码不一致')
      return
    }
    setPwdLoading(true)
    const { error } = await client.post('/api/auth/reset-password-by-token', {
      body: { token: expiredInfo?.tempToken, newPassword: values.newPassword },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any) as { error?: unknown }
    setPwdLoading(false)
    if (!error) {
      message.success('密码修改成功，请重新登录')
      setExpiredInfo(null)
      pwdForm.resetFields()
    }
  }

  const handlePasskeyLogin = async () => {
    const username = form.getFieldValue('username')
    if (!username) {
      message.warning('请先输入账号')
      return
    }
    setPasskeyLoading(true)
    const result = await passkeyLogin(username)
    setPasskeyLoading(false)
    if (result && 'id' in result) {
      message.success('登录成功')
      navigate('/app', { replace: true })
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-120 bg-white/90 backdrop-blur-sm rounded-lg shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-dark">{siteName} 管理后台</h1>
          <p className="text-gray-500 mt-2">请输入账号和密码登录</p>
        </div>

        <Form
          form={form}
          className="flex flex-col gap-3"
          name="login"
          onFinish={onFinish}
          autoComplete="off"
          layout="vertical"
        >
          <Form.Item name="username" rules={[{ required: true, message: '请输入账号' }]}>
            <Input placeholder="请输入账号" size="large" />
          </Form.Item>

          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password placeholder="请输入密码" size="large" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} size="large" className="w-full">
              登 录
            </Button>
          </Form.Item>

          {passkeyEnabled && (
            <>
              <Divider plain>其他登录方式</Divider>
              <Button
                size="large"
                className="w-full"
                loading={passkeyLoading}
                onClick={handlePasskeyLogin}
              >
                Passkey 登录
              </Button>
            </>
          )}
        </Form>
      </div>

      {/* MFA 验证弹窗 */}
      <Modal
        title="多因素认证验证"
        open={!!mfaInfo}
        closable={false}
        footer={null}
        destroyOnHidden
      >
        <p className="text-gray-500 mb-4">请输入您的认证器应用中显示的6位验证码</p>
        <div className="flex flex-col items-center gap-4">
          <Input.OTP
            ref={inputRef}
            length={6}
            size="large"
            value={mfaCode}
            onChange={setMfaCode}
          />
          <Button
            type="primary"
            size="large"
            className="w-full"
            loading={mfaLoading}
            disabled={mfaCode.length !== 6}
            onClick={handleMfaSubmit}
          >
            验 证
          </Button>
        </div>
      </Modal>

      <Modal
        title="密码已过期"
        open={!!expiredInfo}
        onCancel={() => setExpiredInfo(null)}
        onOk={handlePasswordChange}
        confirmLoading={pwdLoading}
        okText="修改密码"
        destroyOnHidden
      >
        <p className="text-gray-500 mb-4">您的密码已过期，请修改密码后重新登录。</p>
        <Form form={pwdForm} layout="vertical">
          <Form.Item name="newPassword" label="新密码" rules={[{ required: true, message: '请输入新密码' }, { min: 6, message: '密码不能少于6位' }]}>
            <Input.Password placeholder="请输入新密码" />
          </Form.Item>
          <Form.Item name="confirmPassword" label="确认密码" rules={[{ required: true, message: '请确认密码' }]}>
            <Input.Password placeholder="请再次输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default LoginPage
