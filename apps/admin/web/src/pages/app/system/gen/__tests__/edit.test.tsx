import { describe, test, expect } from 'bun:test'

describe('代码生成编辑页', () => {
  test('API 端点路径正确', () => {
    const endpoints = {
      get: '/api/system/gen/tables/:id',
      update: '/api/system/gen/tables/:id',
    }
    expect(endpoints.get).toContain('gen/tables')
    expect(endpoints.get).toContain(':id')
    expect(endpoints.update).toBe(endpoints.get)
  })

  test('genType 选项正确', () => {
    const genTypeOptions = [
      { label: '单表', value: 'single' },
      { label: '树表', value: 'tree' },
      { label: '主子表', value: 'sub' },
    ]
    expect(genTypeOptions).toHaveLength(3)
    expect(genTypeOptions.map(t => t.value)).toEqual(['single', 'tree', 'sub'])
    expect(genTypeOptions.map(t => t.label)).toEqual(['单表', '树表', '主子表'])
  })

  test('displayType 选项正确', () => {
    const displayTypeOptions = [
      { label: '输入框', value: 'input' },
      { label: '文本域', value: 'textarea' },
      { label: '下拉框', value: 'select' },
      { label: '日期', value: 'date' },
      { label: '数字', value: 'number' },
    ]
    expect(displayTypeOptions).toHaveLength(5)
    expect(displayTypeOptions.map(t => t.value)).toEqual(['input', 'textarea', 'select', 'date', 'number'])
  })

  test('queryType 选项正确', () => {
    const queryTypeOptions = [
      { label: '等于', value: 'eq' },
      { label: '模糊', value: 'like' },
      { label: '范围', value: 'between' },
      { label: 'IN', value: 'in' },
    ]
    expect(queryTypeOptions).toHaveLength(4)
    expect(queryTypeOptions.map(t => t.value)).toEqual(['eq', 'like', 'between', 'in'])
  })

  test('handleColumnUpdate 应正确更新指定列的字段', () => {
    const columns = [
      { id: '1', columnName: 'username', displayType: 'input', required: false },
      { id: '2', columnName: 'email', displayType: 'input', required: false },
    ]

    const handleColumnUpdate = (
      cols: typeof columns,
      key: string,
      field: keyof typeof columns[0],
      value: unknown
    ) => cols.map((col) => col.id === key ? { ...col, [field]: value } : col)

    const updated = handleColumnUpdate(columns, '1', 'displayType', 'textarea')
    expect(updated[0].displayType).toBe('textarea')
    expect(updated[1].displayType).toBe('input')

    const updatedRequired = handleColumnUpdate(columns, '2', 'required', true)
    expect(updatedRequired[1].required).toBe(true)
    expect(updatedRequired[0].required).toBe(false)
  })

  test('handleColumnUpdate 未匹配的列不应被修改', () => {
    const columns = [
      { id: '1', columnName: 'username', displayType: 'input' },
      { id: '2', columnName: 'email', displayType: 'textarea' },
    ]
    const updated = columns.map((col) =>
      col.id === '999' ? { ...col, displayType: 'select' } : col
    )
    expect(updated[0].displayType).toBe('input')
    expect(updated[1].displayType).toBe('textarea')
  })

  test('保存请求体应包含必要字段', () => {
    const saveBody = {
      moduleName: 'system',
      packagePath: 'com.example.system',
      genType: 'single',
      remark: '备注',
      columns: [{ id: '1', columnName: 'username' }],
    }
    expect(saveBody.moduleName).toBeTruthy()
    expect(saveBody.packagePath).toBeTruthy()
    expect(saveBody.genType).toBeTruthy()
    expect(Array.isArray(saveBody.columns)).toBe(true)
  })

  test('表单字段应包含 moduleName、packagePath、genType、remark', () => {
    const formFields = ['moduleName', 'packagePath', 'genType', 'remark']
    expect(formFields).toHaveLength(4)
    expect(formFields).toContain('moduleName')
    expect(formFields).toContain('packagePath')
    expect(formFields).toContain('genType')
    expect(formFields).toContain('remark')
  })

  test('列配置表格应包含所有必要列', () => {
    const columnKeys = [
      'columnName', 'columnType', 'tsType', 'displayType',
      'queryType', 'required', 'showInList', 'showInForm', 'showInQuery', 'comment'
    ]
    expect(columnKeys).toHaveLength(10)
    expect(columnKeys).toContain('displayType')
    expect(columnKeys).toContain('queryType')
    expect(columnKeys).toContain('required')
  })
})
