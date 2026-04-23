import type { InferParams } from "../router";

type Assert<T extends true> = T;
type IsEqual<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
  ? (<T>() => T extends B ? 1 : 2) extends (<T>() => T extends A ? 1 : 2)
    ? true
    : false
  : false;

type MultiParams = InferParams<"/orgs/:orgId/repos/:repoId">;
type TypedParams = InferParams<"/users/:id<int>/posts/:postId<string>">;
type RegexParams = InferParams<"/users/:userId<int>(\\d{2,4})/posts/:postId(^ey[a-zA-Z0-9]{8}==$)">;
type NoParams = InferParams<"/health">;

type _MultiOrgId = Assert<IsEqual<MultiParams["orgId"], string>>;
type _MultiRepoId = Assert<IsEqual<MultiParams["repoId"], string>>;
type _TypedId = Assert<IsEqual<TypedParams["id"], number>>;
type _TypedPostId = Assert<IsEqual<TypedParams["postId"], string>>;
type _RegexUserId = Assert<IsEqual<RegexParams["userId"], number>>;
type _RegexPostId = Assert<IsEqual<RegexParams["postId"], string>>;
type _NoParams = Assert<IsEqual<NoParams, Record<string, never>>>;

import type { InferFieldType, InferSchema } from "../schema-types";
import { createRouter, defineRouteConfig } from "../router";

// ---------- InferFieldType 测试 ----------

type TestString = InferFieldType<{ type: "string" }>;
type AssertString = TestString extends string | undefined ? true : false;
const _assertString: AssertString = true;

type TestRequiredString = InferFieldType<{ type: "string"; required: true }>;
type AssertRequiredString = TestRequiredString extends string ? true : false;
const _assertRequiredString: AssertRequiredString = true;

type TestDefaultInt = InferFieldType<{ type: "int"; default: 1 }>;
type AssertDefaultInt = TestDefaultInt extends number ? true : false;
const _assertDefaultInt: AssertDefaultInt = true;

type TestBool = InferFieldType<{ type: "bool" }>;
type AssertBool = TestBool extends boolean | undefined ? true : false;
const _assertBool: AssertBool = true;

type TestDate = InferFieldType<{ type: "date" }>;
type AssertDate = TestDate extends Date | undefined ? true : false;
const _assertDate: AssertDate = true;

type TestFile = InferFieldType<{ type: "file" }>;
type AssertFile = TestFile extends File | undefined ? true : false;
const _assertFile: AssertFile = true;

type TestArray = InferFieldType<{ type: "array"; items: { type: "int" } }>;
type AssertArray = TestArray extends number[] | undefined ? true : false;
const _assertArray: AssertArray = true;

type TestObject = InferFieldType<{ type: "object"; properties: { name: { type: "string" } } }>;
type AssertObject = TestObject extends { name: string | undefined } | undefined ? true : false;
const _assertObject: AssertObject = true;

// ---------- InferSchema 测试 ----------

type TestSchema = InferSchema<{
  page: { type: "int"; default: 1 };
  search: { type: "string" };
  active: { type: "bool"; required: true };
}>;

type AssertSchemaPage = TestSchema["page"] extends number ? true : false;
const _assertSchemaPage: AssertSchemaPage = true;

type AssertSchemaSearch = TestSchema["search"] extends string | undefined ? true : false;
const _assertSchemaSearch: AssertSchemaSearch = true;

type AssertSchemaActive = TestSchema["active"] extends boolean ? true : false;
const _assertSchemaActive: AssertSchemaActive = true;

// ---------- 路由注册类型推导测试 ----------

const router = createRouter();

// query schema 推导
router.get("/users", {
  query: {
    page: { type: "int", default: 1 },
    limit: { type: "int", default: 20 },
    search: { type: "string" },
  },
}, (ctx) => {
  const page: number = ctx.query.page;
  const limit: number = ctx.query.limit;
  const search: string | undefined = ctx.query.search;
  const bodyCheck: Record<string, unknown> = ctx.body;
  return new Response();
});

// body schema 推导
router.post("/users", {
  body: {
    name: { type: "string", required: true },
    age: { type: "int" },
  },
}, (ctx) => {
  const name: string = ctx.body.name;
  const age: number | undefined = ctx.body.age;
  return new Response();
});

// formData schema 推导
router.post("/upload", {
  formData: {
    title: { type: "string", required: true },
    count: { type: "int", default: 0 },
  },
}, (ctx) => {
  const title: string = ctx.formData.title;
  const count: number = ctx.formData.count;
  return new Response();
});

// 不传 schema 时兼容现有 API
router.get("/legacy", (ctx) => {
  const q: Record<string, string> = ctx.query;
  const b: Record<string, unknown> = ctx.body;
  const h: Headers = ctx.headers;
  return new Response();
});

// 混合 params + query + body
router.post("/users/:id<int>", {
  query: {
    force: { type: "bool" },
  },
  body: {
    name: { type: "string", required: true },
  },
}, (ctx) => {
  const id: number = ctx.params.id;
  const force: boolean | undefined = ctx.query.force;
  const name: string = ctx.body.name;
  return new Response();
});

// defineRouteConfig 保留 schema 推导
const hintedConfig = defineRouteConfig({
  query: {
    page: { type: "int", default: 1 },
  },
  responses: {
    200: {
      contentType: "text/plain",
      schema: { type: "string" },
    },
  },
});

router.get("/hinted", hintedConfig, (ctx) => {
  const page: number = ctx.query.page;
  return new Response(String(page));
});

export {};
