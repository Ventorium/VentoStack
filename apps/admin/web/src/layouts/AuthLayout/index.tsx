import type { WithChildren } from '@/types'
import loginBg from '@/assets/images/login-bg.webp'

const AuthLayout = ({ children }: WithChildren) => {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-end pr-20 relative bg-cover bg-center bg-no-repeat"
      style={{
        backgroundImage: `url(${loginBg})`,
      }}
    >
      {children}
    </div>
  )
}

export default AuthLayout
