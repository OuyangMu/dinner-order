import { CalendarPlus, ChefHat, ClipboardList, KeyRound, LayoutDashboard, LogIn, LogOut, QrCode, RefreshCw, Soup } from "lucide-vue-next";
import { ElMessage, ElMessageBox } from "element-plus";
import { computed, onMounted, reactive, ref } from "vue";
import { request } from "../api";
const adminToken = ref(localStorage.getItem("adminToken") || "");
const isAuthed = computed(() => Boolean(adminToken.value));
const loginForm = reactive({ username: "admin", password: "admin123456" });
const loginLoading = ref(false);
const events = ref([]);
const categories = ref([]);
const dishes = ref([]);
const orders = ref([]);
const summary = ref([]);
const ingredientSummary = ref([]);
const qrcode = ref(null);
const activeEventDishIds = ref(new Set());
const activeEventId = ref("");
const activeTab = ref("dashboard");
const dishDialog = ref(false);
const eventDialog = ref(false);
const passwordDialog = ref(false);
const passwordSaving = ref(false);
const editingDishId = ref("");
const editingEventId = ref("");
const copyTargetEventId = ref("");
const imageInput = ref(null);
const imageUploading = ref(false);
const dishForm = reactive({
    name: "",
    categoryId: "",
    imageUrl: "",
    description: "",
    tagsText: "",
    prepItems: [],
    servingHint: "",
    enabled: true,
    sortOrder: 0
});
const eventForm = reactive({
    title: "",
    description: "",
    dateTime: "",
    status: "OPEN",
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
const qrcodeOrigin = computed(() => {
    if (import.meta.env.VITE_PUBLIC_ORIGIN)
        return import.meta.env.VITE_PUBLIC_ORIGIN;
    if (["localhost", "127.0.0.1"].includes(location.hostname)) {
        return `${location.protocol}//192.168.3.69:${location.port || "5173"}`;
    }
    return location.origin;
});
async function login() {
    loginLoading.value = true;
    try {
        const result = await request("/api/admin/login", {
            method: "POST",
            body: JSON.stringify(loginForm)
        });
        localStorage.setItem("adminToken", result.token);
        adminToken.value = result.token;
        ElMessage.success("登录成功");
        await loadAdmin();
    }
    catch (error) {
        ElMessage.error(error instanceof Error ? error.message : "登录失败");
    }
    finally {
        loginLoading.value = false;
    }
}
async function loadAdmin() {
    if (!isAuthed.value)
        return;
    [events.value, categories.value, dishes.value] = await Promise.all([
        request("/api/admin/events"),
        request("/api/admin/categories"),
        request("/api/admin/dishes")
    ]);
    activeEventId.value ||= events.value[0]?.id || "";
    await loadEventData();
}
async function loadEventData() {
    if (!activeEventId.value)
        return;
    const [eventDishes, eventOrders, eventSummary, eventIngredients, eventQrcode] = await Promise.all([
        request(`/api/admin/events/${activeEventId.value}/dishes`),
        request(`/api/admin/events/${activeEventId.value}/orders`),
        request(`/api/admin/events/${activeEventId.value}/summary`),
        request(`/api/admin/events/${activeEventId.value}/ingredients`),
        request(`/api/admin/events/${activeEventId.value}/qrcode?origin=${encodeURIComponent(qrcodeOrigin.value)}`)
    ]);
    activeEventDishIds.value = new Set(eventDishes.map((item) => item.dishId));
    orders.value = eventOrders;
    summary.value = eventSummary;
    ingredientSummary.value = eventIngredients;
    qrcode.value = eventQrcode;
}
function openDish(dish) {
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
        await request(editingDishId.value ? `/api/admin/dishes/${editingDishId.value}` : "/api/admin/dishes", {
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
    }
    catch (error) {
        ElMessage.error(error instanceof Error ? error.message : "保存失败");
    }
}
function eventStatusText(status) {
    return { DRAFT: "草稿", OPEN: "开放点菜", CLOSED: "已关闭" }[status];
}
function eventStatusType(status) {
    return status === "OPEN" ? "success" : status === "CLOSED" ? "info" : "warning";
}
function openEvent(event) {
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
        const saved = await request(editingEventId.value ? `/api/admin/events/${editingEventId.value}` : "/api/admin/events", {
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
    }
    catch (error) {
        ElMessage.error(error instanceof Error ? error.message : "保存失败");
    }
}
async function updateEventStatus(event, status) {
    try {
        await request(`/api/admin/events/${event.id}`, {
            method: "PUT",
            body: JSON.stringify({ status })
        });
        ElMessage.success("状态已更新");
        await loadAdmin();
    }
    catch (error) {
        ElMessage.error(error instanceof Error ? error.message : "更新失败");
    }
}
async function deleteEvent(event) {
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
    }
    catch (error) {
        if (error !== "cancel") {
            ElMessage.error(error instanceof Error ? error.message : "删除失败");
        }
    }
}
function viewEvent(event) {
    activeEventId.value = event.id;
    activeTab.value = "dashboard";
    loadEventData();
}
async function copyMenuToActiveEvent() {
    if (!activeEventId.value || !copyTargetEventId.value)
        return;
    try {
        const result = await request(`/api/admin/events/${activeEventId.value}/copy-menu`, {
            method: "POST",
            body: JSON.stringify({ fromEventId: copyTargetEventId.value })
        });
        ElMessage.success(`已复制 ${result.copied} 个菜品到当前活动`);
        await loadEventData();
    }
    catch (error) {
        ElMessage.error(error instanceof Error ? error.message : "复制失败");
    }
}
function addPrepItem() {
    dishForm.prepItems.push({ name: "", quantity: 1, unit: "" });
}
function removePrepItem(index) {
    dishForm.prepItems.splice(index, 1);
}
function chooseImage() {
    imageInput.value?.click();
}
async function uploadDishImage(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file)
        return;
    imageUploading.value = true;
    try {
        const formData = new FormData();
        formData.append("file", file);
        const result = await request("/api/admin/uploads/dish-image", {
            method: "POST",
            body: formData
        });
        dishForm.imageUrl = result.url;
        ElMessage.success("图片已上传");
    }
    catch (error) {
        ElMessage.error(error instanceof Error ? error.message : "上传失败");
    }
    finally {
        imageUploading.value = false;
        input.value = "";
    }
}
async function addDishToEvent(dish) {
    if (!activeEventId.value)
        return;
    await request(`/api/admin/events/${activeEventId.value}/dishes/${dish.id}`, { method: "POST" });
    ElMessage.success("已加入当前活动");
    await loadEventData();
}
async function removeDishFromEvent(dish) {
    if (!activeEventId.value)
        return;
    try {
        await ElMessageBox.confirm(`确定从当前活动移除“${dish.name}”吗？历史订单不会被删除。`, "移除菜品", {
            confirmButtonText: "移除",
            cancelButtonText: "取消",
            type: "warning"
        });
        await request(`/api/admin/events/${activeEventId.value}/dishes/${dish.id}`, { method: "DELETE" });
        ElMessage.success("已从当前活动移除");
        await loadEventData();
    }
    catch (error) {
        if (error !== "cancel") {
            ElMessage.error(error instanceof Error ? error.message : "移除失败");
        }
    }
}
async function deleteOrder(order) {
    try {
        await ElMessageBox.confirm(`确定删除“${order.guestName}”的这笔订单吗？`, "删除订单", {
            confirmButtonText: "删除",
            cancelButtonText: "取消",
            type: "warning"
        });
        await request(`/api/admin/orders/${order.id}`, { method: "DELETE" });
        ElMessage.success("订单已删除");
        await loadEventData();
    }
    catch (error) {
        if (error !== "cancel") {
            ElMessage.error(error instanceof Error ? error.message : "删除失败");
        }
    }
}
async function deleteDish(dish) {
    try {
        await ElMessageBox.confirm(`确定删除“${dish.name}”吗？如果这道菜仍被未关闭活动的订单引用，将无法删除；仅出现在已关闭活动中的历史订单则允许删除。`, "删除菜品", {
            confirmButtonText: "删除",
            cancelButtonText: "取消",
            type: "warning"
        });
        await request(`/api/admin/dishes/${dish.id}`, { method: "DELETE" });
        ElMessage.success("菜品已删除");
        await loadAdmin();
    }
    catch (error) {
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
    }
    catch (error) {
        ElMessage.error(error instanceof Error ? error.message : "修改密码失败");
    }
    finally {
        passwordSaving.value = false;
    }
}
function logout() {
    localStorage.removeItem("adminToken");
    adminToken.value = "";
}
onMounted(loadAdmin);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['brand']} */ ;
/** @type {__VLS_StyleScopedClasses['brand']} */ ;
/** @type {__VLS_StyleScopedClasses['brand']} */ ;
/** @type {__VLS_StyleScopedClasses['side-title']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-side']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-side']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-side']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-side']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-side']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-side']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-side']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-top']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-top']} */ ;
/** @type {__VLS_StyleScopedClasses['metric']} */ ;
/** @type {__VLS_StyleScopedClasses['metric']} */ ;
/** @type {__VLS_StyleScopedClasses['metric']} */ ;
/** @type {__VLS_StyleScopedClasses['clickable']} */ ;
/** @type {__VLS_StyleScopedClasses['metric']} */ ;
/** @type {__VLS_StyleScopedClasses['metric']} */ ;
/** @type {__VLS_StyleScopedClasses['band-title']} */ ;
/** @type {__VLS_StyleScopedClasses['qr-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['qr-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-section']} */ ;
/** @type {__VLS_StyleScopedClasses['section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['band-title']} */ ;
/** @type {__VLS_StyleScopedClasses['items-text']} */ ;
/** @type {__VLS_StyleScopedClasses['subhead']} */ ;
/** @type {__VLS_StyleScopedClasses['subhead']} */ ;
/** @type {__VLS_StyleScopedClasses['prep-quantity']} */ ;
/** @type {__VLS_StyleScopedClasses['image-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['muted']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['login-page']} */ ;
/** @type {__VLS_StyleScopedClasses['el-button']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['el-button']} */ ;
/** @type {__VLS_StyleScopedClasses['login-page']} */ ;
/** @type {__VLS_StyleScopedClasses['el-button']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['login-page']} */ ;
/** @type {__VLS_StyleScopedClasses['el-button--primary']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['el-button']} */ ;
/** @type {__VLS_StyleScopedClasses['login-page']} */ ;
/** @type {__VLS_StyleScopedClasses['el-button']} */ ;
/** @type {__VLS_StyleScopedClasses['is-disabled']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['login-page']} */ ;
/** @type {__VLS_StyleScopedClasses['el-input__wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['el-input__wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['el-textarea__inner']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['el-select__wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['login-page']} */ ;
/** @type {__VLS_StyleScopedClasses['el-input__wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['is-focus']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['el-textarea__inner']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['login-page']} */ ;
/** @type {__VLS_StyleScopedClasses['el-input__inner']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['el-input__inner']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['el-textarea__inner']} */ ;
/** @type {__VLS_StyleScopedClasses['login-page']} */ ;
/** @type {__VLS_StyleScopedClasses['el-input__inner']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['login-page']} */ ;
/** @type {__VLS_StyleScopedClasses['el-form-item__label']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['el-table']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['el-table']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['el-table']} */ ;
/** @type {__VLS_StyleScopedClasses['el-table__cell']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['el-table__cell']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['el-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['el-checkbox__inner']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-side']} */ ;
/** @type {__VLS_StyleScopedClasses['side-title']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-side']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-side']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-top']} */ ;
/** @type {__VLS_StyleScopedClasses['qr-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-main']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['copy-menu-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['prep-row']} */ ;
/** @type {__VLS_StyleScopedClasses['prep-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['prep-remove']} */ ;
/** @type {__VLS_StyleScopedClasses['prep-add']} */ ;
/** @type {__VLS_StyleScopedClasses['image-editor']} */ ;
// CSS variable injection 
// CSS variable injection end 
if (!__VLS_ctx.isAuthed) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
        ...{ class: "login-page" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "login-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "brand" },
    });
    const __VLS_0 = {}.ChefHat;
    /** @type {[typeof __VLS_components.ChefHat, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        size: (34),
    }));
    const __VLS_2 = __VLS_1({
        size: (34),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    const __VLS_4 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        labelPosition: "top",
    }));
    const __VLS_6 = __VLS_5({
        labelPosition: "top",
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    __VLS_7.slots.default;
    const __VLS_8 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        label: "用户名",
    }));
    const __VLS_10 = __VLS_9({
        label: "用户名",
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    __VLS_11.slots.default;
    const __VLS_12 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
        modelValue: (__VLS_ctx.loginForm.username),
    }));
    const __VLS_14 = __VLS_13({
        modelValue: (__VLS_ctx.loginForm.username),
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    var __VLS_11;
    const __VLS_16 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        label: "密码",
    }));
    const __VLS_18 = __VLS_17({
        label: "密码",
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    __VLS_19.slots.default;
    const __VLS_20 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        ...{ 'onKeyup': {} },
        modelValue: (__VLS_ctx.loginForm.password),
        type: "password",
        showPassword: true,
    }));
    const __VLS_22 = __VLS_21({
        ...{ 'onKeyup': {} },
        modelValue: (__VLS_ctx.loginForm.password),
        type: "password",
        showPassword: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    let __VLS_24;
    let __VLS_25;
    let __VLS_26;
    const __VLS_27 = {
        onKeyup: (__VLS_ctx.login)
    };
    var __VLS_23;
    var __VLS_19;
    const __VLS_28 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
        ...{ 'onClick': {} },
        type: "primary",
        size: "large",
        loading: (__VLS_ctx.loginLoading),
    }));
    const __VLS_30 = __VLS_29({
        ...{ 'onClick': {} },
        type: "primary",
        size: "large",
        loading: (__VLS_ctx.loginLoading),
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
    let __VLS_32;
    let __VLS_33;
    let __VLS_34;
    const __VLS_35 = {
        onClick: (__VLS_ctx.login)
    };
    __VLS_31.slots.default;
    const __VLS_36 = {}.LogIn;
    /** @type {[typeof __VLS_components.LogIn, ]} */ ;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
        size: (18),
    }));
    const __VLS_38 = __VLS_37({
        size: (18),
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
    var __VLS_31;
    var __VLS_7;
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
        ...{ class: "admin-shell" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
        ...{ class: "admin-side" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "side-title" },
    });
    const __VLS_40 = {}.ChefHat;
    /** @type {[typeof __VLS_components.ChefHat, ]} */ ;
    // @ts-ignore
    const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
        size: (26),
    }));
    const __VLS_42 = __VLS_41({
        size: (26),
    }, ...__VLS_functionalComponentArgsRest(__VLS_41));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.isAuthed))
                    return;
                __VLS_ctx.activeTab = 'dashboard';
            } },
        ...{ class: ({ active: __VLS_ctx.activeTab === 'dashboard' }) },
    });
    const __VLS_44 = {}.LayoutDashboard;
    /** @type {[typeof __VLS_components.LayoutDashboard, ]} */ ;
    // @ts-ignore
    const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
        size: (16),
    }));
    const __VLS_46 = __VLS_45({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_45));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.isAuthed))
                    return;
                __VLS_ctx.activeTab = 'events';
            } },
        ...{ class: ({ active: __VLS_ctx.activeTab === 'events' }) },
    });
    const __VLS_48 = {}.CalendarPlus;
    /** @type {[typeof __VLS_components.CalendarPlus, ]} */ ;
    // @ts-ignore
    const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
        size: (16),
    }));
    const __VLS_50 = __VLS_49({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_49));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.isAuthed))
                    return;
                __VLS_ctx.activeTab = 'dishes';
            } },
        ...{ class: ({ active: __VLS_ctx.activeTab === 'dishes' }) },
    });
    const __VLS_52 = {}.ChefHat;
    /** @type {[typeof __VLS_components.ChefHat, ]} */ ;
    // @ts-ignore
    const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
        size: (16),
    }));
    const __VLS_54 = __VLS_53({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_53));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.isAuthed))
                    return;
                __VLS_ctx.activeTab = 'orders';
            } },
        ...{ class: ({ active: __VLS_ctx.activeTab === 'orders' }) },
    });
    const __VLS_56 = {}.ClipboardList;
    /** @type {[typeof __VLS_components.ClipboardList, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
        size: (16),
    }));
    const __VLS_58 = __VLS_57({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_57));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.isAuthed))
                    return;
                __VLS_ctx.activeTab = 'kitchen';
            } },
        ...{ class: ({ active: __VLS_ctx.activeTab === 'kitchen' }) },
    });
    const __VLS_60 = {}.Soup;
    /** @type {[typeof __VLS_components.Soup, ]} */ ;
    // @ts-ignore
    const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
        size: (16),
    }));
    const __VLS_62 = __VLS_61({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_61));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.openPasswordDialog) },
        ...{ class: "utility" },
    });
    const __VLS_64 = {}.KeyRound;
    /** @type {[typeof __VLS_components.KeyRound, ]} */ ;
    // @ts-ignore
    const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
        size: (15),
    }));
    const __VLS_66 = __VLS_65({
        size: (15),
    }, ...__VLS_functionalComponentArgsRest(__VLS_65));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.logout) },
        ...{ class: "plain" },
    });
    const __VLS_68 = {}.LogOut;
    /** @type {[typeof __VLS_components.LogOut, ]} */ ;
    // @ts-ignore
    const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
        size: (15),
    }));
    const __VLS_70 = __VLS_69({
        size: (15),
    }, ...__VLS_functionalComponentArgsRest(__VLS_69));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "admin-main" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "admin-top" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
    (__VLS_ctx.activeEvent?.title || "后台管理");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "muted" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "top-actions" },
    });
    const __VLS_72 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.activeEventId),
        placeholder: "选择活动",
    }));
    const __VLS_74 = __VLS_73({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.activeEventId),
        placeholder: "选择活动",
    }, ...__VLS_functionalComponentArgsRest(__VLS_73));
    let __VLS_76;
    let __VLS_77;
    let __VLS_78;
    const __VLS_79 = {
        onChange: (__VLS_ctx.loadEventData)
    };
    __VLS_75.slots.default;
    for (const [event] of __VLS_getVForSourceType((__VLS_ctx.events))) {
        const __VLS_80 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
            key: (event.id),
            label: (event.title),
            value: (event.id),
        }));
        const __VLS_82 = __VLS_81({
            key: (event.id),
            label: (event.title),
            value: (event.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_81));
    }
    var __VLS_75;
    const __VLS_84 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
        ...{ 'onClick': {} },
    }));
    const __VLS_86 = __VLS_85({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_85));
    let __VLS_88;
    let __VLS_89;
    let __VLS_90;
    const __VLS_91 = {
        onClick: (__VLS_ctx.loadAdmin)
    };
    __VLS_87.slots.default;
    const __VLS_92 = {}.RefreshCw;
    /** @type {[typeof __VLS_components.RefreshCw, ]} */ ;
    // @ts-ignore
    const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
        size: (16),
    }));
    const __VLS_94 = __VLS_93({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_93));
    var __VLS_87;
    const __VLS_96 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_98 = __VLS_97({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_97));
    let __VLS_100;
    let __VLS_101;
    let __VLS_102;
    const __VLS_103 = {
        onClick: (__VLS_ctx.openEvent)
    };
    __VLS_99.slots.default;
    const __VLS_104 = {}.CalendarPlus;
    /** @type {[typeof __VLS_components.CalendarPlus, ]} */ ;
    // @ts-ignore
    const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
        size: (16),
    }));
    const __VLS_106 = __VLS_105({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_105));
    var __VLS_99;
    if (__VLS_ctx.activeTab === 'dashboard') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "dashboard-grid" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            ...{ onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.isAuthed))
                        return;
                    if (!(__VLS_ctx.activeTab === 'dashboard'))
                        return;
                    __VLS_ctx.activeTab = 'orders';
                } },
            ...{ class: "metric clickable" },
        });
        const __VLS_108 = {}.ClipboardList;
        /** @type {[typeof __VLS_components.ClipboardList, ]} */ ;
        // @ts-ignore
        const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
            size: (22),
        }));
        const __VLS_110 = __VLS_109({
            size: (22),
        }, ...__VLS_functionalComponentArgsRest(__VLS_109));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.orders.length);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            ...{ class: "metric" },
        });
        const __VLS_112 = {}.Soup;
        /** @type {[typeof __VLS_components.Soup, ]} */ ;
        // @ts-ignore
        const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
            size: (22),
        }));
        const __VLS_114 = __VLS_113({
            size: (22),
        }, ...__VLS_functionalComponentArgsRest(__VLS_113));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.summary.reduce((sum, item) => sum + item.quantity, 0));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            ...{ class: "qr-panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "band-title" },
        });
        const __VLS_116 = {}.QrCode;
        /** @type {[typeof __VLS_components.QrCode, ]} */ ;
        // @ts-ignore
        const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
            size: (18),
        }));
        const __VLS_118 = __VLS_117({
            size: (18),
        }, ...__VLS_functionalComponentArgsRest(__VLS_117));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "muted" },
        });
        (__VLS_ctx.qrcode?.url);
        if (__VLS_ctx.qrcode) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
                src: (__VLS_ctx.qrcode.dataUrl),
                alt: "点菜二维码",
            });
        }
    }
    if (__VLS_ctx.activeTab === 'events') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "tool-section" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "section-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
        const __VLS_120 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
            ...{ 'onClick': {} },
            type: "primary",
        }));
        const __VLS_122 = __VLS_121({
            ...{ 'onClick': {} },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_121));
        let __VLS_124;
        let __VLS_125;
        let __VLS_126;
        const __VLS_127 = {
            onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.isAuthed))
                    return;
                if (!(__VLS_ctx.activeTab === 'events'))
                    return;
                __VLS_ctx.openEvent();
            }
        };
        __VLS_123.slots.default;
        var __VLS_123;
        const __VLS_128 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
            data: (__VLS_ctx.events),
            stripe: true,
        }));
        const __VLS_130 = __VLS_129({
            data: (__VLS_ctx.events),
            stripe: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_129));
        __VLS_131.slots.default;
        const __VLS_132 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
            prop: "title",
            label: "活动",
            minWidth: "180",
        }));
        const __VLS_134 = __VLS_133({
            prop: "title",
            label: "活动",
            minWidth: "180",
        }, ...__VLS_functionalComponentArgsRest(__VLS_133));
        const __VLS_136 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
            prop: "accessCode",
            label: "访问短码",
            minWidth: "140",
        }));
        const __VLS_138 = __VLS_137({
            prop: "accessCode",
            label: "访问短码",
            minWidth: "140",
        }, ...__VLS_functionalComponentArgsRest(__VLS_137));
        const __VLS_140 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
            label: "状态",
            width: "110",
        }));
        const __VLS_142 = __VLS_141({
            label: "状态",
            width: "110",
        }, ...__VLS_functionalComponentArgsRest(__VLS_141));
        __VLS_143.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_143.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_144 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
                type: (__VLS_ctx.eventStatusType(row.status)),
            }));
            const __VLS_146 = __VLS_145({
                type: (__VLS_ctx.eventStatusType(row.status)),
            }, ...__VLS_functionalComponentArgsRest(__VLS_145));
            __VLS_147.slots.default;
            (__VLS_ctx.eventStatusText(row.status));
            var __VLS_147;
        }
        var __VLS_143;
        const __VLS_148 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
            label: "聚餐时间",
            width: "180",
        }));
        const __VLS_150 = __VLS_149({
            label: "聚餐时间",
            width: "180",
        }, ...__VLS_functionalComponentArgsRest(__VLS_149));
        __VLS_151.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_151.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.dateTime ? new Date(row.dateTime).toLocaleString() : "未设置");
        }
        var __VLS_151;
        const __VLS_152 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
            label: "操作",
            width: "380",
        }));
        const __VLS_154 = __VLS_153({
            label: "操作",
            width: "380",
        }, ...__VLS_functionalComponentArgsRest(__VLS_153));
        __VLS_155.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_155.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_156 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
                ...{ 'onClick': {} },
                size: "small",
            }));
            const __VLS_158 = __VLS_157({
                ...{ 'onClick': {} },
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_157));
            let __VLS_160;
            let __VLS_161;
            let __VLS_162;
            const __VLS_163 = {
                onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.isAuthed))
                        return;
                    if (!(__VLS_ctx.activeTab === 'events'))
                        return;
                    __VLS_ctx.viewEvent(row);
                }
            };
            __VLS_159.slots.default;
            var __VLS_159;
            const __VLS_164 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
                ...{ 'onClick': {} },
                size: "small",
            }));
            const __VLS_166 = __VLS_165({
                ...{ 'onClick': {} },
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_165));
            let __VLS_168;
            let __VLS_169;
            let __VLS_170;
            const __VLS_171 = {
                onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.isAuthed))
                        return;
                    if (!(__VLS_ctx.activeTab === 'events'))
                        return;
                    __VLS_ctx.openEvent(row);
                }
            };
            __VLS_167.slots.default;
            var __VLS_167;
            if (row.status !== 'OPEN') {
                const __VLS_172 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
                    ...{ 'onClick': {} },
                    size: "small",
                    type: "success",
                }));
                const __VLS_174 = __VLS_173({
                    ...{ 'onClick': {} },
                    size: "small",
                    type: "success",
                }, ...__VLS_functionalComponentArgsRest(__VLS_173));
                let __VLS_176;
                let __VLS_177;
                let __VLS_178;
                const __VLS_179 = {
                    onClick: (...[$event]) => {
                        if (!!(!__VLS_ctx.isAuthed))
                            return;
                        if (!(__VLS_ctx.activeTab === 'events'))
                            return;
                        if (!(row.status !== 'OPEN'))
                            return;
                        __VLS_ctx.updateEventStatus(row, 'OPEN');
                    }
                };
                __VLS_175.slots.default;
                var __VLS_175;
            }
            if (row.status !== 'CLOSED') {
                const __VLS_180 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
                    ...{ 'onClick': {} },
                    size: "small",
                    type: "info",
                }));
                const __VLS_182 = __VLS_181({
                    ...{ 'onClick': {} },
                    size: "small",
                    type: "info",
                }, ...__VLS_functionalComponentArgsRest(__VLS_181));
                let __VLS_184;
                let __VLS_185;
                let __VLS_186;
                const __VLS_187 = {
                    onClick: (...[$event]) => {
                        if (!!(!__VLS_ctx.isAuthed))
                            return;
                        if (!(__VLS_ctx.activeTab === 'events'))
                            return;
                        if (!(row.status !== 'CLOSED'))
                            return;
                        __VLS_ctx.updateEventStatus(row, 'CLOSED');
                    }
                };
                __VLS_183.slots.default;
                var __VLS_183;
            }
            const __VLS_188 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
                ...{ 'onClick': {} },
                size: "small",
                type: "danger",
            }));
            const __VLS_190 = __VLS_189({
                ...{ 'onClick': {} },
                size: "small",
                type: "danger",
            }, ...__VLS_functionalComponentArgsRest(__VLS_189));
            let __VLS_192;
            let __VLS_193;
            let __VLS_194;
            const __VLS_195 = {
                onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.isAuthed))
                        return;
                    if (!(__VLS_ctx.activeTab === 'events'))
                        return;
                    __VLS_ctx.deleteEvent(row);
                }
            };
            __VLS_191.slots.default;
            var __VLS_191;
        }
        var __VLS_155;
        var __VLS_131;
    }
    if (__VLS_ctx.activeTab === 'dishes') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "tool-section" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "section-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
        const __VLS_196 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_197 = __VLS_asFunctionalComponent(__VLS_196, new __VLS_196({
            ...{ 'onClick': {} },
            type: "primary",
        }));
        const __VLS_198 = __VLS_197({
            ...{ 'onClick': {} },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_197));
        let __VLS_200;
        let __VLS_201;
        let __VLS_202;
        const __VLS_203 = {
            onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.isAuthed))
                    return;
                if (!(__VLS_ctx.activeTab === 'dishes'))
                    return;
                __VLS_ctx.openDish();
            }
        };
        __VLS_199.slots.default;
        var __VLS_199;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "copy-menu-bar" },
        });
        const __VLS_204 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({
            modelValue: (__VLS_ctx.copyTargetEventId),
            placeholder: "从历史活动复制菜单到当前活动",
        }));
        const __VLS_206 = __VLS_205({
            modelValue: (__VLS_ctx.copyTargetEventId),
            placeholder: "从历史活动复制菜单到当前活动",
        }, ...__VLS_functionalComponentArgsRest(__VLS_205));
        __VLS_207.slots.default;
        for (const [event] of __VLS_getVForSourceType((__VLS_ctx.events.filter((item) => item.id !== __VLS_ctx.activeEventId)))) {
            const __VLS_208 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_209 = __VLS_asFunctionalComponent(__VLS_208, new __VLS_208({
                key: (event.id),
                label: (event.title),
                value: (event.id),
            }));
            const __VLS_210 = __VLS_209({
                key: (event.id),
                label: (event.title),
                value: (event.id),
            }, ...__VLS_functionalComponentArgsRest(__VLS_209));
        }
        var __VLS_207;
        const __VLS_212 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({
            ...{ 'onClick': {} },
            disabled: (!__VLS_ctx.copyTargetEventId),
        }));
        const __VLS_214 = __VLS_213({
            ...{ 'onClick': {} },
            disabled: (!__VLS_ctx.copyTargetEventId),
        }, ...__VLS_functionalComponentArgsRest(__VLS_213));
        let __VLS_216;
        let __VLS_217;
        let __VLS_218;
        const __VLS_219 = {
            onClick: (__VLS_ctx.copyMenuToActiveEvent)
        };
        __VLS_215.slots.default;
        var __VLS_215;
        const __VLS_220 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_221 = __VLS_asFunctionalComponent(__VLS_220, new __VLS_220({
            data: (__VLS_ctx.dishes),
            stripe: true,
        }));
        const __VLS_222 = __VLS_221({
            data: (__VLS_ctx.dishes),
            stripe: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_221));
        __VLS_223.slots.default;
        const __VLS_224 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_225 = __VLS_asFunctionalComponent(__VLS_224, new __VLS_224({
            prop: "name",
            label: "菜品",
            minWidth: "140",
        }));
        const __VLS_226 = __VLS_225({
            prop: "name",
            label: "菜品",
            minWidth: "140",
        }, ...__VLS_functionalComponentArgsRest(__VLS_225));
        const __VLS_228 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_229 = __VLS_asFunctionalComponent(__VLS_228, new __VLS_228({
            label: "分类",
            minWidth: "100",
        }));
        const __VLS_230 = __VLS_229({
            label: "分类",
            minWidth: "100",
        }, ...__VLS_functionalComponentArgsRest(__VLS_229));
        __VLS_231.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_231.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.category?.name);
        }
        var __VLS_231;
        const __VLS_232 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_233 = __VLS_asFunctionalComponent(__VLS_232, new __VLS_232({
            label: "标签",
            minWidth: "160",
        }));
        const __VLS_234 = __VLS_233({
            label: "标签",
            minWidth: "160",
        }, ...__VLS_functionalComponentArgsRest(__VLS_233));
        __VLS_235.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_235.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            for (const [tag] of __VLS_getVForSourceType((row.tags))) {
                const __VLS_236 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_237 = __VLS_asFunctionalComponent(__VLS_236, new __VLS_236({
                    key: (tag),
                    size: "small",
                }));
                const __VLS_238 = __VLS_237({
                    key: (tag),
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_237));
                __VLS_239.slots.default;
                (tag);
                var __VLS_239;
            }
        }
        var __VLS_235;
        const __VLS_240 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_241 = __VLS_asFunctionalComponent(__VLS_240, new __VLS_240({
            prop: "servingHint",
            label: "份量",
            minWidth: "120",
        }));
        const __VLS_242 = __VLS_241({
            prop: "servingHint",
            label: "份量",
            minWidth: "120",
        }, ...__VLS_functionalComponentArgsRest(__VLS_241));
        const __VLS_244 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_245 = __VLS_asFunctionalComponent(__VLS_244, new __VLS_244({
            label: "每份食材",
            minWidth: "220",
        }));
        const __VLS_246 = __VLS_245({
            label: "每份食材",
            minWidth: "220",
        }, ...__VLS_functionalComponentArgsRest(__VLS_245));
        __VLS_247.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_247.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "items-text" },
            });
            for (const [item] of __VLS_getVForSourceType((row.prepItems))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    key: (`${item.name}-${item.unit}`),
                });
                (item.name);
                (item.quantity);
                (item.unit);
            }
            if (!row.prepItems?.length) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            }
        }
        var __VLS_247;
        const __VLS_248 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_249 = __VLS_asFunctionalComponent(__VLS_248, new __VLS_248({
            label: "当前活动",
            width: "110",
        }));
        const __VLS_250 = __VLS_249({
            label: "当前活动",
            width: "110",
        }, ...__VLS_functionalComponentArgsRest(__VLS_249));
        __VLS_251.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_251.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_252 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_253 = __VLS_asFunctionalComponent(__VLS_252, new __VLS_252({
                type: (__VLS_ctx.activeEventDishIds.has(row.id) ? 'success' : 'info'),
            }));
            const __VLS_254 = __VLS_253({
                type: (__VLS_ctx.activeEventDishIds.has(row.id) ? 'success' : 'info'),
            }, ...__VLS_functionalComponentArgsRest(__VLS_253));
            __VLS_255.slots.default;
            (__VLS_ctx.activeEventDishIds.has(row.id) ? "已加入" : "未加入");
            var __VLS_255;
        }
        var __VLS_251;
        const __VLS_256 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_257 = __VLS_asFunctionalComponent(__VLS_256, new __VLS_256({
            label: "操作",
            width: "290",
        }));
        const __VLS_258 = __VLS_257({
            label: "操作",
            width: "290",
        }, ...__VLS_functionalComponentArgsRest(__VLS_257));
        __VLS_259.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_259.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_260 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_261 = __VLS_asFunctionalComponent(__VLS_260, new __VLS_260({
                ...{ 'onClick': {} },
                size: "small",
            }));
            const __VLS_262 = __VLS_261({
                ...{ 'onClick': {} },
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_261));
            let __VLS_264;
            let __VLS_265;
            let __VLS_266;
            const __VLS_267 = {
                onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.isAuthed))
                        return;
                    if (!(__VLS_ctx.activeTab === 'dishes'))
                        return;
                    __VLS_ctx.openDish(row);
                }
            };
            __VLS_263.slots.default;
            var __VLS_263;
            if (!__VLS_ctx.activeEventDishIds.has(row.id)) {
                const __VLS_268 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_269 = __VLS_asFunctionalComponent(__VLS_268, new __VLS_268({
                    ...{ 'onClick': {} },
                    size: "small",
                }));
                const __VLS_270 = __VLS_269({
                    ...{ 'onClick': {} },
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_269));
                let __VLS_272;
                let __VLS_273;
                let __VLS_274;
                const __VLS_275 = {
                    onClick: (...[$event]) => {
                        if (!!(!__VLS_ctx.isAuthed))
                            return;
                        if (!(__VLS_ctx.activeTab === 'dishes'))
                            return;
                        if (!(!__VLS_ctx.activeEventDishIds.has(row.id)))
                            return;
                        __VLS_ctx.addDishToEvent(row);
                    }
                };
                __VLS_271.slots.default;
                var __VLS_271;
            }
            else {
                const __VLS_276 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_277 = __VLS_asFunctionalComponent(__VLS_276, new __VLS_276({
                    ...{ 'onClick': {} },
                    size: "small",
                    type: "danger",
                }));
                const __VLS_278 = __VLS_277({
                    ...{ 'onClick': {} },
                    size: "small",
                    type: "danger",
                }, ...__VLS_functionalComponentArgsRest(__VLS_277));
                let __VLS_280;
                let __VLS_281;
                let __VLS_282;
                const __VLS_283 = {
                    onClick: (...[$event]) => {
                        if (!!(!__VLS_ctx.isAuthed))
                            return;
                        if (!(__VLS_ctx.activeTab === 'dishes'))
                            return;
                        if (!!(!__VLS_ctx.activeEventDishIds.has(row.id)))
                            return;
                        __VLS_ctx.removeDishFromEvent(row);
                    }
                };
                __VLS_279.slots.default;
                var __VLS_279;
            }
            const __VLS_284 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_285 = __VLS_asFunctionalComponent(__VLS_284, new __VLS_284({
                ...{ 'onClick': {} },
                size: "small",
                type: "danger",
                plain: true,
            }));
            const __VLS_286 = __VLS_285({
                ...{ 'onClick': {} },
                size: "small",
                type: "danger",
                plain: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_285));
            let __VLS_288;
            let __VLS_289;
            let __VLS_290;
            const __VLS_291 = {
                onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.isAuthed))
                        return;
                    if (!(__VLS_ctx.activeTab === 'dishes'))
                        return;
                    __VLS_ctx.deleteDish(row);
                }
            };
            __VLS_287.slots.default;
            var __VLS_287;
        }
        var __VLS_259;
        var __VLS_223;
    }
    if (__VLS_ctx.activeTab === 'orders') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "tool-section" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "section-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
        const __VLS_292 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_293 = __VLS_asFunctionalComponent(__VLS_292, new __VLS_292({
            data: (__VLS_ctx.orders),
            stripe: true,
        }));
        const __VLS_294 = __VLS_293({
            data: (__VLS_ctx.orders),
            stripe: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_293));
        __VLS_295.slots.default;
        const __VLS_296 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_297 = __VLS_asFunctionalComponent(__VLS_296, new __VLS_296({
            prop: "guestName",
            label: "昵称",
            width: "120",
        }));
        const __VLS_298 = __VLS_297({
            prop: "guestName",
            label: "昵称",
            width: "120",
        }, ...__VLS_functionalComponentArgsRest(__VLS_297));
        const __VLS_300 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_301 = __VLS_asFunctionalComponent(__VLS_300, new __VLS_300({
            label: "菜品",
            minWidth: "260",
        }));
        const __VLS_302 = __VLS_301({
            label: "菜品",
            minWidth: "260",
        }, ...__VLS_functionalComponentArgsRest(__VLS_301));
        __VLS_303.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_303.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "items-text" },
            });
            for (const [item] of __VLS_getVForSourceType((row.items))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    key: (item.id),
                });
                (item.dish.name);
                (item.quantity);
            }
        }
        var __VLS_303;
        const __VLS_304 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_305 = __VLS_asFunctionalComponent(__VLS_304, new __VLS_304({
            prop: "note",
            label: "备注",
            minWidth: "160",
        }));
        const __VLS_306 = __VLS_305({
            prop: "note",
            label: "备注",
            minWidth: "160",
        }, ...__VLS_functionalComponentArgsRest(__VLS_305));
        const __VLS_308 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_309 = __VLS_asFunctionalComponent(__VLS_308, new __VLS_308({
            label: "提交时间",
            width: "190",
        }));
        const __VLS_310 = __VLS_309({
            label: "提交时间",
            width: "190",
        }, ...__VLS_functionalComponentArgsRest(__VLS_309));
        __VLS_311.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_311.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (new Date(row.createdAt).toLocaleString());
        }
        var __VLS_311;
        const __VLS_312 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_313 = __VLS_asFunctionalComponent(__VLS_312, new __VLS_312({
            label: "操作",
            width: "100",
        }));
        const __VLS_314 = __VLS_313({
            label: "操作",
            width: "100",
        }, ...__VLS_functionalComponentArgsRest(__VLS_313));
        __VLS_315.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_315.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_316 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_317 = __VLS_asFunctionalComponent(__VLS_316, new __VLS_316({
                ...{ 'onClick': {} },
                size: "small",
                type: "danger",
            }));
            const __VLS_318 = __VLS_317({
                ...{ 'onClick': {} },
                size: "small",
                type: "danger",
            }, ...__VLS_functionalComponentArgsRest(__VLS_317));
            let __VLS_320;
            let __VLS_321;
            let __VLS_322;
            const __VLS_323 = {
                onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.isAuthed))
                        return;
                    if (!(__VLS_ctx.activeTab === 'orders'))
                        return;
                    __VLS_ctx.deleteOrder(row);
                }
            };
            __VLS_319.slots.default;
            var __VLS_319;
        }
        var __VLS_315;
        var __VLS_295;
    }
    if (__VLS_ctx.activeTab === 'kitchen') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "tool-section" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "section-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
            ...{ class: "subhead" },
        });
        const __VLS_324 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_325 = __VLS_asFunctionalComponent(__VLS_324, new __VLS_324({
            data: (__VLS_ctx.summary),
            stripe: true,
        }));
        const __VLS_326 = __VLS_325({
            data: (__VLS_ctx.summary),
            stripe: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_325));
        __VLS_327.slots.default;
        const __VLS_328 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_329 = __VLS_asFunctionalComponent(__VLS_328, new __VLS_328({
            label: "菜品",
            minWidth: "160",
        }));
        const __VLS_330 = __VLS_329({
            label: "菜品",
            minWidth: "160",
        }, ...__VLS_functionalComponentArgsRest(__VLS_329));
        __VLS_331.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_331.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.dish.name);
        }
        var __VLS_331;
        const __VLS_332 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_333 = __VLS_asFunctionalComponent(__VLS_332, new __VLS_332({
            prop: "quantity",
            label: "总份数",
            width: "100",
        }));
        const __VLS_334 = __VLS_333({
            prop: "quantity",
            label: "总份数",
            width: "100",
        }, ...__VLS_functionalComponentArgsRest(__VLS_333));
        const __VLS_336 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_337 = __VLS_asFunctionalComponent(__VLS_336, new __VLS_336({
            label: "点菜人",
            minWidth: "220",
        }));
        const __VLS_338 = __VLS_337({
            label: "点菜人",
            minWidth: "220",
        }, ...__VLS_functionalComponentArgsRest(__VLS_337));
        __VLS_339.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_339.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.guests.join("，"));
        }
        var __VLS_339;
        const __VLS_340 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_341 = __VLS_asFunctionalComponent(__VLS_340, new __VLS_340({
            label: "备注",
            minWidth: "220",
        }));
        const __VLS_342 = __VLS_341({
            label: "备注",
            minWidth: "220",
        }, ...__VLS_functionalComponentArgsRest(__VLS_341));
        __VLS_343.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_343.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.notes.join("；") || "无");
        }
        var __VLS_343;
        var __VLS_327;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
            ...{ class: "subhead" },
        });
        const __VLS_344 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_345 = __VLS_asFunctionalComponent(__VLS_344, new __VLS_344({
            data: (__VLS_ctx.ingredientSummary),
            stripe: true,
        }));
        const __VLS_346 = __VLS_345({
            data: (__VLS_ctx.ingredientSummary),
            stripe: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_345));
        __VLS_347.slots.default;
        const __VLS_348 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_349 = __VLS_asFunctionalComponent(__VLS_348, new __VLS_348({
            prop: "name",
            label: "食材",
            minWidth: "160",
        }));
        const __VLS_350 = __VLS_349({
            prop: "name",
            label: "食材",
            minWidth: "160",
        }, ...__VLS_functionalComponentArgsRest(__VLS_349));
        const __VLS_352 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_353 = __VLS_asFunctionalComponent(__VLS_352, new __VLS_352({
            label: "备菜数量",
            width: "140",
        }));
        const __VLS_354 = __VLS_353({
            label: "备菜数量",
            width: "140",
        }, ...__VLS_functionalComponentArgsRest(__VLS_353));
        __VLS_355.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_355.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.quantity);
            (row.unit);
        }
        var __VLS_355;
        const __VLS_356 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_357 = __VLS_asFunctionalComponent(__VLS_356, new __VLS_356({
            label: "来源菜品",
            minWidth: "260",
        }));
        const __VLS_358 = __VLS_357({
            label: "来源菜品",
            minWidth: "260",
        }, ...__VLS_functionalComponentArgsRest(__VLS_357));
        __VLS_359.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_359.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.sources.join("，"));
        }
        var __VLS_359;
        var __VLS_347;
    }
    const __VLS_360 = {}.ElDialog;
    /** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
    // @ts-ignore
    const __VLS_361 = __VLS_asFunctionalComponent(__VLS_360, new __VLS_360({
        modelValue: (__VLS_ctx.dishDialog),
        title: (__VLS_ctx.editingDishId ? '编辑菜品' : '新增菜品'),
        width: "680px",
    }));
    const __VLS_362 = __VLS_361({
        modelValue: (__VLS_ctx.dishDialog),
        title: (__VLS_ctx.editingDishId ? '编辑菜品' : '新增菜品'),
        width: "680px",
    }, ...__VLS_functionalComponentArgsRest(__VLS_361));
    __VLS_363.slots.default;
    const __VLS_364 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_365 = __VLS_asFunctionalComponent(__VLS_364, new __VLS_364({
        labelPosition: "top",
    }));
    const __VLS_366 = __VLS_365({
        labelPosition: "top",
    }, ...__VLS_functionalComponentArgsRest(__VLS_365));
    __VLS_367.slots.default;
    const __VLS_368 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_369 = __VLS_asFunctionalComponent(__VLS_368, new __VLS_368({
        label: "菜品名称",
    }));
    const __VLS_370 = __VLS_369({
        label: "菜品名称",
    }, ...__VLS_functionalComponentArgsRest(__VLS_369));
    __VLS_371.slots.default;
    const __VLS_372 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_373 = __VLS_asFunctionalComponent(__VLS_372, new __VLS_372({
        modelValue: (__VLS_ctx.dishForm.name),
    }));
    const __VLS_374 = __VLS_373({
        modelValue: (__VLS_ctx.dishForm.name),
    }, ...__VLS_functionalComponentArgsRest(__VLS_373));
    var __VLS_371;
    const __VLS_376 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_377 = __VLS_asFunctionalComponent(__VLS_376, new __VLS_376({
        label: "分类",
    }));
    const __VLS_378 = __VLS_377({
        label: "分类",
    }, ...__VLS_functionalComponentArgsRest(__VLS_377));
    __VLS_379.slots.default;
    const __VLS_380 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_381 = __VLS_asFunctionalComponent(__VLS_380, new __VLS_380({
        modelValue: (__VLS_ctx.dishForm.categoryId),
    }));
    const __VLS_382 = __VLS_381({
        modelValue: (__VLS_ctx.dishForm.categoryId),
    }, ...__VLS_functionalComponentArgsRest(__VLS_381));
    __VLS_383.slots.default;
    for (const [category] of __VLS_getVForSourceType((__VLS_ctx.categories))) {
        const __VLS_384 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_385 = __VLS_asFunctionalComponent(__VLS_384, new __VLS_384({
            key: (category.id),
            label: (category.name),
            value: (category.id),
        }));
        const __VLS_386 = __VLS_385({
            key: (category.id),
            label: (category.name),
            value: (category.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_385));
    }
    var __VLS_383;
    var __VLS_379;
    const __VLS_388 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_389 = __VLS_asFunctionalComponent(__VLS_388, new __VLS_388({
        label: "菜品图片",
    }));
    const __VLS_390 = __VLS_389({
        label: "菜品图片",
    }, ...__VLS_functionalComponentArgsRest(__VLS_389));
    __VLS_391.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "image-editor" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "image-preview" },
    });
    if (__VLS_ctx.dishForm.imageUrl) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
            src: (__VLS_ctx.dishForm.imageUrl),
            alt: "菜品图片预览",
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "image-actions" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ onChange: (__VLS_ctx.uploadDishImage) },
        ref: "imageInput",
        ...{ class: "hidden-input" },
        type: "file",
        accept: "image/png,image/jpeg,image/webp,image/gif",
    });
    /** @type {typeof __VLS_ctx.imageInput} */ ;
    const __VLS_392 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_393 = __VLS_asFunctionalComponent(__VLS_392, new __VLS_392({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.imageUploading),
    }));
    const __VLS_394 = __VLS_393({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.imageUploading),
    }, ...__VLS_functionalComponentArgsRest(__VLS_393));
    let __VLS_396;
    let __VLS_397;
    let __VLS_398;
    const __VLS_399 = {
        onClick: (__VLS_ctx.chooseImage)
    };
    __VLS_395.slots.default;
    var __VLS_395;
    const __VLS_400 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_401 = __VLS_asFunctionalComponent(__VLS_400, new __VLS_400({
        modelValue: (__VLS_ctx.dishForm.imageUrl),
        placeholder: "也可以粘贴图片 URL 或 /uploads/dishes/xxx.jpg",
    }));
    const __VLS_402 = __VLS_401({
        modelValue: (__VLS_ctx.dishForm.imageUrl),
        placeholder: "也可以粘贴图片 URL 或 /uploads/dishes/xxx.jpg",
    }, ...__VLS_functionalComponentArgsRest(__VLS_401));
    var __VLS_391;
    const __VLS_404 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_405 = __VLS_asFunctionalComponent(__VLS_404, new __VLS_404({
        label: "简介",
    }));
    const __VLS_406 = __VLS_405({
        label: "简介",
    }, ...__VLS_functionalComponentArgsRest(__VLS_405));
    __VLS_407.slots.default;
    const __VLS_408 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_409 = __VLS_asFunctionalComponent(__VLS_408, new __VLS_408({
        modelValue: (__VLS_ctx.dishForm.description),
        type: "textarea",
    }));
    const __VLS_410 = __VLS_409({
        modelValue: (__VLS_ctx.dishForm.description),
        type: "textarea",
    }, ...__VLS_functionalComponentArgsRest(__VLS_409));
    var __VLS_407;
    const __VLS_412 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_413 = __VLS_asFunctionalComponent(__VLS_412, new __VLS_412({
        label: "标签",
    }));
    const __VLS_414 = __VLS_413({
        label: "标签",
    }, ...__VLS_functionalComponentArgsRest(__VLS_413));
    __VLS_415.slots.default;
    const __VLS_416 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_417 = __VLS_asFunctionalComponent(__VLS_416, new __VLS_416({
        modelValue: (__VLS_ctx.dishForm.tagsText),
        placeholder: "微辣, 招牌, 素菜",
    }));
    const __VLS_418 = __VLS_417({
        modelValue: (__VLS_ctx.dishForm.tagsText),
        placeholder: "微辣, 招牌, 素菜",
    }, ...__VLS_functionalComponentArgsRest(__VLS_417));
    var __VLS_415;
    const __VLS_420 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_421 = __VLS_asFunctionalComponent(__VLS_420, new __VLS_420({
        label: "份量说明",
    }));
    const __VLS_422 = __VLS_421({
        label: "份量说明",
    }, ...__VLS_functionalComponentArgsRest(__VLS_421));
    __VLS_423.slots.default;
    const __VLS_424 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_425 = __VLS_asFunctionalComponent(__VLS_424, new __VLS_424({
        modelValue: (__VLS_ctx.dishForm.servingHint),
    }));
    const __VLS_426 = __VLS_425({
        modelValue: (__VLS_ctx.dishForm.servingHint),
    }, ...__VLS_functionalComponentArgsRest(__VLS_425));
    var __VLS_423;
    const __VLS_428 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_429 = __VLS_asFunctionalComponent(__VLS_428, new __VLS_428({
        label: "每份备菜食材",
    }));
    const __VLS_430 = __VLS_429({
        label: "每份备菜食材",
    }, ...__VLS_functionalComponentArgsRest(__VLS_429));
    __VLS_431.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "prep-editor" },
    });
    for (const [item, index] of __VLS_getVForSourceType((__VLS_ctx.dishForm.prepItems))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (index),
            ...{ class: "prep-row" },
        });
        const __VLS_432 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_433 = __VLS_asFunctionalComponent(__VLS_432, new __VLS_432({
            modelValue: (item.name),
            ...{ class: "prep-name" },
            placeholder: "食材",
        }));
        const __VLS_434 = __VLS_433({
            modelValue: (item.name),
            ...{ class: "prep-name" },
            placeholder: "食材",
        }, ...__VLS_functionalComponentArgsRest(__VLS_433));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "prep-meta" },
        });
        const __VLS_436 = {}.ElInputNumber;
        /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
        // @ts-ignore
        const __VLS_437 = __VLS_asFunctionalComponent(__VLS_436, new __VLS_436({
            modelValue: (item.quantity),
            ...{ class: "prep-quantity" },
            min: (0.01),
            step: (1),
            controlsPosition: "right",
        }));
        const __VLS_438 = __VLS_437({
            modelValue: (item.quantity),
            ...{ class: "prep-quantity" },
            min: (0.01),
            step: (1),
            controlsPosition: "right",
        }, ...__VLS_functionalComponentArgsRest(__VLS_437));
        const __VLS_440 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_441 = __VLS_asFunctionalComponent(__VLS_440, new __VLS_440({
            modelValue: (item.unit),
            ...{ class: "prep-unit" },
            placeholder: "单位",
        }));
        const __VLS_442 = __VLS_441({
            modelValue: (item.unit),
            ...{ class: "prep-unit" },
            placeholder: "单位",
        }, ...__VLS_functionalComponentArgsRest(__VLS_441));
        const __VLS_444 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_445 = __VLS_asFunctionalComponent(__VLS_444, new __VLS_444({
            ...{ 'onClick': {} },
            ...{ class: "prep-remove" },
        }));
        const __VLS_446 = __VLS_445({
            ...{ 'onClick': {} },
            ...{ class: "prep-remove" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_445));
        let __VLS_448;
        let __VLS_449;
        let __VLS_450;
        const __VLS_451 = {
            onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.isAuthed))
                    return;
                __VLS_ctx.removePrepItem(index);
            }
        };
        __VLS_447.slots.default;
        var __VLS_447;
    }
    const __VLS_452 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_453 = __VLS_asFunctionalComponent(__VLS_452, new __VLS_452({
        ...{ 'onClick': {} },
        ...{ class: "prep-add" },
    }));
    const __VLS_454 = __VLS_453({
        ...{ 'onClick': {} },
        ...{ class: "prep-add" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_453));
    let __VLS_456;
    let __VLS_457;
    let __VLS_458;
    const __VLS_459 = {
        onClick: (__VLS_ctx.addPrepItem)
    };
    __VLS_455.slots.default;
    var __VLS_455;
    var __VLS_431;
    var __VLS_367;
    {
        const { footer: __VLS_thisSlot } = __VLS_363.slots;
        const __VLS_460 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_461 = __VLS_asFunctionalComponent(__VLS_460, new __VLS_460({
            ...{ 'onClick': {} },
        }));
        const __VLS_462 = __VLS_461({
            ...{ 'onClick': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_461));
        let __VLS_464;
        let __VLS_465;
        let __VLS_466;
        const __VLS_467 = {
            onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.isAuthed))
                    return;
                __VLS_ctx.dishDialog = false;
            }
        };
        __VLS_463.slots.default;
        var __VLS_463;
        const __VLS_468 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_469 = __VLS_asFunctionalComponent(__VLS_468, new __VLS_468({
            ...{ 'onClick': {} },
            type: "primary",
        }));
        const __VLS_470 = __VLS_469({
            ...{ 'onClick': {} },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_469));
        let __VLS_472;
        let __VLS_473;
        let __VLS_474;
        const __VLS_475 = {
            onClick: (__VLS_ctx.saveDish)
        };
        __VLS_471.slots.default;
        var __VLS_471;
    }
    var __VLS_363;
    const __VLS_476 = {}.ElDialog;
    /** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
    // @ts-ignore
    const __VLS_477 = __VLS_asFunctionalComponent(__VLS_476, new __VLS_476({
        modelValue: (__VLS_ctx.eventDialog),
        title: (__VLS_ctx.editingEventId ? '编辑活动' : '新建活动'),
        width: "560px",
    }));
    const __VLS_478 = __VLS_477({
        modelValue: (__VLS_ctx.eventDialog),
        title: (__VLS_ctx.editingEventId ? '编辑活动' : '新建活动'),
        width: "560px",
    }, ...__VLS_functionalComponentArgsRest(__VLS_477));
    __VLS_479.slots.default;
    const __VLS_480 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_481 = __VLS_asFunctionalComponent(__VLS_480, new __VLS_480({
        labelPosition: "top",
    }));
    const __VLS_482 = __VLS_481({
        labelPosition: "top",
    }, ...__VLS_functionalComponentArgsRest(__VLS_481));
    __VLS_483.slots.default;
    const __VLS_484 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_485 = __VLS_asFunctionalComponent(__VLS_484, new __VLS_484({
        label: "活动名称",
    }));
    const __VLS_486 = __VLS_485({
        label: "活动名称",
    }, ...__VLS_functionalComponentArgsRest(__VLS_485));
    __VLS_487.slots.default;
    const __VLS_488 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_489 = __VLS_asFunctionalComponent(__VLS_488, new __VLS_488({
        modelValue: (__VLS_ctx.eventForm.title),
    }));
    const __VLS_490 = __VLS_489({
        modelValue: (__VLS_ctx.eventForm.title),
    }, ...__VLS_functionalComponentArgsRest(__VLS_489));
    var __VLS_487;
    const __VLS_492 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_493 = __VLS_asFunctionalComponent(__VLS_492, new __VLS_492({
        label: "说明",
    }));
    const __VLS_494 = __VLS_493({
        label: "说明",
    }, ...__VLS_functionalComponentArgsRest(__VLS_493));
    __VLS_495.slots.default;
    const __VLS_496 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_497 = __VLS_asFunctionalComponent(__VLS_496, new __VLS_496({
        modelValue: (__VLS_ctx.eventForm.description),
        type: "textarea",
    }));
    const __VLS_498 = __VLS_497({
        modelValue: (__VLS_ctx.eventForm.description),
        type: "textarea",
    }, ...__VLS_functionalComponentArgsRest(__VLS_497));
    var __VLS_495;
    const __VLS_500 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_501 = __VLS_asFunctionalComponent(__VLS_500, new __VLS_500({
        label: "访问短码",
    }));
    const __VLS_502 = __VLS_501({
        label: "访问短码",
    }, ...__VLS_functionalComponentArgsRest(__VLS_501));
    __VLS_503.slots.default;
    const __VLS_504 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_505 = __VLS_asFunctionalComponent(__VLS_504, new __VLS_504({
        modelValue: (__VLS_ctx.eventForm.accessCode),
    }));
    const __VLS_506 = __VLS_505({
        modelValue: (__VLS_ctx.eventForm.accessCode),
    }, ...__VLS_functionalComponentArgsRest(__VLS_505));
    var __VLS_503;
    const __VLS_508 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_509 = __VLS_asFunctionalComponent(__VLS_508, new __VLS_508({
        label: "聚餐时间",
    }));
    const __VLS_510 = __VLS_509({
        label: "聚餐时间",
    }, ...__VLS_functionalComponentArgsRest(__VLS_509));
    __VLS_511.slots.default;
    const __VLS_512 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_513 = __VLS_asFunctionalComponent(__VLS_512, new __VLS_512({
        modelValue: (__VLS_ctx.eventForm.dateTime),
        type: "datetime-local",
    }));
    const __VLS_514 = __VLS_513({
        modelValue: (__VLS_ctx.eventForm.dateTime),
        type: "datetime-local",
    }, ...__VLS_functionalComponentArgsRest(__VLS_513));
    var __VLS_511;
    const __VLS_516 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_517 = __VLS_asFunctionalComponent(__VLS_516, new __VLS_516({
        label: "状态",
    }));
    const __VLS_518 = __VLS_517({
        label: "状态",
    }, ...__VLS_functionalComponentArgsRest(__VLS_517));
    __VLS_519.slots.default;
    const __VLS_520 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_521 = __VLS_asFunctionalComponent(__VLS_520, new __VLS_520({
        modelValue: (__VLS_ctx.eventForm.status),
    }));
    const __VLS_522 = __VLS_521({
        modelValue: (__VLS_ctx.eventForm.status),
    }, ...__VLS_functionalComponentArgsRest(__VLS_521));
    __VLS_523.slots.default;
    const __VLS_524 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_525 = __VLS_asFunctionalComponent(__VLS_524, new __VLS_524({
        label: "开放点菜",
        value: "OPEN",
    }));
    const __VLS_526 = __VLS_525({
        label: "开放点菜",
        value: "OPEN",
    }, ...__VLS_functionalComponentArgsRest(__VLS_525));
    const __VLS_528 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_529 = __VLS_asFunctionalComponent(__VLS_528, new __VLS_528({
        label: "草稿",
        value: "DRAFT",
    }));
    const __VLS_530 = __VLS_529({
        label: "草稿",
        value: "DRAFT",
    }, ...__VLS_functionalComponentArgsRest(__VLS_529));
    const __VLS_532 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_533 = __VLS_asFunctionalComponent(__VLS_532, new __VLS_532({
        label: "关闭",
        value: "CLOSED",
    }));
    const __VLS_534 = __VLS_533({
        label: "关闭",
        value: "CLOSED",
    }, ...__VLS_functionalComponentArgsRest(__VLS_533));
    var __VLS_523;
    var __VLS_519;
    if (!__VLS_ctx.editingEventId) {
        const __VLS_536 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_537 = __VLS_asFunctionalComponent(__VLS_536, new __VLS_536({
            label: "初始菜单",
        }));
        const __VLS_538 = __VLS_537({
            label: "初始菜单",
        }, ...__VLS_functionalComponentArgsRest(__VLS_537));
        __VLS_539.slots.default;
        const __VLS_540 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_541 = __VLS_asFunctionalComponent(__VLS_540, new __VLS_540({
            modelValue: (__VLS_ctx.eventForm.copyFromEventId),
            clearable: true,
            placeholder: "可选：从已有活动复制菜单",
        }));
        const __VLS_542 = __VLS_541({
            modelValue: (__VLS_ctx.eventForm.copyFromEventId),
            clearable: true,
            placeholder: "可选：从已有活动复制菜单",
        }, ...__VLS_functionalComponentArgsRest(__VLS_541));
        __VLS_543.slots.default;
        for (const [event] of __VLS_getVForSourceType((__VLS_ctx.events))) {
            const __VLS_544 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_545 = __VLS_asFunctionalComponent(__VLS_544, new __VLS_544({
                key: (event.id),
                label: (event.title),
                value: (event.id),
            }));
            const __VLS_546 = __VLS_545({
                key: (event.id),
                label: (event.title),
                value: (event.id),
            }, ...__VLS_functionalComponentArgsRest(__VLS_545));
        }
        var __VLS_543;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "form-help" },
        });
        var __VLS_539;
    }
    const __VLS_548 = {}.ElCheckbox;
    /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
    // @ts-ignore
    const __VLS_549 = __VLS_asFunctionalComponent(__VLS_548, new __VLS_548({
        modelValue: (__VLS_ctx.eventForm.showSummary),
    }));
    const __VLS_550 = __VLS_549({
        modelValue: (__VLS_ctx.eventForm.showSummary),
    }, ...__VLS_functionalComponentArgsRest(__VLS_549));
    __VLS_551.slots.default;
    var __VLS_551;
    var __VLS_483;
    {
        const { footer: __VLS_thisSlot } = __VLS_479.slots;
        const __VLS_552 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_553 = __VLS_asFunctionalComponent(__VLS_552, new __VLS_552({
            ...{ 'onClick': {} },
        }));
        const __VLS_554 = __VLS_553({
            ...{ 'onClick': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_553));
        let __VLS_556;
        let __VLS_557;
        let __VLS_558;
        const __VLS_559 = {
            onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.isAuthed))
                    return;
                __VLS_ctx.eventDialog = false;
            }
        };
        __VLS_555.slots.default;
        var __VLS_555;
        const __VLS_560 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_561 = __VLS_asFunctionalComponent(__VLS_560, new __VLS_560({
            ...{ 'onClick': {} },
            type: "primary",
        }));
        const __VLS_562 = __VLS_561({
            ...{ 'onClick': {} },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_561));
        let __VLS_564;
        let __VLS_565;
        let __VLS_566;
        const __VLS_567 = {
            onClick: (__VLS_ctx.saveEvent)
        };
        __VLS_563.slots.default;
        (__VLS_ctx.editingEventId ? "保存" : "创建");
        var __VLS_563;
    }
    var __VLS_479;
    const __VLS_568 = {}.ElDialog;
    /** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
    // @ts-ignore
    const __VLS_569 = __VLS_asFunctionalComponent(__VLS_568, new __VLS_568({
        modelValue: (__VLS_ctx.passwordDialog),
        title: "修改密码",
        width: "460px",
    }));
    const __VLS_570 = __VLS_569({
        modelValue: (__VLS_ctx.passwordDialog),
        title: "修改密码",
        width: "460px",
    }, ...__VLS_functionalComponentArgsRest(__VLS_569));
    __VLS_571.slots.default;
    const __VLS_572 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_573 = __VLS_asFunctionalComponent(__VLS_572, new __VLS_572({
        labelPosition: "top",
    }));
    const __VLS_574 = __VLS_573({
        labelPosition: "top",
    }, ...__VLS_functionalComponentArgsRest(__VLS_573));
    __VLS_575.slots.default;
    const __VLS_576 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_577 = __VLS_asFunctionalComponent(__VLS_576, new __VLS_576({
        label: "原密码",
    }));
    const __VLS_578 = __VLS_577({
        label: "原密码",
    }, ...__VLS_functionalComponentArgsRest(__VLS_577));
    __VLS_579.slots.default;
    const __VLS_580 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_581 = __VLS_asFunctionalComponent(__VLS_580, new __VLS_580({
        modelValue: (__VLS_ctx.passwordForm.oldPassword),
        type: "password",
        showPassword: true,
        autocomplete: "current-password",
    }));
    const __VLS_582 = __VLS_581({
        modelValue: (__VLS_ctx.passwordForm.oldPassword),
        type: "password",
        showPassword: true,
        autocomplete: "current-password",
    }, ...__VLS_functionalComponentArgsRest(__VLS_581));
    var __VLS_579;
    const __VLS_584 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_585 = __VLS_asFunctionalComponent(__VLS_584, new __VLS_584({
        label: "新密码",
    }));
    const __VLS_586 = __VLS_585({
        label: "新密码",
    }, ...__VLS_functionalComponentArgsRest(__VLS_585));
    __VLS_587.slots.default;
    const __VLS_588 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_589 = __VLS_asFunctionalComponent(__VLS_588, new __VLS_588({
        modelValue: (__VLS_ctx.passwordForm.newPassword),
        type: "password",
        showPassword: true,
        autocomplete: "new-password",
        placeholder: "至少 8 位",
    }));
    const __VLS_590 = __VLS_589({
        modelValue: (__VLS_ctx.passwordForm.newPassword),
        type: "password",
        showPassword: true,
        autocomplete: "new-password",
        placeholder: "至少 8 位",
    }, ...__VLS_functionalComponentArgsRest(__VLS_589));
    var __VLS_587;
    const __VLS_592 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_593 = __VLS_asFunctionalComponent(__VLS_592, new __VLS_592({
        label: "确认新密码",
    }));
    const __VLS_594 = __VLS_593({
        label: "确认新密码",
    }, ...__VLS_functionalComponentArgsRest(__VLS_593));
    __VLS_595.slots.default;
    const __VLS_596 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_597 = __VLS_asFunctionalComponent(__VLS_596, new __VLS_596({
        ...{ 'onKeyup': {} },
        modelValue: (__VLS_ctx.passwordForm.confirmPassword),
        type: "password",
        showPassword: true,
        autocomplete: "new-password",
    }));
    const __VLS_598 = __VLS_597({
        ...{ 'onKeyup': {} },
        modelValue: (__VLS_ctx.passwordForm.confirmPassword),
        type: "password",
        showPassword: true,
        autocomplete: "new-password",
    }, ...__VLS_functionalComponentArgsRest(__VLS_597));
    let __VLS_600;
    let __VLS_601;
    let __VLS_602;
    const __VLS_603 = {
        onKeyup: (__VLS_ctx.savePassword)
    };
    var __VLS_599;
    var __VLS_595;
    var __VLS_575;
    {
        const { footer: __VLS_thisSlot } = __VLS_571.slots;
        const __VLS_604 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_605 = __VLS_asFunctionalComponent(__VLS_604, new __VLS_604({
            ...{ 'onClick': {} },
        }));
        const __VLS_606 = __VLS_605({
            ...{ 'onClick': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_605));
        let __VLS_608;
        let __VLS_609;
        let __VLS_610;
        const __VLS_611 = {
            onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.isAuthed))
                    return;
                __VLS_ctx.passwordDialog = false;
            }
        };
        __VLS_607.slots.default;
        var __VLS_607;
        const __VLS_612 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_613 = __VLS_asFunctionalComponent(__VLS_612, new __VLS_612({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.passwordSaving),
        }));
        const __VLS_614 = __VLS_613({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.passwordSaving),
        }, ...__VLS_functionalComponentArgsRest(__VLS_613));
        let __VLS_616;
        let __VLS_617;
        let __VLS_618;
        const __VLS_619 = {
            onClick: (__VLS_ctx.savePassword)
        };
        __VLS_615.slots.default;
        var __VLS_615;
    }
    var __VLS_571;
}
/** @type {__VLS_StyleScopedClasses['login-page']} */ ;
/** @type {__VLS_StyleScopedClasses['login-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['brand']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-side']} */ ;
/** @type {__VLS_StyleScopedClasses['side-title']} */ ;
/** @type {__VLS_StyleScopedClasses['utility']} */ ;
/** @type {__VLS_StyleScopedClasses['plain']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-main']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-top']} */ ;
/** @type {__VLS_StyleScopedClasses['muted']} */ ;
/** @type {__VLS_StyleScopedClasses['top-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['metric']} */ ;
/** @type {__VLS_StyleScopedClasses['clickable']} */ ;
/** @type {__VLS_StyleScopedClasses['metric']} */ ;
/** @type {__VLS_StyleScopedClasses['qr-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['band-title']} */ ;
/** @type {__VLS_StyleScopedClasses['muted']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-section']} */ ;
/** @type {__VLS_StyleScopedClasses['section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-section']} */ ;
/** @type {__VLS_StyleScopedClasses['section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['copy-menu-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['items-text']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-section']} */ ;
/** @type {__VLS_StyleScopedClasses['section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['items-text']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-section']} */ ;
/** @type {__VLS_StyleScopedClasses['section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['subhead']} */ ;
/** @type {__VLS_StyleScopedClasses['subhead']} */ ;
/** @type {__VLS_StyleScopedClasses['image-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['image-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['image-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['hidden-input']} */ ;
/** @type {__VLS_StyleScopedClasses['prep-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['prep-row']} */ ;
/** @type {__VLS_StyleScopedClasses['prep-name']} */ ;
/** @type {__VLS_StyleScopedClasses['prep-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['prep-quantity']} */ ;
/** @type {__VLS_StyleScopedClasses['prep-unit']} */ ;
/** @type {__VLS_StyleScopedClasses['prep-remove']} */ ;
/** @type {__VLS_StyleScopedClasses['prep-add']} */ ;
/** @type {__VLS_StyleScopedClasses['form-help']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            CalendarPlus: CalendarPlus,
            ChefHat: ChefHat,
            ClipboardList: ClipboardList,
            KeyRound: KeyRound,
            LayoutDashboard: LayoutDashboard,
            LogIn: LogIn,
            LogOut: LogOut,
            QrCode: QrCode,
            RefreshCw: RefreshCw,
            Soup: Soup,
            isAuthed: isAuthed,
            loginForm: loginForm,
            loginLoading: loginLoading,
            events: events,
            categories: categories,
            dishes: dishes,
            orders: orders,
            summary: summary,
            ingredientSummary: ingredientSummary,
            qrcode: qrcode,
            activeEventDishIds: activeEventDishIds,
            activeEventId: activeEventId,
            activeTab: activeTab,
            dishDialog: dishDialog,
            eventDialog: eventDialog,
            passwordDialog: passwordDialog,
            passwordSaving: passwordSaving,
            editingDishId: editingDishId,
            editingEventId: editingEventId,
            copyTargetEventId: copyTargetEventId,
            imageInput: imageInput,
            imageUploading: imageUploading,
            dishForm: dishForm,
            eventForm: eventForm,
            passwordForm: passwordForm,
            activeEvent: activeEvent,
            login: login,
            loadAdmin: loadAdmin,
            loadEventData: loadEventData,
            openDish: openDish,
            saveDish: saveDish,
            eventStatusText: eventStatusText,
            eventStatusType: eventStatusType,
            openEvent: openEvent,
            saveEvent: saveEvent,
            updateEventStatus: updateEventStatus,
            deleteEvent: deleteEvent,
            viewEvent: viewEvent,
            copyMenuToActiveEvent: copyMenuToActiveEvent,
            addPrepItem: addPrepItem,
            removePrepItem: removePrepItem,
            chooseImage: chooseImage,
            uploadDishImage: uploadDishImage,
            addDishToEvent: addDishToEvent,
            removeDishFromEvent: removeDishFromEvent,
            deleteOrder: deleteOrder,
            deleteDish: deleteDish,
            openPasswordDialog: openPasswordDialog,
            savePassword: savePassword,
            logout: logout,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
