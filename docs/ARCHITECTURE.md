# 架构设计与数据模型 (Architecture & Data Models)

本文档详细描述「枫叶云笔记」的系统架构设计、数据结构定义以及状态管理机制。

---

## 🏗️ 目录结构组织

```text
├── docs/                      # 项目设计与使用文档
├── public/                    # 静态资源 (包括 Kity/KityMinder 第三方库)
│   └── libs/
│       ├── kity.min.js
│       └── kityminder.core.min.js
├── src/
│   ├── components/            # Vue 界面组件
│   │   ├── icons/             # 专用格式图标与思维导图图标
│   │   ├── FolderTreeItem.vue # 侧边栏多级文件夹递归组件 (支持拖拽位置判断)
│   │   ├── Header.vue         # 顶部搜索、全局操作与用户信息组件
│   │   ├── ImportModal.vue    # 文件/XMind/Markdown导入弹窗
│   │   ├── MindMapEditor.vue  # KityMinder 思维导图核心编辑器与大纲
│   │   ├── MoveModal.vue      # 笔记移动至文件夹多级选择弹窗
│   │   ├── MoveFolderTreeItem.vue # 移动弹窗内部递归树组件
│   │   ├── NewFolderModal.vue # 新建文件夹弹窗
│   │   ├── NoteEditor.vue     # Markdown 富文本笔记编辑器
│   │   ├── NoteList.vue       # 中间工作区笔记列表及排序/过滤
│   │   ├── RenameNoteModal.vue# 重命名笔记弹窗
│   │   ├── ShareModal.vue     # 笔记链接生成与分享弹窗
│   │   ├── ShortcutsModal.vue # 快捷键指南浮层
│   │   └── Sidebar.vue        # 侧边栏主容器与导航
│   ├── composables/           # 组合式函数业务状态管理
│   │   └── useNotes.ts        # 全局笔记/文件夹 CRUD 与持久化状态中心
│   ├── data/
│   │   └── initialData.ts     # 初始演示数据集
│   ├── utils/                 # 工具函数
│   │   ├── kityminder.ts      # KityMinder 初始化加载与实例控制
│   │   ├── markdownMindmap.ts # Markdown ↔ 思维导图 JSON 互转器
│   │   └── xmind.ts           # XMind Zen/XMind 8 压缩包解析器
│   ├── types.ts               # 全局 TypeScript 类型定义
│   ├── App.vue                # 应用根组件
│   └── main.tsx               # 应用入口
├── index.html
├── package.json
└── tsconfig.json
```

---

## 📊 核心数据模型定义 (`src/types.ts`)

### 1. 笔记数据结构 (`Note`)

```typescript
export type NoteFormat = 'markdown' | 'mindmap';

export interface Note {
  id: string;             // 唯一 ID (例如 'note-1')
  title: string;          // 笔记标题
  content: string;        // 笔记正文 (Markdown 格式文本或思维导图序列化 JSON)
  folderId: string;       // 所属文件夹 ID (关联 Folder.id)
  isStarred: boolean;     // 是否标星收藏
  isTrash: boolean;       // 是否在回收站中
  createdAt: number;      // 创建时间戳 (ms)
  updatedAt: number;      // 最近修改时间戳 (ms)
  format?: NoteFormat;    // 笔记格式 ('markdown' | 'mindmap')
  type?: NoteFormat;      // 兼容字段
  tags?: string[];        // 标签集合
  summary?: string;       // 概要简述
}
```

### 2. 文件夹多级树形结构 (`Folder`)

```typescript
export interface Folder {
  id: string;             // 文件夹唯一 ID
  name: string;           // 文件夹名称
  parentId?: string | null; // 父级文件夹 ID (为 null 表示一级根目录)
  order: number;          // 同级排序权重 (从小到大排列)
  isOpen?: boolean;       // 在侧边栏中是否处于展开状态
  createdAt: number;      // 创建时间戳
}
```

### 3. 思维导图节点协议 (`MinderNodeData`)

```typescript
export interface MinderNodeData {
  id?: string;
  text: string;
  note?: string;          // 富文本备注
  priority?: number;      // 优先级 (1-9)
  progress?: number;      // 进度百分比 (1-9)
  resource?: string[];    // 标签资源
  hyperlink?: string;     // 超链接 URL
  expandState?: 'collapse' | 'expand';
}
```

---

## 🔄 状态流转与单向数据流

```text
               ┌────────────────────────┐
               │    useNotes.ts 状态中心 │
               │ (notes, folders, active)│
               └───────────┬────────────┘
                           │
       ┌───────────────────┼──────────────────┐
       ▼                   ▼                  ▼
 ┌───────────┐      ┌──────────────┐   ┌──────────────┐
 │  Sidebar  │      │   NoteList   │   │  NoteEditor  │
 │ (文件夹树) │      │ (笔记筛选列表)│   │/MindMapEditor│
 └─────┬─────┘      └──────┬───────┘   └──────┬───────┘
       │                   │                  │
       └─────────► 发送事件/调用方法 ◄──────────┘
                  (create / update /
                   delete / move / reorder)
```

1. **持久化与反应式**：`useNotes.ts` 集中管理 `folders`、`notes`、`activeNoteId`、`activeFolderId` 等反应式状态，并自动同步至本地持久化。
2. **视图解耦**：组件均通过事件向上分发 (`emit`)，数据向下传递 (`props`)，确保职责单一清晰。
