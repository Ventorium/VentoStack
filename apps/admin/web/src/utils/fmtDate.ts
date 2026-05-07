import dayjs from 'dayjs'

/** 格式化日期字符串为 YYYY-MM-DD HH:mm:ss */
export const fmtDate = (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-'
