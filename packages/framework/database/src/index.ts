/**
 * @ventostack/database — 数据库包统一入口
 *
 * 提供 VentoStack 框架的数据层基础设施，包括：
 * - 数据库核心：配置、创建、执行器与查询入口（createDatabase）
 * - 模型定义：列类型、模型工厂与类型推导（defineModel / column）
 * - 查询构建器：链式条件、排序、分组、聚合、批量插入等（createQueryBuilder）
 * - 迁移管理：版本化数据库结构变更（createMigrationRunner）
 * - 关联定义：一对一、一对多、多对多及 JOIN / 预加载 SQL 生成（defineRelation）
 * - 种子数据：初始化测试或演示数据（createSeedRunner）
 * - 事务管理：嵌套事务、Savepoint、隔离级别（createTransactionManager）
 * - 驱动适配器：多数据库方言抽象（createDriverAdapter）
 * - 读写分离：自动路由读/写 SQL，支持多数据源（createReadWriteSplit）
 * - 连接池：通用连接复用、空闲回收、等待队列与统计（createConnectionPool）
 * - Schema 差异：表/列的增删改检测与迁移 SQL 生成（SchemaDiff）
 *
 * 全部基于 Bun.sql / bun:sqlite 构建，强调标签模板字面量、编译期类型安全与无 class 设计。
 */

// 数据库核心：配置、创建、执行器与查询入口
export { createDatabase, createSqlExecutor } from "./database";
export type { Database, DatabaseConfig, QueryExecutor, SqlExecutor, SqlExecutorOptions } from "./database";

// 模型定义：列类型、模型工厂与类型推导
export { defineModel, column } from "./model";
export type {
  ModelDefinition,
  ColumnDef,
  ColumnOptions,
  ModelOptions,
  InferColumnType,
  InferRowType,
} from "./model";

// 查询构建器：链式条件、排序、分组、聚合、批量插入等
export { createQueryBuilder } from "./query-builder";
export type {
  QueryBuilder,
  WhereCondition,
  WhereOp,
  OrderByClause,
  HavingCondition,
  VersionClause,
} from "./query-builder";

// 迁移管理：版本化数据库结构变更
export { createMigrationRunner } from "./migration";
export type { Migration, MigrationRunner, MigrationStatus } from "./migration";

// 关联定义：一对一、一对多、多对多及 JOIN / 预加载 SQL 生成
export { defineRelation, buildJoinSQL, buildEagerLoadSQL } from "./relation";
export type { RelationDefinition, RelationType } from "./relation";

// 种子数据：初始化测试或演示数据
export { createSeedRunner } from "./seed";
export type { Seed, SeedRunner } from "./seed";

// 事务管理：嵌套事务、Savepoint、隔离级别
export { createTransactionManager } from "./transaction";
export type { TransactionManager, TransactionOptions } from "./transaction";

// 驱动适配器：多数据库方言抽象（占位符、引用、分页、UPSERT 等）
export { createDriverAdapter } from "./driver";
export type { DatabaseDriver, DriverConfig, DriverAdapter } from "./driver";

// 读写分离：自动路由读/写 SQL，支持多数据源
export { createReadWriteSplit } from "./read-write-split";
export type {
  ReadWriteSplitOptions,
  ReadWriteSplitExecutor,
  MultiDataSourceOptions,
  MultiDataSource,
} from "./read-write-split";

// 连接池：通用连接复用、空闲回收、等待队列与统计
export { createConnectionPool } from "./connection-pool";
export type { ConnectionPool, ConnectionPoolOptions, PoolStats } from "./connection-pool";

// Schema 差异：表/列的增删改检测与迁移 SQL 生成
export { diffSchemas, generateMigrationSQL } from "./schema-diff";
export type { SchemaDiff, TableDiff, ColumnSchema, TableSchema, ColumnDiff } from "./schema-diff";

// Schema Reader：数据库表结构读取
export { readTableSchema, listTables } from "./schema-reader";
export type { TableSchemaInfo, ColumnSchemaInfo, IndexSchemaInfo } from "./schema-reader";
