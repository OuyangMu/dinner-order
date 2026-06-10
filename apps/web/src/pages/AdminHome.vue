<script setup lang="ts">
import { CalendarPlus, ChefHat, ClipboardList, LogIn, QrCode, RefreshCw, Soup } from "lucide-vue-next";
import { ElMessage, ElMessageBox } from "element-plus";
import { computed, onMounted, reactive, ref } from "vue";
import { request, type Category, type Dish, type EventInfo, type IngredientSummaryItem, type Order, type PrepItem, type SummaryItem } from "../api";

const isAuthed = computed(() => Boolean(localStorage.getItem("adminToken")));
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
const editingDishId = ref("");
const editingEventId = ref("");
const copyTargetEventId = ref("");
const imageInput = ref<HTMLInputElement | null>(null);
const imageUploading = ref(false);
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

const activeEvent = computed(() => events.value.find((event) => event.id === activeEventId.value));

async function login() {
  loginLoading.value = true;
  try {
    const result = await request<{ token: string }>("/api/admin/login", {
      method: "POST",
      body: JSON.stringify(loginForm)
    });
    localStorage.setItem("adminToken", result.token);
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
      `/api/admin/events/${activeEventId.value}/qrcode?origin=${encodeURIComponent(location.origin)}`
    )
  ]);
  activeEventDishIds.value = new Set(eventDishes.map((item) => item.dishId));
  orders.value = eventOrders;
  summary.value = eventSummary;
  ingredientSummary.value = eventIngredients;
  qrcode.value = eventQrcode;
}

function openDish(dish?: Dish) {
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

  imageUploading.value = true;
  try {
    const formData = new FormData();
    formData.append("file", file);
    const result = await request<{ url: string }>("/api/admin/uploads/dish-image", {
      method: "POST",
      body: formData
    });
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

function logout() {
  localStorage.removeItem("adminToken");
  location.reload();
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
      <button :class="{ active: activeTab === 'dashboard' }" @click="activeTab = 'dashboard'">仪表盘</button>
      <button :class="{ active: activeTab === 'events' }" @click="activeTab = 'events'">活动管理</button>
      <button :class="{ active: activeTab === 'dishes' }" @click="activeTab = 'dishes'">菜品管理</button>
      <button :class="{ active: activeTab === 'orders' }" @click="activeTab = 'orders'">订单列表</button>
      <button :class="{ active: activeTab === 'kitchen' }" @click="activeTab = 'kitchen'">备菜汇总</button>
      <button class="plain" @click="logout">退出登录</button>
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
          <el-table-column label="操作" width="220">
            <template #default="{ row }">
              <el-button size="small" @click="openDish(row)">编辑</el-button>
              <el-button v-if="!activeEventDishIds.has(row.id)" size="small" @click="addDishToEvent(row)">加入活动</el-button>
              <el-button v-else size="small" type="danger" @click="removeDishFromEvent(row)">移除</el-button>
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
              <el-input v-model="item.name" placeholder="食材" />
              <el-input-number v-model="item.quantity" :min="0.01" :step="1" controls-position="right" />
              <el-input v-model="item.unit" placeholder="单位" />
              <el-button @click="removePrepItem(index)">删除</el-button>
            </div>
            <el-button @click="addPrepItem">添加食材</el-button>
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
  </main>
</template>

<style scoped>
.login-page {
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 24px;
  background: #f2f5f7;
}

.login-panel {
  width: min(420px, 100%);
  padding: 28px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: white;
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
}

.brand h1 {
  font-size: 24px;
}

.admin-shell {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  width: 100%;
  min-height: 100vh;
  background: #f6f7f9;
}

.admin-side {
  position: sticky;
  top: 0;
  align-self: start;
  min-height: 100vh;
  padding: 18px 14px;
  border-right: 1px solid #e5e7eb;
  background: white;
}

.side-title {
  margin-bottom: 22px;
  font-size: 18px;
}

.admin-side button {
  width: 100%;
  min-height: 40px;
  margin-bottom: 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #374151;
  text-align: left;
  padding: 0 12px;
}

.admin-side button.active {
  background: #e8f4ed;
  color: #23724a;
  font-weight: 700;
}

.admin-side button.plain {
  margin-top: 18px;
  color: #9b2c2c;
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
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: white;
}

.metric {
  display: grid;
  align-content: space-between;
  min-height: 150px;
  padding: 18px;
}

.metric.clickable {
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.metric.clickable:hover {
  border-color: #23724a;
  box-shadow: 0 8px 20px rgb(31 41 51 / 10%);
  transform: translateY(-1px);
}

.metric strong {
  font-size: 38px;
}

.qr-panel {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  padding: 18px;
}

.qr-panel img {
  width: 150px;
  height: 150px;
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
  background: #f1f5f9;
  color: #374151;
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
  grid-template-columns: 1fr 130px 90px 70px;
  gap: 8px;
  align-items: center;
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
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  background: #f8fafc;
  color: #6b7280;
  font-size: 13px;
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
  color: #6b7280;
  font-size: 12px;
}

.el-tag {
  margin-right: 6px;
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
    border-bottom: 1px solid #e5e7eb;
  }

  .side-title {
    min-width: 130px;
    margin: 0;
  }

  .admin-side button {
    width: auto;
    min-width: 88px;
    margin: 0;
    text-align: center;
  }

  .admin-top,
  .qr-panel {
    align-items: stretch;
    flex-direction: column;
  }

  .dashboard-grid {
    grid-template-columns: 1fr;
  }

  .copy-menu-bar {
    grid-template-columns: 1fr;
  }

  .prep-row {
    grid-template-columns: 1fr;
  }

  .image-editor {
    grid-template-columns: 1fr;
  }
}
</style>
