import { serve } from "@hono/node-server";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import QRCode from "qrcode";
import { z } from "zod";

const prisma = new PrismaClient();
const app = new Hono<{ Variables: { admin: AdminPayload } }>();
const jwtSecret = process.env.JWT_SECRET || "dev-secret";
const port = Number(process.env.PORT || 8787);
const workspaceRoot = /[\\/]apps[\\/]server$/.test(process.cwd()) ? resolve(process.cwd(), "../..") : process.cwd();
const uploadRoot = join(workspaceRoot, "uploads");
const dishUploadDir = join(uploadRoot, "dishes");
const imageMimeToExt: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif"
};

type AdminPayload = {
  id: string;
  username: string;
  role: string;
};

app.use("*", cors({ origin: ["http://localhost:5173", "http://127.0.0.1:5173"], credentials: true }));
app.use("/uploads/*", serveStatic({ root: workspaceRoot }));

const orderSchema = z.object({
  guestName: z.string().min(1).max(40),
  guestToken: z.string().optional(),
  note: z.string().max(300).optional(),
  items: z
    .array(
      z.object({
        dishId: z.string().min(1),
        quantity: z.number().int().min(1).max(99),
        note: z.string().max(200).optional()
      })
    )
    .min(1)
});

const unlimitedQuantityCategories = new Set(["主食", "饮料", "饮品"]);

function isUnlimitedQuantityDish(dish: { category?: { name?: string } | null }) {
  return unlimitedQuantityCategories.has(dish.category?.name || "");
}

const dishSchema = z.object({
  name: z.string().min(1).max(80),
  categoryId: z.string().min(1),
  imageUrl: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
  prepItems: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        quantity: z.number().positive(),
        unit: z.string().max(20).default("")
      })
    )
    .default([]),
  servingHint: z.string().optional().nullable(),
  enabled: z.boolean().default(true),
  stockLimit: z.number().int().positive().optional().nullable(),
  sortOrder: z.number().int().default(0)
});

const eventSchema = z.object({
  title: z.string().min(1).max(80),
  description: z.string().optional().nullable(),
  dateTime: z.string().optional().nullable(),
  status: z.enum(["DRAFT", "OPEN", "CLOSED"]).default("DRAFT"),
  accessCode: z.string().min(3).max(64),
  allowModify: z.boolean().default(true),
  showSummary: z.boolean().default(true),
  copyFromEventId: z.string().optional().nullable()
});

const passwordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8, "新密码至少 8 位").max(64)
});

function signToken(payload: AdminPayload) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString("base64url");
  const signature = createHmac("sha256", jwtSecret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifyToken(token: string): AdminPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = createHmac("sha256", jwtSecret).update(body).digest("base64url");
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as AdminPayload & { exp: number };
  if (payload.exp < Date.now()) return null;
  return { id: payload.id, username: payload.username, role: payload.role };
}

const requireAdmin: MiddlewareHandler<{ Variables: { admin: AdminPayload } }> = async (c, next) => {
  const auth = c.req.header("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : "";
  const admin = token ? verifyToken(token) : null;
  if (!admin) return c.json({ message: "Unauthorized" }, 401);
  c.set("admin", admin);
  await next();
};

function parseTags(tags: string) {
  try {
    return JSON.parse(tags) as string[];
  } catch {
    return [];
  }
}

function parsePrepItems(prepItems: string) {
  try {
    return JSON.parse(prepItems) as Array<{ name: string; quantity: number; unit: string }>;
  } catch {
    return [];
  }
}

function mapDish(dish: any) {
  return { ...dish, tags: parseTags(dish.tags), prepItems: parsePrepItems(dish.prepItems) };
}

async function eventMenu(code: string) {
  const event = await prisma.event.findUnique({
    where: { accessCode: code },
    include: {
      eventDishes: {
        where: { enabled: true, dish: { enabled: true } },
        include: { dish: { include: { category: true } } },
        orderBy: [{ sortOrder: "asc" }]
      }
    }
  });

  if (!event) return null;

  const dishes = event.eventDishes.map((item: any) => ({
    ...mapDish(item.dish),
    eventDishId: item.id,
    stockLimit: item.stockLimit ?? item.dish.stockLimit
  }));
  const categories = (Array.from(new Map(dishes.map((dish: any) => [dish.category.id, dish.category])).values()) as any[]).sort(
    (a, b) => a.sortOrder - b.sortOrder
  );

  return { event: { ...event, eventDishes: undefined }, categories, dishes };
}

app.get("/health", (c) => c.json({ ok: true }));

app.get("/api/events/:code", async (c) => {
  const menu = await eventMenu(c.req.param("code"));
  if (!menu) return c.json({ message: "活动不存在" }, 404);
  return c.json(menu);
});

app.get("/api/events/:code/menu", async (c) => {
  const menu = await eventMenu(c.req.param("code"));
  if (!menu) return c.json({ message: "活动不存在" }, 404);
  return c.json(menu);
});

app.post("/api/events/:code/orders", async (c) => {
  const menu = await eventMenu(c.req.param("code"));
  if (!menu) return c.json({ message: "活动不存在" }, 404);
  if (menu.event.status !== "OPEN") return c.json({ message: "当前活动未开放点菜" }, 400);

  const body = orderSchema.parse(await c.req.json());
  const validDishIds = new Set(menu.dishes.map((dish: any) => dish.id));
  if (body.items.some((item) => !validDishIds.has(item.dishId))) {
    return c.json({ message: "订单包含不可点菜品" }, 400);
  }

  const dishById = new Map(menu.dishes.map((dish: any) => [dish.id, dish]));
  const invalidQuantityItem = body.items.find((item) => {
    const dish = dishById.get(item.dishId);
    return dish && !isUnlimitedQuantityDish(dish) && item.quantity > 1;
  });
  if (invalidQuantityItem) {
    const dish: any = dishById.get(invalidQuantityItem.dishId);
    return c.json({ message: `${dish.name}最多只能点 1 份` }, 400);
  }

  const requestedDishIds = body.items
    .filter((item) => {
      const dish = dishById.get(item.dishId);
      return dish && !isUnlimitedQuantityDish(dish);
    })
    .map((item) => item.dishId);
  const existingItems = await prisma.orderItem.findMany({
    where: {
      dishId: { in: requestedDishIds },
      order: {
        eventId: menu.event.id,
        status: { not: "CANCELED" }
      }
    },
    include: { dish: true, order: true }
  });
  if (existingItems.length) {
    const conflicts = existingItems.map((item) => ({
      dishId: item.dishId,
      dishName: item.dish.name,
      guestName: item.order.guestName
    }));
    const first = conflicts[0];
    return c.json({ message: `${first.dishName}${first.guestName}已点`, conflicts }, 409);
  }

  const guestToken = body.guestToken || randomBytes(16).toString("hex");
  const order = await prisma.order.create({
    data: {
      eventId: menu.event.id,
      guestName: body.guestName,
      guestToken,
      note: body.note,
      items: {
        create: body.items.map((item) => ({
          dishId: item.dishId,
          quantity: item.quantity,
          note: item.note
        }))
      }
    },
    include: { items: { include: { dish: true } } }
  });

  return c.json({ ...order, guestToken });
});

app.get("/api/events/:code/orders/:guestToken", async (c) => {
  const event = await prisma.event.findUnique({ where: { accessCode: c.req.param("code") } });
  if (!event) return c.json({ message: "活动不存在" }, 404);
  const orders = await prisma.order.findMany({
    where: { eventId: event.id, guestToken: c.req.param("guestToken") },
    include: { items: { include: { dish: true } } },
    orderBy: { createdAt: "desc" }
  });
  return c.json(orders.map((order: any) => ({ ...order, items: order.items.map((item: any) => ({ ...item, dish: mapDish(item.dish) })) })));
});

app.get("/api/events/:code/summary", async (c) => {
  const menu = await eventMenu(c.req.param("code"));
  if (!menu) return c.json({ message: "活动不存在" }, 404);
  if (!menu.event.showSummary) return c.json({ message: "活动未开放汇总查看" }, 403);

  const items = await prisma.orderItem.findMany({
    where: { order: { eventId: menu.event.id, status: { not: "CANCELED" } } },
    include: { dish: true, order: true }
  });
  return c.json(toSummary(items));
});

app.post("/api/admin/login", async (c) => {
  const body = z.object({ username: z.string(), password: z.string() }).parse(await c.req.json());
  const admin = await prisma.admin.findUnique({ where: { username: body.username } });
  if (!admin || !(await bcrypt.compare(body.password, admin.passwordHash))) {
    return c.json({ message: "用户名或密码错误" }, 401);
  }
  return c.json({ token: signToken({ id: admin.id, username: admin.username, role: admin.role }) });
});

app.use("/api/admin/*", requireAdmin);

app.get("/api/admin/me", (c) => c.json(c.get("admin")));

app.put("/api/admin/password", async (c) => {
  const body = passwordSchema.parse(await c.req.json());
  const payload = c.get("admin");
  const admin = await prisma.admin.findUnique({ where: { id: payload.id } });
  if (!admin || !(await bcrypt.compare(body.oldPassword, admin.passwordHash))) {
    return c.json({ message: "原密码错误" }, 400);
  }
  if (await bcrypt.compare(body.newPassword, admin.passwordHash)) {
    return c.json({ message: "新密码不能和原密码相同" }, 400);
  }
  const passwordHash = await bcrypt.hash(body.newPassword, 10);
  await prisma.admin.update({ where: { id: payload.id }, data: { passwordHash } });
  return c.json({ ok: true });
});

app.get("/api/admin/events", async (c) => {
  const events = await prisma.event.findMany({ orderBy: { createdAt: "desc" } });
  return c.json(events);
});

app.post("/api/admin/events", async (c) => {
  const body = eventSchema.parse(await c.req.json());
  const { copyFromEventId, ...eventData } = body;
  const event = await prisma.event.create({
    data: { ...eventData, dateTime: eventData.dateTime ? new Date(eventData.dateTime) : null }
  });
  if (copyFromEventId) {
    await copyEventDishes(copyFromEventId, event.id);
  } else {
    await addAllDishesToEvent(event.id);
  }
  return c.json(event);
});

app.put("/api/admin/events/:id", async (c) => {
  const body = eventSchema.partial().parse(await c.req.json());
  const { copyFromEventId, ...eventData } = body;
  const event = await prisma.event.update({
    where: { id: c.req.param("id") },
    data: { ...eventData, dateTime: eventData.dateTime ? new Date(eventData.dateTime) : eventData.dateTime }
  });
  return c.json(event);
});

app.delete("/api/admin/events/:id", async (c) => {
  await prisma.event.delete({ where: { id: c.req.param("id") } });
  return c.json({ ok: true });
});

app.post("/api/admin/events/:id/copy-menu", async (c) => {
  const body = z.object({ fromEventId: z.string().min(1) }).parse(await c.req.json());
  const copied = await copyEventDishes(body.fromEventId, c.req.param("id"));
  return c.json({ copied });
});

app.get("/api/admin/categories", async (c) => {
  const categories = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
  return c.json(categories);
});

app.post("/api/admin/categories", async (c) => {
  const body = z.object({ name: z.string().min(1), sortOrder: z.number().int().default(0), enabled: z.boolean().default(true) }).parse(await c.req.json());
  const category = await prisma.category.create({ data: body });
  return c.json(category);
});

app.post("/api/admin/uploads/dish-image", async (c) => {
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) {
    return c.json({ message: "请上传图片文件" }, 400);
  }

  const ext = imageMimeToExt[file.type];
  if (!ext) {
    return c.json({ message: "仅支持 jpg、png、webp、gif 图片" }, 400);
  }
  if (file.size > 5 * 1024 * 1024) {
    return c.json({ message: "图片不能超过 5MB" }, 400);
  }

  await mkdir(dishUploadDir, { recursive: true });
  const filename = `${Date.now()}-${randomBytes(8).toString("hex")}.${ext}`;
  const filepath = join(dishUploadDir, filename);
  await writeFile(filepath, Buffer.from(await file.arrayBuffer()));

  return c.json({ url: `/uploads/dishes/${filename}` });
});

app.get("/api/admin/dishes", async (c) => {
  const dishes = await prisma.dish.findMany({ include: { category: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] });
  return c.json(dishes.map(mapDish));
});

app.post("/api/admin/dishes", async (c) => {
  const body = dishSchema.parse(await c.req.json());
  const dish = await prisma.dish.create({ data: { ...body, tags: JSON.stringify(body.tags), prepItems: JSON.stringify(body.prepItems) } });
  return c.json(mapDish(dish));
});

app.put("/api/admin/dishes/:id", async (c) => {
  const body = dishSchema.partial().parse(await c.req.json());
  const dish = await prisma.dish.update({
    where: { id: c.req.param("id") },
    data: {
      ...body,
      tags: body.tags ? JSON.stringify(body.tags) : undefined,
      prepItems: body.prepItems ? JSON.stringify(body.prepItems) : undefined
    }
  });
  return c.json(mapDish(dish));
});

app.post("/api/admin/events/:id/dishes/:dishId", async (c) => {
  const eventDish = await prisma.eventDish.upsert({
    where: { eventId_dishId: { eventId: c.req.param("id"), dishId: c.req.param("dishId") } },
    update: { enabled: true },
    create: { eventId: c.req.param("id"), dishId: c.req.param("dishId") }
  });
  return c.json(eventDish);
});

app.get("/api/admin/events/:id/dishes", async (c) => {
  const eventDishes = await prisma.eventDish.findMany({
    where: { eventId: c.req.param("id") },
    include: { dish: true },
    orderBy: { sortOrder: "asc" }
  });
  return c.json(eventDishes);
});

app.delete("/api/admin/events/:id/dishes/:dishId", async (c) => {
  await prisma.eventDish.delete({
    where: { eventId_dishId: { eventId: c.req.param("id"), dishId: c.req.param("dishId") } }
  });
  return c.json({ ok: true });
});

app.get("/api/admin/events/:id/orders", async (c) => {
  const orders = await prisma.order.findMany({
    where: { eventId: c.req.param("id") },
    include: { items: { include: { dish: true } } },
    orderBy: { createdAt: "desc" }
  });
  return c.json(orders.map((order: any) => ({ ...order, items: order.items.map((item: any) => ({ ...item, dish: mapDish(item.dish) })) })));
});

app.delete("/api/admin/orders/:id", async (c) => {
  await prisma.order.delete({ where: { id: c.req.param("id") } });
  return c.json({ ok: true });
});

app.get("/api/admin/events/:id/summary", async (c) => {
  const items = await prisma.orderItem.findMany({
    where: { order: { eventId: c.req.param("id"), status: { not: "CANCELED" } } },
    include: { dish: true, order: true }
  });
  return c.json(toSummary(items));
});

app.get("/api/admin/events/:id/ingredients", async (c) => {
  const items = await prisma.orderItem.findMany({
    where: { order: { eventId: c.req.param("id"), status: { not: "CANCELED" } } },
    include: { dish: true, order: true }
  });
  return c.json(toIngredientSummary(items));
});

app.get("/api/admin/events/:id/qrcode", async (c) => {
  const event = await prisma.event.findUnique({ where: { id: c.req.param("id") } });
  if (!event) return c.json({ message: "活动不存在" }, 404);
  const origin = c.req.query("origin") || "http://localhost:5173";
  const url = `${origin}/e/${event.accessCode}`;
  const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 240 });
  return c.json({ url, dataUrl });
});

function toSummary(items: Array<{ dish: any; quantity: number; note: string | null; order: { guestName: string } }>) {
  const summary = new Map<string, { dish: any; quantity: number; notes: string[]; guests: string[] }>();
  for (const item of items) {
    const current = summary.get(item.dish.id) || { dish: mapDish(item.dish), quantity: 0, notes: [], guests: [] };
    current.quantity += item.quantity;
    current.guests.push(`${item.order.guestName} x${item.quantity}`);
    if (item.note) current.notes.push(`${item.order.guestName}: ${item.note}`);
    summary.set(item.dish.id, current);
  }
  return Array.from(summary.values()).sort((a, b) => b.quantity - a.quantity);
}

async function copyEventDishes(fromEventId: string, toEventId: string) {
  if (fromEventId === toEventId) return 0;
  const sourceDishes = await prisma.eventDish.findMany({
    where: { eventId: fromEventId },
    orderBy: { sortOrder: "asc" }
  });
  let copied = 0;
  for (const item of sourceDishes) {
    await prisma.eventDish.upsert({
      where: { eventId_dishId: { eventId: toEventId, dishId: item.dishId } },
      update: {
        enabled: item.enabled,
        stockLimit: item.stockLimit,
        sortOrder: item.sortOrder
      },
      create: {
        eventId: toEventId,
        dishId: item.dishId,
        enabled: item.enabled,
        stockLimit: item.stockLimit,
        sortOrder: item.sortOrder
      }
    });
    copied += 1;
  }
  return copied;
}

async function addAllDishesToEvent(eventId: string) {
  const dishes = await prisma.dish.findMany({
    where: { enabled: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
  });
  let added = 0;
  for (const dish of dishes) {
    await prisma.eventDish.upsert({
      where: { eventId_dishId: { eventId, dishId: dish.id } },
      update: { enabled: true, sortOrder: dish.sortOrder, stockLimit: dish.stockLimit },
      create: { eventId, dishId: dish.id, enabled: true, sortOrder: dish.sortOrder, stockLimit: dish.stockLimit }
    });
    added += 1;
  }
  return added;
}

function toIngredientSummary(items: Array<{ dish: any; quantity: number; order: { guestName: string } }>) {
  const summary = new Map<string, { name: string; quantity: number; unit: string; sources: string[] }>();
  for (const item of items) {
    const prepItems = parsePrepItems(item.dish.prepItems);
    for (const prepItem of prepItems) {
      const key = `${prepItem.name}__${prepItem.unit || ""}`;
      const current = summary.get(key) || { name: prepItem.name, quantity: 0, unit: prepItem.unit || "", sources: [] };
      const total = prepItem.quantity * item.quantity;
      current.quantity += total;
      current.sources.push(`${item.dish.name} x${item.quantity}`);
      summary.set(key, current);
    }
  }
  return Array.from(summary.values()).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

serve({ fetch: app.fetch, port }, () => {
  console.log(`Dinner Order API running at http://localhost:${port}`);
});
