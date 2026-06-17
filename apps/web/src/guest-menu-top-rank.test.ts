import test from "node:test";
import assert from "node:assert/strict";
import type { Dish } from "./api";
import { getDishTopRankMap } from "./guest-menu-top-rank";

function createDish(overrides: Partial<Dish>): Dish {
  return {
    id: overrides.id || "dish-1",
    name: overrides.name || "测试菜品",
    categoryId: overrides.categoryId || "cat-1",
    category: overrides.category || { id: "cat-1", name: "炒菜", sortOrder: 0, enabled: true },
    tags: overrides.tags || [],
    prepItems: overrides.prepItems || [],
    enabled: overrides.enabled ?? true,
    sortOrder: overrides.sortOrder ?? 0,
    orderCount: overrides.orderCount ?? 0,
    description: overrides.description,
    imageUrl: overrides.imageUrl,
    servingHint: overrides.servingHint,
    stockLimit: overrides.stockLimit
  };
}

test("getDishTopRankMap returns top 3 ranks and excludes 主食饮品", () => {
  const dishes = [
    createDish({ id: "dish-a", name: "红烧排骨", orderCount: 12, category: { id: "cat-a", name: "炒菜", sortOrder: 0, enabled: true } }),
    createDish({ id: "dish-b", name: "麻婆豆腐", orderCount: 10, category: { id: "cat-b", name: "炒菜", sortOrder: 1, enabled: true } }),
    createDish({ id: "dish-c", name: "酸菜鱼", orderCount: 9, category: { id: "cat-c", name: "砂锅", sortOrder: 2, enabled: true } }),
    createDish({ id: "dish-d", name: "番茄炒蛋", orderCount: 8, category: { id: "cat-d", name: "炒菜", sortOrder: 3, enabled: true } }),
    createDish({ id: "dish-e", name: "扬州炒饭", orderCount: 99, category: { id: "cat-e", name: "主食", sortOrder: 4, enabled: true } }),
    createDish({ id: "dish-f", name: "酸梅汤", orderCount: 88, category: { id: "cat-f", name: "饮品", sortOrder: 5, enabled: true } })
  ];

  assert.deepEqual(getDishTopRankMap(dishes), {
    "dish-a": 1,
    "dish-b": 2,
    "dish-c": 3
  });
});
