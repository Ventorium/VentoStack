import { defineFactory, oneOf, sequence } from "@ventostack/testing";
import type { User } from "../../src/models";

export const userFactory = defineFactory<User>({
  fields: {
    id: () => crypto.randomUUID(),
    name: () => `User ${sequence("user")()}`,
    email: sequence("email"),
    password_hash: () => "$2b$10$hashedpasswordplaceholderforfactorydata", // bcrypt hash placeholder
    role: oneOf("admin", "editor", "viewer"),
    created_at: () => new Date().toISOString(),
    updated_at: () => new Date().toISOString(),
  },
});
