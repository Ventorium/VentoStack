export type OpenAPIComponents = {
  schemas: never,
  responses: never,
  // parameters: {},
  // headers: {},
  requestBodies: never
}
export type OpenAPIs = {
  get: {
    '/health': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: {}
    },
    '/health/live': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: {}
    },
    '/health/ready': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: {}
    },
    '/metrics': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: string
    },
    /**
     * 获取公开配置
     */
    '/api/system/configs/public': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 站点名称
         */
        siteName?: string,
        /**
         * @description 主题
         */
        theme?: string,
        /**
         * @description 是否启用部门
         */
        deptEnabled?: boolean,
        /**
         * @description 是否启用 MFA
         */
        mfaEnabled?: boolean,
        /**
         * @description 是否强制 MFA
         */
        mfaForce?: boolean,
        /**
         * @description 是否启用 Passkey
         */
        passkeyEnabled?: boolean
      }
    },
    /**
     * 获取 Passkey 列表
     */
    '/api/auth/passkey/list': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any[]
    },
    /**
     * 获取用户列表
     */
    '/api/system/users': {
      query: {
        page?: number,
        pageSize?: number,
        username?: string,
        status?: number,
        deptId?: string
      },
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 用户列表
         */
        list?: any[],
        /**
         * @description 总数
         */
        total?: number,
        /**
         * @description 当前页
         */
        page?: number,
        /**
         * @description 每页数量
         */
        pageSize?: number,
        /**
         * @description 总页数
         */
        totalPages?: number
      }
    },
    /**
     * 获取用户详情
     */
    '/api/system/users/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 用户 ID
         */
        id?: string,
        /**
         * @description 用户名
         */
        username?: string,
        /**
         * @description 昵称
         */
        nickname?: string,
        /**
         * @description 邮箱
         */
        email?: string,
        /**
         * @description 手机号
         */
        phone?: string,
        /**
         * @description 头像 URL
         */
        avatar?: string,
        /**
         * @description 状态 0=停用 1=正常
         */
        status?: number,
        /**
         * @description 部门 ID
         */
        deptId?: string,
        /**
         * @description 创建时间
         */
        createdAt?: string
      }
    },
    /**
     * 获取system:role列表
     */
    '/api/system/roles': {
      query: {
        page?: number,
        pageSize?: number
      },
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 列表数据
         */
        list?: any[],
        /**
         * @description 总数
         */
        total?: number,
        /**
         * @description 当前页
         */
        page?: number,
        /**
         * @description 每页数量
         */
        pageSize?: number,
        /**
         * @description 总页数
         */
        totalPages?: number
      }
    },
    /**
     * 获取system:role详情
     */
    '/api/system/roles/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 角色 ID
         */
        id?: string,
        /**
         * @description 角色名称
         */
        name?: string,
        /**
         * @description 角色编码
         */
        code?: string,
        /**
         * @description 排序
         */
        sort?: number,
        /**
         * @description 状态
         */
        status?: number,
        /**
         * @description 备注
         */
        remark?: string,
        /**
         * @description 创建时间
         */
        createdAt?: string
      }
    },
    /**
     * 获取system:menu列表
     */
    '/api/system/menus': {
      query: {
        page?: number,
        pageSize?: number
      },
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 列表数据
         */
        list?: any[],
        /**
         * @description 总数
         */
        total?: number,
        /**
         * @description 当前页
         */
        page?: number,
        /**
         * @description 每页数量
         */
        pageSize?: number,
        /**
         * @description 总页数
         */
        totalPages?: number
      }
    },
    /**
     * 获取system:menu详情
     */
    '/api/system/menus/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    /**
     * 获取菜单树
     */
    '/api/system/menus/tree': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any[]
    },
    /**
     * 获取system:dept列表
     */
    '/api/system/depts': {
      query: {
        page?: number,
        pageSize?: number
      },
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 列表数据
         */
        list?: any[],
        /**
         * @description 总数
         */
        total?: number,
        /**
         * @description 当前页
         */
        page?: number,
        /**
         * @description 每页数量
         */
        pageSize?: number,
        /**
         * @description 总页数
         */
        totalPages?: number
      }
    },
    /**
     * 获取部门树
     */
    '/api/system/depts/tree': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any[]
    },
    /**
     * 获取system:post列表
     */
    '/api/system/posts': {
      query: {
        page?: number,
        pageSize?: number
      },
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 列表数据
         */
        list?: any[],
        /**
         * @description 总数
         */
        total?: number,
        /**
         * @description 当前页
         */
        page?: number,
        /**
         * @description 每页数量
         */
        pageSize?: number,
        /**
         * @description 总页数
         */
        totalPages?: number
      }
    },
    /**
     * 获取system:dict列表
     */
    '/api/system/dict/types': {
      query: {
        page?: number,
        pageSize?: number
      },
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 列表数据
         */
        list?: any[],
        /**
         * @description 总数
         */
        total?: number,
        /**
         * @description 当前页
         */
        page?: number,
        /**
         * @description 每页数量
         */
        pageSize?: number,
        /**
         * @description 总页数
         */
        totalPages?: number
      }
    },
    /**
     * 获取system:dict详情
     */
    '/api/system/dict/types/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 字典类型 ID
         */
        id?: string,
        /**
         * @description 字典名称
         */
        name?: string,
        /**
         * @description 字典编码
         */
        code?: string,
        /**
         * @description 状态
         */
        status?: number,
        /**
         * @description 备注
         */
        remark?: string
      }
    },
    /**
     * 获取字典数据
     */
    '/api/system/dict/types/:code/data': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any[]
    },
    /**
     * 获取system:config列表
     */
    '/api/system/configs': {
      query: {
        page?: number,
        pageSize?: number
      },
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 列表数据
         */
        list?: any[],
        /**
         * @description 总数
         */
        total?: number,
        /**
         * @description 当前页
         */
        page?: number,
        /**
         * @description 每页数量
         */
        pageSize?: number,
        /**
         * @description 总页数
         */
        totalPages?: number
      }
    },
    /**
     * 按 key 获取配置
     */
    '/api/system/configs/by-key/:key': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 配置键
         */
        key?: string,
        /**
         * @description 配置值
         */
        value?: string
      }
    },
    /**
     * 获取system:notice列表
     */
    '/api/system/notices': {
      query: {
        page?: number,
        pageSize?: number
      },
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 列表数据
         */
        list?: any[],
        /**
         * @description 总数
         */
        total?: number,
        /**
         * @description 当前页
         */
        page?: number,
        /**
         * @description 每页数量
         */
        pageSize?: number,
        /**
         * @description 总页数
         */
        totalPages?: number
      }
    },
    /**
     * 获取当前用户信息
     */
    '/api/system/user/profile': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 用户 ID
         */
        id?: string,
        /**
         * @description 用户名
         */
        username?: string,
        /**
         * @description 昵称
         */
        nickname?: string,
        /**
         * @description 邮箱
         */
        email?: string,
        /**
         * @description 手机号
         */
        phone?: string,
        /**
         * @description 头像
         */
        avatar?: string,
        /**
         * @description 角色编码列表
         */
        roles?: any[],
        /**
         * @description 权限列表
         */
        permissions?: any[]
      }
    },
    /**
     * 获取当前用户路由
     */
    '/api/system/user/routes': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any[]
    },
    /**
     * 获取当前用户权限
     */
    '/api/system/user/permissions': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any[]
    },
    /**
     * 获取 MFA 状态
     */
    '/api/auth/mfa/status': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description MFA 是否启用
         */
        enabled?: boolean
      }
    },
    /**
     * 获取操作日志
     */
    '/api/system/operation-logs': {
      query: {
        page?: number,
        pageSize?: number,
        username?: string,
        module?: string
      },
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 操作日志列表
         */
        list?: any[],
        /**
         * @description 总数
         */
        total?: number,
        /**
         * @description 当前页
         */
        page?: number,
        /**
         * @description 每页数量
         */
        pageSize?: number,
        /**
         * @description 总页数
         */
        totalPages?: number
      }
    },
    /**
     * 获取登录日志
     */
    '/api/system/login-logs': {
      query: {
        page?: number,
        pageSize?: number,
        username?: string
      },
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 登录日志列表
         */
        list?: any[],
        /**
         * @description 总数
         */
        total?: number,
        /**
         * @description 当前页
         */
        page?: number,
        /**
         * @description 每页数量
         */
        pageSize?: number,
        /**
         * @description 总页数
         */
        totalPages?: number
      }
    },
    /**
     * 获取仪表盘统计
     */
    '/api/system/dashboard/stats': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 用户总数
         */
        userCount?: number,
        /**
         * @description 角色总数
         */
        roleCount?: number,
        /**
         * @description 今日操作数
         */
        todayLogs?: number,
        /**
         * @description 未读通知数
         */
        unreadNotices?: number
      }
    },
    '/api/gen/tables': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/gen/tables/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/gen/tables/:id/preview': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    /**
     * 获取服务器状态
     */
    '/api/system/monitor/server': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description CPU 信息
         */
        cpu?: {},
        /**
         * @description 内存信息
         */
        memory?: {},
        /**
         * @description 磁盘信息
         */
        disk?: {},
        /**
         * @description 操作系统信息
         */
        os?: {},
        /**
         * @description 进程信息
         */
        process?: {}
      }
    },
    /**
     * 获取缓存统计
     */
    '/api/system/monitor/cache': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description Redis 信息
         */
        info?: {},
        /**
         * @description Key 总数
         */
        keyCount?: number,
        /**
         * @description 内存使用
         */
        memory?: string
      }
    },
    /**
     * 获取数据源状态
     */
    '/api/system/monitor/datasource': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 是否连接
         */
        connected?: boolean,
        /**
         * @description 连接池大小
         */
        poolSize?: number,
        /**
         * @description 活跃连接数
         */
        activeConnections?: number,
        /**
         * @description 空闲连接数
         */
        idleConnections?: number
      }
    },
    /**
     * 健康检查
     */
    '/api/system/monitor/health': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 健康状态
         */
        status?: string,
        /**
         * @description 各项检查结果
         */
        checks?: any[]
      }
    },
    /**
     * 获取在线用户
     */
    '/api/system/monitor/online': {
      query: {
        page?: number,
        pageSize?: number
      },
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 在线用户列表
         */
        list?: any[],
        /**
         * @description 总数
         */
        total?: number
      }
    },
    '/api/i18n/locales': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/i18n/messages': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/i18n/messages/:locale': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/workflow/definitions': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/workflow/definitions/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/workflow/definitions/:id/nodes': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/workflow/instances/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/workflow/tasks': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    /**
     * 获取文件列表
     */
    '/api/oss': {
      query: {
        page?: number,
        pageSize?: number,
        bucket?: string,
        uploaderId?: string
      },
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 文件列表
         */
        list?: any[],
        /**
         * @description 总数
         */
        total?: number,
        /**
         * @description 当前页
         */
        page?: number,
        /**
         * @description 每页数量
         */
        pageSize?: number,
        /**
         * @description 总页数
         */
        totalPages?: number
      }
    },
    /**
     * 获取文件详情
     */
    '/api/oss/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 文件 ID
         */
        id?: string,
        /**
         * @description 文件名
         */
        filename?: string,
        /**
         * @description MIME 类型
         */
        contentType?: string,
        /**
         * @description 文件大小（字节）
         */
        size?: number,
        /**
         * @description 存储桶
         */
        bucket?: string,
        /**
         * @description 上传者 ID
         */
        uploaderId?: string,
        /**
         * @description 创建时间
         */
        createdAt?: string
      }
    },
    /**
     * 下载文件
     */
    '/api/oss/:id/download': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    /**
     * 获取签名 URL
     */
    '/api/oss/:id/url': {
      query: {
        expiresIn?: number
      },
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 签名 URL
         */
        url?: string,
        /**
         * @description 过期时间（秒）
         */
        expiresIn?: number
      }
    },
    '/api/scheduler/jobs': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/scheduler/jobs/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/scheduler/logs': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    }
  },
  post: {
    /**
     * 用户登录
     */
    '/api/auth/login': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 用户名
         */
        username: string,
        /**
         * @description 密码
         */
        password: string,
        /**
         * @description 设备类型
         */
        deviceType?: string
      },
      response: {
        /**
         * @description 访问令牌
         */
        accessToken?: string,
        /**
         * @description 刷新令牌
         */
        refreshToken?: string,
        /**
         * @description 过期时间（秒）
         */
        expiresIn?: number,
        /**
         * @description 令牌类型
         */
        tokenType?: string
      }
    },
    /**
     * 用户注册
     */
    '/api/auth/register': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 用户名
         */
        username: string,
        /**
         * @description 密码
         */
        password: string,
        /**
         * @description 邮箱
         */
        email?: string,
        /**
         * @description 手机号
         */
        phone?: string
      },
      response: {
        /**
         * @description 访问令牌
         */
        accessToken?: string,
        /**
         * @description 刷新令牌
         */
        refreshToken?: string,
        /**
         * @description 过期时间（秒）
         */
        expiresIn?: number,
        /**
         * @description 令牌类型
         */
        tokenType?: string
      }
    },
    /**
     * 忘记密码
     */
    '/api/auth/forgot-password': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 注册邮箱
         */
        email: string
      },
      response: {
        /**
         * @description 密码重置令牌
         */
        resetToken?: string
      }
    },
    /**
     * 重置密码（管理员）
     */
    '/api/auth/reset-password': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 用户 ID
         */
        userId: string,
        /**
         * @description 新密码
         */
        newPassword: string
      },
      response: any
    },
    /**
     * 通过令牌重置密码
     */
    '/api/auth/reset-password-by-token': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 重置令牌
         */
        token: string,
        /**
         * @description 新密码
         */
        newPassword: string
      },
      response: any
    },
    /**
     * 刷新令牌
     */
    '/api/auth/refresh': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 刷新令牌
         */
        refreshToken: string
      },
      response: {
        /**
         * @description 访问令牌
         */
        accessToken?: string,
        /**
         * @description 刷新令牌
         */
        refreshToken?: string,
        /**
         * @description 过期时间（秒）
         */
        expiresIn?: number,
        /**
         * @description 令牌类型
         */
        tokenType?: string
      }
    },
    /**
     * MFA 登录验证
     */
    '/api/auth/mfa/login': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description MFA 临时令牌
         */
        mfaToken: string,
        /**
         * @description TOTP 验证码
         */
        code: string,
        /**
         * @description 设备类型
         */
        deviceType?: string
      },
      response: {
        /**
         * @description 访问令牌
         */
        accessToken?: string,
        /**
         * @description 刷新令牌
         */
        refreshToken?: string,
        /**
         * @description 过期时间（秒）
         */
        expiresIn?: number,
        /**
         * @description 令牌类型
         */
        tokenType?: string
      }
    },
    /**
     * 退出登录
     */
    '/api/auth/logout': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    /**
     * 启用 MFA
     */
    '/api/auth/mfa/enable': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description TOTP 密钥
         */
        secret?: string,
        /**
         * @description 二维码数据 URL
         */
        qrCode?: string,
        /**
         * @description 备用恢复码
         */
        backupCodes?: any[]
      }
    },
    /**
     * 验证 MFA 码
     */
    '/api/auth/mfa/verify': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description TOTP 验证码
         */
        code: string
      },
      response: {
        /**
         * @description 验证结果
         */
        valid?: boolean
      }
    },
    /**
     * 禁用 MFA
     */
    '/api/auth/mfa/disable': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description TOTP 验证码
         */
        code: string
      },
      response: any
    },
    /**
     * 开始 Passkey 登录
     */
    '/api/auth/passkey/login-begin': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 用户名（可选，用于识别用户）
         */
        username?: string
      },
      response: {
        /**
         * @description 挑战 ID
         */
        challengeId?: string,
        /**
         * @description WebAuthn 挑战数据
         */
        challenge?: string
      }
    },
    /**
     * 完成 Passkey 登录
     */
    '/api/auth/passkey/login-finish': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 挑战 ID
         */
        challengeId: string,
        /**
         * @description WebAuthn 断言数据
         */
        assertion: {},
        /**
         * @description 设备类型
         */
        deviceType?: string
      },
      response: {
        /**
         * @description 访问令牌
         */
        accessToken?: string,
        /**
         * @description 刷新令牌
         */
        refreshToken?: string,
        /**
         * @description 过期时间（秒）
         */
        expiresIn?: number
      }
    },
    /**
     * 开始 Passkey 注册
     */
    '/api/auth/passkey/register-begin': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 挑战 ID
         */
        challengeId?: string,
        /**
         * @description WebAuthn 挑战数据
         */
        challenge?: string
      }
    },
    /**
     * 完成 Passkey 注册
     */
    '/api/auth/passkey/register-finish': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description Passkey 名称
         */
        name: string,
        /**
         * @description 挑战 ID
         */
        challengeId: string,
        /**
         * @description WebAuthn 凭证数据
         */
        credential: {}
      },
      response: {
        /**
         * @description Passkey ID
         */
        id?: string,
        /**
         * @description Passkey 名称
         */
        name?: string,
        /**
         * @description 创建时间
         */
        createdAt?: string
      }
    },
    /**
     * 创建用户
     */
    '/api/system/users': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 用户名
         */
        username: string,
        /**
         * @description 密码
         */
        password: string,
        /**
         * @description 昵称
         */
        nickname?: string,
        /**
         * @description 邮箱
         */
        email?: string,
        /**
         * @description 手机号
         */
        phone?: string,
        /**
         * @description 部门 ID
         */
        deptId?: string,
        /**
         * @description 角色 ID 列表
         */
        roleIds?: any[],
        /**
         * @description 状态
         */
        status?: number
      },
      response: {
        /**
         * @description 用户 ID
         */
        id?: string
      }
    },
    /**
     * 导出用户 CSV
     */
    '/api/system/users/export': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 用户名筛选
         */
        username?: string,
        /**
         * @description 状态筛选
         */
        status?: number,
        /**
         * @description 部门 ID 筛选
         */
        deptId?: string
      },
      response: any
    },
    /**
     * 创建system:role
     */
    '/api/system/roles': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 角色名称
         */
        name: string,
        /**
         * @description 角色编码
         */
        code: string,
        /**
         * @description 排序
         */
        sort?: number,
        /**
         * @description 状态
         */
        status?: number,
        /**
         * @description 备注
         */
        remark?: string
      },
      response: {
        /**
         * @description 创建的记录 ID
         */
        id?: string
      }
    },
    /**
     * 创建system:menu
     */
    '/api/system/menus': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 父菜单 ID
         */
        parentId?: string,
        /**
         * @description 菜单名称
         */
        name: string,
        /**
         * @description 路由路径
         */
        path?: string,
        /**
         * @description 组件路径
         */
        component?: string,
        /**
         * @description 图标
         */
        icon?: string,
        /**
         * @description 排序
         */
        sort?: number,
        /**
         * @description 类型 D=目录 M=菜单 B=按钮
         * @enum D,M,B
         */
        type: string,
        /**
         * @description 是否可见
         */
        visible?: number,
        /**
         * @description 状态
         */
        status?: number,
        /**
         * @description 权限标识
         */
        permission?: string
      },
      response: {
        /**
         * @description 创建的记录 ID
         */
        id?: string
      }
    },
    /**
     * 创建system:dept
     */
    '/api/system/depts': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 父部门 ID
         */
        parentId?: string,
        /**
         * @description 部门名称
         */
        name: string,
        /**
         * @description 排序
         */
        sort?: number,
        /**
         * @description 负责人
         */
        leader?: string,
        /**
         * @description 联系电话
         */
        phone?: string,
        /**
         * @description 邮箱
         */
        email?: string,
        /**
         * @description 状态
         */
        status?: number
      },
      response: {
        /**
         * @description 创建的记录 ID
         */
        id?: string
      }
    },
    /**
     * 创建system:post
     */
    '/api/system/posts': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 岗位名称
         */
        name: string,
        /**
         * @description 岗位编码
         */
        code: string,
        /**
         * @description 排序
         */
        sort?: number,
        /**
         * @description 状态
         */
        status?: number,
        /**
         * @description 备注
         */
        remark?: string
      },
      response: {
        /**
         * @description 创建的记录 ID
         */
        id?: string
      }
    },
    /**
     * 创建system:dict
     */
    '/api/system/dict/types': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 字典名称
         */
        name: string,
        /**
         * @description 字典编码
         */
        code: string,
        /**
         * @description 状态
         */
        status?: number,
        /**
         * @description 备注
         */
        remark?: string
      },
      response: {
        /**
         * @description 创建的记录 ID
         */
        id?: string
      }
    },
    /**
     * 创建system:config
     */
    '/api/system/configs': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 配置名称
         */
        name: string,
        /**
         * @description 配置键
         */
        key: string,
        /**
         * @description 配置值
         */
        value: string,
        /**
         * @description 配置类型
         */
        type?: string,
        /**
         * @description 备注
         */
        remark?: string
      },
      response: {
        /**
         * @description 创建的记录 ID
         */
        id?: string
      }
    },
    /**
     * 创建system:notice
     */
    '/api/system/notices': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 通知标题
         */
        title: string,
        /**
         * @description 通知内容
         */
        content: string,
        /**
         * @description 通知类型
         */
        type: string
      },
      response: {
        /**
         * @description 创建的记录 ID
         */
        id?: string
      }
    },
    /**
     * 上传头像
     */
    '/api/system/user/profile/avatar': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 头像文件
         */
        file: File
      },
      response: {
        /**
         * @description 头像 URL
         */
        avatar?: string
      }
    },
    /**
     * 创建字典数据
     */
    '/api/system/dict/data': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 字典类型编码
         */
        dictType: string,
        /**
         * @description 字典标签
         */
        label: string,
        /**
         * @description 字典值
         */
        value: string,
        /**
         * @description 排序
         */
        sort?: number,
        /**
         * @description 状态
         */
        status?: number
      },
      response: {
        /**
         * @description 字典数据 ID
         */
        id?: string
      }
    },
    '/api/gen/tables/import': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/gen/tables/:id/generate': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/i18n/locales': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/i18n/messages/set': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/i18n/messages/import': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/workflow/definitions': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/workflow/instances': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    /**
     * 上传文件
     */
    '/api/oss/upload': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 上传文件
         */
        file: File,
        /**
         * @description 存储桶
         */
        bucket?: string
      },
      response: {
        /**
         * @description 文件 ID
         */
        id?: string,
        /**
         * @description 文件名
         */
        filename?: string,
        /**
         * @description MIME 类型
         */
        contentType?: string,
        /**
         * @description 文件大小（字节）
         */
        size?: number,
        /**
         * @description 存储桶
         */
        bucket?: string,
        /**
         * @description 上传者 ID
         */
        uploaderId?: string,
        /**
         * @description 创建时间
         */
        createdAt?: string
      }
    },
    '/api/scheduler/jobs': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/scheduler/jobs/:id/execute': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    }
  },
  delete: {
    /**
     * 删除 Passkey
     */
    '/api/auth/passkey/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    /**
     * 删除用户
     */
    '/api/system/users/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    /**
     * 删除system:role
     */
    '/api/system/roles/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    /**
     * 删除system:menu
     */
    '/api/system/menus/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    /**
     * 删除system:dept
     */
    '/api/system/depts/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    /**
     * 删除system:post
     */
    '/api/system/posts/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    /**
     * 删除system:dict
     */
    '/api/system/dict/types/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    /**
     * 删除system:config
     */
    '/api/system/configs/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    /**
     * 删除system:notice
     */
    '/api/system/notices/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    /**
     * 删除字典数据
     */
    '/api/system/dict/data/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    /**
     * 清空登录日志
     */
    '/api/system/login-logs': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    /**
     * 强制下线
     */
    '/api/system/monitor/online/:sessionId': {
      query: {
        userId?: string
      },
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/i18n/locales/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/i18n/messages/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/workflow/definitions/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    /**
     * 删除文件
     */
    '/api/oss/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/scheduler/jobs/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    }
  },
  put: {
    /**
     * 更新用户
     */
    '/api/system/users/:id': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 昵称
         */
        nickname?: string,
        /**
         * @description 邮箱
         */
        email?: string,
        /**
         * @description 手机号
         */
        phone?: string,
        /**
         * @description 部门 ID
         */
        deptId?: string,
        /**
         * @description 角色 ID 列表
         */
        roleIds?: any[],
        /**
         * @description 状态
         */
        status?: number
      },
      response: any
    },
    /**
     * 重置用户密码
     */
    '/api/system/users/:id/reset-pwd': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 新密码
         */
        newPassword: string
      },
      response: any
    },
    /**
     * 修改用户状态
     */
    '/api/system/users/:id/status': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 状态 0=停用 1=正常
         * @enum 0,1
         */
        status: number
      },
      response: any
    },
    /**
     * 更新system:role
     */
    '/api/system/roles/:id': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 角色名称
         */
        name?: string,
        /**
         * @description 角色编码
         */
        code?: string,
        /**
         * @description 排序
         */
        sort?: number,
        /**
         * @description 状态
         */
        status?: number,
        /**
         * @description 备注
         */
        remark?: string
      },
      response: any
    },
    /**
     * 分配角色菜单
     */
    '/api/system/roles/:id/menus': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 菜单 ID 列表
         */
        menuIds: any[]
      },
      response: any
    },
    /**
     * 分配角色数据范围
     */
    '/api/system/roles/:id/data-scope': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 数据范围
         */
        scope: number,
        /**
         * @description 部门 ID 列表
         */
        deptIds?: any[]
      },
      response: any
    },
    /**
     * 更新system:menu
     */
    '/api/system/menus/:id': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 父菜单 ID
         */
        parentId?: string,
        /**
         * @description 菜单名称
         */
        name?: string,
        /**
         * @description 路由路径
         */
        path?: string,
        /**
         * @description 组件路径
         */
        component?: string,
        /**
         * @description 图标
         */
        icon?: string,
        /**
         * @description 排序
         */
        sort?: number,
        /**
         * @description 类型
         * @enum D,M,B
         */
        type?: string,
        /**
         * @description 是否可见
         */
        visible?: number,
        /**
         * @description 状态
         */
        status?: number,
        /**
         * @description 权限标识
         */
        permission?: string
      },
      response: any
    },
    /**
     * 更新system:dept
     */
    '/api/system/depts/:id': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 父部门 ID
         */
        parentId?: string,
        /**
         * @description 部门名称
         */
        name?: string,
        /**
         * @description 排序
         */
        sort?: number,
        /**
         * @description 负责人
         */
        leader?: string,
        /**
         * @description 联系电话
         */
        phone?: string,
        /**
         * @description 邮箱
         */
        email?: string,
        /**
         * @description 状态
         */
        status?: number
      },
      response: any
    },
    /**
     * 更新system:post
     */
    '/api/system/posts/:id': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 岗位名称
         */
        name?: string,
        /**
         * @description 岗位编码
         */
        code?: string,
        /**
         * @description 排序
         */
        sort?: number,
        /**
         * @description 状态
         */
        status?: number,
        /**
         * @description 备注
         */
        remark?: string
      },
      response: any
    },
    /**
     * 更新system:dict
     */
    '/api/system/dict/types/:id': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 字典名称
         */
        name?: string,
        /**
         * @description 字典编码
         */
        code?: string,
        /**
         * @description 状态
         */
        status?: number,
        /**
         * @description 备注
         */
        remark?: string
      },
      response: any
    },
    /**
     * 更新system:config
     */
    '/api/system/configs/:id': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 配置名称
         */
        name?: string,
        /**
         * @description 配置值
         */
        value?: string,
        /**
         * @description 配置类型
         */
        type?: string,
        /**
         * @description 备注
         */
        remark?: string
      },
      response: any
    },
    /**
     * 更新system:notice
     */
    '/api/system/notices/:id': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 通知标题
         */
        title?: string,
        /**
         * @description 通知内容
         */
        content?: string,
        /**
         * @description 通知类型
         */
        type?: string
      },
      response: any
    },
    /**
     * 发布通知
     */
    '/api/system/notices/:id/publish': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    /**
     * 标记已读
     */
    '/api/system/notices/:id/read': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    /**
     * 更新当前用户信息
     */
    '/api/system/user/profile': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 昵称
         */
        nickname?: string,
        /**
         * @description 邮箱
         */
        email?: string,
        /**
         * @description 手机号
         */
        phone?: string,
        /**
         * @description 性别 male/female/unknown
         */
        gender?: string
      },
      response: any
    },
    /**
     * 修改密码
     */
    '/api/system/user/profile/password': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 旧密码
         */
        oldPassword: string,
        /**
         * @description 新密码
         */
        newPassword: string
      },
      response: any
    },
    /**
     * 更新字典数据
     */
    '/api/system/dict/data/:id': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 字典标签
         */
        label?: string,
        /**
         * @description 字典值
         */
        value?: string,
        /**
         * @description 排序
         */
        sort?: number,
        /**
         * @description 状态
         */
        status?: number
      },
      response: any
    },
    /**
     * 撤回通知
     */
    '/api/system/notices/:id/revoke': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    /**
     * 解锁用户
     */
    '/api/system/users/:id/unlock': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    /**
     * 设置用户黑名单
     */
    '/api/system/users/:id/blacklist': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 是否加入黑名单
         */
        blacklisted: boolean
      },
      response: any
    },
    '/api/gen/tables/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/gen/columns/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/i18n/locales/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/workflow/definitions/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/workflow/definitions/:id/nodes': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/workflow/tasks/:id/approve': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/workflow/tasks/:id/reject': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/scheduler/jobs/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/scheduler/jobs/:id/start': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/scheduler/jobs/:id/stop': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    }
  }
}