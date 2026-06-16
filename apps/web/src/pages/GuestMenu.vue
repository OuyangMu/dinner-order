<script setup lang="ts">
import { ShoppingCart, ClipboardList } from "lucide-vue-next";
import { showFailToast, showImagePreview, showSuccessToast } from "vant";
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { request, type Dish, type MenuPayload, type Order, type SummaryItem } from "../api";

const route = useRoute();
const code = computed(() => String(route.params.code));
const loading = ref(true);
const submitting = ref(false);
const menu = ref<MenuPayload | null>(null);
const myOrders = ref<Order[]>([]);
const summary = ref<SummaryItem[]>([]);
const activeCategory = ref("");
const cart = reactive<Record<string, { dish: Dish; quantity: number; note: string }>>({});
const guestName = ref(localStorage.getItem("guestName") || "");
const guestToken = ref(localStorage.getItem("guestToken") || "");
const note = ref("");
const showCart = ref(false);
const deletingOrderId = ref("");
let scrollLockTimer: number | undefined;
let lockedScrollY = 0;

const unlimitedQuantityCategories = new Set(["主食", "饮品"]);

function isUnlimitedQuantityDish(dish: Dish) {
  return unlimitedQuantityCategories.has(dish.category?.name || "");
}

const cartItems = computed(() => Object.values(cart).filter((item) => item.quantity > 0));
const cartCount = computed(() => cartItems.value.reduce((sum, item) => sum + item.quantity, 0));
const guestNameMissing = computed(() => !guestName.value.trim());
const orderedByDish = computed<Record<string, string>>(() =>
  Object.fromEntries(
    summary.value.map((item) => [
      item.dish.id,
      item.guests.map((guest) => guest.replace(/\s*x\d+$/, "")).join("、")
    ])
  )
);
const hasConflictInCart = computed(() => cartItems.value.some((item) => !isUnlimitedQuantityDish(item.dish) && Boolean(orderedByDish.value[item.dish.id])));
const canSubmit = computed(() => cartItems.value.length > 0 && !guestNameMissing.value && !submitting.value && !hasConflictInCart.value);

const groupedDishes = computed(() => {
  if (!menu.value) return [];
  return menu.value.categories.map((category) => ({
    category,
    dishes: menu.value!.dishes.filter((dish) => dish.categoryId === category.id)
  }));
});

function add(dish: Dish) {
  if (!isUnlimitedQuantityDish(dish) && orderedByDish.value[dish.id]) {
    showFailToast(`${dish.name}${orderedByDish.value[dish.id]}已点`);
    return;
  }
  cart[dish.id] ??= { dish, quantity: 0, note: "" };
  if (!isUnlimitedQuantityDish(dish) && cart[dish.id].quantity >= 1) return;
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

function burstConfetti(event: MouseEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const originX = rect.left + rect.width / 2;
  const originY = rect.top + rect.height / 2;
  const colors = ["#43e8ff", "#9d5cff", "#ff4ade", "#f8fbff", "#7cffc4"];

  for (let index = 0; index < 12; index += 1) {
    const piece = document.createElement("span");
    const angle = Math.random() * Math.PI * 2;
    const distance = 18 + Math.random() * 28;
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance - 8;
    const size = 4 + Math.random() * 4;

    piece.className = "confetti-piece";
    piece.style.left = `${originX}px`;
    piece.style.top = `${originY}px`;
    piece.style.width = `${size}px`;
    piece.style.height = `${size * 1.6}px`;
    piece.style.background = colors[index % colors.length];
    piece.style.setProperty("--x", `${x}px`);
    piece.style.setProperty("--y", `${y}px`);
    piece.style.setProperty("--r", `${Math.random() * 240 - 120}deg`);

    document.body.appendChild(piece);
    window.setTimeout(() => piece.remove(), 720);
  }
}

function lockPageScroll() {
  lockedScrollY = window.scrollY;
  document.body.style.position = "fixed";
  document.body.style.top = `-${lockedScrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
}

function unlockPageScroll() {
  const top = document.body.style.top;
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";
  window.scrollTo(0, Math.abs(Number.parseInt(top || "0", 10)) || lockedScrollY);
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
    if (guestToken.value) {
      myOrders.value = await request<Order[]>(`/api/events/${code.value}/orders/${guestToken.value}`).catch(() => []);
    } else {
      myOrders.value = [];
    }
    if (menu.value.event.showSummary) {
      summary.value = await request<SummaryItem[]>(`/api/events/${code.value}/summary`).catch(() => []);
    } else {
      summary.value = [];
    }
  } catch (error) {
    showFailToast(error instanceof Error ? error.message : "加载失败");
  } finally {
    loading.value = false;
  }
}

async function deleteOwnOrder(order: Order) {
  if (!menu.value?.event.allowModify) {
    showFailToast("当前活动不允许自行修改订单");
    return;
  }

  deletingOrderId.value = order.id;
  try {
    await request(`/api/events/${code.value}/orders/${order.id}?guestToken=${encodeURIComponent(guestToken.value)}`, {
      method: "DELETE"
    });
    showSuccessToast("已撤回点菜");
    await load();
  } catch (error) {
    showFailToast(error instanceof Error ? error.message : "撤回失败");
  } finally {
    deletingOrderId.value = "";
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
  const conflictItem = cartItems.value.find((item) => !isUnlimitedQuantityDish(item.dish) && orderedByDish.value[item.dish.id]);
  if (conflictItem) {
    showFailToast(`${conflictItem.dish.name}${orderedByDish.value[conflictItem.dish.id]}已点`);
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

watch(showCart, (visible) => {
  if (visible) {
    lockPageScroll();
  } else {
    unlockPageScroll();
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("scroll", syncActiveCategoryOnScroll);
  window.clearTimeout(scrollLockTimer);
  if (showCart.value) unlockPageScroll();
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
            <div class="dish-action">
              <span v-if="!isUnlimitedQuantityDish(dish) && orderedByDish[dish.id]" class="ordered-badge">{{ orderedByDish[dish.id] }}已点</span>
              <div class="stepper">
                <button aria-label="减少" @click="remove(dish); burstConfetti($event)">-</button>
                <strong>{{ cart[dish.id]?.quantity || 0 }}</strong>
                <button
                  aria-label="增加"
                  :disabled="(!isUnlimitedQuantityDish(dish) && Boolean(orderedByDish[dish.id])) || (!isUnlimitedQuantityDish(dish) && (cart[dish.id]?.quantity || 0) >= 1)"
                  @click="add(dish); burstConfetti($event)"
                >
                  +
                </button>
              </div>
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

    <section class="summary-band my-orders-band" v-if="myOrders.length">
      <div class="band-title">
        <ShoppingCart :size="18" />
        <h2>我的订单</h2>
      </div>
      <div class="summary-list">
        <article v-for="order in myOrders" :key="order.id" class="summary-row my-order-row">
          <div class="summary-main">
            <strong>{{ order.guestName }}</strong>
            <span>{{ new Date(order.createdAt).toLocaleString() }}</span>
          </div>
          <div class="my-order-items">
            <span v-for="item in order.items" :key="item.id">{{ item.dish.name }} x{{ item.quantity }}</span>
          </div>
          <p v-if="order.note" class="my-order-note">整单备注：{{ order.note }}</p>
          <button
            v-if="menu.event.allowModify && menu.event.status === 'OPEN'"
            class="delete-order-btn"
            :disabled="deletingOrderId === order.id"
            @click="deleteOwnOrder(order)"
          >
            {{ deletingOrderId === order.id ? "撤回中..." : "撤回整单" }}
          </button>
        </article>
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
          <div class="cart-item-main">
            <div class="cart-item-title">
              <strong>{{ item.dish.name }}</strong>
              <span v-if="!isUnlimitedQuantityDish(item.dish) && orderedByDish[item.dish.id]" class="ordered-badge">{{ orderedByDish[item.dish.id] }}已点</span>
              <span v-else>x{{ item.quantity }}</span>
            </div>
            <van-field v-model="item.note" class="cart-field" label="单项备注" placeholder="少辣、不要香菜，可不填" />
          </div>
          <div class="stepper compact">
            <button @click="remove(item.dish); burstConfetti($event)">-</button>
            <strong>{{ item.quantity }}</strong>
            <button :disabled="(!isUnlimitedQuantityDish(item.dish) && Boolean(orderedByDish[item.dish.id])) || (!isUnlimitedQuantityDish(item.dish) && item.quantity >= 1)" @click="add(item.dish); burstConfetti($event)">+</button>
          </div>
        </div>
        <div class="order-fields">
          <van-field
            v-model="guestName"
            class="cart-field"
            label="昵称"
            placeholder="例如：小王"
            required
            clearable
            :error="guestNameMissing"
            error-message="昵称必填"
          />
          <van-field v-model="note" class="cart-field" label="整单备注" placeholder="例如：整体少辣、饮料要冰" />
        </div>
        <van-button block class="submit-order-btn" :loading="submitting" :disabled="!canSubmit" @click="submitOrder">提交点菜</van-button>
      </section>
    </van-popup>
  </main>

  <div v-else class="loading-page">正在加载菜单...</div>
</template>

<style scoped>
.guest-shell {
  min-height: 100vh;
  padding: 18px 16px 92px;
  background:
    radial-gradient(circle at 12% 8%, rgb(33 214 255 / 18%), transparent 28%),
    radial-gradient(circle at 88% 20%, rgb(255 74 222 / 14%), transparent 26%),
    linear-gradient(135deg, #07111f 0%, #101827 48%, #07111f 100%);
  color: #e5f7ff;
}

.guest-shell :deep(.muted) {
  color: #9bb8c8;
}

.guest-shell :deep(.van-cell) {
  background: rgb(255 255 255 / 6%);
  color: #e5f7ff;
}

.guest-shell :deep(.van-field__label),
.guest-shell :deep(.van-field__control),
.guest-shell :deep(.van-field__control::placeholder) {
  color: #b7d8e8;
}

.guest-shell :deep(.van-field__control) {
  font-size: 16px;
}

.guest-shell :deep(.van-field__label) {
  font-size: 14px;
}

.guest-shell :deep(.van-cell::after) {
  border-color: transparent;
}

.guest-shell :deep(.status-pill) {
  background: rgb(67 232 255 / 12%);
  color: #43e8ff;
  box-shadow: inset 0 0 0 1px rgb(67 232 255 / 12%);
}

.event-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin: 0 auto 14px;
  max-width: 980px;
  padding: 18px;
  border: 0;
  border-left: 3px solid #43e8ff;
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgb(67 232 255 / 14%), transparent 34%),
    linear-gradient(180deg, rgb(255 255 255 / 9%), rgb(255 255 255 / 4%));
  box-shadow: 0 18px 48px rgb(0 0 0 / 32%), inset 0 1px 0 rgb(255 255 255 / 10%);
  backdrop-filter: blur(10px);
}

.eyebrow {
  margin: 0 0 8px;
  color: #43e8ff;
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
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
  color: #f8fbff;
  text-shadow: 0 0 18px rgb(67 232 255 / 34%);
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
  border: 0;
  border-radius: 8px;
  background: rgb(255 255 255 / 7%);
  color: #b7d8e8;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 6%);
}

.category-rail button.active {
  background: linear-gradient(135deg, rgb(26 214 255 / 34%), rgb(157 92 255 / 28%));
  color: #f8fbff;
  font-weight: 700;
  box-shadow: 0 0 18px rgb(67 232 255 / 22%), inset 0 0 0 1px rgb(67 232 255 / 18%);
}

.dish-list {
  display: grid;
  gap: 12px;
}

.dish-list h2 {
  padding: 14px 2px 2px;
  font-size: 18px;
  color: #f8fbff;
  position: relative;
}

.dish-list h2::after {
  content: "";
  display: block;
  width: 42px;
  height: 2px;
  margin-top: 8px;
  border-radius: 999px;
  background: linear-gradient(90deg, #43e8ff, transparent);
}

.category-anchor {
  scroll-margin-top: 12px;
}

.dish-row {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr) 124px;
  gap: 12px;
  align-items: center;
  min-height: 112px;
  padding: 11px;
  border: 0;
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgb(255 255 255 / 9%), rgb(255 255 255 / 4%)),
    rgb(11 22 38 / 84%);
  box-shadow: 0 14px 34px rgb(0 0 0 / 22%), inset 0 1px 0 rgb(255 255 255 / 7%);
}

.dish-row img {
  width: 84px;
  height: 84px;
  border-radius: 8px;
  object-fit: cover;
  background: #122033;
  border: 0;
  box-shadow: 0 0 0 1px rgb(255 255 255 / 10%), 0 10px 20px rgb(0 0 0 / 24%);
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
  color: #f8fbff;
}

.dish-title span,
.tag-list span {
  color: #9bb8c8;
  font-size: 12px;
}

.dish-info p {
  margin-top: 6px;
  color: #a8c5d4;
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
  background: rgb(67 232 255 / 10%);
  border: 0;
}

.dish-action {
  display: grid;
  justify-items: end;
  gap: 7px;
}

.ordered-badge {
  max-width: 116px;
  padding: 4px 8px;
  border: 0;
  border-radius: 999px;
  color: #ffe7fb;
  font-size: 12px;
  line-height: 1.25;
  text-align: center;
  background: linear-gradient(135deg, rgb(255 74 222 / 18%), rgb(67 232 255 / 12%));
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 10%), 0 0 16px rgb(255 74 222 / 16%);
  overflow-wrap: anywhere;
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
  background: linear-gradient(135deg, #43e8ff, #9d5cff);
  color: #07111f;
  font-size: 18px;
  line-height: 1;
  box-shadow: 0 0 16px rgb(67 232 255 / 28%);
  cursor: pointer;
  transform: translateZ(0);
  transition: transform 0.16s ease, box-shadow 0.16s ease, filter 0.16s ease;
}

.stepper button:hover {
  box-shadow: 0 0 22px rgb(67 232 255 / 42%), 0 0 30px rgb(157 92 255 / 24%);
  filter: brightness(1.08);
}

.stepper button:disabled {
  cursor: not-allowed;
  opacity: 0.35;
  filter: grayscale(0.55);
  box-shadow: none;
}

.stepper button:disabled:hover {
  box-shadow: none;
  filter: grayscale(0.55);
}

.stepper button:active {
  transform: scale(0.86);
  box-shadow: 0 0 10px rgb(67 232 255 / 34%);
}

.stepper strong {
  text-align: center;
  color: #f8fbff;
  transition: transform 0.16s ease, color 0.16s ease;
}

.stepper:active strong {
  color: #43e8ff;
  transform: scale(1.12);
}

@media (hover: none) {
  .stepper button:hover {
    box-shadow: 0 0 16px rgb(67 232 255 / 28%);
    filter: none;
  }
}

.summary-band {
  padding: 16px;
  border: 0;
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgb(157 92 255 / 12%), transparent),
    rgb(7 17 31 / 70%);
  box-shadow: 0 16px 38px rgb(0 0 0 / 24%);
}

.my-orders-band {
  background:
    linear-gradient(180deg, rgb(67 232 255 / 10%), transparent),
    rgb(7 17 31 / 70%);
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
  background: rgb(255 255 255 / 6%);
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
  background: rgb(67 232 255 / 10%);
  color: #b7d8e8;
  font-size: 12px;
}

.my-order-row {
  gap: 10px;
}

.my-order-items {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.my-order-items span {
  padding: 4px 8px;
  border-radius: 999px;
  background: rgb(255 255 255 / 8%);
  color: #d8f4ff;
  font-size: 12px;
}

.my-order-note {
  color: #9bb8c8;
  font-size: 13px;
  line-height: 1.45;
}

.delete-order-btn {
  justify-self: start;
  min-height: 36px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(135deg, rgb(255 74 222 / 88%), rgb(157 92 255 / 92%));
  color: #f8fbff;
  font-weight: 700;
  box-shadow: 0 12px 28px rgb(255 74 222 / 16%);
}

.delete-order-btn:disabled {
  opacity: 0.5;
  box-shadow: none;
}

.cart-fab {
  position: fixed;
  right: 16px;
  bottom: calc(18px + env(safe-area-inset-bottom));
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding: 0 18px;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(135deg, #43e8ff, #9d5cff);
  color: #07111f;
  font-weight: 800;
  box-shadow: 0 12px 32px rgb(67 232 255 / 26%);
}

.cart-panel {
  padding: 20px 16px calc(26px + env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at 20% 0%, rgb(67 232 255 / 12%), transparent 32%),
    linear-gradient(180deg, #0b1626, #08111f);
  color: #e5f7ff;
}

.cart-panel h2 {
  margin-bottom: 14px;
  color: #f8fbff;
  text-shadow: 0 0 16px rgb(67 232 255 / 30%);
}

.cart-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 86px;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
  padding: 12px;
  border: 0;
  border-radius: 8px;
  background: linear-gradient(135deg, rgb(255 255 255 / 9%), rgb(255 255 255 / 4%));
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 7%);
}

.cart-item-main {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.cart-item-title {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.cart-item-title strong {
  color: #f8fbff;
  font-size: 16px;
}

.cart-item-title span {
  flex: 0 0 auto;
  padding: 3px 8px;
  border: 1px solid rgb(67 232 255 / 20%);
  border-radius: 999px;
  color: #43e8ff;
  font-size: 12px;
}

.cart-item-title .ordered-badge {
  max-width: 128px;
  border: 0;
  color: #ffe7fb;
}

.cart-field {
  overflow: hidden;
  border: 0;
  border-radius: 8px;
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 8%);
}

.order-fields {
  display: grid;
  gap: 10px;
  margin: 14px 0;
}

.submit-order-btn {
  height: 46px;
  border: 0;
  border-radius: 8px;
  background: linear-gradient(135deg, #43e8ff, #9d5cff);
  color: #07111f;
  font-weight: 800;
  letter-spacing: 0;
  box-shadow: 0 12px 30px rgb(67 232 255 / 24%);
}

.submit-order-btn::before {
  display: none;
}

.submit-order-btn.van-button--disabled {
  opacity: 0.45;
  filter: grayscale(0.45);
  box-shadow: none;
}

.submit-order-btn :deep(.van-button__text) {
  color: #07111f;
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
    padding: 14px 10px calc(96px + env(safe-area-inset-bottom));
  }

  .event-head {
    gap: 10px;
    margin-bottom: 12px;
  }

  h1 {
    font-size: 24px;
  }

  .eyebrow {
    font-size: 12px;
  }

  .menu-layout {
    grid-template-columns: 82px minmax(0, 1fr);
    gap: 8px;
  }

  .category-rail button {
    min-height: 44px;
    padding: 0 6px;
    font-size: 14px;
  }

  .dish-list h2 {
    font-size: 17px;
  }

  .dish-row {
    grid-template-columns: 78px minmax(0, 1fr);
    gap: 10px;
    padding: 10px;
  }

  .dish-row img {
    width: 78px;
    height: 78px;
  }

  .dish-title h3 {
    font-size: 16px;
    line-height: 1.25;
  }

  .dish-info p {
    font-size: 13px;
  }

  .dish-action {
    grid-column: 2;
    justify-self: end;
  }

  .ordered-badge {
    max-width: min(150px, 44vw);
  }

  .cart-fab {
    right: 12px;
    min-height: 50px;
    padding: 0 18px;
    font-size: 15px;
  }

  .cart-item {
    grid-template-columns: 1fr;
  }

  .compact {
    justify-self: end;
  }
}
</style>

<style>
html {
  scrollbar-width: thin;
  scrollbar-color: #43e8ff #07111f;
}

html::-webkit-scrollbar,
.cart-panel::-webkit-scrollbar {
  width: 10px;
}

html::-webkit-scrollbar-track,
.cart-panel::-webkit-scrollbar-track {
  background: #07111f;
}

html::-webkit-scrollbar-thumb,
.cart-panel::-webkit-scrollbar-thumb {
  border: 2px solid #07111f;
  border-radius: 999px;
  background: linear-gradient(180deg, #43e8ff, #9d5cff);
  box-shadow: 0 0 12px rgb(67 232 255 / 36%);
}

html::-webkit-scrollbar-thumb:hover,
.cart-panel::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, #7cffc4, #43e8ff);
}

.confetti-piece {
  position: fixed;
  z-index: 4000;
  pointer-events: none;
  border-radius: 2px;
  box-shadow: 0 0 10px currentColor;
  transform: translate(-50%, -50%) rotate(0deg);
  animation: confetti-burst 680ms cubic-bezier(0.15, 0.8, 0.25, 1) forwards;
}

@keyframes confetti-burst {
  0% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(0.8) rotate(0deg);
  }

  70% {
    opacity: 1;
  }

  100% {
    opacity: 0;
    transform: translate(calc(-50% + var(--x)), calc(-50% + var(--y) + 18px)) scale(0.35) rotate(var(--r));
  }
}
</style>
