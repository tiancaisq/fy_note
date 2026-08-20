# 枫叶云笔记 (Maple Notes) - 项目文档

「枫叶云笔记」是一款基于 **Vue 3 + TypeScript + Tailwind CSS** 构建的高效云端笔记与思维导图知识管理系统。系统深度整合了层级知识库管理、Markdown 富文本编辑、KityMinder 可视化思维导图引擎、多格式导入导出以及高灵活度的拖拽管理。

---

## 📚 文档目录

- [1. 项目概述与特性](./README.md)
- [2. 系统架构与数据设计](./ARCHITECTURE.md)
- [3. 核心功能与操作指南](./FEATURES.md)
- [4. 开发与部署指南](./DEVELOPMENT_GUIDE.md)
- [5. 云端同步 API 接口协议规范](./API_SPECIFICATION.md)
- [6. 服务端数据库结构设计文档](./DATABASE_SCHEMA.md)
- [7. MySQL 数据库初始化 SQL 脚本](./init.sql)
- [8. PHP 示例服务端源码与部署指南](./server-sample-php/README.md)

---

## 🚀 核心亮点

1. **双模式知识创作**
   - **Markdown 笔记**：实时富文本渲染、统计字数、快速插入代码块、表格、待办清单等。
   - **思维导图**：内置 KityMinder 核心引擎，支持节点增删改、折叠、富文本备注、优先级与进度标记、大纲视图双向同步。

2. **多层级知识树管理**
   - 支持无限层级文件夹与子文件夹分类；
   - 支持多级文件夹拖拽排序（上方、下方、内嵌子目录智能识别）；
   - 支持快速搜索文件夹、折叠/展开全部以及快捷移动笔记。

3. **数据导入与导出**
   - **导入**：支持 Markdown (.md)、TXT 文件以及 XMind (.xmind) 思维导图文件直接解析导入；
   - **导出**：思维导图支持一键导出为 PNG 高清图片、SVG 矢量图、JSON 以及 Markdown 大纲。

4. **便捷操作与快捷键**
   - 包含快捷键面板（`Ctrl + /` 或 `Cmd + /` 查看）；
   - 笔记搜索全文高亮过滤、标星收藏与回收站机制。

---

## 🛠️ 技术栈总览

- **前端核心**：Vue 3 (Composition API / `<script setup>`) + TypeScript
- **构建工具**：Vite 6 + ESBuild
- **样式方案**：Tailwind CSS v4
- **图标库**：Lucide Vue Next (`lucide-vue-next`)
- **思维导图引擎**：Kity + KityMinder Core
- **解析器与工具**：Marked (Markdown 解析)、JSZip (XMind 压缩包解包解析)

---

## ⚡ 快速启动

```bash
# 1. 安装依赖
npm install

# 2. 启动本地开发服务 (默认端口 3000)
npm run dev

# 3. 类型检查与代码校验
npm run lint

# 4. 构建生产产物
npm run build
```
