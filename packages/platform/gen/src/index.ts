/**
 * @ventostack/gen — 代码生成器
 *
 * 导入数据库表结构、管理字段配置、生成 Model / Service / Routes / Types / Test 代码。
 */

// Models
export { GenTableModel } from "./models/gen-table";
export { GenTableColumnModel } from "./models/gen-table-column";

// Services
export { createGenService } from "./services/gen";
export type {
  GenTableInfo,
  GenColumnInfo,
  GeneratedFile,
  PaginatedResult,
  GenService,
} from "./services/gen";

// Templates
export { renderModel } from "./templates/model.ts.tmpl";
export { renderService } from "./templates/service.ts.tmpl";
export { renderRoutes } from "./templates/routes.ts.tmpl";
export { renderTypes } from "./templates/types.ts.tmpl";
export { renderTest } from "./templates/test.ts.tmpl";

// Routes
export { createGenRoutes } from "./routes/gen";

// Module
export { createGenModule } from "./module";
export type { GenModule, GenModuleDeps } from "./module";

// Migrations
export { createGenTables } from "./migrations/001_create_gen_tables";
