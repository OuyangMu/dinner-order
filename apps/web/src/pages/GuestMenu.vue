<script setup lang="ts">
import { ShoppingCart, ClipboardList, ChevronRight } from "lucide-vue-next";
import { showFailToast, showImagePreview, showSuccessToast } from "vant";
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { request, type Dish, type MenuPayload, type Order, type SummaryItem } from "../api";
import { canDecreaseDishQuantity } from "../guest-menu-stepper";
import { getDishTopRankMap } from "../guest-menu-top-rank";

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
const categoryRail = ref<HTMLElement | null>(null);
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
const dishTopRankMap = computed(() => (menu.value ? getDishTopRankMap(menu.value.dishes) : {}));

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
  const colors = ["#dbeafe", "#c4b5fd", "#bfdbfe", "#f8fafc", "#cbd5e1"];

  for (let index = 0; index < 10; index += 1) {
    const piece = document.createElement("span");
    const angle = Math.random() * Math.PI * 2;
    const distance = 14 + Math.random() * 22;
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance - 6;
    const size = 3 + Math.random() * 3;

    piece.className = "confetti-piece";
    piece.style.left = `${originX}px`;
    piece.style.top = `${originY}px`;
    piece.style.width = `${size}px`;
    piece.style.height = `${size * 1.5}px`;
    piece.style.background = colors[index % colors.length];
    piece.style.setProperty("--x", `${x}px`);
    piece.style.setProperty("--y", `${y}px`);
    piece.style.setProperty("--r", `${Math.random() * 160 - 80}deg`);

    document.body.appendChild(piece);
    window.setTimeout(() => piece.remove(), 620);
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
  }, 420);
}

function syncActiveCategoryOnScroll() {
  if (scrollLockTimer || !menu.value?.categories.length) return;
  const scrollBottom = window.scrollY + window.innerHeight;
  const documentBottom = document.documentElement.scrollHeight;
  if (documentBottom - scrollBottom <= 24) {
    activeCategory.value = menu.value.categories.at(-1)?.id || activeCategory.value;
    return;
  }

  const anchors = menu.value.categories
    .map((category) => ({
      id: category.id,
      top: document.getElementById(categoryAnchorId(category.id))?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY
    }))
    .filter((item) => Number.isFinite(item.top));

  const current =
    anchors.filter((item) => item.top <= 130).sort((a, b) => b.top - a.top)[0] ||
    anchors.sort((a, b) => a.top - b.top)[0];

  if (current) activeCategory.value = current.id;
}

function scrollActiveCategoryIntoView(categoryId: string) {
  const rail = categoryRail.value;
  if (!rail) return;

  const activeButton = rail.querySelector<HTMLElement>(`button[data-category-id="${categoryId}"]`);
  if (!activeButton) return;

  const railRect = rail.getBoundingClientRect();
  const buttonRect = activeButton.getBoundingClientRect();
  const railHasHorizontalOverflow = rail.scrollWidth > rail.clientWidth + 4;
  if (!railHasHorizontalOverflow) return;

  const nextScrollLeft =
    rail.scrollLeft + (buttonRect.left - railRect.left) - railRect.width / 2 + buttonRect.width / 2;

  rail.scrollTo({
    left: Math.max(0, nextScrollLeft),
    behavior: "smooth"
  });
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

watch(activeCategory, (categoryId) => {
  if (!categoryId) return;
  requestAnimationFrame(() => scrollActiveCategoryIntoView(categoryId));
});

onBeforeUnmount(() => {
  window.removeEventListener("scroll", syncActiveCategoryOnScroll);
  window.clearTimeout(scrollLockTimer);
  if (showCart.value) unlockPageScroll();
});
</script>

<template>
  <main v-if="!loading && menu" class="guest-shell">
    <section class="event-head">
      <div class="hero-copy">
        <p class="eyebrow">小欧饭堂</p>
        <h1>{{ menu.event.title }}</h1>
        <p class="muted">{{ menu.event.description || "选好想吃的，主人会在后台汇总备菜。" }}</p>
      </div>
      <span class="status-pill">{{ menu.event.status === "OPEN" ? "开放点菜" : "已关闭" }}</span>
    </section>

    <div class="content-layout">
      <aside ref="categoryRail" class="category-rail" aria-label="菜品分类">
        <button
          v-for="group in groupedDishes"
          :key="group.category.id"
          :data-category-id="group.category.id"
          :class="{ active: activeCategory === group.category.id }"
          @click="scrollToCategory(group.category.id)"
        >
          <span>{{ group.category.name }}</span>
        </button>
      </aside>

      <div class="content-main">
        <section class="dish-list">
          <template v-for="group in groupedDishes" :key="group.category.id">
            <h2 :id="categoryAnchorId(group.category.id)" class="category-anchor">{{ group.category.name }}</h2>
            <article v-for="dish in group.dishes" :key="dish.id" class="dish-row">
              <span v-if="dishTopRankMap[dish.id]" class="top-rank-badge">TOP {{ dishTopRankMap[dish.id] }}</span>
              <button
                v-if="dish.imageUrl"
                type="button"
                class="dish-image image-button"
                :aria-label="`查看${dish.name}大图`"
                @click="previewDishImage(dish)"
              >
                <img :src="dish.imageUrl" :alt="dish.name" />
              </button>
              <div v-else class="dish-image dish-image-placeholder" aria-hidden="true"></div>

              <div class="dish-info">
                <div class="dish-title">
                  <button
                    v-if="dish.imageUrl"
                    type="button"
                    class="dish-name preview-link"
                    @click="previewDishImage(dish)"
                  >
                    {{ dish.name }}
                  </button>
                  <h3 v-else class="dish-name">{{ dish.name }}</h3>
                  <span v-if="dish.servingHint" class="serving-hint">{{ dish.servingHint }}</span>
                </div>
                <p class="dish-description">{{ dish.description }}</p>
                <div v-if="dish.tags.length" class="tag-list">
                  <span v-for="tag in dish.tags" :key="tag">{{ tag }}</span>
                </div>
              </div>

              <div class="dish-action">
                <span v-if="!isUnlimitedQuantityDish(dish) && orderedByDish[dish.id]" class="ordered-badge">{{ orderedByDish[dish.id] }}已点</span>
                <div class="stepper">
                  <button
                    :disabled="!canDecreaseDishQuantity(cart[dish.id]?.quantity || 0)"
                    aria-label="减少"
                    @click="remove(dish); burstConfetti($event)"
                  >
                    -
                  </button>
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

        <section v-if="summary.length" class="summary-band">
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

        <section v-if="myOrders.length" class="summary-band my-orders-band">
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
      </div>
    </div>

    <button class="cart-fab" @click="showCart = true">
      <span class="cart-fab-meta">已选 {{ cartCount }} 件</span>
      <span class="cart-fab-action">
        去结算
        <ChevronRight :size="16" />
      </span>
    </button>

    <van-popup v-model:show="showCart" position="bottom" round>
      <section class="cart-panel">
        <div class="cart-panel-head">
          <h2>确认点菜</h2>
          <span>{{ cartCount }} 件</span>
        </div>
        <div v-if="!cartItems.length" class="empty">还没有选择菜品</div>
        <div v-for="item in cartItems" :key="item.dish.id" class="cart-item">
          <div class="cart-item-main">
            <div class="cart-item-title">
              <strong>{{ item.dish.name }}</strong>
              <span v-if="!isUnlimitedQuantityDish(item.dish) && orderedByDish[item.dish.id]" class="ordered-badge">{{ orderedByDish[item.dish.id] }}已点</span>
              <span v-else>x{{ item.quantity }}</span>
            </div>
            <van-field v-model="item.note" class="cart-field" label="单项备注" placeholder="少辣、不放香菜，可不填" />
          </div>
          <div class="stepper compact">
            <button :disabled="!canDecreaseDishQuantity(item.quantity)" @click="remove(item.dish); burstConfetti($event)">-</button>
            <strong>{{ item.quantity }}</strong>
            <button :disabled="(!isUnlimitedQuantityDish(item.dish) && Boolean(orderedByDish[item.dish.id])) || (!isUnlimitedQuantityDish(item.dish) && item.quantity >= 1)" @click="add(item.dish); burstConfetti($event)">+</button>
          </div>
        </div>
        <div class="order-fields">
          <van-field
            v-model="guestName"
            class="cart-field"
            label="昵称"
            placeholder="例如：小欧"
            required
            clearable
            :error="guestNameMissing"
            error-message="昵称必填"
          />
          <van-field v-model="note" class="cart-field" label="整单备注" placeholder="例如：整体少辣、饮料要冰" />
        </div>
        <van-button block class="submit-order-btn" :loading="submitting" :disabled="!canSubmit" @click="submitOrder">
          提交点菜
        </van-button>
      </section>
    </van-popup>
  </main>

  <div v-else class="loading-page">正在加载菜单...</div>
</template>

<style scoped>
:global(:root) {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", sans-serif;
}

.guest-shell {
  --glass-bg: rgb(255 255 255 / 6%);
  --glass-border: rgb(255 255 255 / 8%);
  --text-main: rgb(255 255 255 / 94%);
  --text-subtle: rgb(255 255 255 / 58%);
  --text-soft: rgb(255 255 255 / 42%);
  --indicator: #60a5fa;
  --ease-apple: cubic-bezier(0.2, 0.8, 0.2, 1);
  min-height: 100vh;
  padding: 24px 18px 124px;
  background: radial-gradient(circle at top, #111827, #0b0f14 60%);
  color: var(--text-main);
}

.guest-shell :deep(.muted) {
  color: var(--text-subtle);
}

.guest-shell :deep(.van-overlay) {
  backdrop-filter: blur(8px);
}

.guest-shell :deep(.van-popup) {
  background: transparent;
}

.guest-shell :deep(.van-cell) {
  background: rgb(255 255 255 / 4%);
  color: var(--text-main);
}

.guest-shell :deep(.van-field__label),
.guest-shell :deep(.van-field__control),
.guest-shell :deep(.van-field__control::placeholder) {
  color: var(--text-subtle);
}

.guest-shell :deep(.van-field__control) {
  font-size: 16px;
}

.guest-shell :deep(.van-cell::after) {
  border-color: transparent;
}

.event-head,
.dish-row,
.summary-band,
.cart-panel {
  background: rgb(255 255 255 / 6%);
  backdrop-filter: blur(20px);
  border: 1px solid rgb(255 255 255 / 8%);
  box-shadow: 0 8px 24px rgb(0 0 0 / 25%);
}

.event-head {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  align-items: flex-start;
  max-width: 1100px;
  margin: 0 auto 20px;
  padding: 22px 22px 20px;
  border-radius: 24px;
}

.hero-copy {
  min-width: 0;
}

.eyebrow {
  margin: 0 0 10px;
  color: rgb(255 255 255 / 46%);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

h1,
h2,
h3,
p {
  margin: 0;
}

h1 {
  font-size: clamp(30px, 4vw, 42px);
  font-weight: 600;
  line-height: 1.08;
  letter-spacing: 0;
}

.event-head .muted {
  margin-top: 10px;
  max-width: 34rem;
  font-size: 14px;
  line-height: 1.6;
}

.status-pill {
  flex: 0 0 auto;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  color: rgb(255 255 255 / 72%);
  background: rgb(255 255 255 / 5%);
  border: 1px solid rgb(255 255 255 / 7%);
}

.content-layout {
  max-width: 1100px;
  margin: 0 auto 18px;
}

.content-layout {
  display: grid;
  grid-template-columns: 104px minmax(0, 1fr);
  gap: 24px;
}

.content-main {
  min-width: 0;
  display: grid;
  gap: 18px;
}

.category-rail {
  position: sticky;
  top: 18px;
  align-self: start;
  display: grid;
  gap: 6px;
  padding: 10px 8px;
  border-radius: 18px;
  background: rgb(255 255 255 / 4%);
  backdrop-filter: blur(18px);
  border: 1px solid rgb(255 255 255 / 6%);
  box-shadow: 0 8px 24px rgb(0 0 0 / 18%);
  z-index: 40;
  isolation: isolate;
  scrollbar-width: thin;
  scrollbar-color: rgb(255 255 255 / 18%) transparent;
}

.category-rail::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.category-rail::-webkit-scrollbar-track {
  background: transparent;
}

.category-rail::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: linear-gradient(90deg, rgb(255 255 255 / 10%), rgb(255 255 255 / 20%));
}

.category-rail::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(90deg, rgb(255 255 255 / 14%), rgb(255 255 255 / 28%));
}

.category-rail button {
  position: relative;
  min-height: 36px;
  padding: 0 12px 0 16px;
  border: 0;
  background: transparent;
  color: rgb(255 255 255 / 60%);
  text-align: left;
  opacity: 0.6;
  transition: all 0.2s var(--ease-apple);
}

.category-rail button::before {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  width: 2px;
  height: 16px;
  border-radius: 999px;
  background: transparent;
  transform: translateY(-50%);
  transition: all 0.2s var(--ease-apple);
}

.category-rail button:hover {
  opacity: 0.86;
  color: rgb(255 255 255 / 84%);
}

.category-rail button.active {
  opacity: 1;
  color: #fff;
  font-weight: 500;
  background: rgb(255 255 255 / 6%);
  border-radius: 12px;
}

.category-rail button.active::before {
  width: 3px;
  height: 18px;
  background: linear-gradient(180deg, rgb(147 197 253 / 88%), rgb(96 165 250 / 56%));
  box-shadow: 0 0 10px rgb(96 165 250 / 22%);
}

.dish-list {
  display: grid;
  gap: 14px;
}

.category-anchor {
  padding: 8px 0 2px;
  color: rgb(255 255 255 / 90%);
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0;
  scroll-margin-top: 20px;
}

.dish-row {
  position: relative;
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr) 116px;
  gap: 16px;
  align-items: center;
  min-height: 120px;
  padding: 14px;
  border-radius: 16px;
  transition: all 0.2s var(--ease-apple);
}

.dish-row:hover {
  transform: translateY(-1px);
  background: rgb(255 255 255 / 7%);
}

.top-rank-badge {
  position: absolute;
  top: 10px;
  right: 12px;
  z-index: 1;
  padding: 5px 9px;
  border-radius: 999px;
  background: linear-gradient(135deg, rgb(96 165 250 / 18%), rgb(255 255 255 / 7%));
  border: 1px solid rgb(96 165 250 / 18%);
  color: rgb(191 219 254 / 92%);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  backdrop-filter: blur(14px);
  box-shadow: 0 8px 18px rgb(0 0 0 / 18%);
}

.dish-image {
  width: 92px;
  height: 92px;
  border-radius: 14px;
  overflow: hidden;
  border: 0;
  padding: 0;
  background: linear-gradient(135deg, #1e293b, #334155);
}

.dish-image img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-button {
  cursor: pointer;
  transition: transform 0.2s var(--ease-apple), opacity 0.2s var(--ease-apple);
}

.image-button:active {
  transform: scale(0.98);
}

.dish-image-placeholder {
  position: relative;
}

.dish-image-placeholder::after {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 6%), transparent),
    linear-gradient(135deg, rgb(255 255 255 / 6%), transparent 55%);
}

.dish-info {
  min-width: 0;
}

.dish-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.dish-name {
  border: 0;
  padding: 0;
  background: transparent;
  color: rgb(255 255 255 / 92%);
  font-size: 17px;
  font-weight: 600;
  text-align: left;
  letter-spacing: 0;
}

.preview-link {
  cursor: pointer;
}

.serving-hint {
  color: var(--text-soft);
  font-size: 12px;
}

.dish-description {
  margin-top: 8px;
  color: var(--text-subtle);
  font-size: 13px;
  line-height: 1.55;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.tag-list span {
  padding: 4px 8px;
  border-radius: 6px;
  background: rgb(255 255 255 / 8%);
  color: rgb(255 255 255 / 65%);
  font-size: 11px;
}

.dish-action {
  display: grid;
  justify-items: end;
  gap: 10px;
}

.ordered-badge {
  max-width: 110px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgb(255 255 255 / 7%);
  color: rgb(255 255 255 / 60%);
  font-size: 11px;
  line-height: 1.35;
  text-align: center;
  overflow-wrap: anywhere;
}

.stepper {
  display: grid;
  grid-template-columns: 32px 34px 32px;
  align-items: center;
  gap: 6px;
}

.stepper button {
  width: 32px;
  height: 32px;
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 999px;
  background: rgb(255 255 255 / 8%);
  color: rgb(255 255 255 / 76%);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.2s var(--ease-apple);
}

.stepper button:hover {
  background: rgb(255 255 255 / 15%);
  transform: scale(1.05);
}

.stepper button:active {
  transform: scale(0.98);
}

.stepper button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
  transform: none;
}

.stepper strong {
  text-align: center;
  color: rgb(255 255 255 / 86%);
  font-size: 15px;
  font-weight: 600;
}

.summary-band {
  padding: 18px;
  border-radius: 20px;
}

.band-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  color: rgb(255 255 255 / 84%);
}

.band-title h2 {
  font-size: 16px;
  font-weight: 600;
}

.summary-list {
  display: grid;
  gap: 10px;
}

.summary-row {
  display: grid;
  gap: 8px;
  padding: 12px 0;
  border-bottom: 1px solid rgb(255 255 255 / 7%);
}

.summary-row:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.summary-main {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.summary-main strong {
  font-size: 15px;
  font-weight: 600;
}

.summary-main span,
.my-order-note {
  color: var(--text-subtle);
  font-size: 13px;
}

.guest-list,
.my-order-items {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.guest-list span,
.my-order-items span {
  padding: 4px 8px;
  border-radius: 999px;
  background: rgb(255 255 255 / 6%);
  color: rgb(255 255 255 / 66%);
  font-size: 11px;
}

.delete-order-btn {
  justify-self: start;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 999px;
  background: rgb(255 255 255 / 7%);
  color: rgb(255 255 255 / 76%);
  transition: all 0.2s var(--ease-apple);
}

.delete-order-btn:hover {
  background: rgb(255 255 255 / 13%);
}

.delete-order-btn:disabled {
  opacity: 0.45;
}

.cart-fab {
  position: fixed;
  left: 50%;
  bottom: calc(20px + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  width: min(92%, 760px);
  min-height: 62px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 0 18px;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 16px;
  background: rgb(20 20 20 / 60%);
  backdrop-filter: blur(20px);
  color: rgb(255 255 255 / 88%);
  box-shadow: 0 8px 24px rgb(0 0 0 / 25%);
  transition: all 0.2s var(--ease-apple);
}

.cart-fab:hover {
  transform: translateX(-50%) scale(1.01);
}

.cart-fab:active {
  transform: translateX(-50%) scale(0.99);
}

.cart-fab-meta {
  color: rgb(255 255 255 / 62%);
  font-size: 14px;
}

.cart-fab-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  font-weight: 600;
}

.cart-panel {
  padding: 22px 16px calc(28px + env(safe-area-inset-bottom));
  border-radius: 24px 24px 0 0;
}

.cart-panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.cart-panel-head h2 {
  font-size: 18px;
  font-weight: 600;
}

.cart-panel-head span {
  color: var(--text-subtle);
  font-size: 13px;
}

.cart-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 96px;
  gap: 14px;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid rgb(255 255 255 / 7%);
}

.cart-item:last-of-type {
  border-bottom: 0;
}

.cart-item-main {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.cart-item-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.cart-item-title strong {
  font-size: 16px;
  font-weight: 600;
}

.cart-item-title span {
  color: var(--text-subtle);
  font-size: 12px;
}

.cart-item-title .ordered-badge {
  color: rgb(255 255 255 / 64%);
}

.cart-field {
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 14px;
  background: rgb(255 255 255 / 4%);
}

.order-fields {
  display: grid;
  gap: 12px;
  margin: 18px 0 0;
}

.submit-order-btn {
  height: 48px;
  margin-top: 16px;
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 14px;
  background: rgb(255 255 255 / 10%);
  color: rgb(255 255 255 / 88%);
  font-weight: 600;
  transition: all 0.2s var(--ease-apple);
}

.submit-order-btn::before {
  display: none;
}

.submit-order-btn:hover {
  background: rgb(255 255 255 / 15%);
}

.submit-order-btn.van-button--disabled {
  opacity: 0.42;
}

.submit-order-btn :deep(.van-button__text) {
  color: rgb(255 255 255 / 88%);
}

.compact {
  justify-self: end;
}

.empty,
.loading-page {
  display: grid;
  place-items: center;
  min-height: 160px;
  color: var(--text-soft);
  text-align: center;
}

.loading-page {
  min-height: 100vh;
  background: radial-gradient(circle at top, #111827, #0b0f14 60%);
}

:global(.confetti-piece) {
  position: fixed;
  z-index: 9999;
  border-radius: 999px;
  pointer-events: none;
  transform: translate3d(0, 0, 0) rotate(0deg);
  animation: confetti-burst 620ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}

@keyframes confetti-burst {
  to {
    opacity: 0;
    transform: translate3d(var(--x), var(--y), 0) rotate(var(--r));
  }
}

@media (max-width: 900px) {
  .content-layout {
    grid-template-columns: 1fr;
    gap: 18px;
  }

  .category-rail {
    position: sticky;
    top: 10px;
    display: flex;
    gap: 12px;
    overflow-x: auto;
    padding: 8px 8px 10px;
    background:
      linear-gradient(180deg, rgb(11 15 20 / 94%), rgb(11 15 20 / 72%));
    z-index: 40;
  }

  .category-rail button {
    flex: 0 0 auto;
    padding: 0 14px 0 16px;
  }
}

@media (max-width: 720px) {
  .guest-shell {
    padding: 16px 14px 120px;
  }

  .event-head {
    flex-direction: column;
    padding: 18px;
    border-radius: 20px;
  }

  .dish-row {
    grid-template-columns: 72px minmax(0, 1fr);
    align-items: start;
  }

  .dish-image {
    width: 72px;
    height: 72px;
    border-radius: 12px;
  }

  .dish-action {
    grid-column: 1 / -1;
    justify-items: end;
    width: 100%;
    margin-top: 2px;
  }

  .cart-item {
    grid-template-columns: 1fr;
  }

  .compact {
    justify-self: start;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dish-row,
  .category-rail button,
  .cart-fab,
  .stepper button,
  .submit-order-btn,
  .delete-order-btn,
  .image-button {
    transition: none;
  }
}
</style>
