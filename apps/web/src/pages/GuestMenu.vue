<script setup lang="ts">
import { ShoppingCart, ClipboardList } from "lucide-vue-next";
import { showFailToast, showImagePreview, showSuccessToast } from "vant";
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useRoute } from "vue-router";
import { request, type Dish, type MenuPayload, type Order, type SummaryItem } from "../api";

const route = useRoute();
const code = computed(() => String(route.params.code));
const loading = ref(true);
const submitting = ref(false);
const menu = ref<MenuPayload | null>(null);
const summary = ref<SummaryItem[]>([]);
const activeCategory = ref("");
const cart = reactive<Record<string, { dish: Dish; quantity: number; note: string }>>({});
const guestName = ref(localStorage.getItem("guestName") || "");
const guestToken = ref(localStorage.getItem("guestToken") || "");
const note = ref("");
const showCart = ref(false);
let scrollLockTimer: number | undefined;

const cartItems = computed(() => Object.values(cart).filter((item) => item.quantity > 0));
const cartCount = computed(() => cartItems.value.reduce((sum, item) => sum + item.quantity, 0));
const guestNameMissing = computed(() => !guestName.value.trim());
const canSubmit = computed(() => cartItems.value.length > 0 && !guestNameMissing.value && !submitting.value);

const groupedDishes = computed(() => {
  if (!menu.value) return [];
  return menu.value.categories.map((category) => ({
    category,
    dishes: menu.value!.dishes.filter((dish) => dish.categoryId === category.id)
  }));
});

function add(dish: Dish) {
  cart[dish.id] ??= { dish, quantity: 0, note: "" };
  cart[dish.id].quantity += 1;
}

function remove(dish: Dish) {
  if (!cart[dish.id]) return;
  cart[dish.id].quantity -= 1;
  if (cart[dish.id].quantity <= 0) delete cart[dish.id];
}

function previewDishImage(dish: Dish) {
  if (!dish.imageUrl) return;
  showImagePreview({
    images: [dish.imageUrl],
    closeable: true
  });
}

function categoryAnchorId(categoryId: string) {
  return `category-${categoryId}`;
}

function scrollToCategory(categoryId: string) {
  activeCategory.value = categoryId;
  window.clearTimeout(scrollLockTimer);
  const element = document.getElementById(categoryAnchorId(categoryId));
  if (!element) return;

  element.scrollIntoView({ behavior: "smooth", block: "start" });
  scrollLockTimer = window.setTimeout(() => {
    scrollLockTimer = undefined;
  }, 550);
}

function syncActiveCategoryOnScroll() {
  if (scrollLockTimer || !menu.value?.categories.length) return;
  const anchors = menu.value.categories
    .map((category) => ({
      id: category.id,
      top: document.getElementById(categoryAnchorId(category.id))?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY
    }))
    .filter((item) => Number.isFinite(item.top));

  const current = anchors
    .filter((item) => item.top <= 110)
    .sort((a, b) => b.top - a.top)[0] || anchors.sort((a, b) => a.top - b.top)[0];

  if (current) activeCategory.value = current.id;
}

async function load() {
  loading.value = true;
  try {
    menu.value = await request<MenuPayload>(`/api/events/${code.value}/menu`);
    activeCategory.value = menu.value.categories[0]?.id || "";
    requestAnimationFrame(syncActiveCategoryOnScroll);
    if (menu.value.event.showSummary) {
      summary.value = await request<SummaryItem[]>(`/api/events/${code.value}/summary`).catch(() => []);
    }
  } catch (error) {
    showFailToast(error instanceof Error ? error.message : "加载失败");
  } finally {
    loading.value = false;
  }
}

async function submitOrder() {
  if (!guestName.value.trim()) {
    showFailToast("请先填写昵称");
    return;
  }
  if (!cartItems.value.length) {
    showFailToast("请先选择菜品");
    return;
  }

  submitting.value = true;
  try {
    const order = await request<Order>(`/api/events/${code.value}/orders`, {
      method: "POST",
      body: JSON.stringify({
        guestName: guestName.value.trim(),
        guestToken: guestToken.value || undefined,
        note: note.value,
        items: cartItems.value.map((item) => ({
          dishId: item.dish.id,
          quantity: item.quantity,
          note: item.note || undefined
        }))
      })
    });
    guestToken.value = order.guestToken;
    localStorage.setItem("guestName", guestName.value.trim());
    localStorage.setItem("guestToken", order.guestToken);
    Object.keys(cart).forEach((key) => delete cart[key]);
    note.value = "";
    showCart.value = false;
    showSuccessToast("已提交点菜");
    await load();
  } catch (error) {
    showFailToast(error instanceof Error ? error.message : "提交失败");
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  load();
  window.addEventListener("scroll", syncActiveCategoryOnScroll, { passive: true });
});

onBeforeUnmount(() => {
  window.removeEventListener("scroll", syncActiveCategoryOnScroll);
  window.clearTimeout(scrollLockTimer);
});
</script>

<template>
  <main class="guest-shell" v-if="!loading && menu">
    <section class="event-head">
      <div>
        <p class="eyebrow">家庭朋友聚餐</p>
        <h1>{{ menu.event.title }}</h1>
        <p class="muted">{{ menu.event.description || "选好想吃的，主人会在后台汇总备菜。" }}</p>
      </div>
      <span class="status-pill">{{ menu.event.status === "OPEN" ? "开放点菜" : "已关闭" }}</span>
    </section>

    <div class="menu-layout">
      <aside class="category-rail">
        <button
          v-for="group in groupedDishes"
          :key="group.category.id"
          :class="{ active: activeCategory === group.category.id }"
          @click="scrollToCategory(group.category.id)"
        >
          {{ group.category.name }}
        </button>
      </aside>

      <section class="dish-list">
        <template v-for="group in groupedDishes" :key="group.category.id">
          <h2 :id="categoryAnchorId(group.category.id)" class="category-anchor">{{ group.category.name }}</h2>
          <article v-for="dish in group.dishes" :key="dish.id" class="dish-row">
            <img
              :src="dish.imageUrl || '/placeholder-dish.jpg'"
              :alt="dish.name"
              :class="{ previewable: dish.imageUrl }"
              @click="previewDishImage(dish)"
            />
            <div class="dish-info">
              <div class="dish-title">
                <h3 :class="{ previewable: dish.imageUrl }" @click="previewDishImage(dish)">{{ dish.name }}</h3>
                <span v-if="dish.servingHint">{{ dish.servingHint }}</span>
              </div>
              <p>{{ dish.description }}</p>
              <div class="tag-list">
                <span v-for="tag in dish.tags" :key="tag">{{ tag }}</span>
              </div>
            </div>
            <div class="stepper">
              <button aria-label="减少" @click="remove(dish)">-</button>
              <strong>{{ cart[dish.id]?.quantity || 0 }}</strong>
              <button aria-label="增加" @click="add(dish)">+</button>
            </div>
          </article>
        </template>
      </section>
    </div>

    <section class="summary-band" v-if="summary.length">
      <div class="band-title">
        <ClipboardList :size="18" />
        <h2>大家已点</h2>
      </div>
      <div class="summary-list">
        <div v-for="item in summary" :key="item.dish.id" class="summary-row">
          <div class="summary-main">
            <strong>{{ item.dish.name }}</strong>
            <span>x{{ item.quantity }}</span>
          </div>
          <div class="guest-list">
            <span v-for="guest in item.guests" :key="guest">{{ guest }}</span>
          </div>
        </div>
      </div>
    </section>

    <button class="cart-fab" @click="showCart = true">
      <ShoppingCart :size="20" />
      <span>点菜单 {{ cartCount }}</span>
    </button>

    <van-popup v-model:show="showCart" position="bottom" round>
      <section class="cart-panel">
        <h2>确认点菜</h2>
        <div v-if="!cartItems.length" class="empty">还没有选择菜品</div>
        <div v-for="item in cartItems" :key="item.dish.id" class="cart-item">
          <div>
            <strong>{{ item.dish.name }}</strong>
            <van-field v-model="item.note" placeholder="单项备注，可不填" />
          </div>
          <div class="stepper compact">
            <button @click="remove(item.dish)">-</button>
            <strong>{{ item.quantity }}</strong>
            <button @click="add(item.dish)">+</button>
          </div>
        </div>
        <van-field
          v-model="guestName"
          label="昵称"
          placeholder="例如：小王"
          required
          clearable
          :error="guestNameMissing"
          error-message="昵称必填"
        />
        <van-field v-model="note" label="整单备注" placeholder="例如：少辣、不要香菜" />
        <van-button block type="primary" :loading="submitting" :disabled="!canSubmit" @click="submitOrder">提交点菜</van-button>
      </section>
    </van-popup>
  </main>

  <div v-else class="loading-page">正在加载菜单...</div>
</template>

<style scoped>
.guest-shell {
  min-height: 100vh;
  padding: 18px 16px 92px;
  background: #f6f7f9;
}

.event-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin: 0 auto 14px;
  max-width: 980px;
}

.eyebrow {
  margin: 0 0 8px;
  color: #a15c38;
  font-size: 13px;
  font-weight: 700;
}

h1,
h2,
h3,
p {
  margin: 0;
}

h1 {
  font-size: 28px;
  line-height: 1.2;
}

.menu-layout,
.summary-band {
  max-width: 980px;
  margin: 0 auto 14px;
}

.menu-layout {
  display: grid;
  grid-template-columns: 92px 1fr;
  gap: 12px;
}

.category-rail {
  position: sticky;
  top: 10px;
  align-self: start;
  display: grid;
  gap: 8px;
}

.category-rail button {
  min-height: 42px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: white;
  color: #374151;
}

.category-rail button.active {
  border-color: #23724a;
  background: #e8f4ed;
  color: #1d5b3d;
  font-weight: 700;
}

.dish-list {
  display: grid;
  gap: 12px;
}

.dish-list h2 {
  padding: 8px 2px 0;
  font-size: 18px;
}

.category-anchor {
  scroll-margin-top: 12px;
}

.dish-row {
  display: grid;
  grid-template-columns: 84px 1fr 86px;
  gap: 12px;
  align-items: center;
  min-height: 112px;
  padding: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: white;
}

.dish-row img {
  width: 84px;
  height: 84px;
  border-radius: 8px;
  object-fit: cover;
  background: #e5e7eb;
}

.previewable {
  cursor: pointer;
}

.dish-row img.previewable {
  transition: transform 0.18s ease, filter 0.18s ease;
}

.dish-row img.previewable:active {
  transform: scale(0.98);
  filter: brightness(0.95);
}

.dish-title {
  display: flex;
  gap: 8px;
  align-items: baseline;
  flex-wrap: wrap;
}

.dish-title h3 {
  font-size: 16px;
}

.dish-title span,
.tag-list span {
  color: #6b7280;
  font-size: 12px;
}

.dish-info p {
  margin-top: 6px;
  color: #4b5563;
  font-size: 13px;
  line-height: 1.45;
}

.tag-list {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.tag-list span {
  padding: 3px 7px;
  border-radius: 999px;
  background: #f1f5f9;
}

.stepper {
  display: grid;
  grid-template-columns: 28px 30px 28px;
  align-items: center;
  gap: 2px;
}

.stepper button {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 50%;
  background: #23724a;
  color: white;
  font-size: 18px;
  line-height: 1;
}

.stepper strong {
  text-align: center;
}

.summary-band {
  padding: 14px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: white;
}

.band-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.summary-list {
  display: grid;
  gap: 8px;
}

.summary-row {
  display: grid;
  gap: 8px;
  padding: 10px;
  border-radius: 8px;
  background: #f8fafc;
}

.summary-main {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.guest-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.guest-list span {
  padding: 3px 7px;
  border-radius: 999px;
  background: white;
  color: #4b5563;
  font-size: 12px;
}

.cart-fab {
  position: fixed;
  right: 16px;
  bottom: 18px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding: 0 18px;
  border: 0;
  border-radius: 999px;
  background: #1f2933;
  color: white;
  box-shadow: 0 10px 26px rgb(31 41 51 / 24%);
}

.cart-panel {
  padding: 18px 16px 24px;
}

.cart-panel h2 {
  margin-bottom: 12px;
}

.cart-item {
  display: grid;
  grid-template-columns: 1fr 86px;
  gap: 10px;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid #eef2f7;
}

.compact {
  justify-self: end;
}

.empty,
.loading-page {
  padding: 40px 20px;
  color: #6b7280;
  text-align: center;
}

@media (max-width: 560px) {
  .guest-shell {
    padding-inline: 12px;
  }

  .menu-layout {
    grid-template-columns: 78px 1fr;
    gap: 8px;
  }

  .dish-row {
    grid-template-columns: 72px 1fr;
  }

  .dish-row img {
    width: 72px;
    height: 72px;
  }

  .stepper {
    grid-column: 2;
    justify-self: end;
  }
}
</style>
