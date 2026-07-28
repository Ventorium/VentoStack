# @ventostack/workflow

VentoStack 的通用审批工作流模块，提供流程定义、图校验、实例运行、任务处理和审批历史。

## 核心能力

- 流程定义、节点、连线、实例、任务和历史模型
- 流程图构建、条件计算、环检测和合法性校验
- 固定用户、角色、部门及表单字段审批人解析
- 串行、会签、或签和比例审批策略
- 审批、驳回、转交、加签、撤回和重新提交
- 流程推进、实例完成和历史记录
- 管理路由、迁移和平台模块装配

## 使用边界

流程配置和表单数据均视为不可信输入。业务系统需在启动流程和执行任务前校验资源权限、租户归属及可执行动作。

```ts
import { createWorkflowModule, type WorkflowModuleDeps } from "@ventostack/workflow";

declare const deps: WorkflowModuleDeps;
const workflow = createWorkflowModule(deps);
```
