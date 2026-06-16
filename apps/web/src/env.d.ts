declare module "*.vue" {
  import type { DefineComponent } from "vue";

  const component: DefineComponent<object, object, any>;
  export default component;
}

interface ImportMetaEnv {
  readonly VITE_PUBLIC_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
