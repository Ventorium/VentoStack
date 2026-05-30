import { NotFoundError } from "@ventostack/core";
import type { Database } from "@ventostack/database";
import { type User, userModel } from "../models";

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role?: string;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  password?: string;
  role?: string;
}

export interface UserServiceDeps {
  db: Database;
}

export function createUserService(deps: UserServiceDeps) {
  const { db } = deps;

  async function listUsers(): Promise<User[]> {
    return (await db.query<User>(userModel).list()) as User[];
  }

  async function getUserById(id: string): Promise<User> {
    const user = await db.query<User>(userModel).where("id", "=", id).get();
    if (!user) {
      throw new NotFoundError(`User not found: ${id}`);
    }
    return user as User;
  }

  async function getUserByEmail(email: string): Promise<User | undefined> {
    return (await db.query<User>(userModel).where("email", "=", email).get()) as User | undefined;
  }

  async function createUser(input: CreateUserInput): Promise<User> {
    const id = crypto.randomUUID();
    const password_hash = await Bun.password.hash(input.password, {
      algorithm: "bcrypt",
    });

    const user = await db.query<User>(userModel).insert(
      {
        id,
        name: input.name,
        email: input.email,
        password_hash,
        role: input.role ?? "viewer",
      },
      { returning: true },
    );

    if (!user) {
      throw new Error("Failed to create user");
    }
    return user as User;
  }

  async function updateUser(id: string, input: UpdateUserInput): Promise<User> {
    const existing = await getUserById(id);

    const data: Partial<User> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.email !== undefined) data.email = input.email;
    if (input.role !== undefined) data.role = input.role;
    if (input.password !== undefined) {
      data.password_hash = await Bun.password.hash(input.password, {
        algorithm: "bcrypt",
      });
    }

    const updated = await db
      .query<User>(userModel)
      .where("id", "=", id)
      .update(data, { returning: true });

    if (!updated) {
      throw new Error("Failed to update user");
    }
    return updated as User;
  }

  async function deleteUser(id: string): Promise<void> {
    await getUserById(id);
    await db.query<User>(userModel).where("id", "=", id).delete();
  }

  return {
    listUsers,
    getUserById,
    getUserByEmail,
    createUser,
    updateUser,
    deleteUser,
  };
}
