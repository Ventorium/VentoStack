import { type Schema, validateBody } from "@ventostack/core";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const loginSchema: Schema = {
  email: { type: "string", required: true, pattern: emailPattern, min: 5, max: 255 },
  password: { type: "string", required: true, min: 6, max: 128 },
};

export const createUserSchema: Schema = {
  name: { type: "string", required: true, min: 1, max: 255 },
  email: { type: "string", required: true, pattern: emailPattern, min: 5, max: 255 },
  password: { type: "string", required: true, min: 6, max: 128 },
  role: { type: "string", required: false, enum: ["admin", "editor", "viewer"] },
};

export const updateUserSchema: Schema = {
  name: { type: "string", required: false, min: 1, max: 255 },
  email: { type: "string", required: false, pattern: emailPattern, min: 5, max: 255 },
  password: { type: "string", required: false, min: 6, max: 128 },
  role: { type: "string", required: false, enum: ["admin", "editor", "viewer"] },
};

export const validateLogin = validateBody(loginSchema);
export const validateCreateUser = validateBody(createUserSchema);
export const validateUpdateUser = validateBody(updateUserSchema);
