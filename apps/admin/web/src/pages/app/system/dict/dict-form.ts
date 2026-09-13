export interface DictTypeUpdateBody {
  name?: string;
  sort?: number;
  status?: number;
  isPublic?: boolean;
  remark?: string;
}

/** 只提取更新接口允许的字段，保持后端 strict schema。 */
export function buildDictTypeUpdateBody(values: Record<string, unknown>): DictTypeUpdateBody {
  return {
    ...(typeof values.name === 'string' ? { name: values.name } : {}),
    ...(typeof values.sort === 'number' ? { sort: values.sort } : {}),
    ...(typeof values.status === 'number' ? { status: values.status } : {}),
    ...(typeof values.isPublic === 'boolean' ? { isPublic: values.isPublic } : {}),
    ...(typeof values.remark === 'string' ? { remark: values.remark } : {}),
  };
}
