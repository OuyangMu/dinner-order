import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const targetCategories = ["汤类", "主食", "饮品", "炒菜", "凉拌", "砂锅", "斩料"] as const;

const legacyCategoryMap = new Map<string, (typeof targetCategories)[number]>([
  ["汤类", "汤类"],
  ["主食", "主食"],
  ["饮品", "饮品"],
  ["饮料", "饮品"],
  ["炒菜", "炒菜"],
  ["热菜", "炒菜"],
  ["凉拌", "凉拌"],
  ["凉菜", "凉拌"],
  ["砂锅", "砂锅"],
  ["斩料", "斩料"]
]);

const dishes = [
  {
    category: "凉拌",
    items: [
      ["凉拌黄瓜", "清爽开胃，适合聚餐先上桌。", ["清爽", "开胃"], "约 2 人份", [["黄瓜", 2, "根"], ["蒜", 10, "g"]]],
      ["皮蛋豆腐", "冰凉顺口，适合夏天聚餐。", ["凉菜", "清淡"], "约 2 人份", [["内酯豆腐", 1, "盒"], ["皮蛋", 2, "个"]]],
      ["老醋木耳", "香脆爽口，特别适合做餐前凉菜。", ["凉拌", "脆爽"], "约 2-3 人份", [["木耳", 200, "g"], ["香菜", 20, "g"]]],
      ["蒜泥白肉", "肥瘦相间，蘸蒜泥很提味。", ["微辣", "下酒"], "约 2-3 人份", [["五花肉", 250, "g"], ["蒜泥", 30, "g"]]]
    ]
  },
  {
    category: "炒菜",
    items: [
      ["宫保鸡丁", "酸甜微辣，聚餐里的稳妥选择。", ["微辣", "招牌"], "约 2-3 人份", [["鸡腿肉", 300, "g"], ["花生", 40, "g"], ["黄瓜", 0.5, "根"]]],
      ["清炒时蔬", "平衡一桌荤素，清爽不腻。", ["素菜", "清淡"], "约 2 人份", [["青菜", 400, "g"], ["蒜", 8, "g"]]],
      ["麻婆豆腐", "下饭利器，人多时特别受欢迎。", ["下饭", "微辣"], "约 2-3 人份", [["南豆腐", 2, "块"], ["牛肉末", 80, "g"]]],
      ["蒜蓉虾球", "口感清爽，适合搭配主食。", ["海鲜", "清爽"], "约 2-3 人份", [["虾球", 220, "g"], ["芦笋", 150, "g"]]],
      ["干锅花菜", "焦香十足，朋友聚餐点它很稳。", ["香辣", "热菜"], "约 2-3 人份", [["花菜", 320, "g"], ["五花肉", 100, "g"]]],
      ["番茄炒蛋", "家常稳妥，小朋友也很爱吃。", ["家常", "温和"], "约 2 人份", [["番茄", 2, "个"], ["鸡蛋", 4, "个"]]]
    ]
  },
  {
    category: "汤类",
    items: [
      ["番茄蛋花汤", "酸甜暖胃，适合所有人。", ["热汤", "家常"], "约 3 人份", [["番茄", 2, "个"], ["鸡蛋", 2, "个"]]],
      ["紫菜虾皮汤", "做法快，适合补一个汤位。", ["快手", "鲜味"], "约 3 人份", [["紫菜", 15, "g"], ["虾皮", 20, "g"]]],
      ["玉米排骨汤", "口感温润，大人小孩都适合。", ["滋补", "家常"], "约 3-4 人份", [["排骨", 400, "g"], ["玉米", 2, "根"]]],
      ["酸汤肥牛锅", "风味浓郁，适合冷天聚餐。", ["暖胃", "开胃"], "约 3 人份", [["肥牛卷", 250, "g"], ["酸汤底", 1, "份"]]]
    ]
  },
  {
    category: "砂锅",
    items: [
      ["砂锅土豆粉", "热乎耐吃，适合多人分享。", ["热乎", "饱腹"], "约 2-3 人份", [["土豆粉", 300, "g"], ["午餐肉", 100, "g"]]],
      ["砂锅豆腐", "口感软嫩，适合老人小孩。", ["家常", "下饭"], "约 3 人份", [["北豆腐", 2, "块"], ["香菇", 80, "g"]]],
      ["砂锅娃娃菜", "清甜顺口，做法简单但很受欢迎。", ["清淡", "热菜"], "约 3 人份", [["娃娃菜", 260, "g"], ["腊肠", 120, "g"]]],
      ["黄焖鸡煲", "浓郁下饭，适合聚餐共享。", ["下饭", "浓郁"], "约 3 人份", [["鸡腿肉", 350, "g"], ["香菇", 100, "g"]]]
    ]
  },
  {
    category: "斩料",
    items: [
      ["白切鸡", "经典聚餐冷盘，蘸料很关键。", ["招牌", "分享"], "约 3-4 人份", [["三黄鸡", 1, "只"], ["姜葱蘸料", 1, "份"]]],
      ["卤味拼盘", "适合边聊边吃。", ["下酒", "拼盘"], "约 2-3 人份", [["鸭翅", 4, "个"], ["卤蛋", 4, "个"]]],
      ["白切鸡胗", "口感紧实，爱吃鸡杂的朋友会喜欢。", ["冷切", "分享"], "约 2-3 人份", [["鸡胗", 300, "g"], ["姜葱蘸料", 1, "份"]]],
      ["盐焗拼肉", "偏下酒口，适合朋友小聚。", ["下酒", "卤味"], "约 2-3 人份", [["猪耳", 200, "g"], ["猪舌", 150, "g"]]]
    ]
  },
  {
    category: "主食",
    items: [
      ["葱油拌面", "简单但很受欢迎。", ["主食"], "1 份 / 人", [["面条", 150, "g"], ["小葱", 20, "g"]]],
      ["米饭", "默认小碗。", ["主食"], "1 碗", [["大米", 80, "g"]]],
      ["扬州炒饭", "一大盘就很满足，适合大家分着吃。", ["主食", "饱腹"], "1 大盘", [["米饭", 300, "g"], ["火腿", 80, "g"]]],
      ["牛肉河粉", "饱腹感强，也很适合当主食。", ["粉面", "主食"], "1 大碗", [["河粉", 250, "g"], ["牛肉", 120, "g"]]]
    ]
  },
  {
    category: "饮品",
    items: [
      ["冰镇可乐", "聚餐里很稳的快乐水。", ["冰镇"], "330ml", [["可乐", 1, "罐"]]],
      ["柠檬茶", "酸甜解腻。", ["无酒精"], "500ml", [["柠檬茶", 1, "瓶"]]],
      ["茉莉气泡水", "很适合夏天，冰一点更好喝。", ["气泡", "冰饮"], "450ml", [["气泡水", 1, "瓶"], ["茉莉风味糖浆", 1, "份"]]],
      ["酸梅汤", "解腻开胃，配烧烤和热菜都合适。", ["解腻", "冰饮"], "500ml", [["酸梅汤底", 50, "ml"], ["水", 450, "ml"]]]
    ]
  }
] as const;

async function ensureCanonicalCategories() {
  const canonicalCategories = new Map<string, { id: string; name: string }>();

  for (const [sortOrder, name] of targetCategories.entries()) {
    const category = await prisma.category.upsert({
      where: { name },
      update: { sortOrder, enabled: true },
      create: { name, sortOrder, enabled: true }
    });
    canonicalCategories.set(name, category);
  }

  const existingCategories = await prisma.category.findMany({
    include: { dishes: { select: { id: true, name: true } } }
  });

  for (const category of existingCategories) {
    const targetName = legacyCategoryMap.get(category.name);
    if (!targetName || targetName === category.name) continue;

    const targetCategory = canonicalCategories.get(targetName);
    if (!targetCategory) continue;

    for (const dish of category.dishes) {
      const duplicate = await prisma.dish.findFirst({
        where: { categoryId: targetCategory.id, name: dish.name },
        select: { id: true }
      });

      if (duplicate) continue;

      await prisma.dish.update({
        where: { id: dish.id },
        data: { categoryId: targetCategory.id }
      });
    }
  }

  const legacyCategories = await prisma.category.findMany({
    where: { name: { in: ["凉菜", "热菜", "饮料"] } },
    include: { dishes: { select: { id: true } } }
  });

  for (const category of legacyCategories) {
    if (category.dishes.length === 0) {
      await prisma.category.delete({ where: { id: category.id } });
    }
  }
}

async function main() {
  const passwordHash = await bcrypt.hash("admin123456", 10);

  await prisma.admin.upsert({
    where: { username: "admin" },
    update: { passwordHash },
    create: { username: "admin", passwordHash }
  });

  await ensureCanonicalCategories();

  const event = await prisma.event.upsert({
    where: { accessCode: "family-demo" },
    update: {},
    create: {
      title: "周末朋友聚餐",
      description: "扫码点菜，后台汇总备菜。",
      status: "OPEN",
      accessCode: "family-demo",
      dateTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    }
  });

  const categoryMap = new Map(
    (
      await prisma.category.findMany({
        where: { name: { in: [...targetCategories] } }
      })
    ).map((category) => [category.name, category])
  );

  let dishOrder = 0;
  for (const [categoryOrder, group] of dishes.entries()) {
    const category = categoryMap.get(group.category);
    if (!category) continue;

    await prisma.category.update({
      where: { id: category.id },
      data: { sortOrder: categoryOrder, enabled: true }
    });

    for (const [name, description, tags, servingHint, prepItems] of group.items) {
      const sortOrder = dishOrder++;
      const dish = await prisma.dish.upsert({
        where: { name_categoryId: { name, categoryId: category.id } },
        update: {
          description,
          tags: JSON.stringify(tags),
          prepItems: JSON.stringify(prepItems.map(([itemName, quantity, unit]) => ({ name: itemName, quantity, unit }))),
          servingHint,
          sortOrder,
          imageUrl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=640&q=80"
        },
        create: {
          name,
          categoryId: category.id,
          description,
          tags: JSON.stringify(tags),
          prepItems: JSON.stringify(prepItems.map(([itemName, quantity, unit]) => ({ name: itemName, quantity, unit }))),
          servingHint,
          sortOrder,
          imageUrl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=640&q=80"
        }
      });

      await prisma.eventDish.upsert({
        where: { eventId_dishId: { eventId: event.id, dishId: dish.id } },
        update: { enabled: true, sortOrder: dish.sortOrder },
        create: { eventId: event.id, dishId: dish.id, sortOrder: dish.sortOrder }
      });
    }
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
