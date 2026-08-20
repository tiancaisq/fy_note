# 开发与部署指南 (Development & Deployment Guide)

本文档面向开发者，说明如何进行本地开发、代码规范、组件扩展及打包部署。

---

## 💻 1. 环境准备

- **Node.js**: >= 18.0.0
- **包管理器**: npm 或 bun

---

## 🛠️ 2. 开发常用脚本

```bash
# 启动本地开发服务 (支持 HMR 与实时重载)
npm run dev

# 执行 TypeScript 静态类型检查
npm run lint

# 构建前端生产产物 (输出到 dist/)
npm run build

# 预览生产构建包
npm run preview
```

---

## 🧩 3. 扩展与开发规范

### 3.1 添加新弹窗或组件
1. 在 `src/components/` 目录下创建组件（如 `MyCustomModal.vue`）；
2. 遵循 Tailwind CSS 实用类规范，不要引入全局 CSS 选择器或破坏主题色彩；
3. 遵循 Vue 3 `<script setup lang="ts">` 语法；
4. 若涉及全局数据改动，在 `src/composables/useNotes.ts` 中暴露相应方法并在 `App.vue` 或对应组件中调用。

### 3.2 外部点击关闭弹窗/下拉框规范
对于自定义下拉菜单或操作气泡，统一使用：
- 在 `onMounted` 注册 `document.addEventListener('click', ...)` 与 `document.addEventListener('keydown', ...)`；
- 配合模板 `ref` 与 `refEl.contains(target)` 判断点击边界；
- 在 `onUnmounted` 中注销监听，防止内存泄漏。

---

## 📦 4. 生产部署指南

执行 `npm run build` 后，Vite 会将优化后的 HTML、CSS、JS 文件打包输出至项目根目录下的 `dist/` 文件夹。

可直接部署至任何静态托管平台（如 Nginx、Vercel、Cloudflare Pages、GitHub Pages 或 Cloud Run）。
