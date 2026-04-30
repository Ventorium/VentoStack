import { Button, Form, Input, message } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, type LoginForm } from '@/store/useAuth'
import loginBg from '@/assets/images/login-bg.webp'

const LoginPage = () => {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [form] = Form.useForm<LoginForm>()
  const [loading, setLoading] = useState(false)

  const onFinish = async (values: LoginForm) => {
    setLoading(true)
    const user = await login(values)
    setLoading(false)
    if (user) {
      message.success('登录成功')
      navigate('/app', { replace: true })
    } else {
      message.error('用户名或密码错误')
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-cover bg-center"
      style={{ backgroundImage: `url(${loginBg})` }}
    >
    <div className="w-120 bg-white/90 backdrop-blur-sm rounded-lg shadow-xl p-8">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-dark">VentoStack 管理后台</h1>
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
      </Form>
    </div>
    </div>
  )
}

export default LoginPage
