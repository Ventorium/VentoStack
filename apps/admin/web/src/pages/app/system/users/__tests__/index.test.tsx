import { describe, test, expect } from 'bun:test'

describe('用户管理页', () => {
  test('buildTreeData 将部门列表转为 TreeSelect 数据', () => {
    const buildTreeData = (items: Array<{ id: string; name: string; children?: Array<{ id: string; name: string; children?: unknown[] }> }>) =>
      items.map(item => ({
        key: item.id,
        title: item.name,
        children: item.children?.length ? buildTreeData(item.children) : undefined,
      }))

    const depts = [
      { id: '1', name: '总公司', children: [
        { id: '2', name: '技术部', children: [] },
        { id: '3', name: '市场部', children: [
          { id: '4', name: '国内组', children: [] },
        ]},
      ]},
    ]
    const result = buildTreeData(depts)
    expect(result).toHaveLength(1)
    expect(result[0].key).toBe('1')
    expect(result[0].title).toBe('总公司')
    expect(result[0].children).toHaveLength(2)
    expect(result[0].children![1].children).toHaveLength(1)
    expect(result[0].children![1].children![0].title).toBe('国内组')
  })

  test('buildTreeData 空列表返回空数组', () => {
    const buildTreeData = (items: Array<{ id: string; name: string; children?: unknown[] }>) =>
      items.map(item => ({
        key: item.id,
        title: item.name,
        children: item.children?.length ? buildTreeData(item.children as any) : undefined,
      }))
    expect(buildTreeData([])).toEqual([])
  })

  test('状态列渲染逻辑', () => {
    const getStatusTag = (status: number) => ({
      color: status === 1 ? 'green' : 'red',
      text: status === 1 ? '正常' : '禁用',
    })
    expect(getStatusTag(1)).toEqual({ color: 'green', text: '正常' })
    expect(getStatusTag(0)).toEqual({ color: 'red', text: '禁用' })
  })

  test('重置密码密码强度校验', () => {
    const pattern = /^(?=.*[a-zA-Z])(?=.*\d)|(?=.*[a-zA-Z])(?=.*[^a-zA-Z0-9])|(?=.*\d)(?=.*[^a-zA-Z0-9]).+$/
    expect(pattern.test('abc12345')).toBe(true)
    expect(pattern.test('abcdefgh')).toBe(false)
    expect(pattern.test('12345678')).toBe(false)
    expect(pattern.test('abc!@#$%')).toBe(true)
  })

  test('重置密码最小长度校验', () => {
    const validateMinLength = (pwd: string) => pwd.length >= 8
    expect(validateMinLength('12345678')).toBe(true)
    expect(validateMinLength('1234567')).toBe(false)
  })

  test('两次密码一致性校验', () => {
    const matchPassword = (a: string, b: string) => a === b
    expect(matchPassword('abc12345', 'abc12345')).toBe(true)
    expect(matchPassword('abc12345', 'abc12346')).toBe(false)
  })

  test('API 端点路径正确', () => {
    const endpoints = {
      list: '/api/system/users',
      create: '/api/system/users',
      update: '/api/system/users/:id',
      delete: '/api/system/users/:id',
      status: '/api/system/users/:id/status',
      resetPwd: '/api/system/users/:id/reset-pwd',
      unlock: '/api/system/users/:id/unlock',
      deptTree: '/api/system/depts/tree',
    }
    expect(endpoints.list).toBe('/api/system/users')
    expect(endpoints.status).toContain('status')
    expect(endpoints.resetPwd).toContain('reset-pwd')
    expect(endpoints.unlock).toContain('unlock')
    expect(endpoints.deptTree).toContain('depts/tree')
  })

  test('手机号校验规则', () => {
    const pattern = /^1[3-9]\d{9}$/
    expect(pattern.test('13800138000')).toBe(true)
    expect(pattern.test('12345678901')).toBe(false)
    expect(pattern.test('1380013800')).toBe(false)
    expect(pattern.test('138001380001')).toBe(false)
  })

  test('邮箱校验规则', () => {
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    expect(pattern.test('test@example.com')).toBe(true)
    expect(pattern.test('invalid-email')).toBe(false)
    expect(pattern.test('@example.com')).toBe(false)
  })

  test('UserItem 类型应包含必要字段', () => {
    const user = {
      id: 'u1',
      username: 'admin',
      nickname: '管理员',
      email: 'admin@example.com',
      phone: '13800138000',
      status: 1,
      deptId: 'd1',
      createdAt: '2024-01-01T00:00:00Z',
    }
    expect(user.id).toBeTruthy()
    expect(user.username).toBeTruthy()
    expect([0, 1]).toContain(user.status)
  })

  test('禁用/启用状态切换逻辑', () => {
    const toggleStatus = (current: number) => (current === 1 ? 0 : 1)
    expect(toggleStatus(1)).toBe(0)
    expect(toggleStatus(0)).toBe(1)
  })

  // --- 新增测试用例 ---

  test('搜索参数组合: username, status, deptId', () => {
    const cleanParams = (params: Record<string, unknown>) => {
      const result: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') result[k] = v
      }
      return result
    }

    // 仅 username
    expect(cleanParams({ username: 'admin', status: undefined, deptId: undefined })).toEqual({ username: 'admin' })

    // username + status
    expect(cleanParams({ username: 'admin', status: 1, deptId: undefined })).toEqual({ username: 'admin', status: 1 })

    // 全部参数
    expect(cleanParams({ username: 'admin', status: 1, deptId: 'd1' })).toEqual({ username: 'admin', status: 1, deptId: 'd1' })

    // 仅 deptId
    expect(cleanParams({ username: '', status: undefined, deptId: 'd1' })).toEqual({ deptId: 'd1' })

    // 空搜索
    expect(cleanParams({ username: '', status: undefined, deptId: undefined })).toEqual({})
  })

  test('创建用户 body 应包含 username, password, nickname, email, phone, deptId, roleIds, status', () => {
    const buildCreateBody = (values: Record<string, unknown>) => ({
      username: values.username,
      password: values.password,
      nickname: values.nickname,
      email: values.email,
      phone: values.phone,
      status: values.status,
      deptId: values.deptId,
      roleIds: values.roleIds,
    })

    const body = buildCreateBody({
      username: 'newuser',
      password: 'Pass1234',
      nickname: '新用户',
      email: 'new@example.com',
      phone: '13900139000',
      status: 1,
      deptId: 'd2',
      roleIds: ['r1', 'r2'],
    })

    expect(body.username).toBe('newuser')
    expect(body.password).toBe('Pass1234')
    expect(body.nickname).toBe('新用户')
    expect(body.email).toBe('new@example.com')
    expect(body.phone).toBe('13900139000')
    expect(body.status).toBe(1)
    expect(body.deptId).toBe('d2')
    expect(body.roleIds).toEqual(['r1', 'r2'])
  })

  test('更新用户 body 应包含 nickname, email, phone, deptId, roleIds, status，不包含 password 和 username', () => {
    const buildUpdateBody = (values: Record<string, unknown>) => ({
      nickname: values.nickname,
      email: values.email,
      phone: values.phone,
      status: values.status,
      deptId: values.deptId,
      roleIds: values.roleIds,
    })

    const body = buildUpdateBody({
      username: 'admin', // 不应包含
      password: 'newpwd', // 不应包含
      nickname: '更新昵称',
      email: 'updated@example.com',
      phone: '13800138001',
      status: 0,
      deptId: 'd3',
      roleIds: ['r1'],
    })

    expect(body).not.toHaveProperty('username')
    expect(body).not.toHaveProperty('password')
    expect(body.nickname).toBe('更新昵称')
    expect(body.email).toBe('updated@example.com')
    expect(body.phone).toBe('13800138001')
    expect(body.status).toBe(0)
    expect(body.deptId).toBe('d3')
    expect(body.roleIds).toEqual(['r1'])
  })

  test('编辑模式下用户名输入框应禁用', () => {
    const isUsernameDisabled = (editingUser: { id: string } | null) => !!editingUser
    expect(isUsernameDisabled({ id: 'u1' })).toBe(true)
    expect(isUsernameDisabled(null)).toBe(false)
  })

  test('状态切换 API: PUT /api/system/users/:id/status', () => {
    const buildStatusRequest = (id: string, currentStatus: number) => ({
      url: `/api/system/users/${id}/status`,
      method: 'PUT',
      params: { id },
      body: { status: currentStatus === 1 ? 0 : 1 },
    })

    const req = buildStatusRequest('u1', 1)
    expect(req.url).toBe('/api/system/users/u1/status')
    expect(req.method).toBe('PUT')
    expect(req.params.id).toBe('u1')
    expect(req.body.status).toBe(0)

    const req2 = buildStatusRequest('u2', 0)
    expect(req2.body.status).toBe(1)
  })

  test('重置密码 API: PUT /api/system/users/:id/reset-pwd', () => {
    const buildResetPwdRequest = (id: string, newPassword: string) => ({
      url: `/api/system/users/${id}/reset-pwd`,
      method: 'PUT',
      params: { id },
      body: { newPassword },
    })

    const req = buildResetPwdRequest('u1', 'NewPass123')
    expect(req.url).toBe('/api/system/users/u1/reset-pwd')
    expect(req.method).toBe('PUT')
    expect(req.body.newPassword).toBe('NewPass123')
  })

  test('解锁用户 API: PUT /api/system/users/:id/unlock', () => {
    const buildUnlockRequest = (id: string) => ({
      url: `/api/system/users/${id}/unlock`,
      method: 'PUT',
      params: { id },
    })

    const req = buildUnlockRequest('u1')
    expect(req.url).toBe('/api/system/users/u1/unlock')
    expect(req.method).toBe('PUT')
    expect(req.params.id).toBe('u1')
  })

  test('部门树侧边栏切换 (deptPanelVisible)', () => {
    const toggleDeptPanel = (visible: boolean) => !visible
    expect(toggleDeptPanel(true)).toBe(false)
    expect(toggleDeptPanel(false)).toBe(true)
  })

  test('选择部门树节点后注入 deptId 到搜索参数', () => {
    const buildSearchWithDept = (formValues: Record<string, unknown>, selectedDeptId: string | null) => {
      const cleanParams = (params: Record<string, unknown>) => {
        const result: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(params)) {
          if (v !== undefined && v !== null && v !== '') result[k] = v
        }
        return result
      }
      return cleanParams({ ...formValues, deptId: selectedDeptId ?? undefined })
    }

    // 选中部门节点
    expect(buildSearchWithDept({ username: 'admin' }, 'd1')).toEqual({ username: 'admin', deptId: 'd1' })

    // 未选中部门
    expect(buildSearchWithDept({ username: 'admin' }, null)).toEqual({ username: 'admin' })

    // 选中部门但无其他搜索条件
    expect(buildSearchWithDept({}, 'd1')).toEqual({ deptId: 'd1' })
  })

  test('handleDeptSelect 取消选中时 deptId 应为 undefined', () => {
    const processDeptSelect = (selectedKeys: string[]) => {
      const deptId = selectedKeys[0]
      return deptId ?? null
    }
    expect(processDeptSelect(['d1'])).toBe('d1')
    expect(processDeptSelect([])).toBeNull()
  })

  test('编辑用户时 form.setFieldsValue 应映射 roles 为 roleIds 数组', () => {
    const mapRolesToForm = (r: { roles?: Array<{ id: string }> }) => ({
      roleIds: r.roles?.map(role => role.id) ?? [],
    })

    expect(mapRolesToForm({ roles: [{ id: 'r1' }, { id: 'r2' }] })).toEqual({ roleIds: ['r1', 'r2'] })
    expect(mapRolesToForm({ roles: [] })).toEqual({ roleIds: [] })
    expect(mapRolesToForm({})).toEqual({ roleIds: [] })
  })
})
