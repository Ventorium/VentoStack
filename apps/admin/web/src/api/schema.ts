export type OpenAPIComponents = {
  schemas: never,
  responses: never,
  // parameters: {},
  // headers: {},
  requestBodies: never
}
export type OpenAPIs = {
  get: {
    '/uploads/*': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: {}
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
        passkeyEnabled?: boolean,
        /**
         * @description 是否允许用户自注册
         */
        registerEnabled?: boolean,
        /**
         * @description 密码最小长度
         */
        passwordMinLength?: number,
        /**
         * @description 密码复杂度: low/medium/high
         */
        passwordComplexity?: string
      }
    },
    /**
     * 获取字典数据
     * @description 租户由服务端部署配置确定。字典类型启用且配置为公开时允许匿名访问；否则必须提供有效登录会话。客户端不得提交 tenantId。
     */
    '/api/system/dict/types/:code/data': {
      query: never,
      params: {
        code: string
      },
      headers: never,
      body: never,
      response: any[]
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
        list?: {
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
        }[],
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
      params: {
        id: string
      },
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
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
     */
    '/api/system/roles': {
      query: {
        page?: number,
        pageSize?: number,
        status?: number
      },
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 列表数据
         */
        list?: {
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
        }[],
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
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
     */
    '/api/system/roles/:id': {
      query: never,
      params: {
        id: string
      },
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
     * 获取角色已分配菜单
     */
    '/api/system/roles/:id/menus': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: {
        /**
         * @description 菜单 ID 列表
         */
        menuIds?: any[]
      }
    },
    /**
     * 获取角色数据范围
     */
    '/api/system/roles/:id/data-scope': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: {
        /**
         * @description 数据范围
         */
        scope?: number,
        /**
         * @description 自定义部门 ID 列表
         */
        deptIds?: any[]
      }
    },
    /**
     * 获取system:menu列表
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
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
        list?: {
          /**
           * @description 菜单 ID
           */
          id?: string,
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
           * @description 菜单类型 1=目录 2=菜单 3=按钮
           */
          type?: number,
          /**
           * @description 是否可见
           */
          visible?: boolean,
          /**
           * @description 状态
           */
          status?: number,
          /**
           * @description 权限标识
           */
          permission?: string
        }[],
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
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
     */
    '/api/system/menus/:id': {
      query: never,
      params: {
        id: string
      },
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
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
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
        list?: {
          /**
           * @description 部门 ID
           */
          id?: string,
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
           * @description 负责人用户 ID
           */
          leaderUserId?: string,
          /**
           * @description 负责人名称
           */
          leaderName?: string,
          /**
           * @description 状态
           */
          status?: number
        }[],
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
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
     */
    '/api/system/posts': {
      query: {
        page?: number,
        pageSize?: number,
        name?: string,
        code?: string,
        status?: number
      },
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 列表数据
         */
        list?: {
          /**
           * @description 岗位 ID
           */
          id?: string,
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
        }[],
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
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
     */
    '/api/system/dict/types': {
      query: {
        page?: number,
        pageSize?: number,
        name?: string,
        code?: string,
        status?: number
      },
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 列表数据
         */
        list?: {
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
           * @description 是否系统内置
           */
          isSystem?: boolean,
          /**
           * @description 是否允许未登录用户访问字典数据
           */
          isPublic?: boolean,
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
        }[],
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
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
     */
    '/api/system/dict/types/:id': {
      query: never,
      params: {
        id: string
      },
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
         * @description 是否系统内置
         */
        isSystem?: boolean,
        /**
         * @description 是否允许未登录用户访问字典数据
         */
        isPublic?: boolean,
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
      }
    },
    /**
     * 获取system:config列表
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
     */
    '/api/system/configs': {
      query: {
        page?: number,
        pageSize?: number,
        name?: string,
        key?: string,
        group?: string
      },
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 列表数据
         */
        list?: {
          /**
           * @description 配置 ID
           */
          id?: string,
          /**
           * @description 配置名称
           */
          name?: string,
          /**
           * @description 配置键
           */
          key?: string,
          /**
           * @description 配置值（敏感配置返回掩码）
           */
          value?: string,
          /**
           * @description 配置类型
           */
          type?: number,
          /**
           * @description 配置分组
           */
          group?: string,
          /**
           * @description 排序
           */
          sort?: number,
          /**
           * @description 备注
           */
          remark?: string,
          /**
           * @description 敏感级别：security=值已掩码；public=公开白名单；business=普通配置
           * @enum security,public,business
           */
          sensitivity?: string,
          /**
           * @description 是否系统预设参数；系统预设参数不可删除
           */
          isSystem?: boolean
        }[],
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
      params: {
        key: string
      },
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
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
     */
    '/api/system/notices': {
      query: {
        page?: number,
        pageSize?: number,
        title?: string,
        type?: number,
        status?: number
      },
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 列表数据
         */
        list?: {
          /**
           * @description 通知 ID
           */
          id?: string,
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
          type?: number,
          /**
           * @description 状态
           */
          status?: number,
          /**
           * @description 创建时间
           */
          createdAt?: string
        }[],
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
     * 获取system:tag列表
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
     */
    '/api/system/tags': {
      query: {
        page?: number,
        pageSize?: number,
        name?: string,
        status?: number
      },
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 列表数据
         */
        list?: {
          /**
           * @description 标签 ID
           */
          id?: string,
          /**
           * @description 标签名称
           */
          name?: string,
          /**
           * @description 标签标识
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
        }[],
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
     * 获取全部有效标签
     */
    '/api/system/tags/all': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any[]
    },
    /**
     * 获取标签关联用户
     */
    '/api/system/tags/:id/users': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any[]
    },
    /**
     * 根据标签标识获取关联用户
     */
    '/api/system/tags/by-code/:code/users': {
      query: never,
      params: {
        code: string
      },
      headers: never,
      body: never,
      response: any[]
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
     * 获取当前用户登录日志（个人视角）
     * @description 租户作用域由服务端根据当前部署与认证会话确定；仅返回当前认证用户自己的登录记录。
     */
    '/api/system/user/login-logs': {
      query: {
        page?: number,
        pageSize?: number
      },
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 当前用户登录日志列表
         */
        list?: {
          /**
           * @description 日志 ID
           */
          id?: string,
          /**
           * @description 用户 ID
           */
          userId?: string,
          /**
           * @description 用户名
           */
          username?: string,
          /**
           * @description 登录 IP
           */
          ip?: string,
          /**
           * @description IP 位置描述
           */
          location?: string,
          /**
           * @description 浏览器
           */
          browser?: string,
          /**
           * @description 操作系统
           */
          os?: string,
          /**
           * @description 状态 0=失败 1=成功
           */
          status?: number,
          /**
           * @description 登录结果信息
           */
          message?: string,
          /**
           * @description 登录方式
           */
          loginMethod?: string,
          /**
           * @description 登录时间
           */
          loginAt?: string,
          /**
           * @description 记录创建时间
           */
          createdAt?: string
        }[],
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
     * 获取用户标签
     */
    '/api/system/users/:id/tags': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any[]
    },
    /**
     * 获取操作日志
     * @description 按当前租户查询操作审计日志，包含可信客户端 IP 和位置描述。
     */
    '/api/system/operation-logs': {
      query: {
        page?: number,
        pageSize?: number,
        username?: string,
        module?: string,
        result?: number
      },
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 操作日志列表
         */
        list?: {
          /**
           * @description 日志 ID
           */
          id?: string,
          /**
           * @description 操作者用户 ID
           */
          userId?: string,
          /**
           * @description 操作者用户名
           */
          username?: string,
          /**
           * @description 业务模块
           */
          module?: string,
          /**
           * @description 中文操作名称
           */
          action?: string,
          /**
           * @description HTTP 方法
           */
          method?: string,
          /**
           * @description 请求路径（不含查询串）
           */
          url?: string,
          /**
           * @description 可信客户端 IP
           */
          ip?: string,
          /**
           * @description IP 位置描述
           */
          location?: string,
          /**
           * @description 脱敏后的请求参数 JSON
           */
          params?: string,
          /**
           * @description 结果 0=失败 1=成功
           */
          result?: number,
          /**
           * @description 异常信息
           */
          errorMsg?: string,
          /**
           * @description 耗时（毫秒）
           */
          duration?: number,
          /**
           * @description 操作时间
           */
          createdAt?: string
        }[],
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
     * @description 按当前租户查询登录日志，支持用户名和登录结果筛选。
     */
    '/api/system/login-logs': {
      query: {
        page?: number,
        pageSize?: number,
        username?: string,
        status?: number
      },
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 登录日志列表
         */
        list?: {}[],
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
    /**
     * 获取已发布通知列表（含已读状态）
     */
    '/api/system/notices/published': {
      query: {
        page?: number,
        pageSize?: number
      },
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 通知列表
         */
        items?: {}[],
        /**
         * @description 总数
         */
        total?: number,
        /**
         * @description 当前页
         */
        page?: number,
        /**
         * @description 每页条数
         */
        pageSize?: number,
        /**
         * @description 总页数
         */
        totalPages?: number
      }
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
         * @description 是否已配置真实缓存统计采集器
         */
        available?: boolean,
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
         * @description 是否可以读取真实连接池统计
         */
        metricsAvailable?: boolean,
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
     * 获取最近活动用户
     * @description 租户范围来自认证上下文；客户端不得提交 tenantId。
     */
    '/api/system/monitor/online': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 当前租户最近 30 分钟活动用户列表（按用户去重）
         */
        list?: {}[],
        /**
         * @description 总数
         */
        total?: number
      }
    },
    '/api/system/notification/messages': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/notification/messages/unread-count': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/notification/templates': {
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
    '/api/i18n/messages': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/i18n/messages/:locale': {
      query: never,
      params: {
        locale: string
      },
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
    '/api/workflow/definitions/by-business-type/:type': {
      query: never,
      params: {
        type: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/workflow/definitions/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/workflow/definitions/:id/graph': {
      query: never,
      params: {
        id: string
      },
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
    '/api/workflow/instances/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/workflow/instances/:id/history': {
      query: never,
      params: {
        id: string
      },
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
    '/api/workflow/tasks/done': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    /**
     * 获取文件列表
     */
    '/api/system/oss': {
      query: {
        page?: number,
        pageSize?: number,
        bucket?: string,
        uploaderId?: string,
        filename?: string
      },
      params: never,
      headers: never,
      body: never,
      response: {
        /**
         * @description 文件列表
         */
        list?: {
          /**
           * @description 文件 ID
           */
          id?: string,
          /**
           * @description 原始文件名
           */
          originalName?: string,
          /**
           * @description 存储路径
           */
          storagePath?: string,
          /**
           * @description 文件大小（字节）
           */
          size?: number,
          /**
           * @description MIME 类型（识别失败时为 null）
           */
          mimeType?: string,
          /**
           * @description 扩展名（含 .）
           */
          extension?: string,
          /**
           * @description 存储桶
           */
          bucket?: string,
          /**
           * @description 租户 ID
           */
          tenantId?: string,
          /**
           * @description 上传者 ID
           */
          uploaderId?: string,
          /**
           * @description 上传者显示名（nickname 优先，解析不到为 null）
           */
          uploaderName?: string,
          /**
           * @description 上传时间
           */
          createdAt?: string
        }[],
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
    '/api/system/oss/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: {
        /**
         * @description 文件 ID
         */
        id?: string,
        /**
         * @description 原始文件名
         */
        originalName?: string,
        /**
         * @description 存储路径
         */
        storagePath?: string,
        /**
         * @description 文件大小（字节）
         */
        size?: number,
        /**
         * @description MIME 类型（识别失败时为 null）
         */
        mimeType?: string,
        /**
         * @description 扩展名（含 .）
         */
        extension?: string,
        /**
         * @description 存储桶
         */
        bucket?: string,
        /**
         * @description 租户 ID
         */
        tenantId?: string,
        /**
         * @description 上传者 ID
         */
        uploaderId?: string,
        /**
         * @description 上传者显示名（nickname 优先，解析不到为 null）
         */
        uploaderName?: string,
        /**
         * @description 上传时间
         */
        createdAt?: string
      }
    },
    /**
     * 下载文件
     */
    '/api/system/oss/:id/download': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 获取签名 URL
     */
    '/api/system/oss/:id/url': {
      query: {
        expiresIn?: number
      },
      params: {
        id: string
      },
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
    /**
     * 获取已注册任务处理器
     * @description 处理器由服务端应用注册，客户端只能选择，不能自行定义。
     */
    '/api/system/scheduler/handlers': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: {}[]
    },
    '/api/system/scheduler/jobs': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/scheduler/jobs/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/system/scheduler/logs': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/gen/tables': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/gen/tables/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/system/gen/tables/:id/preview': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/knowledge-bases': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/knowledge-bases/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 浏览知识库文件
     */
    '/api/ai/knowledge-bases/:id/files': {
      query: {
        path?: string,
        depth?: number
      },
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/knowledge-bases/:id/files/*': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/knowledge-bases/:id/source/*': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/knowledge-bases/:id/search': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 获取 Agent 列表
     */
    '/api/ai/agents': {
      query: {
        page?: number,
        pageSize?: number,
        status?: string,
        search?: string
      },
      params: never,
      headers: never,
      body: never,
      response: any
    },
    /**
     * 获取 Agent 详情
     */
    '/api/ai/agents/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/agents/:id/workspace/files': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/agents/:id/workspace/file': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 获取会话列表
     */
    '/api/ai/conversations': {
      query: {
        agentId?: string,
        limit?: number,
        before?: string
      },
      params: never,
      headers: never,
      body: never,
      response: any
    },
    /**
     * 回收站列表
     */
    '/api/ai/conversations/trash': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: {
        description?: any
      }
    },
    /**
     * 获取会话历史消息
     */
    '/api/ai/conversations/:id/messages': {
      query: {
        limit?: number
      },
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 获取会话产物文件列表
     */
    '/api/ai/conversations/:id/artifacts': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 预览会话产物文件
     */
    '/api/ai/conversations/:id/artifacts/preview': {
      query: {
        path: string
      },
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: {
        description?: any
      }
    },
    /**
     * 获取会话记忆
     */
    '/api/ai/conversations/:id/memory': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 预览会话产物文件
     */
    '/api/ai/conversations/:id/artifact': {
      query: {
        path: string
      },
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/providers/presets': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    /**
     * 获取供应商列表
     */
    '/api/ai/providers': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    /**
     * 获取供应商详情
     */
    '/api/ai/providers/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/providers/:id/models': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 获取全局模型列表
     */
    '/api/ai/models': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    /**
     * 获取 AI 全局配置
     */
    '/api/ai/config/:key': {
      query: never,
      params: {
        key: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/skills/store/search': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/skills/store/:slug': {
      query: never,
      params: {
        slug: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/skills/store/:slug/files': {
      query: never,
      params: {
        slug: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/skills/store/:slug/file': {
      query: never,
      params: {
        slug: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/skills': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/skills/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/skills/:id/files': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/skills/:id/file': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/mcp-servers': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/mcp-servers/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 获取工具列表
     */
    '/api/ai/tools': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/tools/:name': {
      query: never,
      params: {
        name: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 获取追踪会话列表
     */
    '/api/ai/trace/conversations': {
      query: {
        page?: number,
        pageSize?: number,
        agentId?: string,
        userId?: string,
        keyword?: string,
        startTime?: string,
        endTime?: string
      },
      params: never,
      headers: never,
      body: never,
      response: any
    },
    /**
     * 获取会话消息时间线
     */
    '/api/ai/trace/conversations/:id': {
      query: {
        limit?: number
      },
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 获取链路追踪详情
     */
    '/api/ai/trace/traces/:traceId': {
      query: never,
      params: {
        traceId: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 获取链路追踪开关状态
     */
    '/api/ai/trace/config': {
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
         * @description 记住登录
         */
        remember?: boolean,
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
     * @description 仅当系统参数 sys_register_enabled 开启时可用
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
         * @description 新注册用户 ID
         */
        userId?: string
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
         * @description 固定提示（不区分邮箱是否存在，防枚举）
         */
        message?: string
      }
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
         * @description 刷新令牌；浏览器端可省略并使用 HttpOnly Cookie
         */
        refreshToken?: string
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
      body: {
        /**
         * @description 刷新令牌
         */
        refreshToken?: string,
        /**
         * @description 会话 ID
         */
        sessionId?: string
      },
      response: any
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
        qrCodeUri?: string,
        /**
         * @description 备用恢复码
         */
        recoveryCodes?: any[]
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
        roleIds?: string[],
        /**
         * @description 岗位 ID 列表
         */
        postIds?: string[],
        /**
         * @description 状态
         * @enum 0,1
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
         * @description 部门 ID 筛选，__none__ 表示无部门
         */
        deptId?: string
      },
      response: any
    },
    /**
     * 创建system:role
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
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
         * @enum 0,1
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
     * 批量删除角色
     */
    '/api/system/roles/batch-delete': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 角色 ID 列表
         */
        ids: string[]
      },
      response: any
    },
    /**
     * 创建system:menu
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
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
         * @description 类型 1=目录 2=菜单 3=按钮
         * @enum 1,2,3
         */
        type: number,
        /**
         * @description 是否可见
         */
        visible?: boolean,
        /**
         * @description 状态
         * @enum 0,1
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
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
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
         * @description 负责人用户 ID
         */
        leaderUserId?: string,
        /**
         * @description 状态
         * @enum 0,1
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
     * 批量删除部门
     */
    '/api/system/depts/batch-delete': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 部门 ID 列表
         */
        ids: string[]
      },
      response: any
    },
    /**
     * 创建system:post
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
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
         * @enum 0,1
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
     * 批量删除岗位
     */
    '/api/system/posts/batch-delete': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 岗位 ID 列表
         */
        ids: string[]
      },
      response: any
    },
    /**
     * 创建system:dict
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
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
         * @description 是否允许未登录用户访问字典数据，默认否
         */
        isPublic?: boolean,
        /**
         * @description 排序
         */
        sort?: number,
        /**
         * @description 状态
         * @enum 0,1
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
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
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
         * @enum 0,1,2,3
         */
        type?: number,
        /**
         * @description 配置分组
         */
        group?: string,
        /**
         * @description 排序
         */
        sort?: number,
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
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
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
         * @description 通知类型 1=通知 2=公告
         * @enum 1,2
         */
        type: number
      },
      response: {
        /**
         * @description 创建的记录 ID
         */
        id?: string
      }
    },
    /**
     * 批量发布通知
     */
    '/api/system/notices/batch-publish': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 通知 ID 列表
         */
        ids: string[]
      },
      response: any
    },
    /**
     * 批量撤回通知
     */
    '/api/system/notices/batch-revoke': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 通知 ID 列表
         */
        ids: string[]
      },
      response: any
    },
    /**
     * 批量删除通知
     */
    '/api/system/notices/batch-delete': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 通知 ID 列表
         */
        ids: string[]
      },
      response: any
    },
    /**
     * 创建system:tag
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
     */
    '/api/system/tags': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 标签名称
         */
        name: string,
        /**
         * @description 标签标识
         */
        code: string,
        /**
         * @description 排序
         */
        sort?: number,
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
         * @description 标签颜色，推荐使用十六进制 CSS 颜色值
         */
        cssClass?: string,
        /**
         * @description 状态
         * @enum 0,1
         */
        status?: number,
        /**
         * @description 备注
         */
        remark?: string
      },
      response: {
        /**
         * @description 字典数据 ID
         */
        id?: string
      }
    },
    /**
     * 批量删除字典数据
     */
    '/api/system/dict/data/batch-delete': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 字典数据 ID 列表
         */
        ids: string[]
      },
      response: any
    },
    /**
     * 批量删除用户
     */
    '/api/system/users/batch-delete': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 用户 ID 列表
         */
        ids: string[]
      },
      response: any
    },
    /**
     * 批量修改用户状态
     */
    '/api/system/users/batch-status': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 用户 ID 列表
         */
        ids: string[],
        /**
         * @description 目标状态 0=停用 1=正常
         * @enum 0,1
         */
        status: number
      },
      response: any
    },
    /**
     * 批量重置用户密码
     */
    '/api/system/users/batch-reset-pwd': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 用户 ID 列表
         */
        ids: string[]
      },
      response: any
    },
    /**
     * 批量标记通知已读
     */
    '/api/system/notices/batch-read': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 通知 ID 列表
         */
        ids: string[]
      },
      response: {
        /**
         * @description 业务状态码
         */
        code?: number,
        /**
         * @description 响应消息
         */
        message?: string
      }
    },
    '/api/system/notification/send': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/notification/send-by-posts': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/notification/messages/read-batch': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/notification/messages/:id/retry': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/system/notification/templates': {
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
    '/api/workflow/definitions/:id/publish': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/workflow/definitions/:id/disable': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/workflow/definitions/:id/clone': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/workflow/definitions/:id/graph/validate': {
      query: never,
      params: {
        id: string
      },
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
    '/api/workflow/instances/:id/withdraw': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/workflow/tasks/:id/approve': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/workflow/tasks/:id/reject': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/workflow/tasks/:id/transfer': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/workflow/tasks/:id/add-sign': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/workflow/tasks/:id/urge': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 上传文件
     */
    '/api/system/oss/upload': {
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
         * @description 原始文件名
         */
        originalName?: string,
        /**
         * @description 存储路径
         */
        storagePath?: string,
        /**
         * @description 文件大小（字节）
         */
        size?: number,
        /**
         * @description MIME 类型（识别失败时为 null）
         */
        mimeType?: string,
        /**
         * @description 扩展名（含 .）
         */
        extension?: string,
        /**
         * @description 存储桶
         */
        bucket?: string,
        /**
         * @description 租户 ID
         */
        tenantId?: string,
        /**
         * @description 上传者 ID
         */
        uploaderId?: string,
        /**
         * @description 上传者显示名（nickname 优先，解析不到为 null）
         */
        uploaderName?: string,
        /**
         * @description 上传时间
         */
        createdAt?: string
      }
    },
    '/api/system/scheduler/jobs': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/scheduler/jobs/:id/execute': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/system/gen/tables/import': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/gen/tables/:id/generate': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/knowledge-bases': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    /**
     * 重命名知识库文件
     */
    '/api/ai/knowledge-bases/:id/rename': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: {
        /**
         * @description 原文件相对路径
         */
        path: string,
        /**
         * @description 新文件名
         */
        name: string
      },
      response: any
    },
    /**
     * 创建知识库目录
     */
    '/api/ai/knowledge-bases/:id/mkdir': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: {
        /**
         * @description 目录路径（相对知识库根目录）
         */
        path: string
      },
      response: any
    },
    /**
     * 启用/禁用知识库文件
     */
    '/api/ai/knowledge-bases/:id/files/enabled': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: {
        /**
         * @description 文件相对路径
         */
        path: string,
        /**
         * @description true 启用 / false 禁用
         */
        enabled: boolean
      },
      response: any
    },
    '/api/ai/knowledge-bases/:id/upload': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 创建 Agent
     */
    '/api/ai/agents': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description Agent 名称
         */
        name: string,
        /**
         * @description 描述
         */
        description?: string,
        /**
         * @description 新会话欢迎词，为空时使用默认文案
         */
        welcomeMessage?: string,
        /**
         * @description 可用模型 ID 列表（至少 1 个）
         */
        model: string[],
        /**
         * @description 系统提示词
         */
        systemPrompt: string,
        /**
         * @description 启用的工具名
         */
        tools?: string[],
        /**
         * @description 绑定的知识库 ID
         */
        knowledgeBaseIds?: string[],
        /**
         * @description 绑定的技能 ID
         */
        skillIds?: string[],
        /**
         * @description 绑定的 MCP 服务 ID
         */
        mcpServerIds?: string[],
        /**
         * @description 模型覆盖配置（能力 → 模型 ID 映射）
         */
        modelOverrides?: {},
        /**
         * @description 记忆配置（enabled/longTerm/maxHistoryMessages）
         */
        memoryConfig?: {},
        /**
         * @description 扩展配置（如 research.depth）
         */
        config?: {},
        /**
         * @description 最大迭代轮数
         */
        maxIterations?: number,
        /**
         * @description 每轮 Token 上限
         */
        maxTokensPerTurn?: number,
        /**
         * @description 是否公开
         */
        isPublic?: boolean,
        /**
         * @description 是否为 Agent 创建独占虚拟环境（创建后不可修改）
         */
        requiresVirtualEnvironment?: boolean
      },
      response: {
        /**
         * @description Agent ID
         */
        id?: string
      }
    },
    /**
     * 发布 Agent
     */
    '/api/ai/agents/:id/publish': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 聊天内确认工具审批
     */
    '/api/ai/chat/approvals/:id/confirm': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: {
        /**
         * @description 审批决定
         * @enum approved,rejected
         */
        decision: string,
        /**
         * @description 备注原因（可选）
         */
        reason?: string
      },
      response: any
    },
    /**
     * 创建会话
     */
    '/api/ai/conversations': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description Agent ID
         */
        agentId: string
      },
      response: {
        /**
         * @description 会话 ID
         */
        id?: string
      }
    },
    /**
     * 从回收站恢复会话
     */
    '/api/ai/conversations/trash/restore': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 会话 ID 列表
         */
        sessionIds: string[]
      },
      response: any
    },
    /**
     * 彻底删除回收站会话
     */
    '/api/ai/conversations/trash/purge': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 会话 ID 列表（缺省清空全部）
         */
        sessionIds?: string[]
      },
      response: any
    },
    /**
     * 上传会话附件
     */
    '/api/ai/conversations/:id/attachments': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 异步整理会话记忆
     */
    '/api/ai/conversations/:id/memory/consolidate': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 分叉会话
     */
    '/api/ai/conversations/:id/fork': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: {
        /**
         * @description 分叉入口消息 ID
         */
        entryId?: string,
        /**
         * @description 分叉位置
         * @enum before,at
         */
        position?: string,
        /**
         * @description 分叉范围
         * @enum tree,branch
         */
        scope?: string
      },
      response: {
        /**
         * @description 新会话 ID
         */
        sessionId?: string
      }
    },
    /**
     * 发送消息（非流式）
     */
    '/api/ai/chat': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description Agent ID
         */
        agentId: string,
        /**
         * @description 会话 ID（缺省自动创建）
         */
        sessionId?: string,
        /**
         * @description 用户消息
         */
        message: string,
        /**
         * @description 用户选择的模型 ID（须在 Agent 白名单内）
         */
        model?: string,
        /**
         * @description 工具过滤
         */
        tools?: string[],
        /**
         * @description 技能过滤
         */
        skillIds?: string[],
        /**
         * @description MCP 过滤
         */
        mcpServerIds?: string[],
        /**
         * @description 知识库过滤
         */
        knowledgeBaseIds?: string[],
        /**
         * @description 当前会话附件路径
         */
        attachmentPaths?: string[],
        /**
         * @description 思考强度
         * @enum off,minimal,low,medium,high,xhigh
         */
        thinkingLevel?: string
      },
      response: {
        /**
         * @description 回复内容
         */
        content?: string,
        /**
         * @description 会话 ID
         */
        sessionId?: string
      }
    },
    /**
     * 发送消息（SSE 流式）
     */
    '/api/ai/chat/stream': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description Agent ID
         */
        agentId: string,
        /**
         * @description 会话 ID（缺省自动创建）
         */
        sessionId?: string,
        /**
         * @description 用户消息
         */
        message: string,
        /**
         * @description 用户选择的模型 ID（须在 Agent 白名单内）
         */
        model?: string,
        /**
         * @description 工具过滤
         */
        tools?: string[],
        /**
         * @description 技能过滤
         */
        skillIds?: string[],
        /**
         * @description MCP 过滤
         */
        mcpServerIds?: string[],
        /**
         * @description 知识库过滤
         */
        knowledgeBaseIds?: string[],
        /**
         * @description 当前会话附件路径
         */
        attachmentPaths?: string[],
        /**
         * @description 思考强度
         * @enum off,minimal,low,medium,high,xhigh
         */
        thinkingLevel?: string
      },
      response: string
    },
    /**
     * 创建供应商
     */
    '/api/ai/providers': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 供应商名称
         */
        name: string,
        /**
         * @description 显示名称
         */
        displayName?: string,
        /**
         * @description API 格式
         */
        apiFormat?: string,
        /**
         * @description Base URL
         */
        baseUrl?: string,
        /**
         * @description API Key（加密存储）
         */
        apiKey?: string,
        /**
         * @description 自定义请求头
         */
        headers?: {},
        /**
         * @description 扩展配置
         */
        extra?: {},
        /**
         * @description 预设 ID
         */
        presetId?: string,
        /**
         * @description models.dev 标识
         */
        modelsDevSlug?: string,
        /**
         * @description 排序
         */
        sort?: number
      },
      response: any
    },
    '/api/ai/providers/:id/models': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/models/batch-delete': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/models/:id/test': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/models/batch-test': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/providers/:id/sync': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 从供应商接口同步模型
     */
    '/api/ai/providers/:id/sync-api': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 测试 OCR 服务连通性
     */
    '/api/ai/ocr/test': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description OCR 服务地址
         */
        serverUrl: string,
        /**
         * @description 访问 Token
         */
        token?: string,
        /**
         * @description 模型名（默认 PaddleOCR-VL-1.6）
         */
        model?: string
      },
      response: any
    },
    '/api/ai/skills/store/:slug/install': {
      query: never,
      params: {
        slug: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/skills/:id/sync': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/skills/:id/upgrade': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/skills/check-updates': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/skills/upload': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/skills/install-from-workspace': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/mcp-servers': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/mcp-servers/:id/test': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/mcp-servers/:id/refresh': {
      query: never,
      params: {
        id: string
      },
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
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 删除用户
     */
    '/api/system/users/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 删除system:role
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
     */
    '/api/system/roles/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 删除system:menu
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
     */
    '/api/system/menus/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 删除system:dept
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
     */
    '/api/system/depts/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 删除system:post
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
     */
    '/api/system/posts/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 删除system:dict
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
     */
    '/api/system/dict/types/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 删除system:config
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
     */
    '/api/system/configs/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 删除system:notice
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
     */
    '/api/system/notices/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 删除system:tag
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
     */
    '/api/system/tags/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 删除字典数据
     */
    '/api/system/dict/data/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 清空登录日志
     * @description 仅管理员可清空当前租户的登录日志，不影响其他租户。
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
     * @description 校验当前租户内的有效会话，并撤销该用户的全部会话。
     */
    '/api/system/monitor/online/:sessionId': {
      query: never,
      params: {
        sessionId: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/system/notification/messages/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/system/notification/templates/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/i18n/locales/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/i18n/messages/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/workflow/definitions/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 删除文件
     */
    '/api/system/oss/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/system/scheduler/jobs/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/knowledge-bases/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/knowledge-bases/:id/files/*': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 删除 Agent
     */
    '/api/ai/agents/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 删除会话（移入回收站）
     */
    '/api/ai/conversations/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/providers/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/models/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/skills/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/mcp-servers/:id': {
      query: never,
      params: {
        id: string
      },
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
      params: {
        id: string
      },
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
        roleIds?: string[],
        /**
         * @description 岗位 ID 列表
         */
        postIds?: string[],
        /**
         * @description 状态
         * @enum 0,1
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
      params: {
        id: string
      },
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
      params: {
        id: string
      },
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
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
     */
    '/api/system/roles/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: {
        /**
         * @description 角色名称
         */
        name?: string,
        /**
         * @description 排序
         */
        sort?: number,
        /**
         * @description 状态
         * @enum 0,1
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
      params: {
        id: string
      },
      headers: never,
      body: {
        /**
         * @description 菜单 ID 列表
         */
        menuIds: string[]
      },
      response: any
    },
    /**
     * 分配角色数据范围
     */
    '/api/system/roles/:id/data-scope': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: {
        /**
         * @description 数据范围
         */
        scope: number,
        /**
         * @description 部门 ID 列表
         */
        deptIds?: string[]
      },
      response: any
    },
    /**
     * 更新system:menu
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
     */
    '/api/system/menus/:id': {
      query: never,
      params: {
        id: string
      },
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
         * @description 类型 1=目录 2=菜单 3=按钮
         * @enum 1,2,3
         */
        type?: number,
        /**
         * @description 是否可见
         */
        visible?: boolean,
        /**
         * @description 状态
         * @enum 0,1
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
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
     */
    '/api/system/depts/:id': {
      query: never,
      params: {
        id: string
      },
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
         * @description 负责人用户 ID
         */
        leaderUserId?: string,
        /**
         * @description 状态
         * @enum 0,1
         */
        status?: number
      },
      response: any
    },
    /**
     * 更新system:post
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
     */
    '/api/system/posts/:id': {
      query: never,
      params: {
        id: string
      },
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
         * @enum 0,1
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
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
     */
    '/api/system/dict/types/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: {
        /**
         * @description 字典名称
         */
        name?: string,
        /**
         * @description 是否允许未登录用户访问字典数据
         */
        isPublic?: boolean,
        /**
         * @description 排序
         */
        sort?: number,
        /**
         * @description 状态
         * @enum 0,1
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
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
     */
    '/api/system/configs/:id': {
      query: never,
      params: {
        id: string
      },
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
         * @enum 0,1,2,3
         */
        type?: number,
        /**
         * @description 配置分组
         */
        group?: string,
        /**
         * @description 排序
         */
        sort?: number,
        /**
         * @description 备注
         */
        remark?: string
      },
      response: any
    },
    /**
     * 更新system:notice
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
     */
    '/api/system/notices/:id': {
      query: never,
      params: {
        id: string
      },
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
         * @description 通知类型 1=通知 2=公告
         * @enum 1,2
         */
        type?: number
      },
      response: any
    },
    /**
     * 发布通知
     */
    '/api/system/notices/:id/publish': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 标记已读
     */
    '/api/system/notices/:id/read': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 更新system:tag
     * @description 租户作用域由服务端根据当前部署与认证会话确定；客户端不得提交 tenantId。跨租户资源按不存在处理。
     */
    '/api/system/tags/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: {
        /**
         * @description 标签名称
         */
        name?: string,
        /**
         * @description 标签标识
         */
        code?: string,
        /**
         * @description 排序
         */
        sort?: number,
        /**
         * @description 状态
         * @enum 0,1
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
      params: {
        id: string
      },
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
         * @description 标签颜色，推荐使用十六进制 CSS 颜色值
         */
        cssClass?: string,
        /**
         * @description 状态
         * @enum 0,1
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
     * 撤回通知
     */
    '/api/system/notices/:id/revoke': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 解锁用户
     */
    '/api/system/users/:id/unlock': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 设置用户黑名单
     */
    '/api/system/users/:id/blacklist': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: {
        /**
         * @description 是否加入黑名单
         */
        blacklisted: boolean
      },
      response: any
    },
    /**
     * 分配用户标签
     */
    '/api/system/users/:id/tags': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: {
        /**
         * @description 标签 ID 列表
         */
        tagIds: string[]
      },
      response: any
    },
    '/api/system/notification/messages/:id/read': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/system/notification/templates/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/i18n/locales/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/workflow/definitions/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/workflow/definitions/:id/graph': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/system/scheduler/jobs/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/system/scheduler/jobs/:id/start': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/system/scheduler/jobs/:id/stop': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/system/gen/tables/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/system/gen/columns/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/knowledge-bases/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 写入知识库文件
     */
    '/api/ai/knowledge-bases/:id/files/*': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: {
        /**
         * @description 文件内容
         */
        content: string
      },
      response: any
    },
    /**
     * 更新 Agent
     */
    '/api/ai/agents/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: {
        /**
         * @description Agent 名称
         */
        name?: string,
        /**
         * @description 描述
         */
        description?: string,
        /**
         * @description 新会话欢迎词，为空时使用默认文案
         */
        welcomeMessage?: string,
        /**
         * @description 可用模型 ID 列表（至少 1 个）
         */
        model?: string[],
        /**
         * @description 系统提示词
         */
        systemPrompt?: string,
        /**
         * @description 启用的工具名
         */
        tools?: string[],
        /**
         * @description 绑定的知识库 ID
         */
        knowledgeBaseIds?: string[],
        /**
         * @description 绑定的技能 ID
         */
        skillIds?: string[],
        /**
         * @description 绑定的 MCP 服务 ID
         */
        mcpServerIds?: string[],
        /**
         * @description 模型覆盖配置（能力 → 模型 ID 映射）
         */
        modelOverrides?: {},
        /**
         * @description 记忆配置
         */
        memoryConfig?: {},
        /**
         * @description 扩展配置（如 research.depth）
         */
        config?: {},
        /**
         * @description 最大迭代轮数
         */
        maxIterations?: number,
        /**
         * @description 每轮 Token 上限
         */
        maxTokensPerTurn?: number,
        /**
         * @description 是否公开
         */
        isPublic?: boolean
      },
      response: any
    },
    '/api/ai/providers/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/models/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 设置 AI 全局配置
     */
    '/api/ai/config/:key': {
      query: never,
      params: {
        key: string
      },
      headers: never,
      body: {
        /**
         * @description 配置值
         */
        value: string
      },
      response: any
    },
    '/api/ai/skills/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/skills/:id/file': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/mcp-servers/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/mcp-servers/:id/enabled': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 设置链路追踪开关
     */
    '/api/ai/trace/config': {
      query: never,
      params: never,
      headers: never,
      body: {
        /**
         * @description 是否开启链路追踪
         */
        enabled: boolean
      },
      response: any
    }
  }
}