const excludedCategories = new Set(["主食", "饮品"]);
export function getDishTopRankMap(dishes) {
    return Object.fromEntries(dishes
        .filter((dish) => !excludedCategories.has(dish.category?.name || "") && dish.orderCount > 0)
        .sort((a, b) => b.orderCount - a.orderCount || a.name.localeCompare(b.name, "zh-CN"))
        .slice(0, 3)
        .map((dish, index) => [dish.id, index + 1]));
}
