import { ShoppingCart, ClipboardList, ChevronRight } from "lucide-vue-next";
import { showFailToast, showImagePreview, showSuccessToast } from "vant";
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { request } from "../api";
import { canDecreaseDishQuantity } from "../guest-menu-stepper";
import { getDishTopRankMap } from "../guest-menu-top-rank";
const route = useRoute();
const code = computed(() => String(route.params.code));
const loading = ref(true);
const submitting = ref(false);
const menu = ref(null);
const myOrders = ref([]);
const summary = ref([]);
const activeCategory = ref("");
const cart = reactive({});
const guestName = ref(localStorage.getItem("guestName") || "");
const guestToken = ref(localStorage.getItem("guestToken") || "");
const note = ref("");
const showCart = ref(false);
const deletingOrderId = ref("");
const categoryRail = ref(null);
let scrollLockTimer;
let lockedScrollY = 0;
const unlimitedQuantityCategories = new Set(["主食", "饮品"]);
function isUnlimitedQuantityDish(dish) {
    return unlimitedQuantityCategories.has(dish.category?.name || "");
}
const cartItems = computed(() => Object.values(cart).filter((item) => item.quantity > 0));
const cartCount = computed(() => cartItems.value.reduce((sum, item) => sum + item.quantity, 0));
const guestNameMissing = computed(() => !guestName.value.trim());
const orderedByDish = computed(() => Object.fromEntries(summary.value.map((item) => [
    item.dish.id,
    item.guests.map((guest) => guest.replace(/\s*x\d+$/, "")).join("、")
])));
const hasConflictInCart = computed(() => cartItems.value.some((item) => !isUnlimitedQuantityDish(item.dish) && Boolean(orderedByDish.value[item.dish.id])));
const canSubmit = computed(() => cartItems.value.length > 0 && !guestNameMissing.value && !submitting.value && !hasConflictInCart.value);
const groupedDishes = computed(() => {
    if (!menu.value)
        return [];
    return menu.value.categories.map((category) => ({
        category,
        dishes: menu.value.dishes.filter((dish) => dish.categoryId === category.id)
    }));
});
const dishTopRankMap = computed(() => (menu.value ? getDishTopRankMap(menu.value.dishes) : {}));
function add(dish) {
    if (!isUnlimitedQuantityDish(dish) && orderedByDish.value[dish.id]) {
        showFailToast(`${dish.name}${orderedByDish.value[dish.id]}已点`);
        return;
    }
    cart[dish.id] ??= { dish, quantity: 0, note: "" };
    if (!isUnlimitedQuantityDish(dish) && cart[dish.id].quantity >= 1)
        return;
    cart[dish.id].quantity += 1;
}
function remove(dish) {
    if (!cart[dish.id])
        return;
    cart[dish.id].quantity -= 1;
    if (cart[dish.id].quantity <= 0)
        delete cart[dish.id];
}
function previewDishImage(dish) {
    if (!dish.imageUrl)
        return;
    showImagePreview({
        images: [dish.imageUrl],
        closeable: true
    });
}
function burstConfetti(event) {
    const rect = event.currentTarget.getBoundingClientRect();
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
function categoryAnchorId(categoryId) {
    return `category-${categoryId}`;
}
function scrollToCategory(categoryId) {
    activeCategory.value = categoryId;
    window.clearTimeout(scrollLockTimer);
    const element = document.getElementById(categoryAnchorId(categoryId));
    if (!element)
        return;
    element.scrollIntoView({ behavior: "smooth", block: "start" });
    scrollLockTimer = window.setTimeout(() => {
        scrollLockTimer = undefined;
    }, 420);
}
function syncActiveCategoryOnScroll() {
    if (scrollLockTimer || !menu.value?.categories.length)
        return;
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
    const current = anchors.filter((item) => item.top <= 130).sort((a, b) => b.top - a.top)[0] ||
        anchors.sort((a, b) => a.top - b.top)[0];
    if (current)
        activeCategory.value = current.id;
}
function scrollActiveCategoryIntoView(categoryId) {
    const rail = categoryRail.value;
    if (!rail)
        return;
    const activeButton = rail.querySelector(`button[data-category-id="${categoryId}"]`);
    if (!activeButton)
        return;
    const railRect = rail.getBoundingClientRect();
    const buttonRect = activeButton.getBoundingClientRect();
    const railHasHorizontalOverflow = rail.scrollWidth > rail.clientWidth + 4;
    if (!railHasHorizontalOverflow)
        return;
    const nextScrollLeft = rail.scrollLeft + (buttonRect.left - railRect.left) - railRect.width / 2 + buttonRect.width / 2;
    rail.scrollTo({
        left: Math.max(0, nextScrollLeft),
        behavior: "smooth"
    });
}
async function load() {
    loading.value = true;
    try {
        menu.value = await request(`/api/events/${code.value}/menu`);
        activeCategory.value = menu.value.categories[0]?.id || "";
        requestAnimationFrame(syncActiveCategoryOnScroll);
        if (guestToken.value) {
            myOrders.value = await request(`/api/events/${code.value}/orders/${guestToken.value}`).catch(() => []);
        }
        else {
            myOrders.value = [];
        }
        if (menu.value.event.showSummary) {
            summary.value = await request(`/api/events/${code.value}/summary`).catch(() => []);
        }
        else {
            summary.value = [];
        }
    }
    catch (error) {
        showFailToast(error instanceof Error ? error.message : "加载失败");
    }
    finally {
        loading.value = false;
    }
}
async function deleteOwnOrder(order) {
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
    }
    catch (error) {
        showFailToast(error instanceof Error ? error.message : "撤回失败");
    }
    finally {
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
        const order = await request(`/api/events/${code.value}/orders`, {
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
    }
    catch (error) {
        showFailToast(error instanceof Error ? error.message : "提交失败");
    }
    finally {
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
    }
    else {
        unlockPageScroll();
    }
});
watch(activeCategory, (categoryId) => {
    if (!categoryId)
        return;
    requestAnimationFrame(() => scrollActiveCategoryIntoView(categoryId));
});
onBeforeUnmount(() => {
    window.removeEventListener("scroll", syncActiveCategoryOnScroll);
    window.clearTimeout(scrollLockTimer);
    if (showCart.value)
        unlockPageScroll();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['guest-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['guest-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['guest-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['guest-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['guest-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['guest-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['guest-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['van-field__control']} */ ;
/** @type {__VLS_StyleScopedClasses['guest-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['van-field__control']} */ ;
/** @type {__VLS_StyleScopedClasses['guest-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['van-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['event-head']} */ ;
/** @type {__VLS_StyleScopedClasses['event-head']} */ ;
/** @type {__VLS_StyleScopedClasses['muted']} */ ;
/** @type {__VLS_StyleScopedClasses['content-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['category-rail']} */ ;
/** @type {__VLS_StyleScopedClasses['category-rail']} */ ;
/** @type {__VLS_StyleScopedClasses['category-rail']} */ ;
/** @type {__VLS_StyleScopedClasses['category-rail']} */ ;
/** @type {__VLS_StyleScopedClasses['category-rail']} */ ;
/** @type {__VLS_StyleScopedClasses['category-rail']} */ ;
/** @type {__VLS_StyleScopedClasses['category-rail']} */ ;
/** @type {__VLS_StyleScopedClasses['category-rail']} */ ;
/** @type {__VLS_StyleScopedClasses['category-rail']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-row']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-row']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-image']} */ ;
/** @type {__VLS_StyleScopedClasses['image-button']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-image-placeholder']} */ ;
/** @type {__VLS_StyleScopedClasses['tag-list']} */ ;
/** @type {__VLS_StyleScopedClasses['stepper']} */ ;
/** @type {__VLS_StyleScopedClasses['stepper']} */ ;
/** @type {__VLS_StyleScopedClasses['stepper']} */ ;
/** @type {__VLS_StyleScopedClasses['stepper']} */ ;
/** @type {__VLS_StyleScopedClasses['stepper']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-band']} */ ;
/** @type {__VLS_StyleScopedClasses['band-title']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-row']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-main']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-main']} */ ;
/** @type {__VLS_StyleScopedClasses['guest-list']} */ ;
/** @type {__VLS_StyleScopedClasses['my-order-items']} */ ;
/** @type {__VLS_StyleScopedClasses['delete-order-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['delete-order-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['cart-fab']} */ ;
/** @type {__VLS_StyleScopedClasses['cart-fab']} */ ;
/** @type {__VLS_StyleScopedClasses['cart-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['cart-panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['cart-panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['cart-item']} */ ;
/** @type {__VLS_StyleScopedClasses['cart-item-title']} */ ;
/** @type {__VLS_StyleScopedClasses['cart-item-title']} */ ;
/** @type {__VLS_StyleScopedClasses['cart-item-title']} */ ;
/** @type {__VLS_StyleScopedClasses['ordered-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['submit-order-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['submit-order-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['submit-order-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['submit-order-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['loading-page']} */ ;
/** @type {__VLS_StyleScopedClasses['content-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['category-rail']} */ ;
/** @type {__VLS_StyleScopedClasses['category-rail']} */ ;
/** @type {__VLS_StyleScopedClasses['guest-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['event-head']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-row']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-image']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-action']} */ ;
/** @type {__VLS_StyleScopedClasses['top-rank-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-title']} */ ;
/** @type {__VLS_StyleScopedClasses['action-ordered-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['cart-item']} */ ;
/** @type {__VLS_StyleScopedClasses['compact']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-row']} */ ;
/** @type {__VLS_StyleScopedClasses['category-rail']} */ ;
/** @type {__VLS_StyleScopedClasses['cart-fab']} */ ;
/** @type {__VLS_StyleScopedClasses['stepper']} */ ;
/** @type {__VLS_StyleScopedClasses['submit-order-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['delete-order-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['image-button']} */ ;
// CSS variable injection 
// CSS variable injection end 
if (!__VLS_ctx.loading && __VLS_ctx.menu) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
        ...{ class: "guest-shell" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "event-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "hero-copy" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
    (__VLS_ctx.menu.event.title);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "muted" },
    });
    (__VLS_ctx.menu.event.description || "选好想吃的，主人会在后台汇总备菜。");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "status-pill" },
    });
    (__VLS_ctx.menu.event.status === "OPEN" ? "开放点菜" : "已关闭");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "content-layout" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
        ref: "categoryRail",
        ...{ class: "category-rail" },
        'aria-label': "菜品分类",
    });
    /** @type {typeof __VLS_ctx.categoryRail} */ ;
    for (const [group] of __VLS_getVForSourceType((__VLS_ctx.groupedDishes))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(!__VLS_ctx.loading && __VLS_ctx.menu))
                        return;
                    __VLS_ctx.scrollToCategory(group.category.id);
                } },
            key: (group.category.id),
            'data-category-id': (group.category.id),
            ...{ class: ({ active: __VLS_ctx.activeCategory === group.category.id }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (group.category.name);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "content-main" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "dish-list" },
    });
    for (const [group] of __VLS_getVForSourceType((__VLS_ctx.groupedDishes))) {
        (group.category.id);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
            id: (__VLS_ctx.categoryAnchorId(group.category.id)),
            ...{ class: "category-anchor" },
        });
        (group.category.name);
        for (const [dish] of __VLS_getVForSourceType((group.dishes))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                key: (dish.id),
                ...{ class: "dish-row" },
            });
            if (__VLS_ctx.dishTopRankMap[dish.id]) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "top-rank-badge" },
                });
                (__VLS_ctx.dishTopRankMap[dish.id]);
            }
            if (dish.imageUrl) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(!__VLS_ctx.loading && __VLS_ctx.menu))
                                return;
                            if (!(dish.imageUrl))
                                return;
                            __VLS_ctx.previewDishImage(dish);
                        } },
                    type: "button",
                    ...{ class: "dish-image image-button" },
                    'aria-label': (`查看${dish.name}大图`),
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
                    src: (dish.thumbnailUrl || dish.imageUrl),
                    alt: (dish.name),
                    loading: "lazy",
                    decoding: "async",
                });
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "dish-image dish-image-placeholder" },
                    'aria-hidden': "true",
                });
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "dish-info" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "dish-title" },
            });
            if (dish.imageUrl) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(!__VLS_ctx.loading && __VLS_ctx.menu))
                                return;
                            if (!(dish.imageUrl))
                                return;
                            __VLS_ctx.previewDishImage(dish);
                        } },
                    type: "button",
                    ...{ class: "dish-name preview-link" },
                });
                (dish.name);
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
                    ...{ class: "dish-name" },
                });
                (dish.name);
            }
            if (dish.servingHint) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "serving-hint" },
                });
                (dish.servingHint);
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "dish-description" },
            });
            (dish.description);
            if (dish.tags.length) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "tag-list" },
                });
                for (const [tag] of __VLS_getVForSourceType((dish.tags))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        key: (tag),
                    });
                    (tag);
                }
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "dish-action" },
            });
            if (!__VLS_ctx.isUnlimitedQuantityDish(dish) && __VLS_ctx.orderedByDish[dish.id]) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "ordered-badge action-ordered-badge" },
                });
                (__VLS_ctx.orderedByDish[dish.id]);
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "stepper" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(!__VLS_ctx.loading && __VLS_ctx.menu))
                            return;
                        __VLS_ctx.remove(dish);
                        __VLS_ctx.burstConfetti($event);
                    } },
                disabled: (!__VLS_ctx.canDecreaseDishQuantity(__VLS_ctx.cart[dish.id]?.quantity || 0)),
                'aria-label': "减少",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (__VLS_ctx.cart[dish.id]?.quantity || 0);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(!__VLS_ctx.loading && __VLS_ctx.menu))
                            return;
                        __VLS_ctx.add(dish);
                        __VLS_ctx.burstConfetti($event);
                    } },
                'aria-label': "增加",
                disabled: ((!__VLS_ctx.isUnlimitedQuantityDish(dish) && Boolean(__VLS_ctx.orderedByDish[dish.id])) || (!__VLS_ctx.isUnlimitedQuantityDish(dish) && (__VLS_ctx.cart[dish.id]?.quantity || 0) >= 1)),
            });
        }
    }
    if (__VLS_ctx.summary.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "summary-band" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "band-title" },
        });
        const __VLS_0 = {}.ClipboardList;
        /** @type {[typeof __VLS_components.ClipboardList, ]} */ ;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
            size: (18),
        }));
        const __VLS_2 = __VLS_1({
            size: (18),
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "summary-list" },
        });
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.summary))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (item.dish.id),
                ...{ class: "summary-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "summary-main" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (item.dish.name);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (item.quantity);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "guest-list" },
            });
            for (const [guest] of __VLS_getVForSourceType((item.guests))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    key: (guest),
                });
                (guest);
            }
        }
    }
    if (__VLS_ctx.myOrders.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "summary-band my-orders-band" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "band-title" },
        });
        const __VLS_4 = {}.ShoppingCart;
        /** @type {[typeof __VLS_components.ShoppingCart, ]} */ ;
        // @ts-ignore
        const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
            size: (18),
        }));
        const __VLS_6 = __VLS_5({
            size: (18),
        }, ...__VLS_functionalComponentArgsRest(__VLS_5));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "summary-list" },
        });
        for (const [order] of __VLS_getVForSourceType((__VLS_ctx.myOrders))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                key: (order.id),
                ...{ class: "summary-row my-order-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "summary-main" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (order.guestName);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (new Date(order.createdAt).toLocaleString());
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "my-order-items" },
            });
            for (const [item] of __VLS_getVForSourceType((order.items))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    key: (item.id),
                });
                (item.dish.name);
                (item.quantity);
            }
            if (order.note) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "my-order-note" },
                });
                (order.note);
            }
            if (__VLS_ctx.menu.event.allowModify && __VLS_ctx.menu.event.status === 'OPEN') {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(!__VLS_ctx.loading && __VLS_ctx.menu))
                                return;
                            if (!(__VLS_ctx.myOrders.length))
                                return;
                            if (!(__VLS_ctx.menu.event.allowModify && __VLS_ctx.menu.event.status === 'OPEN'))
                                return;
                            __VLS_ctx.deleteOwnOrder(order);
                        } },
                    ...{ class: "delete-order-btn" },
                    disabled: (__VLS_ctx.deletingOrderId === order.id),
                });
                (__VLS_ctx.deletingOrderId === order.id ? "撤回中..." : "撤回整单");
            }
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(!__VLS_ctx.loading && __VLS_ctx.menu))
                    return;
                __VLS_ctx.showCart = true;
            } },
        ...{ class: "cart-fab" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "cart-fab-meta" },
    });
    (__VLS_ctx.cartCount);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "cart-fab-action" },
    });
    const __VLS_8 = {}.ChevronRight;
    /** @type {[typeof __VLS_components.ChevronRight, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        size: (16),
    }));
    const __VLS_10 = __VLS_9({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    const __VLS_12 = {}.VanPopup;
    /** @type {[typeof __VLS_components.VanPopup, typeof __VLS_components.vanPopup, typeof __VLS_components.VanPopup, typeof __VLS_components.vanPopup, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
        show: (__VLS_ctx.showCart),
        position: "bottom",
        round: true,
    }));
    const __VLS_14 = __VLS_13({
        show: (__VLS_ctx.showCart),
        position: "bottom",
        round: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    __VLS_15.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "cart-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cart-panel-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.cartCount);
    if (!__VLS_ctx.cartItems.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "empty" },
        });
    }
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.cartItems))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (item.dish.id),
            ...{ class: "cart-item" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "cart-item-main" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "cart-item-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (item.dish.name);
        if (!__VLS_ctx.isUnlimitedQuantityDish(item.dish) && __VLS_ctx.orderedByDish[item.dish.id]) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "ordered-badge" },
            });
            (__VLS_ctx.orderedByDish[item.dish.id]);
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (item.quantity);
        }
        const __VLS_16 = {}.VanField;
        /** @type {[typeof __VLS_components.VanField, typeof __VLS_components.vanField, ]} */ ;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
            modelValue: (item.note),
            ...{ class: "cart-field" },
            label: "单项备注",
            placeholder: "少辣、不放香菜，可不填",
        }));
        const __VLS_18 = __VLS_17({
            modelValue: (item.note),
            ...{ class: "cart-field" },
            label: "单项备注",
            placeholder: "少辣、不放香菜，可不填",
        }, ...__VLS_functionalComponentArgsRest(__VLS_17));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stepper compact" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(!__VLS_ctx.loading && __VLS_ctx.menu))
                        return;
                    __VLS_ctx.remove(item.dish);
                    __VLS_ctx.burstConfetti($event);
                } },
            disabled: (!__VLS_ctx.canDecreaseDishQuantity(item.quantity)),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (item.quantity);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(!__VLS_ctx.loading && __VLS_ctx.menu))
                        return;
                    __VLS_ctx.add(item.dish);
                    __VLS_ctx.burstConfetti($event);
                } },
            disabled: ((!__VLS_ctx.isUnlimitedQuantityDish(item.dish) && Boolean(__VLS_ctx.orderedByDish[item.dish.id])) || (!__VLS_ctx.isUnlimitedQuantityDish(item.dish) && item.quantity >= 1)),
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "order-fields" },
    });
    const __VLS_20 = {}.VanField;
    /** @type {[typeof __VLS_components.VanField, typeof __VLS_components.vanField, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        modelValue: (__VLS_ctx.guestName),
        ...{ class: "cart-field" },
        label: "昵称",
        placeholder: "例如：小欧",
        required: true,
        clearable: true,
        error: (__VLS_ctx.guestNameMissing),
        errorMessage: "昵称必填",
    }));
    const __VLS_22 = __VLS_21({
        modelValue: (__VLS_ctx.guestName),
        ...{ class: "cart-field" },
        label: "昵称",
        placeholder: "例如：小欧",
        required: true,
        clearable: true,
        error: (__VLS_ctx.guestNameMissing),
        errorMessage: "昵称必填",
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    const __VLS_24 = {}.VanField;
    /** @type {[typeof __VLS_components.VanField, typeof __VLS_components.vanField, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        modelValue: (__VLS_ctx.note),
        ...{ class: "cart-field" },
        label: "整单备注",
        placeholder: "例如：整体少辣、饮料要冰",
    }));
    const __VLS_26 = __VLS_25({
        modelValue: (__VLS_ctx.note),
        ...{ class: "cart-field" },
        label: "整单备注",
        placeholder: "例如：整体少辣、饮料要冰",
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    const __VLS_28 = {}.VanButton;
    /** @type {[typeof __VLS_components.VanButton, typeof __VLS_components.vanButton, typeof __VLS_components.VanButton, typeof __VLS_components.vanButton, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
        ...{ 'onClick': {} },
        block: true,
        ...{ class: "submit-order-btn" },
        loading: (__VLS_ctx.submitting),
        disabled: (!__VLS_ctx.canSubmit),
    }));
    const __VLS_30 = __VLS_29({
        ...{ 'onClick': {} },
        block: true,
        ...{ class: "submit-order-btn" },
        loading: (__VLS_ctx.submitting),
        disabled: (!__VLS_ctx.canSubmit),
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
    let __VLS_32;
    let __VLS_33;
    let __VLS_34;
    const __VLS_35 = {
        onClick: (__VLS_ctx.submitOrder)
    };
    __VLS_31.slots.default;
    var __VLS_31;
    var __VLS_15;
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "loading-page" },
    });
}
/** @type {__VLS_StyleScopedClasses['guest-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['event-head']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['muted']} */ ;
/** @type {__VLS_StyleScopedClasses['status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['content-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['category-rail']} */ ;
/** @type {__VLS_StyleScopedClasses['content-main']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-list']} */ ;
/** @type {__VLS_StyleScopedClasses['category-anchor']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-row']} */ ;
/** @type {__VLS_StyleScopedClasses['top-rank-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-image']} */ ;
/** @type {__VLS_StyleScopedClasses['image-button']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-image']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-image-placeholder']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-info']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-title']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-name']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-link']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-name']} */ ;
/** @type {__VLS_StyleScopedClasses['serving-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-description']} */ ;
/** @type {__VLS_StyleScopedClasses['tag-list']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-action']} */ ;
/** @type {__VLS_StyleScopedClasses['ordered-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['action-ordered-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['stepper']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-band']} */ ;
/** @type {__VLS_StyleScopedClasses['band-title']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-list']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-row']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-main']} */ ;
/** @type {__VLS_StyleScopedClasses['guest-list']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-band']} */ ;
/** @type {__VLS_StyleScopedClasses['my-orders-band']} */ ;
/** @type {__VLS_StyleScopedClasses['band-title']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-list']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-row']} */ ;
/** @type {__VLS_StyleScopedClasses['my-order-row']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-main']} */ ;
/** @type {__VLS_StyleScopedClasses['my-order-items']} */ ;
/** @type {__VLS_StyleScopedClasses['my-order-note']} */ ;
/** @type {__VLS_StyleScopedClasses['delete-order-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['cart-fab']} */ ;
/** @type {__VLS_StyleScopedClasses['cart-fab-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['cart-fab-action']} */ ;
/** @type {__VLS_StyleScopedClasses['cart-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['cart-panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['empty']} */ ;
/** @type {__VLS_StyleScopedClasses['cart-item']} */ ;
/** @type {__VLS_StyleScopedClasses['cart-item-main']} */ ;
/** @type {__VLS_StyleScopedClasses['cart-item-title']} */ ;
/** @type {__VLS_StyleScopedClasses['ordered-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['cart-field']} */ ;
/** @type {__VLS_StyleScopedClasses['stepper']} */ ;
/** @type {__VLS_StyleScopedClasses['compact']} */ ;
/** @type {__VLS_StyleScopedClasses['order-fields']} */ ;
/** @type {__VLS_StyleScopedClasses['cart-field']} */ ;
/** @type {__VLS_StyleScopedClasses['cart-field']} */ ;
/** @type {__VLS_StyleScopedClasses['submit-order-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['loading-page']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ShoppingCart: ShoppingCart,
            ClipboardList: ClipboardList,
            ChevronRight: ChevronRight,
            canDecreaseDishQuantity: canDecreaseDishQuantity,
            loading: loading,
            submitting: submitting,
            menu: menu,
            myOrders: myOrders,
            summary: summary,
            activeCategory: activeCategory,
            cart: cart,
            guestName: guestName,
            note: note,
            showCart: showCart,
            deletingOrderId: deletingOrderId,
            categoryRail: categoryRail,
            isUnlimitedQuantityDish: isUnlimitedQuantityDish,
            cartItems: cartItems,
            cartCount: cartCount,
            guestNameMissing: guestNameMissing,
            orderedByDish: orderedByDish,
            canSubmit: canSubmit,
            groupedDishes: groupedDishes,
            dishTopRankMap: dishTopRankMap,
            add: add,
            remove: remove,
            previewDishImage: previewDishImage,
            burstConfetti: burstConfetti,
            categoryAnchorId: categoryAnchorId,
            scrollToCategory: scrollToCategory,
            deleteOwnOrder: deleteOwnOrder,
            submitOrder: submitOrder,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
