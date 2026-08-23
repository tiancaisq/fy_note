import { Folder, Note } from '../types';
import { DRAWIO_TEMPLATES } from '../utils/drawioTemplates';

export const INITIAL_FOLDERS: Folder[] = [
  {
    id: 'folder-tech-arch',
    name: '技术架构与设计',
    parentId: null,
    order: 0,
    isOpen: true,
  },
  {
    id: 'folder-projects',
    name: '项目研发规划',
    parentId: null,
    order: 1,
    isOpen: true,
  },
  {
    id: 'folder-daily-notes',
    name: '工作日常记录',
    parentId: null,
    order: 2,
    isOpen: false,
  },
];

const archTemplate = DRAWIO_TEMPLATES.find((t) => t.id === 'architecture') || DRAWIO_TEMPLATES[1];
const flowchartTemplate = DRAWIO_TEMPLATES.find((t) => t.id === 'flowchart') || DRAWIO_TEMPLATES[0];

export const INITIAL_NOTES: Note[] = [
  {
    id: 'note-drawio-cloud-arch',
    title: '云原生高可用微服务架构全景图',
    content: archTemplate.xml,
    folderId: 'folder-tech-arch',
    createdAt: '2025-01-15 10:30',
    updatedAt: '2025-01-15 11:20',
    isStarred: true,
    isFavorite: true,
    isShared: false,
    isDeleted: false,
    tags: ['架构图', 'Draw.io', '微服务'],
    format: 'drawio',
    type: 'drawio',
  },
  {
    id: 'note-drawio-flowchart',
    title: '用户认证与鉴权状态流程图',
    content: flowchartTemplate.xml,
    folderId: 'folder-tech-arch',
    createdAt: '2025-01-16 14:20',
    updatedAt: '2025-01-16 15:00',
    isStarred: false,
    isFavorite: true,
    isShared: false,
    isDeleted: false,
    tags: ['流程图', 'Draw.io', '安全鉴权'],
    format: 'drawio',
    type: 'drawio',
  },
  {
    id: 'note-mindmap-roadmap',
    title: '2025 产品技术路线与功能演进脑图',
    content: JSON.stringify({
      root: {
        data: { id: 'root', text: '2025 枫叶云笔记演进路线' },
        children: [
          {
            data: { id: 'c1', text: '多元文档形态' },
            children: [
              { data: { id: 'c1-1', text: 'Markdown 专业富文本' } },
              { data: { id: 'c1-2', text: 'KityMinder 思维导图' } },
              { data: { id: 'c1-3', text: 'Draw.io 架构图/流程图' } },
            ],
          },
          {
            data: { id: 'c2', text: '云端与离线' },
            children: [
              { data: { id: 'c2-1', text: 'IndexedDB 本地持久化' } },
              { data: { id: 'c2-2', text: 'REST/WebSocket 云同步' } },
              { data: { id: 'c2-3', text: '多端导出与备份' } },
            ],
          },
          {
            data: { id: 'c3', text: '效率工具' },
            children: [
              { data: { id: 'c3-1', text: '全文极速检索' } },
              { data: { id: 'c3-2', text: '常用文件夹置顶' } },
              { data: { id: 'c3-3', text: '多标签/标星/时间线' } },
            ],
          },
        ],
      },
      template: 'right',
      theme: 'classic',
      version: '1.4.43',
    }, null, 2),
    folderId: 'folder-projects',
    createdAt: '2025-01-17 09:00',
    updatedAt: '2025-01-17 10:00',
    isStarred: true,
    isFavorite: false,
    isShared: false,
    isDeleted: false,
    tags: ['思维导图', '规划', '路线图'],
    format: 'mindmap',
    type: 'mindmap',
  },
  {
    id: 'note-markdown-welcome',
    title: '欢迎使用枫叶云笔记 (Markdown, 脑图 & Draw.io)',
    content: `# 🍁 欢迎使用枫叶云笔记

枫叶云笔记现已全面集成 **Markdown**、**思维导图 (Mind Map)** 与 **Draw.io 专业图表系统**！

## 🚀 三大核心创作引擎

1. **Markdown 编辑器**：支持实时分屏预览、代码高亮、数学公式、表格与快捷键格式化。
2. **KityMinder 脑图**：自由发散、主题关联、鱼骨图与多级大纲。
3. **Draw.io 专业图表**：
   - 包含流程图 (Flowchart)、云原生微服务架构图 (Cloud Architecture)、UML 类图与时序图、ER 数据库模型图。
   - 支持 SVG、PNG、PDF 与 .drawio 格式无损导入与导出。
   - 支持多套专业预设模板（微服务、数据库设计、时序图、网络拓扑等）。

## ⌨️ 快捷键支持
- \`⌘N\` / \`Ctrl+N\`：新建 Markdown 笔记
- \`⌘M\` / \`Ctrl+M\`：新建思维导图
- \`⌘D\` / \`Ctrl+D\`：新建 Draw.io 图表
- \`⌘F\` / \`Ctrl+F\`：全局搜索定位

祝您创作愉快！`,
    folderId: 'folder-daily-notes',
    createdAt: '2025-01-18 08:30',
    updatedAt: '2025-01-18 08:30',
    isStarred: false,
    isFavorite: false,
    isShared: false,
    isDeleted: false,
    tags: ['指南', '欢迎', '快捷键'],
    format: 'markdown',
    type: 'markdown',
  },
];

