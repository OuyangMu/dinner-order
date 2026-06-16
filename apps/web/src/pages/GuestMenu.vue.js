import { ShoppingCart, ClipboardList } from "lucide-vue-next";
import { showFailToast, showImagePreview, showSuccessToast } from "vant";
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { request } from "../api";
const route = useRoute();
const code = computed(() => String(route.params.code));
const loading = ref(true);
const submitting = ref(false);
const menu = ref(null);
const summary = ref([]);
const activeCategory = ref("");
const cart = reactive({});
const guestName = ref(localStorage.getItem("guestName") || "");
const guestToken = ref(localStorage.getItem("guestToken") || "");
const note = ref("");
const showCart = ref(false);
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
    }, 550);
}
function syncActiveCategoryOnScroll() {
    if (scrollLockTimer || !menu.value?.categories.length)
        return;
    const anchors = menu.value.categories
        .map((category) => ({
        id: category.id,
        top: document.getElementById(categoryAnchorId(category.id))?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY
    }))
        .filter((item) => Number.isFinite(item.top));
    const current = anchors
        .filter((item) => item.top <= 110)
        .sort((a, b) => b.top - a.top)[0] || anchors.sort((a, b) => a.top - b.top)[0];
    if (current)
        activeCategory.value = current.id;
}
async function load() {
    loading.value = true;
    try {
        menu.value = await request(`/api/events/${code.value}/menu`);
        activeCategory.value = menu.value.categories[0]?.id || "";
        requestAnimationFrame(syncActiveCategoryOnScroll);
        if (menu.value.event.showSummary) {
            summary.value = await request(`/api/events/${code.value}/summary`).catch(() => []);
        }
    }
    catch (error) {
        showFailToast(error instanceof Error ? error.message : "加载失败");
    }
    finally {
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
/** @type {__VLS_StyleScopedClasses['van-field__control']} */ ;
/** @type {__VLS_StyleScopedClasses['guest-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['van-field__control']} */ ;
/** @type {__VLS_StyleScopedClasses['guest-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['van-field__label']} */ ;
/** @type {__VLS_StyleScopedClasses['guest-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['van-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['guest-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['category-rail']} */ ;
/** @type {__VLS_StyleScopedClasses['category-rail']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-list']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-list']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-row']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-row']} */ ;
/** @type {__VLS_StyleScopedClasses['previewable']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-row']} */ ;
/** @type {__VLS_StyleScopedClasses['previewable']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-title']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-title']} */ ;
/** @type {__VLS_StyleScopedClasses['tag-list']} */ ;
/** @type {__VLS_StyleScopedClasses['tag-list']} */ ;
/** @type {__VLS_StyleScopedClasses['stepper']} */ ;
/** @type {__VLS_StyleScopedClasses['stepper']} */ ;
/** @type {__VLS_StyleScopedClasses['stepper']} */ ;
/** @type {__VLS_StyleScopedClasses['stepper']} */ ;
/** @type {__VLS_StyleScopedClasses['stepper']} */ ;
/** @type {__VLS_StyleScopedClasses['stepper']} */ ;
/** @type {__VLS_StyleScopedClasses['stepper']} */ ;
/** @type {__VLS_StyleScopedClasses['stepper']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-band']} */ ;
/** @type {__VLS_StyleScopedClasses['guest-list']} */ ;
/** @type {__VLS_StyleScopedClasses['cart-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['cart-item-title']} */ ;
/** @type {__VLS_StyleScopedClasses['cart-item-title']} */ ;
/** @type {__VLS_StyleScopedClasses['cart-item-title']} */ ;
/** @type {__VLS_StyleScopedClasses['ordered-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['submit-order-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['submit-order-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['submit-order-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['guest-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['event-head']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['category-rail']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-list']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-row']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-row']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-title']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-info']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-action']} */ ;
/** @type {__VLS_StyleScopedClasses['ordered-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['cart-fab']} */ ;
/** @type {__VLS_StyleScopedClasses['cart-item']} */ ;
/** @type {__VLS_StyleScopedClasses['compact']} */ ;
// CSS variable injection 
// CSS variable injection end 
if (!__VLS_ctx.loading && __VLS_ctx.menu) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
        ...{ class: "guest-shell" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "event-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
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
        ...{ class: "menu-layout" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
        ...{ class: "category-rail" },
    });
    for (const [group] of __VLS_getVForSourceType((__VLS_ctx.groupedDishes))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(!__VLS_ctx.loading && __VLS_ctx.menu))
                        return;
                    __VLS_ctx.scrollToCategory(group.category.id);
                } },
            key: (group.category.id),
            ...{ class: ({ active: __VLS_ctx.activeCategory === group.category.id }) },
        });
        (group.category.name);
    }
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
            __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
                ...{ onClick: (...[$event]) => {
                        if (!(!__VLS_ctx.loading && __VLS_ctx.menu))
                            return;
                        __VLS_ctx.previewDishImage(dish);
                    } },
                src: (dish.imageUrl || '/placeholder-dish.jpg'),
                alt: (dish.name),
                ...{ class: ({ previewable: dish.imageUrl }) },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "dish-info" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "dish-title" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
                ...{ onClick: (...[$event]) => {
                        if (!(!__VLS_ctx.loading && __VLS_ctx.menu))
                            return;
                        __VLS_ctx.previewDishImage(dish);
                    } },
                ...{ class: ({ previewable: dish.imageUrl }) },
            });
            (dish.name);
            if (dish.servingHint) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (dish.servingHint);
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            (dish.description);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "tag-list" },
            });
            for (const [tag] of __VLS_getVForSourceType((dish.tags))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    key: (tag),
                });
                (tag);
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "dish-action" },
            });
            if (!__VLS_ctx.isUnlimitedQuantityDish(dish) && __VLS_ctx.orderedByDish[dish.id]) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "ordered-badge" },
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(!__VLS_ctx.loading && __VLS_ctx.menu))
                    return;
                __VLS_ctx.showCart = true;
            } },
        ...{ class: "cart-fab" },
    });
    const __VLS_4 = {}.ShoppingCart;
    /** @type {[typeof __VLS_components.ShoppingCart, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        size: (20),
    }));
    const __VLS_6 = __VLS_5({
        size: (20),
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.cartCount);
    const __VLS_8 = {}.VanPopup;
    /** @type {[typeof __VLS_components.VanPopup, typeof __VLS_components.vanPopup, typeof __VLS_components.VanPopup, typeof __VLS_components.vanPopup, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        show: (__VLS_ctx.showCart),
        position: "bottom",
        round: true,
    }));
    const __VLS_10 = __VLS_9({
        show: (__VLS_ctx.showCart),
        position: "bottom",
        round: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    __VLS_11.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "cart-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
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
        const __VLS_12 = {}.VanField;
        /** @type {[typeof __VLS_components.VanField, typeof __VLS_components.vanField, ]} */ ;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
            modelValue: (item.note),
            ...{ class: "cart-field" },
            label: "单项备注",
            placeholder: "少辣、不要香菜，可不填",
        }));
        const __VLS_14 = __VLS_13({
            modelValue: (item.note),
            ...{ class: "cart-field" },
            label: "单项备注",
            placeholder: "少辣、不要香菜，可不填",
        }, ...__VLS_functionalComponentArgsRest(__VLS_13));
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
    const __VLS_16 = {}.VanField;
    /** @type {[typeof __VLS_components.VanField, typeof __VLS_components.vanField, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        modelValue: (__VLS_ctx.guestName),
        ...{ class: "cart-field" },
        label: "昵称",
        placeholder: "例如：小王",
        required: true,
        clearable: true,
        error: (__VLS_ctx.guestNameMissing),
        errorMessage: "昵称必填",
    }));
    const __VLS_18 = __VLS_17({
        modelValue: (__VLS_ctx.guestName),
        ...{ class: "cart-field" },
        label: "昵称",
        placeholder: "例如：小王",
        required: true,
        clearable: true,
        error: (__VLS_ctx.guestNameMissing),
        errorMessage: "昵称必填",
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    const __VLS_20 = {}.VanField;
    /** @type {[typeof __VLS_components.VanField, typeof __VLS_components.vanField, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        modelValue: (__VLS_ctx.note),
        ...{ class: "cart-field" },
        label: "整单备注",
        placeholder: "例如：整体少辣、饮料要冰",
    }));
    const __VLS_22 = __VLS_21({
        modelValue: (__VLS_ctx.note),
        ...{ class: "cart-field" },
        label: "整单备注",
        placeholder: "例如：整体少辣、饮料要冰",
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    const __VLS_24 = {}.VanButton;
    /** @type {[typeof __VLS_components.VanButton, typeof __VLS_components.vanButton, typeof __VLS_components.VanButton, typeof __VLS_components.vanButton, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        ...{ 'onClick': {} },
        block: true,
        ...{ class: "submit-order-btn" },
        loading: (__VLS_ctx.submitting),
        disabled: (!__VLS_ctx.canSubmit),
    }));
    const __VLS_26 = __VLS_25({
        ...{ 'onClick': {} },
        block: true,
        ...{ class: "submit-order-btn" },
        loading: (__VLS_ctx.submitting),
        disabled: (!__VLS_ctx.canSubmit),
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    let __VLS_28;
    let __VLS_29;
    let __VLS_30;
    const __VLS_31 = {
        onClick: (__VLS_ctx.submitOrder)
    };
    __VLS_27.slots.default;
    var __VLS_27;
    var __VLS_11;
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "loading-page" },
    });
}
/** @type {__VLS_StyleScopedClasses['guest-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['event-head']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['muted']} */ ;
/** @type {__VLS_StyleScopedClasses['status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['category-rail']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-list']} */ ;
/** @type {__VLS_StyleScopedClasses['category-anchor']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-row']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-info']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-title']} */ ;
/** @type {__VLS_StyleScopedClasses['tag-list']} */ ;
/** @type {__VLS_StyleScopedClasses['dish-action']} */ ;
/** @type {__VLS_StyleScopedClasses['ordered-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['stepper']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-band']} */ ;
/** @type {__VLS_StyleScopedClasses['band-title']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-list']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-row']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-main']} */ ;
/** @type {__VLS_StyleScopedClasses['guest-list']} */ ;
/** @type {__VLS_StyleScopedClasses['cart-fab']} */ ;
/** @type {__VLS_StyleScopedClasses['cart-panel']} */ ;
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
            loading: loading,
            submitting: submitting,
            menu: menu,
            summary: summary,
            activeCategory: activeCategory,
            cart: cart,
            guestName: guestName,
            note: note,
            showCart: showCart,
            isUnlimitedQuantityDish: isUnlimitedQuantityDish,
            cartItems: cartItems,
            cartCount: cartCount,
            guestNameMissing: guestNameMissing,
            orderedByDish: orderedByDish,
            canSubmit: canSubmit,
            groupedDishes: groupedDishes,
            add: add,
            remove: remove,
            previewDishImage: previewDishImage,
            burstConfetti: burstConfetti,
            categoryAnchorId: categoryAnchorId,
            scrollToCategory: scrollToCategory,
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
