import { type ModelDefinition, column, defineModel } from "@ventostack/database";

export interface User extends Record<string, unknown> {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: string;
  created_at: string;
  updated_at: string;
}

export const userModel = defineModel(
  "users",
  {
    id: column.varchar({ primary: true, length: 36 }),
    name: column.varchar({ length: 255, nullable: false }),
    email: column.varchar({ length: 255, unique: true, nullable: false }),
    password_hash: column.varchar({ length: 255, nullable: false }),
    role: column.varchar({ length: 50, nullable: false, default: "viewer" }),
    created_at: column.timestamp({ nullable: false, default: "CURRENT_TIMESTAMP" }),
    updated_at: column.timestamp({ nullable: false, default: "CURRENT_TIMESTAMP" }),
  },
  { timestamps: false },
) as unknown as ModelDefinition<User>;
