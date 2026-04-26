import { useEffect, useState } from 'react'
import { BrowserRouter, useNavigate, useLocation } from 'react-router-dom'
import { Spin, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { Suspense } from 'react'
import { useRoutes } from 'react-router'
import { useAuth } from '@/store/useAuth'
import { useMenu } from '@/store/useMenu'
import GlobalHistory from '@/components/GlobalHistory'
import GlobalMessage from '@/components/GlobalMessage'
import { AppTheme } from '@/theme'
import routes from '~react-pages'

const AppRoutes = () => {
  return (
    <Suspense fallback={<Spin size="large" fullscreen />}>
      {useRoutes(routes)}
    </Suspense>
  )
}

const _App = () => {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const {
    ready: authReady,
    computed: { logged },
  } = useAuth()
  const fetchRoutes = useMenu(s => s.fetchRoutes)
  const menuReady = useMenu(s => s.ready)

  useEffect(() => {
    if (authReady) {
      if (logged) {
        // fetch menus when logged in and not already fetched
        fetchRoutes()
      } else if (pathname !== '/auth/login') {
        navigate('/auth/login', { replace: true })
      }
    }
  }, [authReady, logged, pathname, navigate, fetchRoutes])

  // show loading while auth is initializing or menus loading
  if (!authReady || (logged && !menuReady && pathname.startsWith('/app'))) {
    return <Spin size="large" fullscreen />
  }

  return <AppRoutes />
}

function App() {
  const { init: initAuth } = useAuth()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    Promise.all([initAuth()])
      .catch(() => {})
      .then(() => {
        setReady(true)
      })
  }, [])

  return (
    <BrowserRouter>
      <GlobalHistory />
      <GlobalMessage />
      <ConfigProvider
        locale={zhCN}
        theme={{
          token: {
            colorPrimary: AppTheme.primaryColor,
          },
        }}
      >
        {ready ? <_App /> : <Spin size="large" fullscreen />}
      </ConfigProvider>
    </BrowserRouter>
  )
}

export default App
