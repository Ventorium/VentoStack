import { useState, useCallback } from 'react'
import type { PaginatedParams, PaginatedData } from '@/api/types'

interface UseTableOptions<P extends PaginatedParams> {
  defaultPageSize?: number
  defaultParams?: Partial<P>
}

interface UseTableReturn<T, P extends PaginatedParams> {
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
}

export function useTable<T, P extends PaginatedParams = PaginatedParams>(
  fetcher: (params: P) => Promise<{ error?: unknown; data?: PaginatedData<T> }>,
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

  const fetchData = useCallback(async (p: P) => {
    setLoading(true)
    try {
      const { error, data: result } = await fetcher(p)
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

  return {
    loading, data, total, page, pageSize, params,
    setParams, refresh, onSearch, onReset, onPageChange,
  }
}
