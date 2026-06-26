<script setup lang="ts">
import { CalendarPlus, ChefHat, ClipboardList, KeyRound, LayoutDashboard, LogIn, LogOut, QrCode, RefreshCw, Soup } from "lucide-vue-next";
import { ElMessage, ElMessageBox } from "element-plus";
import { computed, onMounted, reactive, ref } from "vue";
import { shouldApplyUploadResult } from "../admin-home-image-upload";
import { request, type Category, type Dish, type EventInfo, type IngredientSummaryItem, type Order, type PrepItem, type SummaryItem } from "../api";

const adminToken = ref(localStorage.getItem("adminToken") || "");
const isAuthed = computed(() => Boolean(adminToken.value));
const loginForm = reactive({ username: "admin", password: "admin123456" });
const loginLoading = ref(false);
const events = ref<EventInfo[]>([]);
const categories = ref<Category[]>([]);
const dishes = ref<Dish[]>([]);
const orders = ref<Order[]>([]);
const summary = ref<SummaryItem[]>([]);
const ingredientSummary = ref<IngredientSummaryItem[]>([]);
const qrcode = ref<{ url: string; dataUrl: string } | null>(null);
const activeEventDishIds = ref<Set<string>>(new Set());
const activeEventId = ref("");
const activeTab = ref("dashboard");
const dishDialog = ref(false);
const eventDialog = ref(false);
const passwordDialog = ref(false);
const passwordSaving = ref(false);
const editingDishId = ref("");
const editingEventId = ref("");
const copyTargetEventId = ref("");
const imageInput = ref<HTMLInputElement | null>(null);
const imageUploading = ref(false);
const dishImageSessionId = ref(0);
const dishForm = reactive({
  name: "",
  categoryId: "",
  imageUrl: "",
  description: "",
  tagsText: "",
  prepItems: [] as PrepItem[],
  servingHint: "",
  enabled: true,
  sortOrder: 0
});
const eventForm = reactive({
  title: "",
  description: "",
  dateTime: "",
  status: "OPEN" as EventInfo["status"],
  accessCode: "",
  allowModify: true,
  showSummary: true,
  copyFromEventId: ""
});
const passwordForm = reactive({
  oldPassword: "",
  newPassword: "",
  confirmPassword: ""
});

const activeEvent = computed(() => events.value.find((event) => event.id === activeEventId.value));
const topOrderedDishes = computed(() =>
  dishes.value
    .filter((dish) => !["主食", "饮品"].includes(dish.category?.name || "") && dish.orderCount > 0)
    .sort((a, b) => b.orderCount - a.orderCount || a.name.localeCompare(b.name, "zh-CN"))
    .slice(0, 3)
);
const qrcodeOrigin = computed(() => {
  if (import.meta.env.VITE_PUBLIC_ORIGIN) return import.meta.env.VITE_PUBLIC_ORIGIN;
  if (["localhost", "127.0.0.1"].includes(location.hostname)) {
    return `${location.protocol}//192.168.3.69:${location.port || "5173"}`;
  }
  return location.origin;
});

async function login() {
  loginLoading.value = true;
  try {
    const result = await request<{ token: string }>("/api/admin/login", {
      method: "POST",
      body: JSON.stringify(loginForm)
    });
    localStorage.setItem("adminToken", result.token);
    adminToken.value = result.token;
    ElMessage.success("登录成功");
    await loadAdmin();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "登录失败");
  } finally {
    loginLoading.value = false;
  }
}

async function loadAdmin() {
  if (!isAuthed.value) return;
  [events.value, categories.value, dishes.value] = await Promise.all([
    request<EventInfo[]>("/api/admin/events"),
    request<Category[]>("/api/admin/categories"),
    request<Dish[]>("/api/admin/dishes")
  ]);
  activeEventId.value ||= events.value[0]?.id || "";
  await loadEventData();
}

async function loadEventData() {
  if (!activeEventId.value) return;
  const [eventDishes, eventOrders, eventSummary, eventIngredients, eventQrcode] = await Promise.all([
    request<Array<{ dishId: string }>>(`/api/admin/events/${activeEventId.value}/dishes`),
    request<Order[]>(`/api/admin/events/${activeEventId.value}/orders`),
    request<SummaryItem[]>(`/api/admin/events/${activeEventId.value}/summary`),
    request<IngredientSummaryItem[]>(`/api/admin/events/${activeEventId.value}/ingredients`),
    request<{ url: string; dataUrl: string }>(
      `/api/admin/events/${activeEventId.value}/qrcode?origin=${encodeURIComponent(qrcodeOrigin.value)}`
    )
  ]);
  activeEventDishIds.value = new Set(eventDishes.map((item) => item.dishId));
  orders.value = eventOrders;
  summary.value = eventSummary;
  ingredientSummary.value = eventIngredients;
  qrcode.value = eventQrcode;
}

function openDish(dish?: Dish) {
  dishImageSessionId.value += 1;
  editingDishId.value = dish?.id || "";
  Object.assign(dishForm, {
    name: dish?.name || "",
    categoryId: dish?.categoryId || categories.value[0]?.id || "",
    imageUrl: dish?.imageUrl || "",
    description: dish?.description || "",
    tagsText: dish?.tags?.join(", ") || "",
    prepItems: dish?.prepItems?.map((item) => ({ ...item })) || [],
    servingHint: dish?.servingHint || "",
    enabled: dish?.enabled ?? true,
    sortOrder: dish?.sortOrder ?? dishes.value.length
  });
  dishDialog.value = true;
}

async function saveDish() {
  try {
    await request<Dish>(editingDishId.value ? `/api/admin/dishes/${editingDishId.value}` : "/api/admin/dishes", {
      method: editingDishId.value ? "PUT" : "POST",
      body: JSON.stringify({
        ...dishForm,
        imageUrl: dishForm.imageUrl || null,
        description: dishForm.description || null,
        servingHint: dishForm.servingHint || null,
        tags: dishForm.tagsText
          .split(/[，,]/)
          .map((item) => item.trim())
          .filter(Boolean),
        prepItems: dishForm.prepItems
          .filter((item) => item.name.trim() && Number(item.quantity) > 0)
          .map((item) => ({ name: item.name.trim(), quantity: Number(item.quantity), unit: item.unit.trim() }))
      })
    });
    dishDialog.value = false;
    ElMessage.success(editingDishId.value ? "菜品已更新" : "菜品已保存");
    await loadAdmin();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "保存失败");
  }
}

function eventStatusText(status: EventInfo["status"]) {
  return { DRAFT: "草稿", OPEN: "开放点菜", CLOSED: "已关闭" }[status];
}

function eventStatusType(status: EventInfo["status"]) {
  return status === "OPEN" ? "success" : status === "CLOSED" ? "info" : "warning";
}

function openEvent(event?: EventInfo) {
  editingEventId.value = event?.id || "";
  Object.assign(eventForm, {
    title: event?.title || "",
    description: event?.description || "",
    dateTime: event?.dateTime ? event.dateTime.slice(0, 16) : "",
    status: event?.status || "OPEN",
    accessCode: event?.accessCode || `event-${Date.now().toString(36)}`,
    allowModify: event?.allowModify ?? true,
    showSummary: event?.showSummary ?? true,
    copyFromEventId: ""
  });
  eventDialog.value = true;
}

async function saveEvent() {
  try {
    const saved = await request<EventInfo>(editingEventId.value ? `/api/admin/events/${editingEventId.value}` : "/api/admin/events", {
      method: editingEventId.value ? "PUT" : "POST",
      body: JSON.stringify({
        ...eventForm,
        description: eventForm.description || null,
        dateTime: eventForm.dateTime || null,
        copyFromEventId: !editingEventId.value && eventForm.copyFromEventId ? eventForm.copyFromEventId : null
      })
    });
    eventDialog.value = false;
    ElMessage.success(editingEventId.value ? "活动已更新" : "活动已创建");
    await loadAdmin();
    activeEventId.value = saved.id;
    await loadEventData();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "保存失败");
  }
}

async function updateEventStatus(event: EventInfo, status: EventInfo["status"]) {
  try {
    await request<EventInfo>(`/api/admin/events/${event.id}`, {
      method: "PUT",
      body: JSON.stringify({ status })
    });
    ElMessage.success("状态已更新");
    await loadAdmin();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "更新失败");
  }
}

async function deleteEvent(event: EventInfo) {
  try {
    await ElMessageBox.confirm(`确定删除“${event.title}”吗？该活动的订单也会一并删除。`, "删除活动", {
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      type: "warning"
    });
    await request(`/api/admin/events/${event.id}`, { method: "DELETE" });
    ElMessage.success("活动已删除");
    if (activeEventId.value === event.id) {
      activeEventId.value = "";
    }
    await loadAdmin();
  } catch (error) {
    if (error !== "cancel") {
      ElMessage.error(error instanceof Error ? error.message : "删除失败");
    }
  }
}

function viewEvent(event: EventInfo) {
  activeEventId.value = event.id;
  activeTab.value = "dashboard";
  loadEventData();
}

async function copyMenuToActiveEvent() {
  if (!activeEventId.value || !copyTargetEventId.value) return;
  try {
    const result = await request<{ copied: number }>(`/api/admin/events/${activeEventId.value}/copy-menu`, {
      method: "POST",
      body: JSON.stringify({ fromEventId: copyTargetEventId.value })
    });
    ElMessage.success(`已复制 ${result.copied} 个菜品到当前活动`);
    await loadEventData();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "复制失败");
  }
}

function addPrepItem() {
  dishForm.prepItems.push({ name: "", quantity: 1, unit: "" });
}

function removePrepItem(index: number) {
  dishForm.prepItems.splice(index, 1);
}

function chooseImage() {
  imageInput.value?.click();
}

async function uploadDishImage(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const uploadSessionId = dishImageSessionId.value;

  imageUploading.value = true;
  try {
    const formData = new FormData();
    formData.append("file", file);
    const result = await request<{ url: string }>("/api/admin/uploads/dish-image", {
      method: "POST",
      body: formData
    });
    if (!shouldApplyUploadResult(uploadSessionId, dishImageSessionId.value)) return;
    dishForm.imageUrl = result.url;
    ElMessage.success("图片已上传");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "上传失败");
  } finally {
    imageUploading.value = false;
    input.value = "";
  }
}

async function addDishToEvent(dish: Dish) {
  if (!activeEventId.value) return;
  await request(`/api/admin/events/${activeEventId.value}/dishes/${dish.id}`, { method: "POST" });
  ElMessage.success("已加入当前活动");
  await loadEventData();
}

async function removeDishFromEvent(dish: Dish) {
  if (!activeEventId.value) return;
  try {
    await ElMessageBox.confirm(`确定从当前活动移除“${dish.name}”吗？历史订单不会被删除。`, "移除菜品", {
      confirmButtonText: "移除",
      cancelButtonText: "取消",
      type: "warning"
    });
    await request(`/api/admin/events/${activeEventId.value}/dishes/${dish.id}`, { method: "DELETE" });
    ElMessage.success("已从当前活动移除");
    await loadEventData();
  } catch (error) {
    if (error !== "cancel") {
      ElMessage.error(error instanceof Error ? error.message : "移除失败");
    }
  }
}

async function deleteOrder(order: Order) {
  try {
    await ElMessageBox.confirm(`确定删除“${order.guestName}”的这笔订单吗？`, "删除订单", {
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      type: "warning"
    });
    await request(`/api/admin/orders/${order.id}`, { method: "DELETE" });
    ElMessage.success("订单已删除");
    await loadEventData();
  } catch (error) {
    if (error !== "cancel") {
      ElMessage.error(error instanceof Error ? error.message : "删除失败");
    }
  }
}

async function deleteDish(dish: Dish) {
  try {
    await ElMessageBox.confirm(`确定删除“${dish.name}”吗？如果这道菜仍被未关闭活动的订单引用，将无法删除；仅出现在已关闭活动中的历史订单则允许删除。`, "删除菜品", {
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      type: "warning"
    });
    await request(`/api/admin/dishes/${dish.id}`, { method: "DELETE" });
    ElMessage.success("菜品已删除");
    await loadAdmin();
  } catch (error) {
    if (error !== "cancel") {
      ElMessage.error(error instanceof Error ? error.message : "删除失败");
    }
  }
}

function openPasswordDialog() {
  Object.assign(passwordForm, { oldPassword: "", newPassword: "", confirmPassword: "" });
  passwordDialog.value = true;
}

async function savePassword() {
  if (passwordForm.newPassword.length < 8) {
    ElMessage.error("新密码至少 8 位");
    return;
  }
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    ElMessage.error("两次输入的新密码不一致");
    return;
  }

  passwordSaving.value = true;
  try {
    await request("/api/admin/password", {
      method: "PUT",
      body: JSON.stringify({
        oldPassword: passwordForm.oldPassword,
        newPassword: passwordForm.newPassword
      })
    });
    ElMessage.success("密码已修改，请使用新密码重新登录");
    passwordDialog.value = false;
    logout();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "修改密码失败");
  } finally {
    passwordSaving.value = false;
  }
}

function logout() {
  localStorage.removeItem("adminToken");
  adminToken.value = "";
}

onMounted(loadAdmin);
</script>

<template>
  <main v-if="!isAuthed" class="login-page">
    <section class="login-panel">
      <div class="brand">
        <ChefHat :size="34" />
        <div>
          <h1>聚餐点菜后台</h1>
          <p>管理菜单、活动和备菜汇总</p>
        </div>
      </div>
      <el-form label-position="top">
        <el-form-item label="用户名">
          <el-input v-model="loginForm.username" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="loginForm.password" type="password" show-password @keyup.enter="login" />
        </el-form-item>
        <el-button type="primary" size="large" :loading="loginLoading" @click="login">
          <LogIn :size="18" />
          登录
        </el-button>
      </el-form>
    </section>
  </main>

  <main v-else class="admin-shell">
    <aside class="admin-side">
      <div class="side-title">
        <ChefHat :size="26" />
        <strong>聚餐点菜</strong>
      </div>
      <button :class="{ active: activeTab === 'dashboard' }" @click="activeTab = 'dashboard'">
        <LayoutDashboard :size="16" />
        <span>仪表盘</span>
      </button>
      <button :class="{ active: activeTab === 'events' }" @click="activeTab = 'events'">
        <CalendarPlus :size="16" />
        <span>活动管理</span>
      </button>
      <button :class="{ active: activeTab === 'dishes' }" @click="activeTab = 'dishes'">
        <ChefHat :size="16" />
        <span>菜品管理</span>
      </button>
      <button :class="{ active: activeTab === 'orders' }" @click="activeTab = 'orders'">
        <ClipboardList :size="16" />
        <span>订单列表</span>
      </button>
      <button :class="{ active: activeTab === 'kitchen' }" @click="activeTab = 'kitchen'">
        <Soup :size="16" />
        <span>备菜汇总</span>
      </button>
      <button class="utility" @click="openPasswordDialog">
        <KeyRound :size="15" />
        <span>修改密码</span>
      </button>
      <button class="plain" @click="logout">
        <LogOut :size="15" />
        <span>退出登录</span>
      </button>
    </aside>

    <section class="admin-main">
      <header class="admin-top">
        <div>
          <h1>{{ activeEvent?.title || "后台管理" }}</h1>
          <p class="muted">选择活动后查看二维码、订单和备菜统计。</p>
        </div>
        <div class="top-actions">
          <el-select v-model="activeEventId" placeholder="选择活动" @change="loadEventData">
            <el-option v-for="event in events" :key="event.id" :label="event.title" :value="event.id" />
          </el-select>
          <el-button @click="loadAdmin">
            <RefreshCw :size="16" />
          </el-button>
          <el-button type="primary" @click="openEvent">
            <CalendarPlus :size="16" />
            新建活动
          </el-button>
        </div>
      </header>

      <section v-if="activeTab === 'dashboard'" class="dashboard-grid">
        <article class="metric clickable" @click="activeTab = 'orders'">
          <ClipboardList :size="22" />
          <span>订单数</span>
          <strong>{{ orders.length }}</strong>
        </article>
        <article class="metric">
          <Soup :size="22" />
          <span>已点份数</span>
          <strong>{{ summary.reduce((sum, item) => sum + item.quantity, 0) }}</strong>
        </article>
        <article class="tool-section top-dishes-panel">
          <div class="band-title">
            <ChefHat :size="18" />
            <h2>热门菜品 Top 3</h2>
          </div>
          <div v-if="topOrderedDishes.length" class="top-dishes-list">
            <div v-for="(dish, index) in topOrderedDishes" :key="dish.id" class="top-dish-item">
              <div class="top-dish-rank">{{ index + 1 }}</div>
              <div class="top-dish-meta">
                <strong>{{ dish.name }}</strong>
                <span>{{ dish.category?.name }}</span>
              </div>
              <div class="top-dish-count">{{ dish.orderCount }} 次</div>
            </div>
          </div>
          <p v-else class="muted">暂无可统计的点单数据</p>
        </article>
        <article class="qr-panel">
          <div>
            <div class="band-title">
              <QrCode :size="18" />
              <h2>点菜二维码</h2>
            </div>
            <p class="muted">{{ qrcode?.url }}</p>
          </div>
          <img v-if="qrcode" :src="qrcode.dataUrl" alt="点菜二维码" />
        </article>
      </section>

      <section v-if="activeTab === 'events'" class="tool-section">
        <div class="section-head">
          <h2>活动管理</h2>
          <el-button type="primary" @click="openEvent()">新建活动</el-button>
        </div>
        <el-table :data="events" stripe>
          <el-table-column prop="title" label="活动" min-width="180" />
          <el-table-column prop="accessCode" label="访问短码" min-width="140" />
          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <el-tag :type="eventStatusType(row.status)">{{ eventStatusText(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="聚餐时间" width="180">
            <template #default="{ row }">{{ row.dateTime ? new Date(row.dateTime).toLocaleString() : "未设置" }}</template>
          </el-table-column>
          <el-table-column label="操作" width="380">
            <template #default="{ row }">
              <el-button size="small" @click="viewEvent(row)">查看</el-button>
              <el-button size="small" @click="openEvent(row)">编辑</el-button>
              <el-button v-if="row.status !== 'OPEN'" size="small" type="success" @click="updateEventStatus(row, 'OPEN')">开放</el-button>
              <el-button v-if="row.status !== 'CLOSED'" size="small" type="info" @click="updateEventStatus(row, 'CLOSED')">关闭</el-button>
              <el-button size="small" type="danger" @click="deleteEvent(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </section>

      <section v-if="activeTab === 'dishes'" class="tool-section">
        <div class="section-head">
          <h2>菜品管理</h2>
          <el-button type="primary" @click="openDish()">新增菜品</el-button>
        </div>
        <div class="copy-menu-bar">
          <el-select v-model="copyTargetEventId" placeholder="从历史活动复制菜单到当前活动">
            <el-option
              v-for="event in events.filter((item) => item.id !== activeEventId)"
              :key="event.id"
              :label="event.title"
              :value="event.id"
            />
          </el-select>
          <el-button :disabled="!copyTargetEventId" @click="copyMenuToActiveEvent">复制菜单</el-button>
        </div>
        <el-table :data="dishes" stripe>
          <el-table-column prop="name" label="菜品" min-width="140" />
          <el-table-column label="分类" min-width="100">
            <template #default="{ row }">{{ row.category?.name }}</template>
          </el-table-column>
          <el-table-column label="标签" min-width="160">
            <template #default="{ row }">
              <el-tag v-for="tag in row.tags" :key="tag" size="small">{{ tag }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="servingHint" label="份量" min-width="120" />
          <el-table-column prop="orderCount" label="点单次数" width="110" sortable />
          <el-table-column label="每份食材" min-width="220">
            <template #default="{ row }">
              <div class="items-text">
                <span v-for="item in row.prepItems" :key="`${item.name}-${item.unit}`">
                  {{ item.name }} {{ item.quantity }}{{ item.unit }}
                </span>
                <span v-if="!row.prepItems?.length">未设置</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="当前活动" width="110">
            <template #default="{ row }">
              <el-tag :type="activeEventDishIds.has(row.id) ? 'success' : 'info'">
                {{ activeEventDishIds.has(row.id) ? "已加入" : "未加入" }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="290">
            <template #default="{ row }">
              <el-button size="small" @click="openDish(row)">编辑</el-button>
              <el-button v-if="!activeEventDishIds.has(row.id)" size="small" @click="addDishToEvent(row)">加入活动</el-button>
              <el-button v-else size="small" type="danger" @click="removeDishFromEvent(row)">移除</el-button>
              <el-button size="small" type="danger" plain @click="deleteDish(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </section>

      <section v-if="activeTab === 'orders'" class="tool-section">
        <div class="section-head">
          <h2>订单列表</h2>
        </div>
        <el-table :data="orders" stripe>
          <el-table-column prop="guestName" label="昵称" width="120" />
          <el-table-column label="菜品" min-width="260">
            <template #default="{ row }">
              <div class="items-text">
                <span v-for="item in row.items" :key="item.id">{{ item.dish.name }} x{{ item.quantity }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="note" label="备注" min-width="160" />
          <el-table-column label="提交时间" width="190">
            <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString() }}</template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button size="small" type="danger" @click="deleteOrder(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </section>

      <section v-if="activeTab === 'kitchen'" class="tool-section">
        <div class="section-head">
          <h2>备菜汇总</h2>
        </div>
        <h3 class="subhead">菜品份数</h3>
        <el-table :data="summary" stripe>
          <el-table-column label="菜品" min-width="160">
            <template #default="{ row }">{{ row.dish.name }}</template>
          </el-table-column>
          <el-table-column prop="quantity" label="总份数" width="100" />
          <el-table-column label="点菜人" min-width="220">
            <template #default="{ row }">{{ row.guests.join("，") }}</template>
          </el-table-column>
          <el-table-column label="备注" min-width="220">
            <template #default="{ row }">{{ row.notes.join("；") || "无" }}</template>
          </el-table-column>
        </el-table>

        <h3 class="subhead">食材清单</h3>
        <el-table :data="ingredientSummary" stripe>
          <el-table-column prop="name" label="食材" min-width="160" />
          <el-table-column label="备菜数量" width="140">
            <template #default="{ row }">{{ row.quantity }}{{ row.unit }}</template>
          </el-table-column>
          <el-table-column label="来源菜品" min-width="260">
            <template #default="{ row }">{{ row.sources.join("，") }}</template>
          </el-table-column>
        </el-table>
      </section>
    </section>

    <el-dialog v-model="dishDialog" :title="editingDishId ? '编辑菜品' : '新增菜品'" width="680px">
      <el-form label-position="top">
        <el-form-item label="菜品名称"><el-input v-model="dishForm.name" /></el-form-item>
        <el-form-item label="分类">
          <el-select v-model="dishForm.categoryId">
            <el-option v-for="category in categories" :key="category.id" :label="category.name" :value="category.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="菜品图片">
          <div class="image-editor">
            <div class="image-preview">
              <img v-if="dishForm.imageUrl" :src="dishForm.imageUrl" alt="菜品图片预览" />
              <span v-else>暂无图片</span>
            </div>
            <div class="image-actions">
              <input ref="imageInput" class="hidden-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" @change="uploadDishImage" />
              <el-button :loading="imageUploading" @click="chooseImage">上传图片</el-button>
              <el-input v-model="dishForm.imageUrl" placeholder="也可以粘贴图片 URL 或 /uploads/dishes/xxx.jpg" />
            </div>
          </div>
        </el-form-item>
        <el-form-item label="简介"><el-input v-model="dishForm.description" type="textarea" /></el-form-item>
        <el-form-item label="标签"><el-input v-model="dishForm.tagsText" placeholder="微辣, 招牌, 素菜" /></el-form-item>
        <el-form-item label="份量说明"><el-input v-model="dishForm.servingHint" /></el-form-item>
        <el-form-item label="每份备菜食材">
          <div class="prep-editor">
            <div v-for="(item, index) in dishForm.prepItems" :key="index" class="prep-row">
              <el-input v-model="item.name" class="prep-name" placeholder="食材" />
              <div class="prep-meta">
                <el-input-number v-model="item.quantity" class="prep-quantity" :min="0.01" :step="1" controls-position="right" />
                <el-input v-model="item.unit" class="prep-unit" placeholder="单位" />
              </div>
              <el-button class="prep-remove" @click="removePrepItem(index)">删除</el-button>
            </div>
            <el-button class="prep-add" @click="addPrepItem">添加食材</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dishDialog = false">取消</el-button>
        <el-button type="primary" @click="saveDish">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="eventDialog" :title="editingEventId ? '编辑活动' : '新建活动'" width="560px">
      <el-form label-position="top">
        <el-form-item label="活动名称"><el-input v-model="eventForm.title" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="eventForm.description" type="textarea" /></el-form-item>
        <el-form-item label="访问短码"><el-input v-model="eventForm.accessCode" /></el-form-item>
        <el-form-item label="聚餐时间"><el-input v-model="eventForm.dateTime" type="datetime-local" /></el-form-item>
        <el-form-item label="状态">
          <el-select v-model="eventForm.status">
            <el-option label="开放点菜" value="OPEN" />
            <el-option label="草稿" value="DRAFT" />
            <el-option label="关闭" value="CLOSED" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="!editingEventId" label="初始菜单">
          <el-select v-model="eventForm.copyFromEventId" clearable placeholder="可选：从已有活动复制菜单">
            <el-option v-for="event in events" :key="event.id" :label="event.title" :value="event.id" />
          </el-select>
          <p class="form-help">不选择历史活动时，会默认加入所有已启用菜品。</p>
        </el-form-item>
        <el-checkbox v-model="eventForm.showSummary">前台显示大家已点</el-checkbox>
      </el-form>
      <template #footer>
        <el-button @click="eventDialog = false">取消</el-button>
        <el-button type="primary" @click="saveEvent">{{ editingEventId ? "保存" : "创建" }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="passwordDialog" title="修改密码" width="460px">
      <el-form label-position="top">
        <el-form-item label="原密码">
          <el-input v-model="passwordForm.oldPassword" type="password" show-password autocomplete="current-password" />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="passwordForm.newPassword" type="password" show-password autocomplete="new-password" placeholder="至少 8 位" />
        </el-form-item>
        <el-form-item label="确认新密码">
          <el-input v-model="passwordForm.confirmPassword" type="password" show-password autocomplete="new-password" @keyup.enter="savePassword" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="passwordDialog = false">取消</el-button>
        <el-button type="primary" :loading="passwordSaving" @click="savePassword">保存新密码</el-button>
      </template>
    </el-dialog>
  </main>
</template>

<style scoped>
.login-page {
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(circle at 16% 10%, rgb(67 232 255 / 18%), transparent 28%),
    radial-gradient(circle at 86% 18%, rgb(255 74 222 / 13%), transparent 26%),
    linear-gradient(135deg, #07111f 0%, #101827 52%, #08111f 100%);
  color: #e5f7ff;
}

.login-panel {
  width: min(420px, 100%);
  padding: 28px;
  border: 0;
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgb(255 255 255 / 10%), rgb(255 255 255 / 4%)),
    rgb(8 17 31 / 88%);
  box-shadow: 0 22px 70px rgb(0 0 0 / 36%), inset 0 1px 0 rgb(255 255 255 / 10%);
  backdrop-filter: blur(12px);
}

.brand,
.side-title,
.band-title,
.top-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

h1,
h2,
p {
  margin: 0;
}

.brand {
  margin-bottom: 24px;
  color: #f8fbff;
}

.brand h1 {
  font-size: 24px;
  text-shadow: 0 0 18px rgb(67 232 255 / 34%);
}

.brand p {
  margin-top: 4px;
  color: #9bb8c8;
}

.admin-shell {
  --el-bg-color: #0b1626;
  --el-bg-color-overlay: #0f1c2e;
  --el-fill-color-blank: rgb(255 255 255 / 7%);
  --el-fill-color-light: rgb(255 255 255 / 8%);
  --el-fill-color-lighter: rgb(255 255 255 / 5%);
  --el-text-color-primary: #e5f7ff;
  --el-text-color-regular: #cdefff;
  --el-text-color-secondary: #9bb8c8;
  --el-border-color: rgb(255 255 255 / 10%);
  --el-border-color-light: rgb(255 255 255 / 8%);
  --el-border-color-lighter: rgb(255 255 255 / 6%);
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  width: 100%;
  min-height: 100vh;
  background:
    radial-gradient(circle at 14% 8%, rgb(67 232 255 / 14%), transparent 24%),
    radial-gradient(circle at 92% 10%, rgb(255 74 222 / 10%), transparent 22%),
    linear-gradient(135deg, #07111f 0%, #0f1a2b 48%, #07111f 100%);
  color: #e5f7ff;
}

.admin-side {
  position: sticky;
  top: 0;
  align-self: start;
  min-height: 100vh;
  padding: 18px 14px;
  border-right: 1px solid rgb(67 232 255 / 12%);
  background:
    linear-gradient(180deg, rgb(67 232 255 / 10%), transparent 30%),
    rgb(7 17 31 / 86%);
  box-shadow: 12px 0 34px rgb(0 0 0 / 18%);
  backdrop-filter: blur(12px);
}

.side-title {
  margin-bottom: 22px;
  font-size: 18px;
  color: #f8fbff;
  text-shadow: 0 0 16px rgb(67 232 255 / 30%);
}

.admin-side button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 40px;
  margin-bottom: 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #b7d8e8;
  text-align: left;
  padding: 0 12px;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.admin-side button svg {
  flex: 0 0 auto;
}

.admin-side button span {
  flex: 1;
  min-width: 0;
}

.admin-side button:hover {
  background: rgb(255 255 255 / 7%);
  color: #f8fbff;
  transform: translateX(2px);
}

.admin-side button.active {
  background: linear-gradient(135deg, rgb(67 232 255 / 26%), rgb(157 92 255 / 18%));
  color: #f8fbff;
  font-weight: 700;
  box-shadow: 0 0 18px rgb(67 232 255 / 18%), inset 0 0 0 1px rgb(67 232 255 / 18%);
}

.admin-side button.utility {
  margin-top: 18px;
  color: #d8f4ff;
}

.admin-side button.plain {
  margin-top: 8px;
  color: #ff9fc8;
}

.admin-main {
  min-width: 0;
  padding: 22px;
  overflow-x: hidden;
}

.admin-top {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: center;
  margin-bottom: 18px;
  padding: 18px;
  border-left: 3px solid #43e8ff;
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgb(67 232 255 / 12%), transparent 34%),
    rgb(255 255 255 / 6%);
  box-shadow: 0 18px 48px rgb(0 0 0 / 24%), inset 0 1px 0 rgb(255 255 255 / 8%);
}

.admin-top h1 {
  color: #f8fbff;
  text-shadow: 0 0 18px rgb(67 232 255 / 28%);
}

.admin-top .muted {
  margin-top: 6px;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(160px, 220px)) minmax(0, 1fr);
  gap: 14px;
  min-width: 0;
}

.metric,
.qr-panel,
.tool-section {
  border: 0;
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgb(255 255 255 / 9%), rgb(255 255 255 / 4%)),
    rgb(11 22 38 / 82%);
  box-shadow: 0 16px 42px rgb(0 0 0 / 22%), inset 0 1px 0 rgb(255 255 255 / 8%);
}

.metric {
  display: grid;
  align-content: space-between;
  min-height: 150px;
  padding: 18px;
  color: #b7d8e8;
}

.metric.clickable {
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.metric.clickable:hover {
  box-shadow: 0 18px 46px rgb(67 232 255 / 16%), inset 0 0 0 1px rgb(67 232 255 / 20%);
  transform: translateY(-1px);
}

.metric strong {
  font-size: 38px;
  color: #f8fbff;
  text-shadow: 0 0 18px rgb(67 232 255 / 36%);
}

.metric svg,
.band-title svg {
  color: #43e8ff;
}

.qr-panel {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  padding: 18px;
}

.top-dishes-panel {
  display: grid;
  gap: 14px;
}

.top-dishes-list {
  display: grid;
  gap: 10px;
}

.top-dish-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  border-radius: 8px;
  background: rgb(255 255 255 / 4%);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 7%);
}

.top-dish-rank {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: rgb(67 232 255 / 12%);
  color: #f8fbff;
  font-weight: 700;
}

.top-dish-meta {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.top-dish-meta strong {
  color: #f8fbff;
}

.top-dish-meta span,
.top-dish-count {
  color: #9bb8c8;
  font-size: 13px;
}

.qr-panel img {
  width: 150px;
  height: 150px;
  border-radius: 8px;
  box-shadow: 0 0 0 6px rgb(255 255 255 / 8%), 0 0 28px rgb(67 232 255 / 20%);
}

.tool-section {
  min-width: 0;
  padding: 16px;
  overflow: hidden;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.section-head h2,
.band-title h2,
.subhead {
  color: #f8fbff;
}

.copy-menu-bar {
  display: grid;
  grid-template-columns: minmax(220px, 360px) auto;
  gap: 10px;
  justify-content: start;
  margin-bottom: 14px;
}

.items-text {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.items-text span {
  padding: 3px 8px;
  border-radius: 999px;
  background: rgb(67 232 255 / 10%);
  color: #b7d8e8;
}

.subhead {
  margin: 18px 0 10px;
  font-size: 15px;
}

.subhead:first-of-type {
  margin-top: 0;
}

.prep-editor {
  display: grid;
  width: 100%;
  gap: 10px;
}

.prep-row {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(220px, 280px) auto;
  gap: 10px;
  align-items: center;
  padding: 10px;
  border-radius: 8px;
  background: rgb(255 255 255 / 4%);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 8%);
}

.prep-meta {
  display: grid;
  grid-template-columns: minmax(124px, 148px) minmax(88px, 1fr);
  gap: 10px;
  align-items: center;
}

.prep-quantity,
.prep-unit,
.prep-name {
  min-width: 0;
}

.prep-quantity :deep(.el-input-number) {
  width: 100%;
}

.prep-remove {
  min-width: 72px;
}

.prep-add {
  justify-self: start;
}

.image-editor {
  display: grid;
  grid-template-columns: 128px 1fr;
  gap: 12px;
  width: 100%;
  align-items: center;
}

.image-preview {
  display: grid;
  place-items: center;
  width: 128px;
  aspect-ratio: 1;
  border: 0;
  border-radius: 8px;
  overflow: hidden;
  background: rgb(255 255 255 / 7%);
  color: #9bb8c8;
  font-size: 13px;
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 10%);
}

.image-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-actions {
  display: grid;
  gap: 8px;
}

.hidden-input {
  display: none;
}

.form-help {
  width: 100%;
  margin: 6px 0 0;
  color: #9bb8c8;
  font-size: 12px;
}

.el-tag {
  margin-right: 6px;
}

.muted {
  color: #9bb8c8;
}

.admin-shell :deep(.el-button),
.login-page :deep(.el-button) {
  border: 0;
  border-radius: 8px;
  background: rgb(255 255 255 / 8%);
  color: #d8f4ff;
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 10%);
}

.admin-shell :deep(.el-button:hover),
.login-page :deep(.el-button:hover) {
  color: #f8fbff;
  background: rgb(67 232 255 / 14%);
  box-shadow: inset 0 0 0 1px rgb(67 232 255 / 24%), 0 0 18px rgb(67 232 255 / 14%);
}

.admin-shell :deep(.el-button--primary),
.login-page :deep(.el-button--primary) {
  background: linear-gradient(135deg, #43e8ff, #9d5cff);
  color: #07111f;
  font-weight: 800;
  box-shadow: 0 12px 28px rgb(67 232 255 / 22%);
}

.admin-shell :deep(.el-button--success) {
  background: linear-gradient(135deg, #7cffc4, #43e8ff);
  color: #07111f;
}

.admin-shell :deep(.el-button--danger) {
  background: linear-gradient(135deg, #ff4ade, #ff7aa8);
  color: #07111f;
}

.admin-shell :deep(.el-button--info) {
  background: rgb(157 92 255 / 18%);
  color: #e6d8ff;
}

.admin-shell :deep(.el-button.is-disabled),
.login-page :deep(.el-button.is-disabled) {
  opacity: 0.45;
  box-shadow: none;
}

.admin-shell :deep(.el-input__wrapper),
.admin-shell :deep(.el-textarea__inner),
.admin-shell :deep(.el-select__wrapper),
.login-page :deep(.el-input__wrapper) {
  border: 0;
  border-radius: 8px;
  background: rgb(255 255 255 / 7%);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 10%);
}

.admin-shell :deep(.el-input__wrapper.is-focus),
.admin-shell :deep(.el-textarea__inner:focus),
.admin-shell :deep(.el-select__wrapper.is-focused),
.login-page :deep(.el-input__wrapper.is-focus) {
  box-shadow: inset 0 0 0 1px rgb(67 232 255 / 44%), 0 0 18px rgb(67 232 255 / 14%);
}

.admin-shell :deep(.el-input__inner),
.admin-shell :deep(.el-textarea__inner),
.admin-shell :deep(.el-select__placeholder),
.admin-shell :deep(.el-select__selected-item),
.login-page :deep(.el-input__inner) {
  color: #e5f7ff;
}

.admin-shell :deep(.el-input__inner::placeholder),
.admin-shell :deep(.el-textarea__inner::placeholder),
.login-page :deep(.el-input__inner::placeholder) {
  color: #799bad;
}

.admin-shell :deep(.el-form-item__label),
.login-page :deep(.el-form-item__label) {
  color: #b7d8e8;
}

.admin-shell :deep(.el-table) {
  --el-bg-color: transparent;
  --el-fill-color-blank: transparent;
  --el-table-border-color: rgb(255 255 255 / 8%);
  --el-table-header-bg-color: rgb(10 29 48);
  --el-table-header-text-color: #e5f7ff;
  --el-table-row-hover-bg-color: rgb(67 232 255 / 9%);
  --el-table-text-color: #cdefff;
  --el-table-tr-bg-color: rgb(11 22 38 / 68%);
  --el-table-bg-color: rgb(11 22 38 / 68%);
  border-radius: 8px;
  overflow: hidden;
  background: rgb(11 22 38 / 68%);
}

.admin-shell :deep(.el-table th.el-table__cell) {
  background: rgb(10 29 48);
}

.admin-shell :deep(.el-table tr),
.admin-shell :deep(.el-table td.el-table__cell) {
  background: rgb(11 22 38 / 68%);
}

.admin-shell :deep(.el-table__row--striped td.el-table__cell) {
  background: rgb(17 34 56 / 86%);
}

.admin-shell :deep(.el-table__inner-wrapper::before) {
  background: rgb(255 255 255 / 8%);
}

.admin-shell :deep(.el-tag) {
  border: 0;
  background: rgb(67 232 255 / 12%);
  color: #b7f4ff;
}

.admin-shell :deep(.el-tag--success) {
  background: rgb(124 255 196 / 14%);
  color: #a9ffd6;
}

.admin-shell :deep(.el-tag--info) {
  background: rgb(157 92 255 / 14%);
  color: #dfd0ff;
}

.admin-shell :deep(.el-dialog) {
  border-radius: 8px;
  background:
    radial-gradient(circle at 20% 0%, rgb(67 232 255 / 12%), transparent 34%),
    linear-gradient(180deg, #0b1626, #08111f);
  box-shadow: 0 24px 80px rgb(0 0 0 / 48%), inset 0 1px 0 rgb(255 255 255 / 10%);
}

.admin-shell :deep(.el-dialog__title),
.admin-shell :deep(.el-dialog__body) {
  color: #e5f7ff;
}

.admin-shell :deep(.el-dialog__headerbtn .el-dialog__close) {
  color: #b7d8e8;
}

.admin-shell :deep(.el-checkbox__label) {
  color: #b7d8e8;
}

.admin-shell :deep(.el-checkbox__inner) {
  border-color: rgb(67 232 255 / 38%);
  background: rgb(255 255 255 / 8%);
}

.admin-shell :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
  border-color: #43e8ff;
  background: #43e8ff;
}

@media (max-width: 900px) {
  .admin-shell {
    grid-template-columns: 1fr;
  }

  .admin-side {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    min-height: auto;
    gap: 8px;
    overflow-x: auto;
    border-right: 0;
    border-bottom: 1px solid rgb(67 232 255 / 12%);
  }

  .side-title {
    min-width: 130px;
    margin: 0;
  }

  .admin-side button {
    justify-content: center;
    width: auto;
    min-width: 88px;
    margin: 0;
    text-align: center;
  }

  .admin-side button:hover {
    transform: none;
  }

  .admin-top,
  .qr-panel {
    align-items: stretch;
    flex-direction: column;
  }

  .admin-main {
    padding: 12px;
  }

  .dashboard-grid {
    grid-template-columns: 1fr;
  }

  .copy-menu-bar {
    grid-template-columns: 1fr;
  }

  .prep-row {
    grid-template-columns: 1fr;
    padding: 12px;
  }

  .prep-meta {
    grid-template-columns: minmax(0, 1fr) 96px;
  }

  .prep-remove,
  .prep-add {
    width: 100%;
  }

  .image-editor {
    grid-template-columns: 1fr;
  }
}
</style>

<style>
.el-popper.is-light,
.el-select-dropdown,
.el-picker__popper,
.el-message-box,
.el-message {
  --el-bg-color-overlay: #0f1c2e;
  --el-fill-color-blank: rgb(255 255 255 / 7%);
  --el-text-color-primary: #e5f7ff;
  --el-text-color-regular: #cdefff;
  --el-text-color-secondary: #9bb8c8;
  --el-border-color: rgb(255 255 255 / 10%);
  border: 0 !important;
  background:
    linear-gradient(135deg, rgb(255 255 255 / 10%), rgb(255 255 255 / 4%)),
    #0b1626 !important;
  color: #e5f7ff !important;
  box-shadow: 0 18px 52px rgb(0 0 0 / 42%), inset 0 1px 0 rgb(255 255 255 / 10%) !important;
}

.el-select-dropdown__item,
.el-message-box__title,
.el-message-box__content,
.el-message__content {
  color: #d8f4ff !important;
}

.el-select-dropdown__item.is-hovering,
.el-select-dropdown__item:hover {
  background: rgb(67 232 255 / 12%) !important;
}

.el-select-dropdown__item.is-selected {
  color: #43e8ff !important;
}

.el-popper.is-light .el-popper__arrow::before {
  border: 0 !important;
  background: #0b1626 !important;
}

.el-overlay {
  background-color: rgb(2 8 18 / 62%) !important;
  backdrop-filter: blur(4px);
}

.el-dialog {
  border-radius: 8px !important;
  background:
    radial-gradient(circle at 20% 0%, rgb(67 232 255 / 12%), transparent 34%),
    linear-gradient(180deg, #0b1626, #08111f) !important;
  color: #e5f7ff;
  box-shadow: 0 24px 80px rgb(0 0 0 / 48%), inset 0 1px 0 rgb(255 255 255 / 10%) !important;
}

.el-dialog__title,
.el-dialog__body,
.el-dialog__headerbtn .el-dialog__close {
  color: #e5f7ff !important;
}
</style>
