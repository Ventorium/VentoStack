/**
 * @ventostack/system - 字典服务
 * 提供字典类型与字典数据的 CRUD，带缓存策略
 */

import type { Database } from "@ventostack/database";
import type { Cache } from "@ventostack/cache";
import { DictTypeModel, DictDataModel } from "../models/dict";

/** 分页查询结果 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 字典类型创建参数 */
export interface CreateDictTypeParams {
  name: string;
  code: string;
  remark?: string;
}

/** 字典类型更新参数 */
export interface UpdateDictTypeParams {
  name?: string;
  status?: number;
  remark?: string;
}

/** 字典类型列表项 */
export interface DictTypeItem {
  id: string;
  name: string;
  code: string;
  status: number;
  remark: string;
}

/** 字典数据创建参数 */
export interface CreateDictDataParams {
  typeCode: string;
  label: string;
  value: string;
  sort?: number;
  cssClass?: string;
}

/** 字典数据更新参数 */
export interface UpdateDictDataParams {
  label?: string;
  value?: string;
  sort?: number;
  cssClass?: string;
  status?: number;
  remark?: string;
}

/** 字典数据列表项 */
export interface DictDataItem {
  id: string;
  typeCode: string;
  label: string;
  value: string;
  sort: number;
  cssClass: string;
  status: number;
  remark: string;
}

/** 字典服务接口 */
export interface DictService {
  /** 创建字典类型 */
  createType(params: CreateDictTypeParams): Promise<{ id: string }>;
  /** 更新字典类型 */
  updateType(code: string, params: UpdateDictTypeParams): Promise<void>;
  /** 删除字典类型 */
  deleteType(code: string): Promise<void>;
  /** 分页查询字典类型 */
  listTypes(params?: { page?: number; pageSize?: number }): Promise<PaginatedResult<DictTypeItem>>;

  /** 创建字典数据 */
  createData(params: CreateDictDataParams): Promise<{ id: string }>;
  /** 更新字典数据 */
  updateData(id: string, params: UpdateDictDataParams): Promise<void>;
  /** 删除字典数据 */
  deleteData(id: string): Promise<void>;
  /** 按字典类型查询字典数据（带缓存） */
  listDataByType(typeCode: string): Promise<DictDataItem[]>;
  /** 刷新字典缓存 */
  refreshCache(typeCode?: string): Promise<void>;
}

/**
 * 创建字典服务实例
 * @param deps 依赖注入
 * @returns DictService 实例
 */
export function createDictService(deps: { db: Database; cache: Cache }): DictService {
  const { db, cache } = deps;

  function cacheKey(typeCode: string): string {
    return `dict:${typeCode}`;
  }

  // ===== 字典类型 =====

  async function createType(params: CreateDictTypeParams): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    await db.query(DictTypeModel).insert({
      id,
      name: params.name,
      code: params.code,
      status: 1,
      remark: params.remark ?? null,
    });
    return { id };
  }

  async function updateType(code: string, params: UpdateDictTypeParams): Promise<void> {
    const updates: Record<string, unknown> = {};
    if (params.name !== undefined) updates.name = params.name;
    if (params.status !== undefined) updates.status = params.status;
    if (params.remark !== undefined) updates.remark = params.remark;

    if (Object.keys(updates).length === 0) return;

    await db.query(DictTypeModel).where("code", "=", code).update(updates);

    // 类型变更后刷新对应字典数据缓存
    await refreshCache(code);
  }

  async function deleteType(code: string): Promise<void> {
    await db.query(DictDataModel).where("type_code", "=", code).hardDelete();
    await db.query(DictTypeModel).where("code", "=", code).hardDelete();
    await cache.del(cacheKey(code));
  }

  async function listTypes(params?: { page?: number; pageSize?: number }): Promise<PaginatedResult<DictTypeItem>> {
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 10;

    const total = await db.query(DictTypeModel).count();

    const rows = await db.query(DictTypeModel)
      .select("id", "name", "code", "status", "remark")
      .orderBy("id", "asc")
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .list();

    const items: DictTypeItem[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      status: row.status ?? 1,
      remark: row.remark ?? "",
    }));

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
    };
  }

  // ===== 字典数据 =====

  async function createData(params: CreateDictDataParams): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    await db.query(DictDataModel).insert({
      id,
      type_code: params.typeCode,
      label: params.label,
      value: params.value,
      sort: params.sort ?? 0,
      css_class: params.cssClass ?? null,
      status: 1,
      remark: null,
    });
    // 新增数据后使缓存失效
    await cache.del(cacheKey(params.typeCode));
    return { id };
  }

  async function updateData(id: string, params: UpdateDictDataParams): Promise<void> {
    // 先查出当前记录的 type_code 以便刷新缓存
    const existing = await db.query(DictDataModel)
      .where("id", "=", id)
      .select("type_code")
      .get();

    const updates: Record<string, unknown> = {};
    if (params.label !== undefined) updates.label = params.label;
    if (params.value !== undefined) updates.value = params.value;
    if (params.sort !== undefined) updates.sort = params.sort;
    if (params.cssClass !== undefined) updates.css_class = params.cssClass;
    if (params.status !== undefined) updates.status = params.status;
    if (params.remark !== undefined) updates.remark = params.remark;

    if (Object.keys(updates).length === 0) return;

    await db.query(DictDataModel).where("id", "=", id).update(updates);

    // 刷新关联的字典类型缓存
    if (existing?.type_code) {
      await cache.del(cacheKey(existing.type_code));
    }
  }

  async function deleteData(id: string): Promise<void> {
    // 先查出当前记录的 type_code 以便刷新缓存
    const existing = await db.query(DictDataModel)
      .where("id", "=", id)
      .select("type_code")
      .get();

    await db.query(DictDataModel).where("id", "=", id).hardDelete();

    if (existing?.type_code) {
      await cache.del(cacheKey(existing.type_code));
    }
  }

  async function queryDataByType(typeCode: string): Promise<DictDataItem[]> {
    const rows = await db.query(DictDataModel)
      .where("type_code", "=", typeCode)
      .where("status", "=", 1)
      .select("id", "type_code", "label", "value", "sort", "css_class", "status", "remark")
      .orderBy("sort", "asc")
      .orderBy("id", "asc")
      .list();

    return rows.map((row) => ({
      id: row.id,
      typeCode: row.type_code,
      label: row.label,
      value: row.value,
      sort: row.sort ?? 0,
      cssClass: row.css_class ?? "",
      status: row.status ?? 1,
      remark: row.remark ?? "",
    }));
  }

  async function listDataByType(typeCode: string): Promise<DictDataItem[]> {
    return cache.remember<DictDataItem[]>(cacheKey(typeCode), 3600, () =>
      queryDataByType(typeCode),
    );
  }

  async function refreshCache(typeCode?: string): Promise<void> {
    if (typeCode) {
      await cache.del(cacheKey(typeCode));
      // 预热缓存
      await queryDataByType(typeCode);
    } else {
      // 刷新所有 dict:* 缓存
      const adapter = (cache as unknown as { keys?: (pattern: string) => Promise<string[]> }).keys;
      if (adapter && typeof adapter === "function") {
        const allKeys = await adapter("dict:*");
        for (const key of allKeys) {
          await cache.del(key);
        }
      }
    }
  }

  return {
    createType,
    updateType,
    deleteType,
    listTypes,
    createData,
    updateData,
    deleteData,
    listDataByType,
    refreshCache,
  };
}
