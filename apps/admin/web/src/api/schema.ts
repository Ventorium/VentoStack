export type OpenAPIComponents = {
  schemas: never,
  responses: never,
  // parameters: {},
  // headers: {},
  requestBodies: never
}
export type OpenAPIs = {
  get: {
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
           * @description 菜单类型
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
     * 获取字典数据
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
          type?: string,
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
     */
    '/api/system/tags': {
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
      query: never,
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
        uploaderId?: string
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
    '/api/ai/knowledge-bases/:id/files': {
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
        agentId?: string
      },
      params: never,
      headers: never,
      body: never,
      response: any
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
     * 获取 AI 工具审计日志
     */
    '/api/ai/audit': {
      query: {
        page?: number,
        pageSize?: number,
        toolName?: string,
        status?: string,
        userId?: string
      },
      params: never,
      headers: never,
      body: never,
      response: any
    },
    /**
     * 获取审批请求详情
     */
    '/api/ai/approvals/:id': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * 获取待审批列表
     */
    '/api/ai/approvals': {
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
         * @description 部门 ID 筛选，__none__ 表示无部门
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
        ids: any[]
      },
      response: any
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
        ids: any[]
      },
      response: any
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
        ids: any[]
      },
      response: any
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
        ids: any[]
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
        ids: any[]
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
        ids: any[]
      },
      response: any
    },
    /**
     * 创建system:tag
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
        ids: any[]
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
        ids: any[]
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
        ids: any[],
        /**
         * @description 目标状态 0=停用 1=正常
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
        ids: any[]
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
    '/api/ai/knowledge-bases': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/knowledge-bases/:id/rename': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
      response: any
    },
    '/api/ai/knowledge-bases/:id/mkdir': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: never,
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
         * @description 模型 ID
         */
        model: string,
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
        isPublic?: boolean
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
        knowledgeBaseIds?: string[]
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
        knowledgeBaseIds?: string[]
      },
      response: {
        description?: any
      }
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
        apiKey?: string
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
    },
    /**
     * 审批通过
     */
    '/api/ai/approvals/:id/approve': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: {
        /**
         * @description 审批备注
         */
        reason?: string
      },
      response: any
    },
    /**
     * 审批拒绝
     */
    '/api/ai/approvals/:id/reject': {
      query: never,
      params: {
        id: string
      },
      headers: never,
      body: {
        /**
         * @description 拒绝原因
         */
        reason?: string
      },
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
      params: {
        sessionId: string
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
     * 删除会话
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
      params: {
        id: string
      },
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
        deptIds?: any[]
      },
      response: any
    },
    /**
     * 更新system:menu
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
     * 更新system:config
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
        tagIds: any[]
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
         * @description 模型 ID
         */
        model?: string,
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
        isPublic?: boolean,
        /**
         * @description 状态
         */
        status?: string
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
    }
  }
}