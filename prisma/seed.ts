import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const dishes = [
  {
    category: "凉菜",
    items: [
      ["凉拌黄瓜", "清爽开胃，适合先上桌。", ["素", "清爽"], "约 2 人份", [["黄瓜", 2, "根"], ["蒜", 10, "g"]]],
      ["夫妻肺片", "香辣浓郁，适合下酒。", ["辣", "下酒"], "约 2-3 人份", [["牛肉", 250, "g"], ["辣椒油", 30, "ml"]]]
    ]
  },
  {
    category: "热菜",
    items: [
      ["宫保鸡丁", "酸甜微辣，朋友聚餐稳妥款。", ["微辣", "招牌"], "约 2-3 人份", [["鸡腿肉", 300, "g"], ["花生", 40, "g"], ["黄瓜", 0.5, "根"]]],
      ["番茄牛腩", "汤汁浓厚，适合配饭。", ["热乎", "推荐"], "约 3 人份", [["牛腩", 500, "g"], ["番茄", 3, "个"]]],
      ["清炒时蔬", "平衡一桌肉菜。", ["素", "清淡"], "约 2 人份", [["青菜", 400, "g"], ["蒜", 8, "g"]]]
    ]
  },
  {
    category: "主食",
    items: [
      ["葱油拌面", "简单但很受欢迎。", ["主食"], "1 份/人", [["面条", 150, "g"], ["小葱", 20, "g"]]],
      ["米饭", "默认小碗。", ["主食"], "1 碗", [["大米", 80, "g"]]]
    ]
  },
  {
    category: "饮品",
    items: [
      ["冰镇可乐", "快乐气泡。", ["冰镇"], "330ml", [["可乐", 1, "罐"]]],
      ["柠檬茶", "酸甜解腻。", ["无酒精"], "500ml", [["柠檬茶", 1, "瓶"]]]
    ]
  }
] as const;

async function main() {
  const passwordHash = await bcrypt.hash("admin123456", 10);

  await prisma.admin.upsert({
    where: { username: "admin" },
    update: { passwordHash },
    create: { username: "admin", passwordHash }
  });

  const event = await prisma.event.upsert({
    where: { accessCode: "family-demo" },
    update: {},
    create: {
      title: "周末朋友聚餐",
      description: "扫码点菜，主人后台汇总备菜。",
      status: "OPEN",
      accessCode: "family-demo",
      dateTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    }
  });

  let categoryOrder = 0;
  let dishOrder = 0;
  for (const group of dishes) {
    const category = await prisma.category.upsert({
      where: { name: group.category },
      update: { sortOrder: categoryOrder },
      create: { name: group.category, sortOrder: categoryOrder }
    });
    categoryOrder += 1;

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
          imageUrl: `https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=640&q=80`
        },
        create: {
          name,
          categoryId: category.id,
          description,
          tags: JSON.stringify(tags),
          prepItems: JSON.stringify(prepItems.map(([itemName, quantity, unit]) => ({ name: itemName, quantity, unit }))),
          servingHint,
          sortOrder,
          imageUrl: `https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=640&q=80`
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
