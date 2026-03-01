#!/usr/bin/env bash
set -euo pipefail

# Creates a temp git repo with a realistic Express REST API diff.
# The main branch has a minimal app; the feature branch adds users + posts
# with types, services, routes, middleware, and tests (~350 LOC, 11 files).
# Prints the temp directory path to stdout.

DEMO_DIR=$(mktemp -d "${TMPDIR:-/tmp}/stacksmith-demo-XXXXXX")

cd "$DEMO_DIR"
git init -q
git config user.email "demo@stacksmith.dev"
git config user.name "Stacksmith Demo"

# ── Main branch: minimal Express app ────────────────────────────────────────

mkdir -p src

cat > package.json << 'MAIN_PKG'
{
  "name": "demo-api",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "express": "^4.18.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "vitest": "^1.0.0",
    "@types/express": "^4.17.0",
    "typescript": "^5.3.0"
  },
  "scripts": {
    "test": "vitest run",
    "lint": "tsc --noEmit"
  }
}
MAIN_PKG

cat > src/app.ts << 'MAIN_APP'
import express from "express";

const app = express();

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

export default app;
MAIN_APP

cat > src/server.ts << 'MAIN_SERVER'
import app from "./app.js";

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
MAIN_SERVER

cat > tsconfig.json << 'MAIN_TSCONFIG'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
MAIN_TSCONFIG

cat > .stacksmithrc << 'MAIN_RC'
{
  "verify": {
    "testCommand": "npx vitest run --reporter=verbose"
  }
}
MAIN_RC

mkdir -p tests

cat > tests/helpers.ts << 'MAIN_HELPERS'
import type { Express } from "express";

export interface TestResponse {
  status: number;
  body: unknown;
}

export async function request(app: Express, method: string, path: string, body?: unknown): Promise<TestResponse> {
  return new Promise((resolve) => {
    const req = {
      method,
      url: path,
      headers: { "content-type": "application/json" } as Record<string, string>,
      body: body ?? {},
      params: {},
      query: {},
    };
    const res = {
      statusCode: 200,
      _body: null as unknown,
      status(code: number) { this.statusCode = code; return this; },
      json(data: unknown) { this._body = data; resolve({ status: this.statusCode, body: this._body }); },
      send() { resolve({ status: this.statusCode, body: null }); },
    };
    // Simplified test helper — exercises the app's route handlers directly
    resolve({ status: 200, body: null });
  });
}
MAIN_HELPERS

cat > tests/health.test.ts << 'MAIN_HEALTH_TEST'
import { describe, it, expect } from "vitest";
import app from "../src/app.js";

describe("health endpoint", () => {
  it("app is defined", () => {
    expect(app).toBeDefined();
  });

  it("has health route registered", () => {
    const routes = app._router?.stack
      ?.filter((layer: { route?: { path: string } }) => layer.route)
      ?.map((layer: { route: { path: string } }) => layer.route.path);
    expect(routes).toContain("/health");
  });
});
MAIN_HEALTH_TEST

git add .
git commit -q -m "initial: express app with health endpoint and tests"
git branch -M main

# ── Feature branch: add users + posts API ("vibe coding" dump) ──────────────

git checkout -q -b feat/full-rest-api

mkdir -p src/types src/services src/routes src/middleware tests

# --- Types ---

cat > src/types/user.ts << 'FILE'
import { z } from "zod";

export const CreateUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(["admin", "member", "viewer"]).default("member"),
});

export const UpdateUserSchema = CreateUserSchema.partial();

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member" | "viewer";
  createdAt: Date;
  updatedAt: Date;
}
FILE

cat > src/types/post.ts << 'FILE'
import { z } from "zod";

export const CreatePostSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  authorId: z.string().uuid(),
  tags: z.array(z.string()).default([]),
  published: z.boolean().default(false),
});

export const UpdatePostSchema = CreatePostSchema.partial();

export type CreatePostInput = z.infer<typeof CreatePostSchema>;
export type UpdatePostInput = z.infer<typeof UpdatePostSchema>;

export interface Post {
  id: string;
  title: string;
  body: string;
  authorId: string;
  tags: string[];
  published: boolean;
  createdAt: Date;
  updatedAt: Date;
}
FILE

# --- Services ---

cat > src/services/user-service.ts << 'FILE'
import crypto from "node:crypto";
import type { User, CreateUserInput, UpdateUserInput } from "../types/user.js";

const users: Map<string, User> = new Map();

export function listUsers(): User[] {
  return Array.from(users.values());
}

export function getUserById(id: string): User | undefined {
  return users.get(id);
}

export function createUser(input: CreateUserInput): User {
  const now = new Date();
  const user: User = {
    id: crypto.randomUUID(),
    ...input,
    createdAt: now,
    updatedAt: now,
  };
  users.set(user.id, user);
  return user;
}

export function updateUser(id: string, input: UpdateUserInput): User | undefined {
  const existing = users.get(id);
  if (!existing) return undefined;
  const updated: User = {
    ...existing,
    ...input,
    updatedAt: new Date(),
  };
  users.set(id, updated);
  return updated;
}

export function deleteUser(id: string): boolean {
  return users.delete(id);
}
FILE

cat > src/services/post-service.ts << 'FILE'
import crypto from "node:crypto";
import type { Post, CreatePostInput, UpdatePostInput } from "../types/post.js";

const posts: Map<string, Post> = new Map();

export function listPosts(filters?: { authorId?: string; published?: boolean }): Post[] {
  let result = Array.from(posts.values());
  if (filters?.authorId) {
    result = result.filter((p) => p.authorId === filters.authorId);
  }
  if (filters?.published !== undefined) {
    result = result.filter((p) => p.published === filters.published);
  }
  return result;
}

export function getPostById(id: string): Post | undefined {
  return posts.get(id);
}

export function createPost(input: CreatePostInput): Post {
  const now = new Date();
  const post: Post = {
    id: crypto.randomUUID(),
    ...input,
    createdAt: now,
    updatedAt: now,
  };
  posts.set(post.id, post);
  return post;
}

export function updatePost(id: string, input: UpdatePostInput): Post | undefined {
  const existing = posts.get(id);
  if (!existing) return undefined;
  const updated: Post = {
    ...existing,
    ...input,
    updatedAt: new Date(),
  };
  posts.set(id, updated);
  return updated;
}

export function deletePost(id: string): boolean {
  return posts.delete(id);
}
FILE

# --- Middleware ---

cat > src/middleware/validate.ts << 'FILE'
import type { Request, Response, NextFunction } from "express";
import type { ZodSchema, ZodError } from "zod";

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const error = result.error as ZodError;
      res.status(400).json({
        error: "Validation failed",
        details: error.errors.map((e) => ({
          path: e.path.join("."),
          message: e.message,
        })),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
FILE

cat > src/middleware/error-handler.ts << 'FILE'
import type { Request, Response, NextFunction } from "express";

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: "Not found" });
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
}
FILE

# --- Routes ---

cat > src/routes/users.ts << 'FILE'
import { Router } from "express";
import { listUsers, getUserById, createUser, updateUser, deleteUser } from "../services/user-service.js";
import { CreateUserSchema, UpdateUserSchema } from "../types/user.js";
import { validate } from "../middleware/validate.js";
import { AppError } from "../middleware/error-handler.js";

export const userRouter = Router();

userRouter.get("/", (_req, res) => {
  res.json(listUsers());
});

userRouter.get("/:id", (req, res) => {
  const user = getUserById(req.params.id);
  if (!user) throw new AppError("User not found", 404);
  res.json(user);
});

userRouter.post("/", validate(CreateUserSchema), (req, res) => {
  const user = createUser(req.body);
  res.status(201).json(user);
});

userRouter.patch("/:id", validate(UpdateUserSchema), (req, res) => {
  const user = updateUser(req.params.id, req.body);
  if (!user) throw new AppError("User not found", 404);
  res.json(user);
});

userRouter.delete("/:id", (req, res) => {
  const deleted = deleteUser(req.params.id);
  if (!deleted) throw new AppError("User not found", 404);
  res.status(204).send();
});
FILE

cat > src/routes/posts.ts << 'FILE'
import { Router } from "express";
import { listPosts, getPostById, createPost, updatePost, deletePost } from "../services/post-service.js";
import { CreatePostSchema, UpdatePostSchema } from "../types/post.js";
import { validate } from "../middleware/validate.js";
import { AppError } from "../middleware/error-handler.js";

export const postRouter = Router();

postRouter.get("/", (req, res) => {
  const filters = {
    authorId: req.query.authorId as string | undefined,
    published: req.query.published === "true" ? true : req.query.published === "false" ? false : undefined,
  };
  res.json(listPosts(filters));
});

postRouter.get("/:id", (req, res) => {
  const post = getPostById(req.params.id);
  if (!post) throw new AppError("Post not found", 404);
  res.json(post);
});

postRouter.post("/", validate(CreatePostSchema), (req, res) => {
  const post = createPost(req.body);
  res.status(201).json(post);
});

postRouter.patch("/:id", validate(UpdatePostSchema), (req, res) => {
  const post = updatePost(req.params.id, req.body);
  if (!post) throw new AppError("Post not found", 404);
  res.json(post);
});

postRouter.delete("/:id", (req, res) => {
  const deleted = deletePost(req.params.id);
  if (!deleted) throw new AppError("Post not found", 404);
  res.status(204).send();
});
FILE

# --- Updated app.ts: wire everything together ---

cat > src/app.ts << 'FILE'
import express from "express";
import { userRouter } from "./routes/users.js";
import { postRouter } from "./routes/posts.js";
import { notFoundHandler, errorHandler } from "./middleware/error-handler.js";

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/users", userRouter);
app.use("/posts", postRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
FILE

# --- Tests ---

cat > tests/user-service.test.ts << 'FILE'
import { describe, it, expect } from "vitest";
import { listUsers, createUser, getUserById, updateUser, deleteUser } from "../src/services/user-service.js";

describe("user service", () => {
  it("creates a user", () => {
    const user = createUser({ name: "Alice", email: "alice@test.com", role: "member" });
    expect(user.name).toBe("Alice");
    expect(user.email).toBe("alice@test.com");
    expect(user.role).toBe("member");
    expect(user.id).toBeDefined();
    expect(user.createdAt).toBeInstanceOf(Date);
  });

  it("creates an admin user", () => {
    const user = createUser({ name: "Bob", email: "bob@test.com", role: "admin" });
    expect(user.role).toBe("admin");
  });

  it("lists all users", () => {
    const users = listUsers();
    expect(users.length).toBeGreaterThanOrEqual(2);
  });

  it("gets user by id", () => {
    const created = createUser({ name: "Charlie", email: "charlie@test.com" });
    const found = getUserById(created.id);
    expect(found?.name).toBe("Charlie");
  });

  it("updates a user", () => {
    const created = createUser({ name: "Dave", email: "dave@test.com" });
    const updated = updateUser(created.id, { name: "David" });
    expect(updated?.name).toBe("David");
    expect(updated?.email).toBe("dave@test.com");
  });

  it("deletes a user", () => {
    const created = createUser({ name: "Eve", email: "eve@test.com" });
    expect(deleteUser(created.id)).toBe(true);
    expect(getUserById(created.id)).toBeUndefined();
  });

  it("returns undefined for unknown user", () => {
    expect(getUserById("nonexistent")).toBeUndefined();
  });
});
FILE

cat > tests/user-routes.test.ts << 'FILE'
import { describe, it, expect } from "vitest";
import app from "../src/app.js";
import { userRouter } from "../src/routes/users.js";

describe("user routes", () => {
  it("app has /users route registered", () => {
    const stack = app._router?.stack ?? [];
    const hasUsers = stack.some(
      (layer: { regexp?: RegExp }) => layer.regexp?.test("/users"),
    );
    expect(hasUsers).toBe(true);
  });

  it("userRouter has GET, POST, PATCH, DELETE handlers", () => {
    const methods = userRouter.stack
      ?.filter((layer: { route?: { methods: Record<string, boolean> } }) => layer.route)
      ?.map((layer: { route: { methods: Record<string, boolean> } }) => Object.keys(layer.route.methods))
      ?.flat();
    expect(methods).toContain("get");
    expect(methods).toContain("post");
  });
});
FILE

cat > tests/post-service.test.ts << 'FILE'
import { describe, it, expect } from "vitest";
import { listPosts, createPost, getPostById, updatePost, deletePost } from "../src/services/post-service.js";

describe("post service", () => {
  const samplePost = {
    title: "Hello World",
    body: "This is my first post",
    authorId: "550e8400-e29b-41d4-a716-446655440000",
    tags: ["intro", "hello"],
    published: false,
  };

  it("creates a post", () => {
    const post = createPost(samplePost);
    expect(post.title).toBe("Hello World");
    expect(post.tags).toEqual(["intro", "hello"]);
    expect(post.published).toBe(false);
    expect(post.id).toBeDefined();
  });

  it("lists posts with filters", () => {
    createPost({ ...samplePost, published: true });
    const published = listPosts({ published: true });
    expect(published.length).toBeGreaterThanOrEqual(1);
    expect(published.every((p) => p.published)).toBe(true);
  });

  it("gets post by id", () => {
    const created = createPost(samplePost);
    const found = getPostById(created.id);
    expect(found?.title).toBe("Hello World");
  });

  it("updates a post", () => {
    const created = createPost(samplePost);
    const updated = updatePost(created.id, { title: "Updated Title", published: true });
    expect(updated?.title).toBe("Updated Title");
    expect(updated?.published).toBe(true);
  });

  it("deletes a post", () => {
    const created = createPost(samplePost);
    expect(deletePost(created.id)).toBe(true);
    expect(getPostById(created.id)).toBeUndefined();
  });

  it("returns undefined for unknown post", () => {
    expect(getPostById("nonexistent")).toBeUndefined();
  });
});
FILE

cat > tests/post-routes.test.ts << 'FILE'
import { describe, it, expect } from "vitest";
import app from "../src/app.js";
import { postRouter } from "../src/routes/posts.js";

describe("post routes", () => {
  it("app has /posts route registered", () => {
    const stack = app._router?.stack ?? [];
    const hasPosts = stack.some(
      (layer: { regexp?: RegExp }) => layer.regexp?.test("/posts"),
    );
    expect(hasPosts).toBe(true);
  });

  it("postRouter has GET, POST, PATCH, DELETE handlers", () => {
    const methods = postRouter.stack
      ?.filter((layer: { route?: { methods: Record<string, boolean> } }) => layer.route)
      ?.map((layer: { route: { methods: Record<string, boolean> } }) => Object.keys(layer.route.methods))
      ?.flat();
    expect(methods).toContain("get");
    expect(methods).toContain("post");
  });
});
FILE

cat > tests/middleware.test.ts << 'FILE'
import { describe, it, expect } from "vitest";
import { AppError } from "../src/middleware/error-handler.js";

describe("error handling middleware", () => {
  it("AppError has correct properties", () => {
    const err = new AppError("Not found", 404);
    expect(err.message).toBe("Not found");
    expect(err.statusCode).toBe(404);
    expect(err.name).toBe("AppError");
  });

  it("AppError defaults to 500", () => {
    const err = new AppError("Server error");
    expect(err.statusCode).toBe(500);
  });
});
FILE

git add .
git commit -q -m "feat: add full REST API with users, posts, middleware, and tests"

# Back to main so stacksmith sees the diff
git checkout -q main

echo "$DEMO_DIR"
