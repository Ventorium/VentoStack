import { useState, useCallback, useEffect } from 'react'
import type { TableRowSelection } from 'antd/es/table'

export interface PaginatedData<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
  totalPages?: number
}

export interface PaginatedParams {
  page?: number
  pageSize?: number
  [key: string]: unknown
}

export interface UseTableOptions<P extends PaginatedParams> {
  defaultPageSize?: number
  defaultParams?: Partial<P>
}

export interface UseTableReturn<T, P extends PaginatedParams> {
  loading: boolean
  data: T[]
  total: number
  page: number
  pageSize: number
  params: P
  setParams: (p: Partial<P>) => void
  refresh: () => Promise<void>
  onSearch: (p: Partial<P>) => void
  onReset: () => void
  onPageChange: (page: number, pageSize: number) => void
  selectedRowKeys: React.Key[]
  selectedRows: T[]
  rowSelection: TableRowSelection<T>
  clearSelection: () => void
  hasSelected: boolean
}

export function useTable<T, P extends PaginatedParams = PaginatedParams>(
  fetcher: (params: P) => Promise<any>,
  options?: UseTableOptions<P>,
): UseTableReturn<T, P> {
  const defaultPageSize = options?.defaultPageSize ?? 10
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(defaultPageSize)
  const [params, setParamsState] = useState<P>({
    page: 1,
    pageSize: defaultPageSize,
    ...options?.defaultParams,
  } as P)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [selectedRows, setSelectedRows] = useState<T[]>([])

  const fetchData = useCallback(async (p: P) => {
    setLoading(true)
    try {
      const { error, data: result } = await fetcher(p) as { error?: unknown; data?: PaginatedData<T> }
      if (!error && result) {
        setData(result.list)
        setTotal(result.total)
        setPage(result.page)
        setPageSize(result.pageSize)
      }
    } finally {
      setLoading(false)
    }
  }, [fetcher])

  const refresh = useCallback(async () => {
    await fetchData(params)
  }, [fetchData, params])

  const onSearch = useCallback((p: Partial<P>) => {
    const newParams = { ...params, ...p, page: 1 as P[keyof P] & 1 }
    setParamsState(newParams)
    fetchData(newParams)
  }, [params, fetchData])

  const onReset = useCallback(() => {
    const newParams = { page: 1, pageSize: defaultPageSize, ...options?.defaultParams } as P
    setParamsState(newParams)
    fetchData(newParams)
  }, [defaultPageSize, options?.defaultParams, fetchData])

  const onPageChange = useCallback((p: number, ps: number) => {
    const newParams = { ...params, page: p, pageSize: ps } as P
    setParamsState(newParams)
    fetchData(newParams)
  }, [params, fetchData])

  const setParams = useCallback((p: Partial<P>) => {
    const newParams = { ...params, ...p } as P
    setParamsState(newParams)
  }, [params])

  const onSelectChange = useCallback((keys: React.Key[], rows: T[]) => {
    setSelectedRowKeys(keys)
    setSelectedRows(rows)
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedRowKeys([])
    setSelectedRows([])
  }, [])

  const rowSelection: TableRowSelection<T> = {
    selectedRowKeys,
    onChange: onSelectChange as any,
  }

  // 初始加载
  useEffect(() => {
    fetchData(params)
  }, [])

  return {
    loading, data, total, page, pageSize, params,
    setParams, refresh, onSearch, onReset, onPageChange,
    selectedRowKeys, selectedRows, rowSelection, clearSelection, hasSelected: selectedRowKeys.length > 0,
  }
}
