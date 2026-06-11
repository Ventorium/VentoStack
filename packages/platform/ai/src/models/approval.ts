import { column, defineModel } from "@ventostack/database";

export const AiApprovalRequestModel = defineModel(
  "ai_approval_request",
  {
    id: column.varchar({ primary: true, length: 36 }),
    tool_name: column.varchar({ length: 128 }),
    input: column.json({ nullable: true }),
    requested_by: column.varchar({ length: 36 }),
    status: column.varchar({ length: 16, default: "pending" }),
    approved_by: column.varchar({ length: 36, nullable: true }),
    comment: column.text({ nullable: true }),
    expires_at: column.timestamp(),
    tenant_id: column.varchar({ length: 36 }),
  },
  { timestamps: true },
);
