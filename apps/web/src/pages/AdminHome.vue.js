import { CalendarPlus, ChefHat, ClipboardList, LogIn, QrCode, RefreshCw, Soup } from "lucide-vue-next";
import { ElMessage, ElMessageBox } from "element-plus";
import { computed, onMounted, reactive, ref } from "vue";
import { request } from "../api";
const isAuthed = computed(() => Boolean(localStorage.getItem("adminToken")));
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
const activeEvent = computed(() => events.value.find((event) => event.id === activeEventId.value));
async function login() {
    loginLoading.value = true;
    try {
        const result = await request("/api/admin/login", {
            method: "POST",
            body: JSON.stringify(loginForm)
        });
        localStorage.setItem("adminToken", result.token);
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
        request(`/api/admin/events/${activeEventId.value}/qrcode?origin=${encodeURIComponent(location.origin)}`)
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
function logout() {
    localStorage.removeItem("adminToken");
    location.reload();
}
onMounted(loadAdmin);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['brand']} */ ;
/** @type {__VLS_StyleScopedClasses['brand']} */ ;
/** @type {__VLS_StyleScopedClasses['side-title']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-side']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-side']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-side']} */ ;
/** @type {__VLS_StyleScopedClasses['metric']} */ ;
/** @type {__VLS_StyleScopedClasses['metric']} */ ;
/** @type {__VLS_StyleScopedClasses['metric']} */ ;
/** @type {__VLS_StyleScopedClasses['clickable']} */ ;
/** @type {__VLS_StyleScopedClasses['metric']} */ ;
/** @type {__VLS_StyleScopedClasses['qr-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['qr-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-section']} */ ;
/** @type {__VLS_StyleScopedClasses['items-text']} */ ;
/** @type {__VLS_StyleScopedClasses['subhead']} */ ;
/** @type {__VLS_StyleScopedClasses['image-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-side']} */ ;
/** @type {__VLS_StyleScopedClasses['side-title']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-side']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-top']} */ ;
/** @type {__VLS_StyleScopedClasses['qr-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['copy-menu-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['prep-row']} */ ;
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.isAuthed))
                    return;
                __VLS_ctx.activeTab = 'events';
            } },
        ...{ class: ({ active: __VLS_ctx.activeTab === 'events' }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.isAuthed))
                    return;
                __VLS_ctx.activeTab = 'dishes';
            } },
        ...{ class: ({ active: __VLS_ctx.activeTab === 'dishes' }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.isAuthed))
                    return;
                __VLS_ctx.activeTab = 'orders';
            } },
        ...{ class: ({ active: __VLS_ctx.activeTab === 'orders' }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.isAuthed))
                    return;
                __VLS_ctx.activeTab = 'kitchen';
            } },
        ...{ class: ({ active: __VLS_ctx.activeTab === 'kitchen' }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.logout) },
        ...{ class: "plain" },
    });
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
    const __VLS_44 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.activeEventId),
        placeholder: "选择活动",
    }));
    const __VLS_46 = __VLS_45({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.activeEventId),
        placeholder: "选择活动",
    }, ...__VLS_functionalComponentArgsRest(__VLS_45));
    let __VLS_48;
    let __VLS_49;
    let __VLS_50;
    const __VLS_51 = {
        onChange: (__VLS_ctx.loadEventData)
    };
    __VLS_47.slots.default;
    for (const [event] of __VLS_getVForSourceType((__VLS_ctx.events))) {
        const __VLS_52 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
            key: (event.id),
            label: (event.title),
            value: (event.id),
        }));
        const __VLS_54 = __VLS_53({
            key: (event.id),
            label: (event.title),
            value: (event.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_53));
    }
    var __VLS_47;
    const __VLS_56 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
        ...{ 'onClick': {} },
    }));
    const __VLS_58 = __VLS_57({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_57));
    let __VLS_60;
    let __VLS_61;
    let __VLS_62;
    const __VLS_63 = {
        onClick: (__VLS_ctx.loadAdmin)
    };
    __VLS_59.slots.default;
    const __VLS_64 = {}.RefreshCw;
    /** @type {[typeof __VLS_components.RefreshCw, ]} */ ;
    // @ts-ignore
    const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
        size: (16),
    }));
    const __VLS_66 = __VLS_65({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_65));
    var __VLS_59;
    const __VLS_68 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_70 = __VLS_69({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_69));
    let __VLS_72;
    let __VLS_73;
    let __VLS_74;
    const __VLS_75 = {
        onClick: (__VLS_ctx.openEvent)
    };
    __VLS_71.slots.default;
    const __VLS_76 = {}.CalendarPlus;
    /** @type {[typeof __VLS_components.CalendarPlus, ]} */ ;
    // @ts-ignore
    const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
        size: (16),
    }));
    const __VLS_78 = __VLS_77({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_77));
    var __VLS_71;
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
        const __VLS_80 = {}.ClipboardList;
        /** @type {[typeof __VLS_components.ClipboardList, ]} */ ;
        // @ts-ignore
        const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
            size: (22),
        }));
        const __VLS_82 = __VLS_81({
            size: (22),
        }, ...__VLS_functionalComponentArgsRest(__VLS_81));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.orders.length);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            ...{ class: "metric" },
        });
        const __VLS_84 = {}.Soup;
        /** @type {[typeof __VLS_components.Soup, ]} */ ;
        // @ts-ignore
        const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
            size: (22),
        }));
        const __VLS_86 = __VLS_85({
            size: (22),
        }, ...__VLS_functionalComponentArgsRest(__VLS_85));
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
        const __VLS_88 = {}.QrCode;
        /** @type {[typeof __VLS_components.QrCode, ]} */ ;
        // @ts-ignore
        const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
            size: (18),
        }));
        const __VLS_90 = __VLS_89({
            size: (18),
        }, ...__VLS_functionalComponentArgsRest(__VLS_89));
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
        const __VLS_92 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
            ...{ 'onClick': {} },
            type: "primary",
        }));
        const __VLS_94 = __VLS_93({
            ...{ 'onClick': {} },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_93));
        let __VLS_96;
        let __VLS_97;
        let __VLS_98;
        const __VLS_99 = {
            onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.isAuthed))
                    return;
                if (!(__VLS_ctx.activeTab === 'events'))
                    return;
                __VLS_ctx.openEvent();
            }
        };
        __VLS_95.slots.default;
        var __VLS_95;
        const __VLS_100 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
            data: (__VLS_ctx.events),
            stripe: true,
        }));
        const __VLS_102 = __VLS_101({
            data: (__VLS_ctx.events),
            stripe: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_101));
        __VLS_103.slots.default;
        const __VLS_104 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
            prop: "title",
            label: "活动",
            minWidth: "180",
        }));
        const __VLS_106 = __VLS_105({
            prop: "title",
            label: "活动",
            minWidth: "180",
        }, ...__VLS_functionalComponentArgsRest(__VLS_105));
        const __VLS_108 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
            prop: "accessCode",
            label: "访问短码",
            minWidth: "140",
        }));
        const __VLS_110 = __VLS_109({
            prop: "accessCode",
            label: "访问短码",
            minWidth: "140",
        }, ...__VLS_functionalComponentArgsRest(__VLS_109));
        const __VLS_112 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
            label: "状态",
            width: "110",
        }));
        const __VLS_114 = __VLS_113({
            label: "状态",
            width: "110",
        }, ...__VLS_functionalComponentArgsRest(__VLS_113));
        __VLS_115.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_115.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_116 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
                type: (__VLS_ctx.eventStatusType(row.status)),
            }));
            const __VLS_118 = __VLS_117({
                type: (__VLS_ctx.eventStatusType(row.status)),
            }, ...__VLS_functionalComponentArgsRest(__VLS_117));
            __VLS_119.slots.default;
            (__VLS_ctx.eventStatusText(row.status));
            var __VLS_119;
        }
        var __VLS_115;
        const __VLS_120 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
            label: "聚餐时间",
            width: "180",
        }));
        const __VLS_122 = __VLS_121({
            label: "聚餐时间",
            width: "180",
        }, ...__VLS_functionalComponentArgsRest(__VLS_121));
        __VLS_123.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_123.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.dateTime ? new Date(row.dateTime).toLocaleString() : "未设置");
        }
        var __VLS_123;
        const __VLS_124 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
            label: "操作",
            width: "380",
        }));
        const __VLS_126 = __VLS_125({
            label: "操作",
            width: "380",
        }, ...__VLS_functionalComponentArgsRest(__VLS_125));
        __VLS_127.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_127.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_128 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
                ...{ 'onClick': {} },
                size: "small",
            }));
            const __VLS_130 = __VLS_129({
                ...{ 'onClick': {} },
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_129));
            let __VLS_132;
            let __VLS_133;
            let __VLS_134;
            const __VLS_135 = {
                onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.isAuthed))
                        return;
                    if (!(__VLS_ctx.activeTab === 'events'))
                        return;
                    __VLS_ctx.viewEvent(row);
                }
            };
            __VLS_131.slots.default;
            var __VLS_131;
            const __VLS_136 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
                ...{ 'onClick': {} },
                size: "small",
            }));
            const __VLS_138 = __VLS_137({
                ...{ 'onClick': {} },
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_137));
            let __VLS_140;
            let __VLS_141;
            let __VLS_142;
            const __VLS_143 = {
                onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.isAuthed))
                        return;
                    if (!(__VLS_ctx.activeTab === 'events'))
                        return;
                    __VLS_ctx.openEvent(row);
                }
            };
            __VLS_139.slots.default;
            var __VLS_139;
            if (row.status !== 'OPEN') {
                const __VLS_144 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
                    ...{ 'onClick': {} },
                    size: "small",
                    type: "success",
                }));
                const __VLS_146 = __VLS_145({
                    ...{ 'onClick': {} },
                    size: "small",
                    type: "success",
                }, ...__VLS_functionalComponentArgsRest(__VLS_145));
                let __VLS_148;
                let __VLS_149;
                let __VLS_150;
                const __VLS_151 = {
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
                __VLS_147.slots.default;
                var __VLS_147;
            }
            if (row.status !== 'CLOSED') {
                const __VLS_152 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
                    ...{ 'onClick': {} },
                    size: "small",
                    type: "info",
                }));
                const __VLS_154 = __VLS_153({
                    ...{ 'onClick': {} },
                    size: "small",
                    type: "info",
                }, ...__VLS_functionalComponentArgsRest(__VLS_153));
                let __VLS_156;
                let __VLS_157;
                let __VLS_158;
                const __VLS_159 = {
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
                __VLS_155.slots.default;
                var __VLS_155;
            }
            const __VLS_160 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
                ...{ 'onClick': {} },
                size: "small",
                type: "danger",
            }));
            const __VLS_162 = __VLS_161({
                ...{ 'onClick': {} },
                size: "small",
                type: "danger",
            }, ...__VLS_functionalComponentArgsRest(__VLS_161));
            let __VLS_164;
            let __VLS_165;
            let __VLS_166;
            const __VLS_167 = {
                onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.isAuthed))
                        return;
                    if (!(__VLS_ctx.activeTab === 'events'))
                        return;
                    __VLS_ctx.deleteEvent(row);
                }
            };
            __VLS_163.slots.default;
            var __VLS_163;
        }
        var __VLS_127;
        var __VLS_103;
    }
    if (__VLS_ctx.activeTab === 'dishes') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "tool-section" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "section-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
        const __VLS_168 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
            ...{ 'onClick': {} },
            type: "primary",
        }));
        const __VLS_170 = __VLS_169({
            ...{ 'onClick': {} },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_169));
        let __VLS_172;
        let __VLS_173;
        let __VLS_174;
        const __VLS_175 = {
            onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.isAuthed))
                    return;
                if (!(__VLS_ctx.activeTab === 'dishes'))
                    return;
                __VLS_ctx.openDish();
            }
        };
        __VLS_171.slots.default;
        var __VLS_171;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "copy-menu-bar" },
        });
        const __VLS_176 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
            modelValue: (__VLS_ctx.copyTargetEventId),
            placeholder: "从历史活动复制菜单到当前活动",
        }));
        const __VLS_178 = __VLS_177({
            modelValue: (__VLS_ctx.copyTargetEventId),
            placeholder: "从历史活动复制菜单到当前活动",
        }, ...__VLS_functionalComponentArgsRest(__VLS_177));
        __VLS_179.slots.default;
        for (const [event] of __VLS_getVForSourceType((__VLS_ctx.events.filter((item) => item.id !== __VLS_ctx.activeEventId)))) {
            const __VLS_180 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
                key: (event.id),
                label: (event.title),
                value: (event.id),
            }));
            const __VLS_182 = __VLS_181({
                key: (event.id),
                label: (event.title),
                value: (event.id),
            }, ...__VLS_functionalComponentArgsRest(__VLS_181));
        }
        var __VLS_179;
        const __VLS_184 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
            ...{ 'onClick': {} },
            disabled: (!__VLS_ctx.copyTargetEventId),
        }));
        const __VLS_186 = __VLS_185({
            ...{ 'onClick': {} },
            disabled: (!__VLS_ctx.copyTargetEventId),
        }, ...__VLS_functionalComponentArgsRest(__VLS_185));
        let __VLS_188;
        let __VLS_189;
        let __VLS_190;
        const __VLS_191 = {
            onClick: (__VLS_ctx.copyMenuToActiveEvent)
        };
        __VLS_187.slots.default;
        var __VLS_187;
        const __VLS_192 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
            data: (__VLS_ctx.dishes),
            stripe: true,
        }));
        const __VLS_194 = __VLS_193({
            data: (__VLS_ctx.dishes),
            stripe: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_193));
        __VLS_195.slots.default;
        const __VLS_196 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_197 = __VLS_asFunctionalComponent(__VLS_196, new __VLS_196({
            prop: "name",
            label: "菜品",
            minWidth: "140",
        }));
        const __VLS_198 = __VLS_197({
            prop: "name",
            label: "菜品",
            minWidth: "140",
        }, ...__VLS_functionalComponentArgsRest(__VLS_197));
        const __VLS_200 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({
            label: "分类",
            minWidth: "100",
        }));
        const __VLS_202 = __VLS_201({
            label: "分类",
            minWidth: "100",
        }, ...__VLS_functionalComponentArgsRest(__VLS_201));
        __VLS_203.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_203.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.category?.name);
        }
        var __VLS_203;
        const __VLS_204 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({
            label: "标签",
            minWidth: "160",
        }));
        const __VLS_206 = __VLS_205({
            label: "标签",
            minWidth: "160",
        }, ...__VLS_functionalComponentArgsRest(__VLS_205));
        __VLS_207.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_207.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            for (const [tag] of __VLS_getVForSourceType((row.tags))) {
                const __VLS_208 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_209 = __VLS_asFunctionalComponent(__VLS_208, new __VLS_208({
                    key: (tag),
                    size: "small",
                }));
                const __VLS_210 = __VLS_209({
                    key: (tag),
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_209));
                __VLS_211.slots.default;
                (tag);
                var __VLS_211;
            }
        }
        var __VLS_207;
        const __VLS_212 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({
            prop: "servingHint",
            label: "份量",
            minWidth: "120",
        }));
        const __VLS_214 = __VLS_213({
            prop: "servingHint",
            label: "份量",
            minWidth: "120",
        }, ...__VLS_functionalComponentArgsRest(__VLS_213));
        const __VLS_216 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_217 = __VLS_asFunctionalComponent(__VLS_216, new __VLS_216({
            label: "每份食材",
            minWidth: "220",
        }));
        const __VLS_218 = __VLS_217({
            label: "每份食材",
            minWidth: "220",
        }, ...__VLS_functionalComponentArgsRest(__VLS_217));
        __VLS_219.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_219.slots;
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
        var __VLS_219;
        const __VLS_220 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_221 = __VLS_asFunctionalComponent(__VLS_220, new __VLS_220({
            label: "当前活动",
            width: "110",
        }));
        const __VLS_222 = __VLS_221({
            label: "当前活动",
            width: "110",
        }, ...__VLS_functionalComponentArgsRest(__VLS_221));
        __VLS_223.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_223.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_224 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_225 = __VLS_asFunctionalComponent(__VLS_224, new __VLS_224({
                type: (__VLS_ctx.activeEventDishIds.has(row.id) ? 'success' : 'info'),
            }));
            const __VLS_226 = __VLS_225({
                type: (__VLS_ctx.activeEventDishIds.has(row.id) ? 'success' : 'info'),
            }, ...__VLS_functionalComponentArgsRest(__VLS_225));
            __VLS_227.slots.default;
            (__VLS_ctx.activeEventDishIds.has(row.id) ? "已加入" : "未加入");
            var __VLS_227;
        }
        var __VLS_223;
        const __VLS_228 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_229 = __VLS_asFunctionalComponent(__VLS_228, new __VLS_228({
            label: "操作",
            width: "220",
        }));
        const __VLS_230 = __VLS_229({
            label: "操作",
            width: "220",
        }, ...__VLS_functionalComponentArgsRest(__VLS_229));
        __VLS_231.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_231.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_232 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_233 = __VLS_asFunctionalComponent(__VLS_232, new __VLS_232({
                ...{ 'onClick': {} },
                size: "small",
            }));
            const __VLS_234 = __VLS_233({
                ...{ 'onClick': {} },
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_233));
            let __VLS_236;
            let __VLS_237;
            let __VLS_238;
            const __VLS_239 = {
                onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.isAuthed))
                        return;
                    if (!(__VLS_ctx.activeTab === 'dishes'))
                        return;
                    __VLS_ctx.openDish(row);
                }
            };
            __VLS_235.slots.default;
            var __VLS_235;
            if (!__VLS_ctx.activeEventDishIds.has(row.id)) {
                const __VLS_240 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_241 = __VLS_asFunctionalComponent(__VLS_240, new __VLS_240({
                    ...{ 'onClick': {} },
                    size: "small",
                }));
                const __VLS_242 = __VLS_241({
                    ...{ 'onClick': {} },
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_241));
                let __VLS_244;
                let __VLS_245;
                let __VLS_246;
                const __VLS_247 = {
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
                __VLS_243.slots.default;
                var __VLS_243;
            }
            else {
                const __VLS_248 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_249 = __VLS_asFunctionalComponent(__VLS_248, new __VLS_248({
                    ...{ 'onClick': {} },
                    size: "small",
                    type: "danger",
                }));
                const __VLS_250 = __VLS_249({
                    ...{ 'onClick': {} },
                    size: "small",
                    type: "danger",
                }, ...__VLS_functionalComponentArgsRest(__VLS_249));
                let __VLS_252;
                let __VLS_253;
                let __VLS_254;
                const __VLS_255 = {
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
                __VLS_251.slots.default;
                var __VLS_251;
            }
        }
        var __VLS_231;
        var __VLS_195;
    }
    if (__VLS_ctx.activeTab === 'orders') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "tool-section" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "section-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
        const __VLS_256 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_257 = __VLS_asFunctionalComponent(__VLS_256, new __VLS_256({
            data: (__VLS_ctx.orders),
            stripe: true,
        }));
        const __VLS_258 = __VLS_257({
            data: (__VLS_ctx.orders),
            stripe: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_257));
        __VLS_259.slots.default;
        const __VLS_260 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_261 = __VLS_asFunctionalComponent(__VLS_260, new __VLS_260({
            prop: "guestName",
            label: "昵称",
            width: "120",
        }));
        const __VLS_262 = __VLS_261({
            prop: "guestName",
            label: "昵称",
            width: "120",
        }, ...__VLS_functionalComponentArgsRest(__VLS_261));
        const __VLS_264 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_265 = __VLS_asFunctionalComponent(__VLS_264, new __VLS_264({
            label: "菜品",
            minWidth: "260",
        }));
        const __VLS_266 = __VLS_265({
            label: "菜品",
            minWidth: "260",
        }, ...__VLS_functionalComponentArgsRest(__VLS_265));
        __VLS_267.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_267.slots;
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
        var __VLS_267;
        const __VLS_268 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_269 = __VLS_asFunctionalComponent(__VLS_268, new __VLS_268({
            prop: "note",
            label: "备注",
            minWidth: "160",
        }));
        const __VLS_270 = __VLS_269({
            prop: "note",
            label: "备注",
            minWidth: "160",
        }, ...__VLS_functionalComponentArgsRest(__VLS_269));
        const __VLS_272 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_273 = __VLS_asFunctionalComponent(__VLS_272, new __VLS_272({
            label: "提交时间",
            width: "190",
        }));
        const __VLS_274 = __VLS_273({
            label: "提交时间",
            width: "190",
        }, ...__VLS_functionalComponentArgsRest(__VLS_273));
        __VLS_275.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_275.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (new Date(row.createdAt).toLocaleString());
        }
        var __VLS_275;
        const __VLS_276 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_277 = __VLS_asFunctionalComponent(__VLS_276, new __VLS_276({
            label: "操作",
            width: "100",
        }));
        const __VLS_278 = __VLS_277({
            label: "操作",
            width: "100",
        }, ...__VLS_functionalComponentArgsRest(__VLS_277));
        __VLS_279.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_279.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_280 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_281 = __VLS_asFunctionalComponent(__VLS_280, new __VLS_280({
                ...{ 'onClick': {} },
                size: "small",
                type: "danger",
            }));
            const __VLS_282 = __VLS_281({
                ...{ 'onClick': {} },
                size: "small",
                type: "danger",
            }, ...__VLS_functionalComponentArgsRest(__VLS_281));
            let __VLS_284;
            let __VLS_285;
            let __VLS_286;
            const __VLS_287 = {
                onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.isAuthed))
                        return;
                    if (!(__VLS_ctx.activeTab === 'orders'))
                        return;
                    __VLS_ctx.deleteOrder(row);
                }
            };
            __VLS_283.slots.default;
            var __VLS_283;
        }
        var __VLS_279;
        var __VLS_259;
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
        const __VLS_288 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_289 = __VLS_asFunctionalComponent(__VLS_288, new __VLS_288({
            data: (__VLS_ctx.summary),
            stripe: true,
        }));
        const __VLS_290 = __VLS_289({
            data: (__VLS_ctx.summary),
            stripe: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_289));
        __VLS_291.slots.default;
        const __VLS_292 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_293 = __VLS_asFunctionalComponent(__VLS_292, new __VLS_292({
            label: "菜品",
            minWidth: "160",
        }));
        const __VLS_294 = __VLS_293({
            label: "菜品",
            minWidth: "160",
        }, ...__VLS_functionalComponentArgsRest(__VLS_293));
        __VLS_295.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_295.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.dish.name);
        }
        var __VLS_295;
        const __VLS_296 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_297 = __VLS_asFunctionalComponent(__VLS_296, new __VLS_296({
            prop: "quantity",
            label: "总份数",
            width: "100",
        }));
        const __VLS_298 = __VLS_297({
            prop: "quantity",
            label: "总份数",
            width: "100",
        }, ...__VLS_functionalComponentArgsRest(__VLS_297));
        const __VLS_300 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_301 = __VLS_asFunctionalComponent(__VLS_300, new __VLS_300({
            label: "点菜人",
            minWidth: "220",
        }));
        const __VLS_302 = __VLS_301({
            label: "点菜人",
            minWidth: "220",
        }, ...__VLS_functionalComponentArgsRest(__VLS_301));
        __VLS_303.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_303.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.guests.join("，"));
        }
        var __VLS_303;
        const __VLS_304 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_305 = __VLS_asFunctionalComponent(__VLS_304, new __VLS_304({
            label: "备注",
            minWidth: "220",
        }));
        const __VLS_306 = __VLS_305({
            label: "备注",
            minWidth: "220",
        }, ...__VLS_functionalComponentArgsRest(__VLS_305));
        __VLS_307.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_307.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.notes.join("；") || "无");
        }
        var __VLS_307;
        var __VLS_291;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
            ...{ class: "subhead" },
        });
        const __VLS_308 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_309 = __VLS_asFunctionalComponent(__VLS_308, new __VLS_308({
            data: (__VLS_ctx.ingredientSummary),
            stripe: true,
        }));
        const __VLS_310 = __VLS_309({
            data: (__VLS_ctx.ingredientSummary),
            stripe: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_309));
        __VLS_311.slots.default;
        const __VLS_312 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_313 = __VLS_asFunctionalComponent(__VLS_312, new __VLS_312({
            prop: "name",
            label: "食材",
            minWidth: "160",
        }));
        const __VLS_314 = __VLS_313({
            prop: "name",
            label: "食材",
            minWidth: "160",
        }, ...__VLS_functionalComponentArgsRest(__VLS_313));
        const __VLS_316 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_317 = __VLS_asFunctionalComponent(__VLS_316, new __VLS_316({
            label: "备菜数量",
            width: "140",
        }));
        const __VLS_318 = __VLS_317({
            label: "备菜数量",
            width: "140",
        }, ...__VLS_functionalComponentArgsRest(__VLS_317));
        __VLS_319.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_319.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.quantity);
            (row.unit);
        }
        var __VLS_319;
        const __VLS_320 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_321 = __VLS_asFunctionalComponent(__VLS_320, new __VLS_320({
            label: "来源菜品",
            minWidth: "260",
        }));
        const __VLS_322 = __VLS_321({
            label: "来源菜品",
            minWidth: "260",
        }, ...__VLS_functionalComponentArgsRest(__VLS_321));
        __VLS_323.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_323.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.sources.join("，"));
        }
        var __VLS_323;
        var __VLS_311;
    }
    const __VLS_324 = {}.ElDialog;
    /** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
    // @ts-ignore
    const __VLS_325 = __VLS_asFunctionalComponent(__VLS_324, new __VLS_324({
        modelValue: (__VLS_ctx.dishDialog),
        title: (__VLS_ctx.editingDishId ? '编辑菜品' : '新增菜品'),
        width: "680px",
    }));
    const __VLS_326 = __VLS_325({
        modelValue: (__VLS_ctx.dishDialog),
        title: (__VLS_ctx.editingDishId ? '编辑菜品' : '新增菜品'),
        width: "680px",
    }, ...__VLS_functionalComponentArgsRest(__VLS_325));
    __VLS_327.slots.default;
    const __VLS_328 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_329 = __VLS_asFunctionalComponent(__VLS_328, new __VLS_328({
        labelPosition: "top",
    }));
    const __VLS_330 = __VLS_329({
        labelPosition: "top",
    }, ...__VLS_functionalComponentArgsRest(__VLS_329));
    __VLS_331.slots.default;
    const __VLS_332 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_333 = __VLS_asFunctionalComponent(__VLS_332, new __VLS_332({
        label: "菜品名称",
    }));
    const __VLS_334 = __VLS_333({
        label: "菜品名称",
    }, ...__VLS_functionalComponentArgsRest(__VLS_333));
    __VLS_335.slots.default;
    const __VLS_336 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_337 = __VLS_asFunctionalComponent(__VLS_336, new __VLS_336({
        modelValue: (__VLS_ctx.dishForm.name),
    }));
    const __VLS_338 = __VLS_337({
        modelValue: (__VLS_ctx.dishForm.name),
    }, ...__VLS_functionalComponentArgsRest(__VLS_337));
    var __VLS_335;
    const __VLS_340 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_341 = __VLS_asFunctionalComponent(__VLS_340, new __VLS_340({
        label: "分类",
    }));
    const __VLS_342 = __VLS_341({
        label: "分类",
    }, ...__VLS_functionalComponentArgsRest(__VLS_341));
    __VLS_343.slots.default;
    const __VLS_344 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_345 = __VLS_asFunctionalComponent(__VLS_344, new __VLS_344({
        modelValue: (__VLS_ctx.dishForm.categoryId),
    }));
    const __VLS_346 = __VLS_345({
        modelValue: (__VLS_ctx.dishForm.categoryId),
    }, ...__VLS_functionalComponentArgsRest(__VLS_345));
    __VLS_347.slots.default;
    for (const [category] of __VLS_getVForSourceType((__VLS_ctx.categories))) {
        const __VLS_348 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_349 = __VLS_asFunctionalComponent(__VLS_348, new __VLS_348({
            key: (category.id),
            label: (category.name),
            value: (category.id),
        }));
        const __VLS_350 = __VLS_349({
            key: (category.id),
            label: (category.name),
            value: (category.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_349));
    }
    var __VLS_347;
    var __VLS_343;
    const __VLS_352 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_353 = __VLS_asFunctionalComponent(__VLS_352, new __VLS_352({
        label: "菜品图片",
    }));
    const __VLS_354 = __VLS_353({
        label: "菜品图片",
    }, ...__VLS_functionalComponentArgsRest(__VLS_353));
    __VLS_355.slots.default;
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
    const __VLS_356 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_357 = __VLS_asFunctionalComponent(__VLS_356, new __VLS_356({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.imageUploading),
    }));
    const __VLS_358 = __VLS_357({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.imageUploading),
    }, ...__VLS_functionalComponentArgsRest(__VLS_357));
    let __VLS_360;
    let __VLS_361;
    let __VLS_362;
    const __VLS_363 = {
        onClick: (__VLS_ctx.chooseImage)
    };
    __VLS_359.slots.default;
    var __VLS_359;
    const __VLS_364 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_365 = __VLS_asFunctionalComponent(__VLS_364, new __VLS_364({
        modelValue: (__VLS_ctx.dishForm.imageUrl),
        placeholder: "也可以粘贴图片 URL 或 /uploads/dishes/xxx.jpg",
    }));
    const __VLS_366 = __VLS_365({
        modelValue: (__VLS_ctx.dishForm.imageUrl),
        placeholder: "也可以粘贴图片 URL 或 /uploads/dishes/xxx.jpg",
    }, ...__VLS_functionalComponentArgsRest(__VLS_365));
    var __VLS_355;
    const __VLS_368 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_369 = __VLS_asFunctionalComponent(__VLS_368, new __VLS_368({
        label: "简介",
    }));
    const __VLS_370 = __VLS_369({
        label: "简介",
    }, ...__VLS_functionalComponentArgsRest(__VLS_369));
    __VLS_371.slots.default;
    const __VLS_372 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_373 = __VLS_asFunctionalComponent(__VLS_372, new __VLS_372({
        modelValue: (__VLS_ctx.dishForm.description),
        type: "textarea",
    }));
    const __VLS_374 = __VLS_373({
        modelValue: (__VLS_ctx.dishForm.description),
        type: "textarea",
    }, ...__VLS_functionalComponentArgsRest(__VLS_373));
    var __VLS_371;
    const __VLS_376 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_377 = __VLS_asFunctionalComponent(__VLS_376, new __VLS_376({
        label: "标签",
    }));
    const __VLS_378 = __VLS_377({
        label: "标签",
    }, ...__VLS_functionalComponentArgsRest(__VLS_377));
    __VLS_379.slots.default;
    const __VLS_380 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_381 = __VLS_asFunctionalComponent(__VLS_380, new __VLS_380({
        modelValue: (__VLS_ctx.dishForm.tagsText),
        placeholder: "微辣, 招牌, 素菜",
    }));
    const __VLS_382 = __VLS_381({
        modelValue: (__VLS_ctx.dishForm.tagsText),
        placeholder: "微辣, 招牌, 素菜",
    }, ...__VLS_functionalComponentArgsRest(__VLS_381));
    var __VLS_379;
    const __VLS_384 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_385 = __VLS_asFunctionalComponent(__VLS_384, new __VLS_384({
        label: "份量说明",
    }));
    const __VLS_386 = __VLS_385({
        label: "份量说明",
    }, ...__VLS_functionalComponentArgsRest(__VLS_385));
    __VLS_387.slots.default;
    const __VLS_388 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_389 = __VLS_asFunctionalComponent(__VLS_388, new __VLS_388({
        modelValue: (__VLS_ctx.dishForm.servingHint),
    }));
    const __VLS_390 = __VLS_389({
        modelValue: (__VLS_ctx.dishForm.servingHint),
    }, ...__VLS_functionalComponentArgsRest(__VLS_389));
    var __VLS_387;
    const __VLS_392 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_393 = __VLS_asFunctionalComponent(__VLS_392, new __VLS_392({
        label: "每份备菜食材",
    }));
    const __VLS_394 = __VLS_393({
        label: "每份备菜食材",
    }, ...__VLS_functionalComponentArgsRest(__VLS_393));
    __VLS_395.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "prep-editor" },
    });
    for (const [item, index] of __VLS_getVForSourceType((__VLS_ctx.dishForm.prepItems))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (index),
            ...{ class: "prep-row" },
        });
        const __VLS_396 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_397 = __VLS_asFunctionalComponent(__VLS_396, new __VLS_396({
            modelValue: (item.name),
            placeholder: "食材",
        }));
        const __VLS_398 = __VLS_397({
            modelValue: (item.name),
            placeholder: "食材",
        }, ...__VLS_functionalComponentArgsRest(__VLS_397));
        const __VLS_400 = {}.ElInputNumber;
        /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
        // @ts-ignore
        const __VLS_401 = __VLS_asFunctionalComponent(__VLS_400, new __VLS_400({
            modelValue: (item.quantity),
            min: (0.01),
            step: (1),
            controlsPosition: "right",
        }));
        const __VLS_402 = __VLS_401({
            modelValue: (item.quantity),
            min: (0.01),
            step: (1),
            controlsPosition: "right",
        }, ...__VLS_functionalComponentArgsRest(__VLS_401));
        const __VLS_404 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_405 = __VLS_asFunctionalComponent(__VLS_404, new __VLS_404({
            modelValue: (item.unit),
            placeholder: "单位",
        }));
        const __VLS_406 = __VLS_405({
            modelValue: (item.unit),
            placeholder: "单位",
        }, ...__VLS_functionalComponentArgsRest(__VLS_405));
        const __VLS_408 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_409 = __VLS_asFunctionalComponent(__VLS_408, new __VLS_408({
            ...{ 'onClick': {} },
        }));
        const __VLS_410 = __VLS_409({
            ...{ 'onClick': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_409));
        let __VLS_412;
        let __VLS_413;
        let __VLS_414;
        const __VLS_415 = {
            onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.isAuthed))
                    return;
                __VLS_ctx.removePrepItem(index);
            }
        };
        __VLS_411.slots.default;
        var __VLS_411;
    }
    const __VLS_416 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_417 = __VLS_asFunctionalComponent(__VLS_416, new __VLS_416({
        ...{ 'onClick': {} },
    }));
    const __VLS_418 = __VLS_417({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_417));
    let __VLS_420;
    let __VLS_421;
    let __VLS_422;
    const __VLS_423 = {
        onClick: (__VLS_ctx.addPrepItem)
    };
    __VLS_419.slots.default;
    var __VLS_419;
    var __VLS_395;
    var __VLS_331;
    {
        const { footer: __VLS_thisSlot } = __VLS_327.slots;
        const __VLS_424 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_425 = __VLS_asFunctionalComponent(__VLS_424, new __VLS_424({
            ...{ 'onClick': {} },
        }));
        const __VLS_426 = __VLS_425({
            ...{ 'onClick': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_425));
        let __VLS_428;
        let __VLS_429;
        let __VLS_430;
        const __VLS_431 = {
            onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.isAuthed))
                    return;
                __VLS_ctx.dishDialog = false;
            }
        };
        __VLS_427.slots.default;
        var __VLS_427;
        const __VLS_432 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_433 = __VLS_asFunctionalComponent(__VLS_432, new __VLS_432({
            ...{ 'onClick': {} },
            type: "primary",
        }));
        const __VLS_434 = __VLS_433({
            ...{ 'onClick': {} },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_433));
        let __VLS_436;
        let __VLS_437;
        let __VLS_438;
        const __VLS_439 = {
            onClick: (__VLS_ctx.saveDish)
        };
        __VLS_435.slots.default;
        var __VLS_435;
    }
    var __VLS_327;
    const __VLS_440 = {}.ElDialog;
    /** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
    // @ts-ignore
    const __VLS_441 = __VLS_asFunctionalComponent(__VLS_440, new __VLS_440({
        modelValue: (__VLS_ctx.eventDialog),
        title: (__VLS_ctx.editingEventId ? '编辑活动' : '新建活动'),
        width: "560px",
    }));
    const __VLS_442 = __VLS_441({
        modelValue: (__VLS_ctx.eventDialog),
        title: (__VLS_ctx.editingEventId ? '编辑活动' : '新建活动'),
        width: "560px",
    }, ...__VLS_functionalComponentArgsRest(__VLS_441));
    __VLS_443.slots.default;
    const __VLS_444 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_445 = __VLS_asFunctionalComponent(__VLS_444, new __VLS_444({
        labelPosition: "top",
    }));
    const __VLS_446 = __VLS_445({
        labelPosition: "top",
    }, ...__VLS_functionalComponentArgsRest(__VLS_445));
    __VLS_447.slots.default;
    const __VLS_448 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_449 = __VLS_asFunctionalComponent(__VLS_448, new __VLS_448({
        label: "活动名称",
    }));
    const __VLS_450 = __VLS_449({
        label: "活动名称",
    }, ...__VLS_functionalComponentArgsRest(__VLS_449));
    __VLS_451.slots.default;
    const __VLS_452 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_453 = __VLS_asFunctionalComponent(__VLS_452, new __VLS_452({
        modelValue: (__VLS_ctx.eventForm.title),
    }));
    const __VLS_454 = __VLS_453({
        modelValue: (__VLS_ctx.eventForm.title),
    }, ...__VLS_functionalComponentArgsRest(__VLS_453));
    var __VLS_451;
    const __VLS_456 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_457 = __VLS_asFunctionalComponent(__VLS_456, new __VLS_456({
        label: "说明",
    }));
    const __VLS_458 = __VLS_457({
        label: "说明",
    }, ...__VLS_functionalComponentArgsRest(__VLS_457));
    __VLS_459.slots.default;
    const __VLS_460 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_461 = __VLS_asFunctionalComponent(__VLS_460, new __VLS_460({
        modelValue: (__VLS_ctx.eventForm.description),
        type: "textarea",
    }));
    const __VLS_462 = __VLS_461({
        modelValue: (__VLS_ctx.eventForm.description),
        type: "textarea",
    }, ...__VLS_functionalComponentArgsRest(__VLS_461));
    var __VLS_459;
    const __VLS_464 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_465 = __VLS_asFunctionalComponent(__VLS_464, new __VLS_464({
        label: "访问短码",
    }));
    const __VLS_466 = __VLS_465({
        label: "访问短码",
    }, ...__VLS_functionalComponentArgsRest(__VLS_465));
    __VLS_467.slots.default;
    const __VLS_468 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_469 = __VLS_asFunctionalComponent(__VLS_468, new __VLS_468({
        modelValue: (__VLS_ctx.eventForm.accessCode),
    }));
    const __VLS_470 = __VLS_469({
        modelValue: (__VLS_ctx.eventForm.accessCode),
    }, ...__VLS_functionalComponentArgsRest(__VLS_469));
    var __VLS_467;
    const __VLS_472 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_473 = __VLS_asFunctionalComponent(__VLS_472, new __VLS_472({
        label: "聚餐时间",
    }));
    const __VLS_474 = __VLS_473({
        label: "聚餐时间",
    }, ...__VLS_functionalComponentArgsRest(__VLS_473));
    __VLS_475.slots.default;
    const __VLS_476 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_477 = __VLS_asFunctionalComponent(__VLS_476, new __VLS_476({
        modelValue: (__VLS_ctx.eventForm.dateTime),
        type: "datetime-local",
    }));
    const __VLS_478 = __VLS_477({
        modelValue: (__VLS_ctx.eventForm.dateTime),
        type: "datetime-local",
    }, ...__VLS_functionalComponentArgsRest(__VLS_477));
    var __VLS_475;
    const __VLS_480 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_481 = __VLS_asFunctionalComponent(__VLS_480, new __VLS_480({
        label: "状态",
    }));
    const __VLS_482 = __VLS_481({
        label: "状态",
    }, ...__VLS_functionalComponentArgsRest(__VLS_481));
    __VLS_483.slots.default;
    const __VLS_484 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_485 = __VLS_asFunctionalComponent(__VLS_484, new __VLS_484({
        modelValue: (__VLS_ctx.eventForm.status),
    }));
    const __VLS_486 = __VLS_485({
        modelValue: (__VLS_ctx.eventForm.status),
    }, ...__VLS_functionalComponentArgsRest(__VLS_485));
    __VLS_487.slots.default;
    const __VLS_488 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_489 = __VLS_asFunctionalComponent(__VLS_488, new __VLS_488({
        label: "开放点菜",
        value: "OPEN",
    }));
    const __VLS_490 = __VLS_489({
        label: "开放点菜",
        value: "OPEN",
    }, ...__VLS_functionalComponentArgsRest(__VLS_489));
    const __VLS_492 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_493 = __VLS_asFunctionalComponent(__VLS_492, new __VLS_492({
        label: "草稿",
        value: "DRAFT",
    }));
    const __VLS_494 = __VLS_493({
        label: "草稿",
        value: "DRAFT",
    }, ...__VLS_functionalComponentArgsRest(__VLS_493));
    const __VLS_496 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_497 = __VLS_asFunctionalComponent(__VLS_496, new __VLS_496({
        label: "关闭",
        value: "CLOSED",
    }));
    const __VLS_498 = __VLS_497({
        label: "关闭",
        value: "CLOSED",
    }, ...__VLS_functionalComponentArgsRest(__VLS_497));
    var __VLS_487;
    var __VLS_483;
    if (!__VLS_ctx.editingEventId) {
        const __VLS_500 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_501 = __VLS_asFunctionalComponent(__VLS_500, new __VLS_500({
            label: "初始菜单",
        }));
        const __VLS_502 = __VLS_501({
            label: "初始菜单",
        }, ...__VLS_functionalComponentArgsRest(__VLS_501));
        __VLS_503.slots.default;
        const __VLS_504 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_505 = __VLS_asFunctionalComponent(__VLS_504, new __VLS_504({
            modelValue: (__VLS_ctx.eventForm.copyFromEventId),
            clearable: true,
            placeholder: "可选：从已有活动复制菜单",
        }));
        const __VLS_506 = __VLS_505({
            modelValue: (__VLS_ctx.eventForm.copyFromEventId),
            clearable: true,
            placeholder: "可选：从已有活动复制菜单",
        }, ...__VLS_functionalComponentArgsRest(__VLS_505));
        __VLS_507.slots.default;
        for (const [event] of __VLS_getVForSourceType((__VLS_ctx.events))) {
            const __VLS_508 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_509 = __VLS_asFunctionalComponent(__VLS_508, new __VLS_508({
                key: (event.id),
                label: (event.title),
                value: (event.id),
            }));
            const __VLS_510 = __VLS_509({
                key: (event.id),
                label: (event.title),
                value: (event.id),
            }, ...__VLS_functionalComponentArgsRest(__VLS_509));
        }
        var __VLS_507;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "form-help" },
        });
        var __VLS_503;
    }
    const __VLS_512 = {}.ElCheckbox;
    /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
    // @ts-ignore
    const __VLS_513 = __VLS_asFunctionalComponent(__VLS_512, new __VLS_512({
        modelValue: (__VLS_ctx.eventForm.showSummary),
    }));
    const __VLS_514 = __VLS_513({
        modelValue: (__VLS_ctx.eventForm.showSummary),
    }, ...__VLS_functionalComponentArgsRest(__VLS_513));
    __VLS_515.slots.default;
    var __VLS_515;
    var __VLS_447;
    {
        const { footer: __VLS_thisSlot } = __VLS_443.slots;
        const __VLS_516 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_517 = __VLS_asFunctionalComponent(__VLS_516, new __VLS_516({
            ...{ 'onClick': {} },
        }));
        const __VLS_518 = __VLS_517({
            ...{ 'onClick': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_517));
        let __VLS_520;
        let __VLS_521;
        let __VLS_522;
        const __VLS_523 = {
            onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.isAuthed))
                    return;
                __VLS_ctx.eventDialog = false;
            }
        };
        __VLS_519.slots.default;
        var __VLS_519;
        const __VLS_524 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_525 = __VLS_asFunctionalComponent(__VLS_524, new __VLS_524({
            ...{ 'onClick': {} },
            type: "primary",
        }));
        const __VLS_526 = __VLS_525({
            ...{ 'onClick': {} },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_525));
        let __VLS_528;
        let __VLS_529;
        let __VLS_530;
        const __VLS_531 = {
            onClick: (__VLS_ctx.saveEvent)
        };
        __VLS_527.slots.default;
        (__VLS_ctx.editingEventId ? "保存" : "创建");
        var __VLS_527;
    }
    var __VLS_443;
}
/** @type {__VLS_StyleScopedClasses['login-page']} */ ;
/** @type {__VLS_StyleScopedClasses['login-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['brand']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-side']} */ ;
/** @type {__VLS_StyleScopedClasses['side-title']} */ ;
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
/** @type {__VLS_StyleScopedClasses['form-help']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            CalendarPlus: CalendarPlus,
            ChefHat: ChefHat,
            ClipboardList: ClipboardList,
            LogIn: LogIn,
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
            editingDishId: editingDishId,
            editingEventId: editingEventId,
            copyTargetEventId: copyTargetEventId,
            imageInput: imageInput,
            imageUploading: imageUploading,
            dishForm: dishForm,
            eventForm: eventForm,
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
