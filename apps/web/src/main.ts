import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import Vant from "vant";
import "vant/lib/index.css";
import App from "./App.vue";
import AdminHome from "./pages/AdminHome.vue";
import GuestMenu from "./pages/GuestMenu.vue";
import "./style.css";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/e/family-demo" },
    { path: "/e/:code", component: GuestMenu },
    { path: "/admin", component: AdminHome }
  ]
});

createApp(App).use(router).use(ElementPlus).use(Vant).mount("#app");
