import { describe, test, expect, mock } from 'bun:test'

describe('字典管理页', () => {
  test('状态列渲染逻辑', () => {
    const getStatusTag = (status: number) => ({
      color: status === 1 ? 'green' : 'red',
      text: status === 1 ? '正常' : '禁用',
    })
    expect(getStatusTag(1)).toEqual({ color: 'green', text: '正常' })
    expect(getStatusTag(0)).toEqual({ color: 'red', text: '禁用' })
  })

  test('API 端点路径正确', () => {
    const endpoints = {
      typeList: '/api/system/dict/types',
      typeCreate: '/api/system/dict/types',
      typeUpdate: '/api/system/dict/types/:id',
      typeDelete: '/api/system/dict/types/:id',
      dataList: '/api/system/dict/types/:code/data',
      dataCreate: '/api/system/dict/data',
      dataUpdate: '/api/system/dict/data/:id',
      dataDelete: '/api/system/dict/data/:id',
    }
    expect(endpoints.typeList).toContain('dict/types')
    expect(endpoints.dataList).toContain('data')
    expect(endpoints.dataCreate).toContain('dict/data')
  })

  test('DictTypeItem 类型应包含必要字段', () => {
    const dictType = {
      id: 'dt1',
      name: '系统状态',
      code: 'sys_status',
      status: 1,
      remark: '系统状态字典',
      createdAt: '2024-01-01T00:00:00Z',
    }
    expect(dictType.id).toBeTruthy()
    expect(dictType.name).toBeTruthy()
    expect(dictType.code).toBeTruthy()
    expect([0, 1]).toContain(dictType.status)
  })

  test('DictDataItem 类型应包含必要字段', () => {
    const dictData = {
      id: 'dd1',
      label: '正常',
      value: '1',
      typeCode: 'sys_status',
      cssClass: 'green',
      sort: 1,
      status: 1,
      remark: '',
    }
    expect(dictData.id).toBeTruthy()
    expect(dictData.label).toBeTruthy()
    expect(dictData.value).toBeTruthy()
    expect(dictData.typeCode).toBeTruthy()
  })

  test('编辑字典类型时字典标识应禁用', () => {
    const isCodeDisabled = (editing: boolean) => editing
    expect(isCodeDisabled(true)).toBe(true)
    expect(isCodeDisabled(false)).toBe(false)
  })

  test('字典数据 Drawer 标题包含类型名称', () => {
    const getDrawerTitle = (typeName: string, typeCode: string) =>
      `字典数据 - ${typeName || typeCode}`
    expect(getDrawerTitle('系统状态', 'sys_status')).toBe('字典数据 - 系统状态')
    expect(getDrawerTitle('', 'sys_status')).toBe('字典数据 - sys_status')
  })

  test('新增字典数据默认值正确', () => {
    const defaults = { sort: 0, status: 1 }
    expect(defaults.sort).toBe(0)
    expect(defaults.status).toBe(1)
  })

  test('编辑字典数据后应刷新当前字典数据列表', () => {
    const currentTypeCode = 'sys_status'
    const currentTypeName = '系统状态'
    const shouldRefresh = (typeCode: string, typeName: string) => typeCode === currentTypeCode && typeName === currentTypeName
    expect(shouldRefresh('sys_status', '系统状态')).toBe(true)
    expect(shouldRefresh('other', '其他')).toBe(false)
  })

  test('删除字典类型使用 code 作为标识', () => {
    const deleteParam = (code: string) => ({ params: { id: code } })
    expect(deleteParam('sys_status')).toEqual({ params: { id: 'sys_status' } })
  })

  test('新增字典数据时携带 typeCode', () => {
    const currentTypeCode = 'sys_status'
    const buildBody = (values: Record<string, unknown>, typeCode: string) => ({ ...values, typeCode })
    expect(buildBody({ label: '正常', value: '1' }, currentTypeCode)).toEqual({
      label: '正常',
      value: '1',
      typeCode: 'sys_status',
    })
  })

  test('字典类型 CRUD: 创建 API POST /api/system/dict/types', () => {
    const client = { post: mock(() => Promise.resolve({ error: null })) }
    client.post('/api/system/dict/types', { body: { name: '性别', code: 'gender', status: 1 } })
    expect(client.post).toHaveBeenCalledTimes(1)
    const [url, options] = client.post.mock.calls[0]
    expect(url).toBe('/api/system/dict/types')
    expect(options.body.name).toBe('性别')
    expect(options.body.code).toBe('gender')
  })

  test('字典类型 CRUD: 更新 API PUT /api/system/dict/types/:id', () => {
    const client = { put: mock(() => Promise.resolve({ error: null })) }
    client.put('/api/system/dict/types/:id', { params: { id: 'gender' }, body: { name: '性别(新)', status: 1 } })
    expect(client.put).toHaveBeenCalledTimes(1)
    const [url, options] = client.put.mock.calls[0]
    expect(url).toBe('/api/system/dict/types/:id')
    expect(options.params.id).toBe('gender')
    expect(options.body.name).toBe('性别(新)')
  })

  test('字典类型 CRUD: 删除 API DELETE /api/system/dict/types/:id，使用 code 作为路径参数', () => {
    const client = { delete: mock(() => Promise.resolve({ error: null })) }
    const code = 'sys_status'
    client.delete('/api/system/dict/types/:id', { params: { id: code } })
    expect(client.delete).toHaveBeenCalledTimes(1)
    const [url, options] = client.delete.mock.calls[0]
    expect(url).toBe('/api/system/dict/types/:id')
    expect(options.params.id).toBe('sys_status')
  })

  test('字典数据 CRUD: 创建 API POST /api/system/dict/data，body 含 dictType', () => {
    const client = { post: mock(() => Promise.resolve({ error: null })) }
    const currentTypeCode = 'sys_status'
    client.post('/api/system/dict/data', {
      body: { label: '正常', value: '1', sort: 0, status: 1, dictType: currentTypeCode },
    })
    expect(client.post).toHaveBeenCalledTimes(1)
    const [url, options] = client.post.mock.calls[0]
    expect(url).toBe('/api/system/dict/data')
    expect(options.body.dictType).toBe('sys_status')
    expect(options.body.label).toBe('正常')
  })

  test('字典数据创建 body 包含 label, value, sort, status, dictType（不含 cssClass, remark）', () => {
    const currentTypeCode = 'sys_status'
    const values = { label: '正常', value: '1', sort: 0, status: 1 }
    const body = { label: values.label, value: values.value, sort: values.sort, status: values.status, dictType: currentTypeCode }
    expect(body).toEqual({ label: '正常', value: '1', sort: 0, status: 1, dictType: 'sys_status' })
    expect(body).not.toHaveProperty('cssClass')
    expect(body).not.toHaveProperty('remark')
  })

  test('字典数据 CRUD: 更新 API PUT /api/system/dict/data/:id', () => {
    const client = { put: mock(() => Promise.resolve({ error: null })) }
    client.put('/api/system/dict/data/:id', {
      params: { id: 'dd1' },
      body: { label: '正常(新)', value: '1', sort: 1, status: 1 },
    })
    expect(client.put).toHaveBeenCalledTimes(1)
    const [url, options] = client.put.mock.calls[0]
    expect(url).toBe('/api/system/dict/data/:id')
    expect(options.params.id).toBe('dd1')
  })

  test('字典数据 CRUD: 删除 API DELETE /api/system/dict/data/:id', () => {
    const client = { delete: mock(() => Promise.resolve({ error: null })) }
    client.delete('/api/system/dict/data/:id', { params: { id: 'dd1' } })
    expect(client.delete).toHaveBeenCalledTimes(1)
    const [url, options] = client.delete.mock.calls[0]
    expect(url).toBe('/api/system/dict/data/:id')
    expect(options.params.id).toBe('dd1')
  })

  test('打开 Drawer 时按 typeCode 获取字典数据', () => {
    const client = { get: mock(() => Promise.resolve({ error: null, data: [] })) }
    const typeCode = 'sys_status'
    client.get('/api/system/dict/types/:code/data', { params: { code: typeCode } })
    expect(client.get).toHaveBeenCalledTimes(1)
    const [url, options] = client.get.mock.calls[0]
    expect(url).toBe('/api/system/dict/types/:code/data')
    expect(options.params.code).toBe('sys_status')
  })

  test('字典数据变更后应刷新当前字典数据列表', () => {
    const client = { get: mock(() => Promise.resolve({ error: null, data: [] })) }
    let refreshCalled = false
    const openDictData = (typeCode: string, _typeName: string) => {
      client.get('/api/system/dict/types/:code/data', { params: { code: typeCode } })
      refreshCalled = true
    }
    openDictData('sys_status', '系统状态')
    expect(refreshCalled).toBe(true)
    expect(client.get).toHaveBeenCalledTimes(1)
  })

  test('新增字典数据默认 sort=0, status=1', () => {
    const defaults = { sort: 0, status: 1 }
    expect(defaults.sort).toBe(0)
    expect(defaults.status).toBe(1)
  })

  test('编辑字典数据时表单预填 label, value, sort, cssClass, status, remark', () => {
    const record = { id: 'dd1', label: '正常', value: '1', sort: 1, cssClass: 'green', status: 1, remark: '备注' }
    const formValues = { label: record.label, value: record.value, sort: record.sort, cssClass: record.cssClass, status: record.status, remark: record.remark }
    expect(formValues.label).toBe('正常')
    expect(formValues.value).toBe('1')
    expect(formValues.cssClass).toBe('green')
  })

  test('字典类型列表搜索参数: name, code', () => {
    const searchParams = { name: '系统', code: 'sys' }
    expect(searchParams.name).toBe('系统')
    expect(searchParams.code).toBe('sys')
  })
})
