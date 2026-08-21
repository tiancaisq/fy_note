<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick, toRaw } from 'vue';
import {
  X,
  Save,
  Star,
  Box,
  Share2,
  Download,
  Folder as FolderIcon,
  Plus,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  RotateCw,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Compass,
  FileText,
  Link as LinkIcon,
  Palette,
  Layout as LayoutIcon,
  Check,
  CheckCheck,
  Layers,
  Search,
  FileDown,
  FileUp,
  Image as ImageIcon,
  FolderInput,
  Sparkles,
  HelpCircle,
  Eye,
  Type,
  Bold,
  Italic,
  Sliders,
  ChevronDown,
  ChevronRight,
  ListTree,
  GitBranch,
  Hash,
  LayoutGrid,
  FileCode2,
  Map as MapIcon,
  WrapText
} from 'lucide-vue-next';
import { Note, Folder } from '../types';
import { compareFolders } from '../utils/folderSort';
import MindmapIcon from './icons/MindmapIcon.vue';
import MindMapSearchTreeItem, { SearchTreeNode } from './MindMapSearchTreeItem.vue';
import MindMapOutlineTreeItem, { OutlineTreeNode } from './MindMapOutlineTreeItem.vue';
import MindMapMarkdownModal from './MindMapMarkdownModal.vue';
import MindMapMinimap from './MindMapMinimap.vue';
import { loadKityMinder } from '../utils/kityminder';
import { exportToXMind, importFromXMind } from '../utils/xmind';

const props = withDefaults(
  defineProps<{
    note: Note;
    folders?: Folder[];
  }>(),
  {
    folders: () => [],
  }
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'updateNote', id: string, updates: Partial<Note>): void;
  (e: 'toggleStar', noteId: string): void;
  (e: 'toggleFavorite', noteId: string): void;
  (e: 'openShare', note: Note): void;
}>();

const isMac = computed(() => {
  return typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
});

// Local reactive state
const localTitle = ref(props.note.title);
const localFolderId = ref(props.note.folderId);
const localTags = ref<string[]>([...props.note.tags]);

// Hierarchical folders formatted with level indentation
const hierarchicalFolders = computed(() => {
  const result: { id: string; name: string; level: number; fullPath: string; prefix: string }[] = [];
  const list = props.folders || [];
  const validIds = new Set(list.map((f) => f.id));
  const firstId = list.find((f) => !f.parentId)?.id || list[0]?.id || '';

  function getChildren(pId: string | null = null) {
    if (!pId) {
      return list.filter((f) => !f.parentId).sort(compareFolders);
    }
    return list
      .filter((f) => {
        if (f.parentId === pId) return true;
        if (pId === firstId && f.parentId && !validIds.has(f.parentId) && f.id !== firstId) {
          return true;
        }
        return false;
      })
      .sort(compareFolders);
  }

  function traverse(parentId: string | null = null, level = 0, parentPath = '', visited = new Set<string>()) {
    const children = getChildren(parentId);

    for (const child of children) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      const currentPath = parentPath ? `${parentPath} / ${child.name}` : child.name;
      const indent = level === 0 ? '' : '　'.repeat(level) + '└ ';
      result.push({
        id: child.id,
        name: child.name,
        level,
        fullPath: currentPath,
        prefix: indent,
      });
      traverse(child.id, level + 1, currentPath, visited);
    }
  }

  traverse(null, 0, '');
  return result;
});
const newTagInput = ref('');
const activeTab = ref<'common' | 'idea' | 'appearance' | 'data' | 'view'>('common');
const isFullscreen = ref(true);
const saveStatus = ref('已自动同步');
const searchKeyword = ref('');
const isSearching = ref(false);
const isNoteModalOpen = ref(false);
const nodeNoteText = ref('');
const noteTextareaRef = ref<HTMLTextAreaElement | null>(null);
const isLinkModalOpen = ref(false);
const linkUrl = ref('');
const linkTitle = ref('');
const linkInputRef = ref<HTMLInputElement | null>(null);

// Inline Node Editing State
const isEditingNode = ref(false);
const editingNodeText = ref('');
const editingInputRef = ref<HTMLInputElement | null>(null);
let editingNode: any = null;
let justFinishedEditing = false;
const inlineEditorPosition = ref({
  left: 0,
  top: 0,
  width: 120,
  height: 32,
});

// Breadcrumb Item Interface & Dropdown State
interface BreadcrumbItem {
  id: string;
  node: any;
  text: string;
  isRoot: boolean;
  level: number;
  siblings: Array<{
    id: string;
    node: any;
    text: string;
    isActive: boolean;
  }>;
}

const activeBreadcrumbDropdown = ref<string | null>(null);
const breadcrumbDropdownPos = ref({ top: 0, left: 0, width: 220 });

const activeBreadcrumbItem = computed(() => {
  if (!activeBreadcrumbDropdown.value) return null;
  return breadcrumbTrail.value.find(item => item.id === activeBreadcrumbDropdown.value) || null;
});

function closeBreadcrumbDropdown() {
  activeBreadcrumbDropdown.value = null;
}

function toggleBreadcrumbDropdown(itemId: string, event?: MouseEvent) {
  if (activeBreadcrumbDropdown.value === itemId) {
    activeBreadcrumbDropdown.value = null;
    return;
  }
  
  activeBreadcrumbDropdown.value = itemId;

  if (event) {
    const target = event.currentTarget as HTMLElement;
    const pill = target.closest('.breadcrumb-node-pill') || target;
    const rect = pill.getBoundingClientRect();
    
    // Position below the pill, ensuring it doesn't overflow viewport edges
    const dropdownWidth = 240;
    let left = rect.left;
    if (left + dropdownWidth > window.innerWidth - 16) {
      left = Math.max(16, window.innerWidth - dropdownWidth - 16);
    }

    breadcrumbDropdownPos.value = {
      top: rect.bottom + 4,
      left: Math.max(12, left),
      width: Math.max(200, rect.width)
    };
  }
}

// Current Node Breadcrumb Trail (all ancestors up to current selected node)
const breadcrumbTrail = computed<BreadcrumbItem[]>(() => {
  // Trigger on version and selection updates
  const _v = outlineTreeVersion.value;
  const _sel = activeSelectedNodeId.value;
  if (!minder) return [];
  const root = minder.getRoot();
  if (!root) return [];

  const selected = minder.getSelectedNode() || root;
  const liveSelected = findLiveNode(selected) || root;

  // Build ancestor chain from selected node up to root
  const chain: any[] = [];
  let cur = liveSelected;
  while (cur) {
    chain.unshift(cur);
    cur = cur.parent || (typeof cur.getParent === 'function' ? cur.getParent() : null);
  }

  return chain.map((node, index) => {
    const id = getNodeStableId(node);
    const text = getNodeText(node);
    const isRoot = node === root || (typeof node.isRoot === 'function' && node.isRoot());
    const level = typeof node.getLevel === 'function' ? node.getLevel() : index;

    // Collect siblings under the same parent for dropdown
    const parent = node.parent || (typeof node.getParent === 'function' ? node.getParent() : null);
    let siblingsList: Array<{ id: string; node: any; text: string; isActive: boolean }> = [];

    if (parent) {
      const parentChildren = parent.getChildren ? parent.getChildren() : [];
      siblingsList = parentChildren.map((sNode: any) => ({
        id: getNodeStableId(sNode),
        node: sNode,
        text: getNodeText(sNode),
        isActive: getNodeStableId(sNode) === id
      }));
    } else {
      // Root node has no parent siblings, list root itself
      siblingsList = [{
        id,
        node,
        text,
        isActive: true
      }];
    }

    return {
      id,
      node,
      text,
      isRoot,
      level,
      siblings: siblingsList
    };
  });
});

// KityMinder Instance References
const minderContainerRef = ref<HTMLDivElement | null>(null);
let minder: any = null;
const minderInstance = ref<any>(null);
const isMinimapOpen = ref(true);
let saveTimeout: any = null;
const zoomPercent = ref(100);
const selectedNodeText = ref('');
const activeSelectedNodeId = ref<string | null>(null);
const hasSelectedNode = ref(false);
const currentTheme = ref('classic');
const currentTemplate = ref('default');

// Default initial Mind Map template
const DEFAULT_MIND_DATA = {
  root: {
    data: { text: '中心主题', expandState: 'expand' },
    children: [
      {
        data: { text: '分支主题 1', priority: 1 },
        children: [
          { data: { text: '子主题 1.1' } },
          { data: { text: '子主题 1.2' } }
        ]
      },
      {
        data: { text: '分支主题 2', priority: 2 },
        children: [
          { data: { text: '子主题 2.1' } }
        ]
      },
      {
        data: { text: '分支主题 3', priority: 3 },
        children: [
          { data: { text: '子主题 3.1' } }
        ]
      }
    ]
  },
  template: 'default',
  theme: 'fresh-green'
};

// Templates available in KityMinder
const TEMPLATE_LIST = [
  { id: 'default', name: '思维导图', desc: '向左右两侧扩散' },
  { id: 'right', name: '逻辑结构图', desc: '向右侧单向扩散' },
  { id: 'structure', name: '组织结构图', desc: '自顶向下组织图' },
  { id: 'fish-bone', name: '鱼骨图', desc: '因果分析鱼骨图' },
  { id: 'tianpan', name: '天盘图', desc: '环绕天盘布局' }
];

// Themes available in KityMinder
const THEME_LIST = [
  { id: 'fresh-green', name: '清新绿', bg: '#059669', color: '#ffffff' },
  { id: 'fresh-blue', name: '天空蓝', bg: '#0284c7', color: '#ffffff' },
  { id: 'classic', name: '脑图经典', bg: '#737373', color: '#ffffff' },
  { id: 'classic-compact', name: '紧凑经典', bg: '#404040', color: '#ffffff' },
  { id: 'snow', name: '温柔冷光', bg: '#475569', color: '#ffffff' },
  { id: 'fresh-purple', name: '浪漫紫', bg: '#9333ea', color: '#ffffff' },
  { id: 'fresh-pink', name: '活力粉', bg: '#db2777', color: '#ffffff' },
  { id: 'fresh-red', name: '热情红', bg: '#dc2626', color: '#ffffff' },
  { id: 'fresh-soil', name: '大地黄', bg: '#d97706', color: '#ffffff' },
  { id: 'wire', name: '黑白线框', bg: '#0f172a', color: '#ffffff' }
];

// Priority List
const PRIORITY_LIST = [
  { value: 1, label: 'P1', bg: '#ef4444', text: '#fff' },
  { value: 2, label: 'P2', bg: '#f97316', text: '#fff' },
  { value: 3, label: 'P3', bg: '#eab308', text: '#fff' },
  { value: 4, label: 'P4', bg: '#3b82f6', text: '#fff' },
  { value: 5, label: 'P5', bg: '#8b5cf6', text: '#fff' }
];

// Progress List
const PROGRESS_LIST = [
  { value: 1, label: '0%', text: '未开始' },
  { value: 3, label: '25%', text: '初见端倪' },
  { value: 5, label: '50%', text: '进展过半' },
  { value: 7, label: '75%', text: '胜利在望' },
  { value: 9, label: '100%', text: '全部完成' }
];

// Initialize KityMinder
async function initKityMinder() {
  if (!minderContainerRef.value) return;

  try {
    await loadKityMinder();
    const Minder = (window as any).kityminder?.Minder;
    if (!Minder) {
      console.error('KityMinder engine not found on window');
      return;
    }

    // Clear previous elements inside container if any
    minderContainerRef.value.innerHTML = '';

    // Create Minder instance
    minder = new Minder({
      renderTo: minderContainerRef.value,
      enableKeyReceiver: true,
      enableAnimation: true
    });

    (window as any).currentMinder = minder;
    minderInstance.value = minder;

    // Load Note Data or Default Template
    let initialData: any = null;
    if (props.note.content && typeof props.note.content === 'string') {
      try {
        const trimmed = props.note.content.trim();
        if (trimmed.startsWith('{')) {
          const parsed = JSON.parse(trimmed);
          if (parsed && (parsed.root || parsed.data)) {
            initialData = parsed;
          }
        }
      } catch (e) {
        console.warn('Could not parse note mindmap content, using default', e);
      }
    }

    if (!initialData || !initialData.root) {
      initialData = {
        root: {
          data: {
            text: props.note.title && props.note.title !== '未命名笔记' && props.note.title !== '无标题思维导图' ? props.note.title : '中心主题',
            expandState: 'expand'
          },
          children: [
            {
              data: { text: '核心概念与要点', priority: 1 },
              children: [
                { data: { text: '详细说明分支 1' } },
                { data: { text: '详细说明分支 2' } }
              ]
            },
            {
              data: { text: '规划与落地目标', priority: 2 },
              children: [
                { data: { text: '阶段一里程碑' } },
                { data: { text: '阶段二里程碑' } }
              ]
            },
            {
              data: { text: '总结与行动项', priority: 3 },
              children: [
                { data: { text: '待办任务清单' } }
              ]
            }
          ]
        },
        template: 'default',
        theme: 'fresh-green'
      };
    }

    minder.importJson(initialData);
    
    if (initialData.template) {
      currentTemplate.value = initialData.template;
      try { minder.useTemplate(initialData.template); } catch {}
    }
    if (initialData.theme) {
      currentTheme.value = initialData.theme;
      try { minder.useTheme(initialData.theme); } catch {}
    }

    // Force initial layout render
    try {
      if (typeof minder.layout === 'function') {
        minder.layout();
      }
    } catch {}

    // Bind event listeners
    let lastHoveredNoteNode: any = null;

    minder.on('shownoterequest', (e: any) => {
      if (e && e.node) {
        lastHoveredNoteNode = e.node;
      }
    });

    // Native KityMinder edit note request event handler
    minder.on('editnoterequest', (e: any) => {
      const node = (e && e.node) || (e && e.getTargetNode && e.getTargetNode()) || lastHoveredNoteNode || minder.getSelectedNode();
      if (node && isMinderNode(node)) {
        if (isEditingNode.value) {
          finishEditing(true);
        }
        openNoteModal(node);
      }
    });

    minder.on('selectionchange', handleSelectionChange);
    minder.on('contentchange', handleContentChange);
    minder.on('zoom', () => {
      zoomPercent.value = Math.round(minder.getZoomValue());
      if (isEditingNode.value && editingNode) {
        updateInlineEditorPosition(editingNode);
      }
    });

    // Double click to edit node text
    minder.on('dblclick', (e: any) => {
      const node = (e && e.getTargetNode && e.getTargetNode()) || (e && e.originEvent && findNodeByDomElement(e.originEvent.target)) || minder.getSelectedNode();
      if (node && isMinderNode(node)) {
        startEditingNode(node);
      }
    });

    minder.on('click', (e: any) => {
      const node = (e && e.getTargetNode && e.getTargetNode()) || (e && e.originEvent && findNodeByDomElement(e.originEvent.target));
      if (isEditingNode.value && (!node || node !== editingNode)) {
        finishEditing(true);
      }
    });

    minder.on('layoutallfinish', () => {
      if (isEditingNode.value && editingNode) {
        updateInlineEditorPosition(editingNode);
      }
    });

    // Initialize history baseline snapshot
    recordSnapshot(true);

    // Auto center camera onto root node with smooth animation
    setTimeout(() => {
      try {
        const root = minder.getRoot();
        if (root) {
          minder.select(root, true);
          centerNodeInCanvas(root, 200);
        }
      } catch (err) {
        console.warn('Auto center camera error', err);
      }
    }, 150);

  } catch (err) {
    console.error('Failed to initialize KityMinder', err);
  }
}

// Minder Node Type Guard Helper
function isMinderNode(node: any): boolean {
  return !!(node && typeof node === 'object' && typeof node.getData === 'function');
}

function findNodeByDomElement(element: Element | null): any {
  if (!minder || !element) return null;
  let targetNode: any = null;
  const root = minder.getRoot();
  if (!root) return null;

  root.traverse((node: any) => {
    if (targetNode) return;
    try {
      const container = node.getRenderContainer();
      const containerElem = container && (container.node || (container.getNode && container.getNode()));
      if (containerElem && (containerElem === element || (containerElem.contains && containerElem.contains(element)))) {
        targetNode = node;
      }
    } catch {}
  });

  return targetNode;
}

// Inline Node Editing Functions
function startEditingNode(node?: any) {
  if (!minder) return;
  const target = isMinderNode(node) ? node : minder.getSelectedNode();
  if (!target || !isMinderNode(target)) return;

  if (minder.getSelectedNode() !== target) {
    minder.select(target, true);
  }
  editingNode = target;
  editingNodeText.value = target.getText() || '';
  updateInlineEditorPosition(target);
  isEditingNode.value = true;

  nextTick(() => {
    if (editingInputRef.value) {
      editingInputRef.value.focus();
      editingInputRef.value.select();
    }
  });
}

function updateInlineEditorPosition(node: any) {
  if (!node || !minderContainerRef.value) return;
  try {
    const containerRect = minderContainerRef.value.getBoundingClientRect();
    const nodeElem = node.getRenderContainer()?.node;
    if (nodeElem && typeof nodeElem.getBoundingClientRect === 'function') {
      const rect = nodeElem.getBoundingClientRect();
      inlineEditorPosition.value = {
        left: Math.max(0, rect.left - containerRect.left - 4),
        top: Math.max(0, rect.top - containerRect.top - 2),
        width: Math.max(90, rect.width + 16),
        height: Math.max(28, rect.height + 6),
      };
    }
  } catch (err) {
    console.warn('Failed to calculate node position', err);
  }
}

function finishEditing(save: boolean = true) {
  if (!isEditingNode.value || !editingNode) return;
  const node = editingNode;
  const text = editingNodeText.value.trim();
  isEditingNode.value = false;
  editingNode = null;
  justFinishedEditing = true;
  setTimeout(() => {
    justFinishedEditing = false;
  }, 150);

  if (save && minder && text) {
    node.setText(text);
    if (typeof node.render === 'function') {
      node.render();
    }
    if (typeof minder.layout === 'function') {
      minder.layout();
    }
    minder.fire('contentchange');
  }
}

function handleEditingTab(e: KeyboardEvent) {
  finishEditing(true);
  if (e.shiftKey) {
    appendParentNode();
  } else {
    appendChildNode();
  }
}

// Helper to get geometric center coordinates of a MinderNode
function getNodeCenter(node: any): { x: number; y: number } {
  if (!node) return { x: 0, y: 0 };
  try {
    if (typeof node.getLayoutBox === 'function') {
      const box = node.getLayoutBox();
      if (box) {
        const cx = typeof box.cx === 'number' && !isNaN(box.cx) ? box.cx : ((box.x || 0) + (box.width || 0) / 2);
        const cy = typeof box.cy === 'number' && !isNaN(box.cy) ? box.cy : ((box.y || 0) + (box.height || 0) / 2);
        return { x: cx, y: cy };
      }
    }
  } catch {}
  try {
    if (typeof node.getLayoutPoint === 'function') {
      const pt = node.getLayoutPoint();
      if (pt && typeof pt.x === 'number' && !isNaN(pt.x)) {
        return { x: pt.x, y: pt.y || 0 };
      }
    }
  } catch {}
  try {
    const rc = node.getRenderContainer ? node.getRenderContainer() : null;
    const rBox = rc && typeof rc.getRenderBox === 'function' ? rc.getRenderBox('minder') : null;
    if (rBox) {
      return { x: (rBox.x || 0) + (rBox.width || 0) / 2, y: (rBox.y || 0) + (rBox.height || 0) / 2 };
    }
  } catch {}
  return { x: 0, y: 0 };
}

// Determine if node is located to the left or right or top or bottom relative to root
function getNodeOrientation(node: any): 'root' | 'left' | 'right' | 'top' | 'bottom' {
  if (!node || !minder) return 'root';
  const root = minder.getRoot();
  if (!root || node === root || (typeof node.isRoot === 'function' && node.isRoot())) {
    return 'root';
  }

  // Trace up the ancestor chain to find the level 1 ancestor directly under root
  let level1Ancestor = node;
  while (level1Ancestor) {
    const parent = level1Ancestor.parent || (typeof level1Ancestor.getParent === 'function' ? level1Ancestor.getParent() : null);
    if (!parent || parent === root || (typeof parent.isRoot === 'function' && parent.isRoot())) {
      break;
    }
    level1Ancestor = parent;
  }

  const rootCenter = getNodeCenter(root);
  const targetCenter = getNodeCenter(level1Ancestor || node);
  const dx = targetCenter.x - rootCenter.x;
  const dy = targetCenter.y - rootCenter.y;

  if (Math.abs(dx) >= Math.abs(dy) || Math.abs(dx) > 15) {
    return dx < 0 ? 'left' : 'right';
  } else {
    return dy < 0 ? 'top' : 'bottom';
  }
}

// Spatial search fallback: finds the visually nearest node in the given direction
function findNearestNodeInDirection(current: any, direction: 'up' | 'down' | 'left' | 'right'): any | null {
  if (!minder || !current) return null;
  const root = minder.getRoot();
  if (!root) return null;

  const currentCenter = getNodeCenter(current);
  let bestCandidate: any = null;
  let minScore = Infinity;

  function traverse(node: any) {
    if (!node || node === current) return;
    
    // Check if node is visible (not collapsed inside hidden parent)
    let p = node.parent || (typeof node.getParent === 'function' ? node.getParent() : null);
    let isHidden = false;
    while (p) {
      if ((typeof p.isCollapsed === 'function' && p.isCollapsed()) || p.getData('expandState') === 'collapse') {
        isHidden = true;
        break;
      }
      p = p.parent || (typeof p.getParent === 'function' ? p.getParent() : null);
    }
    if (isHidden) return;

    const candCenter = getNodeCenter(node);
    const dx = candCenter.x - currentCenter.x;
    const dy = candCenter.y - currentCenter.y;

    let isMatchDirection = false;
    let score = Infinity;

    if (direction === 'left' && dx < -10) {
      isMatchDirection = true;
      // Main distance |dx|, penalized by perpendicular drift |dy|
      score = Math.abs(dx) + Math.abs(dy) * 2.2;
    } else if (direction === 'right' && dx > 10) {
      isMatchDirection = true;
      score = Math.abs(dx) + Math.abs(dy) * 2.2;
    } else if (direction === 'up' && dy < -10) {
      isMatchDirection = true;
      score = Math.abs(dy) + Math.abs(dx) * 2.2;
    } else if (direction === 'down' && dy > 10) {
      isMatchDirection = true;
      score = Math.abs(dy) + Math.abs(dx) * 2.2;
    }

    if (isMatchDirection && score < minScore) {
      minScore = score;
      bestCandidate = node;
    }

    const children = node.getChildren ? node.getChildren() : [];
    for (const child of children) {
      traverse(child);
    }
  }

  traverse(root);
  return bestCandidate;
}

// Arrow Key Navigation between Mind Map Nodes (Accurately adapts to layout orientation)
function handleArrowNavigation(direction: 'up' | 'down' | 'left' | 'right') {
  if (!minder) return;
  const current = minder.getSelectedNode();
  if (!current) {
    const root = minder.getRoot();
    if (root) minder.select(root, true);
    return;
  }

  const root = minder.getRoot();
  const parent = current.getParent ? current.getParent() : current.parent;
  const children = (current.getChildren ? current.getChildren() : []) as any[];
  const isRoot = !parent || current === root || (typeof current.isRoot === 'function' && current.isRoot());
  const orientation = isRoot ? 'root' : getNodeOrientation(current);
  const curCenter = getNodeCenter(current);

  let targetNode: any = null;

  // 1. If currently on Root node
  if (isRoot) {
    if (direction === 'left') {
      const leftChildren = children.filter((c: any) => getNodeCenter(c).x < curCenter.x - 5);
      if (leftChildren.length > 0) {
        // Choose child closest to vertical center of root
        leftChildren.sort((a, b) => Math.abs(getNodeCenter(a).y - curCenter.y) - Math.abs(getNodeCenter(b).y - curCenter.y));
        targetNode = leftChildren[0];
      } else {
        targetNode = findNearestNodeInDirection(current, 'left');
      }
    } else if (direction === 'right') {
      const rightChildren = children.filter((c: any) => getNodeCenter(c).x >= curCenter.x - 5);
      if (rightChildren.length > 0) {
        rightChildren.sort((a, b) => Math.abs(getNodeCenter(a).y - curCenter.y) - Math.abs(getNodeCenter(b).y - curCenter.y));
        targetNode = rightChildren[0];
      } else {
        targetNode = findNearestNodeInDirection(current, 'right');
      }
    } else if (direction === 'up') {
      const topChildren = children.filter((c: any) => getNodeCenter(c).y < curCenter.y - 5);
      if (topChildren.length > 0) {
        topChildren.sort((a, b) => getNodeCenter(b).y - getNodeCenter(a).y);
        targetNode = topChildren[0];
      } else if (children.length > 0) {
        // Fallback: topmost child
        const sorted = [...children].sort((a, b) => getNodeCenter(a).y - getNodeCenter(b).y);
        targetNode = sorted[0];
      } else {
        targetNode = findNearestNodeInDirection(current, 'up');
      }
    } else if (direction === 'down') {
      const bottomChildren = children.filter((c: any) => getNodeCenter(c).y > curCenter.y + 5);
      if (bottomChildren.length > 0) {
        bottomChildren.sort((a, b) => getNodeCenter(a).y - getNodeCenter(b).y);
        targetNode = bottomChildren[0];
      } else if (children.length > 0) {
        // Fallback: bottommost child
        const sorted = [...children].sort((a, b) => getNodeCenter(b).y - getNodeCenter(a).y);
        targetNode = sorted[0];
      } else {
        targetNode = findNearestNodeInDirection(current, 'down');
      }
    }
  }
  // 2. If node is in Left-side branch (node is to the left of Root)
  else if (orientation === 'left') {
    if (direction === 'left') {
      // Pressing Left on a left-side node: expand outwards into children further to the left
      const isCollapsed = (typeof current.isCollapsed === 'function' && current.isCollapsed()) || current.getData('expandState') === 'collapse';
      if (!isCollapsed && children.length > 0) {
        // Filter children strictly to the left of current node, or pick child vertically closest
        const leftChildren = children.filter(c => getNodeCenter(c).x <= curCenter.x);
        const candidateChildren = leftChildren.length > 0 ? leftChildren : children;
        const sortedChildren = [...candidateChildren].sort((a, b) => Math.abs(getNodeCenter(a).y - curCenter.y) - Math.abs(getNodeCenter(b).y - curCenter.y));
        targetNode = sortedChildren[0];
      } else {
        targetNode = findNearestNodeInDirection(current, 'left');
      }
    } else if (direction === 'right') {
      // Pressing Right on a left-side node: navigate towards the right (inward towards parent/root)
      targetNode = parent || findNearestNodeInDirection(current, 'right');
    } else if (direction === 'up') {
      // Up key: Previous sibling in vertical order
      if (parent) {
        const siblings = (parent.getChildren ? parent.getChildren() : []) as any[];
        const aboveSiblings = siblings.filter(s => getNodeCenter(s).y < curCenter.y - 4);
        if (aboveSiblings.length > 0) {
          aboveSiblings.sort((a, b) => getNodeCenter(b).y - getNodeCenter(a).y);
          targetNode = aboveSiblings[0];
        } else {
          targetNode = findNearestNodeInDirection(current, 'up');
        }
      }
    } else if (direction === 'down') {
      // Down key: Next sibling in vertical order
      if (parent) {
        const siblings = (parent.getChildren ? parent.getChildren() : []) as any[];
        const belowSiblings = siblings.filter(s => getNodeCenter(s).y > curCenter.y + 4);
        if (belowSiblings.length > 0) {
          belowSiblings.sort((a, b) => getNodeCenter(a).y - getNodeCenter(b).y);
          targetNode = belowSiblings[0];
        } else {
          targetNode = findNearestNodeInDirection(current, 'down');
        }
      }
    }
  }
  // 3. If node is in Right-side branch (node is to the right of Root)
  else if (orientation === 'right') {
    if (direction === 'left') {
      // Pressing Left on a right-side node: navigate towards the left (inward towards parent/root)
      targetNode = parent || findNearestNodeInDirection(current, 'left');
    } else if (direction === 'right') {
      // Pressing Right on a right-side node: expand outwards into children further to the right
      const isCollapsed = (typeof current.isCollapsed === 'function' && current.isCollapsed()) || current.getData('expandState') === 'collapse';
      if (!isCollapsed && children.length > 0) {
        const rightChildren = children.filter(c => getNodeCenter(c).x >= curCenter.x);
        const candidateChildren = rightChildren.length > 0 ? rightChildren : children;
        const sortedChildren = [...candidateChildren].sort((a, b) => Math.abs(getNodeCenter(a).y - curCenter.y) - Math.abs(getNodeCenter(b).y - curCenter.y));
        targetNode = sortedChildren[0];
      } else {
        targetNode = findNearestNodeInDirection(current, 'right');
      }
    } else if (direction === 'up') {
      if (parent) {
        const siblings = (parent.getChildren ? parent.getChildren() : []) as any[];
        const aboveSiblings = siblings.filter(s => getNodeCenter(s).y < curCenter.y - 4);
        if (aboveSiblings.length > 0) {
          aboveSiblings.sort((a, b) => getNodeCenter(b).y - getNodeCenter(a).y);
          targetNode = aboveSiblings[0];
        } else {
          targetNode = findNearestNodeInDirection(current, 'up');
        }
      }
    } else if (direction === 'down') {
      if (parent) {
        const siblings = (parent.getChildren ? parent.getChildren() : []) as any[];
        const belowSiblings = siblings.filter(s => getNodeCenter(s).y > curCenter.y + 4);
        if (belowSiblings.length > 0) {
          belowSiblings.sort((a, b) => getNodeCenter(a).y - getNodeCenter(b).y);
          targetNode = belowSiblings[0];
        } else {
          targetNode = findNearestNodeInDirection(current, 'down');
        }
      }
    }
  }
  // 4. If node is in Top-branch (e.g. Org chart upwards)
  else if (orientation === 'top') {
    if (direction === 'up') {
      const isCollapsed = (typeof current.isCollapsed === 'function' && current.isCollapsed()) || current.getData('expandState') === 'collapse';
      if (!isCollapsed && children.length > 0) {
        targetNode = children[0];
      } else {
        targetNode = findNearestNodeInDirection(current, 'up');
      }
    } else if (direction === 'down') {
      targetNode = parent;
    } else if (direction === 'left' || direction === 'right') {
      targetNode = findNearestNodeInDirection(current, direction);
    }
  }
  // 5. If node is in Bottom-branch (e.g. Org chart downwards)
  else if (orientation === 'bottom') {
    if (direction === 'down') {
      const isCollapsed = (typeof current.isCollapsed === 'function' && current.isCollapsed()) || current.getData('expandState') === 'collapse';
      if (!isCollapsed && children.length > 0) {
        targetNode = children[0];
      } else {
        targetNode = findNearestNodeInDirection(current, 'down');
      }
    } else if (direction === 'up') {
      targetNode = parent;
    } else if (direction === 'left' || direction === 'right') {
      targetNode = findNearestNodeInDirection(current, direction);
    }
  }

  // 6. Global spatial fallback if no topology match found
  if (!targetNode) {
    targetNode = findNearestNodeInDirection(current, direction);
  }

  // Apply selection and ensure visibility
  if (targetNode && targetNode !== current) {
    try {
      minder.select(targetNode, true);
      const targetId = getNodeStableId(targetNode);
      activeSelectedNodeId.value = targetId;
      outlineTreeVersion.value++;
      if (isOutlineOpen.value && targetId) {
        expandAncestorsInOutline(targetNode);
        scrollOutlineNodeIntoView(targetId);
      }
    } catch (err) {
      console.warn('Navigation selection error', err);
    }
  }
}

// History management for MindMap (Undo / Redo)
interface MindMapSnapshot {
  data: any;
  selectedId?: string | null;
}

const historyStack = ref<MindMapSnapshot[]>([]);
const historyIndex = ref<number>(-1);
const isHistoryNavigating = ref(false);
const MAX_HISTORY_LENGTH = 50;

const canUndo = computed(() => historyIndex.value > 0);
const canRedo = computed(() => historyIndex.value >= 0 && historyIndex.value < historyStack.value.length - 1);

function recordSnapshot(force = false) {
  if (!minder || isHistoryNavigating.value) return;
  try {
    const exported = minder.exportJson();
    const currentJsonStr = JSON.stringify(exported);
    
    // Check if identical to the current history item
    if (!force && historyIndex.value >= 0 && historyIndex.value < historyStack.value.length) {
      const prevJsonStr = JSON.stringify(historyStack.value[historyIndex.value].data);
      if (currentJsonStr === prevJsonStr) {
        return;
      }
    }

    const selectedNode = minder.getSelectedNode();
    const snapshot: MindMapSnapshot = {
      data: exported,
      selectedId: selectedNode ? getNodeStableId(selectedNode) : null
    };

    const nextHistory = historyStack.value.slice(0, historyIndex.value + 1);
    nextHistory.push(snapshot);
    if (nextHistory.length > MAX_HISTORY_LENGTH) {
      nextHistory.shift();
    }
    historyStack.value = nextHistory;
    historyIndex.value = nextHistory.length - 1;
  } catch (err) {
    console.warn('Failed to record mindmap snapshot', err);
  }
}

function undo() {
  if (!canUndo.value || !minder) return;
  if (isEditingNode.value) {
    finishEditing(false);
  }
  const targetIndex = historyIndex.value - 1;
  applySnapshot(targetIndex);
}

function redo() {
  if (!canRedo.value || !minder) return;
  if (isEditingNode.value) {
    finishEditing(false);
  }
  const targetIndex = historyIndex.value + 1;
  applySnapshot(targetIndex);
}

function applySnapshot(index: number) {
  if (index < 0 || index >= historyStack.value.length || !minder) return;
  try {
    isHistoryNavigating.value = true;
    historyIndex.value = index;
    const snapshot = historyStack.value[index];
    
    minder.importJson(snapshot.data);

    if (snapshot.data.template) {
      currentTemplate.value = snapshot.data.template;
    }
    if (snapshot.data.theme) {
      currentTheme.value = snapshot.data.theme;
    }

    if (typeof minder.layout === 'function') {
      try { minder.layout(); } catch {}
    }

    // Try to reselect previous node if still present
    if (snapshot.selectedId) {
      const node = findLiveNode(snapshot.selectedId);
      if (node && isMinderNode(node)) {
        try { minder.select(node, true); } catch {}
      }
    }

    outlineTreeVersion.value++;
    
    // Trigger note synchronization
    saveStatus.value = '保存中...';
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      try {
        const exported = minder.exportJson();
        emit('updateNote', props.note.id, {
          title: localTitle.value || '未命名思维导图',
          content: JSON.stringify(exported, null, 2),
          folderId: localFolderId.value,
          tags: localTags.value,
          format: 'mindmap',
          type: 'mindmap'
        });
        saveStatus.value = '已自动同步';
      } catch (e) {
        console.error('Failed to auto-save mindmap', e);
      }
    }, 400);

    setTimeout(() => {
      isHistoryNavigating.value = false;
    }, 60);
  } catch (e) {
    console.error('Failed to apply history snapshot', e);
    isHistoryNavigating.value = false;
  }
}

// Auto Save Handler
function handleContentChange() {
  outlineTreeVersion.value++;
  if (!minder) return;
  if (!isHistoryNavigating.value) {
    recordSnapshot();
  }
  saveStatus.value = '保存中...';
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      const exported = minder.exportJson();
      emit('updateNote', props.note.id, {
        title: localTitle.value || '未命名思维导图',
        content: JSON.stringify(exported, null, 2),
        folderId: localFolderId.value,
        tags: localTags.value,
        format: 'mindmap',
        type: 'mindmap'
      });
      saveStatus.value = '已自动同步';
    } catch (e) {
      console.error('Failed to auto-save mindmap', e);
    }
  }, 500);
}

function handleSelectionChange() {
  if (!minder) return;
  const nodes = minder.getSelectedNodes();
  hasSelectedNode.value = nodes && nodes.length > 0;
  if (hasSelectedNode.value) {
    const node = minder.getSelectedNode();
    selectedNodeText.value = node ? node.getText() : '';
    const nodeId = node ? getNodeStableId(node) : null;
    activeSelectedNodeId.value = nodeId;

    if (node && isOutlineOpen.value && nodeId) {
      expandAncestorsInOutline(node);
      scrollOutlineNodeIntoView(nodeId);
    }
  } else {
    selectedNodeText.value = '';
    activeSelectedNodeId.value = null;
  }
  outlineTreeVersion.value++;
}

function handleManualSave() {
  if (!minder) return;
  if (saveTimeout) clearTimeout(saveTimeout);
  try {
    const exported = minder.exportJson();
    emit('updateNote', props.note.id, {
      title: localTitle.value || '未命名思维导图',
      content: JSON.stringify(exported, null, 2),
      folderId: localFolderId.value,
      tags: localTags.value,
      format: 'mindmap',
      type: 'mindmap'
    });
    saveStatus.value = '已即时保存 ✓';
    setTimeout(() => {
      saveStatus.value = '已自动同步';
    }, 2000);
  } catch (e) {
    console.error('Save failed', e);
  }
}

// Command execution helper
function exec(command: string, ...args: any[]) {
  if (!minder) return;
  const cmdLower = command.toLowerCase();
  if (cmdLower === 'undo') {
    undo();
    return;
  }
  if (cmdLower === 'redo') {
    redo();
    return;
  }
  try {
    minder.execCommand(command, ...args);
    minder.fire('contentchange');
  } catch (err) {
    console.warn(`Command ${command} execution error:`, err);
  }
}

// Node Actions (With auto text editing on creation)
function appendChildNode() {
  if (!minder) return;
  const selected = minder.getSelectedNode();
  if (!selected) {
    const root = minder.getRoot();
    if (root) minder.select(root, true);
  }
  exec('AppendChildNode', '分支主题');
  setTimeout(() => {
    const newNode = minder.getSelectedNode();
    if (newNode) {
      startEditingNode(newNode);
    }
  }, 60);
}

function appendSiblingNode() {
  if (!minder) return;
  const selected = minder.getSelectedNode();
  if (selected && selected === minder.getRoot()) {
    appendChildNode();
    return;
  }
  exec('AppendSiblingNode', '同级主题');
  setTimeout(() => {
    const newNode = minder.getSelectedNode();
    if (newNode) {
      startEditingNode(newNode);
    }
  }, 60);
}

function appendParentNode() {
  if (!minder) return;
  const selected = minder.getSelectedNode();
  if (selected && selected === minder.getRoot()) return;
  exec('AppendParentNode', '上级主题');
  setTimeout(() => {
    const newNode = minder.getSelectedNode();
    if (newNode) {
      startEditingNode(newNode);
    }
  }, 60);
}

function removeNode() {
  exec('RemoveNode');
}

function arrangeUp() {
  exec('ArrangeUp');
}

function arrangeDown() {
  exec('ArrangeDown');
}

function setPriority(val: number | null) {
  exec('Priority', val);
}

function setProgress(val: number | null) {
  exec('Progress', val);
}

function setTemplate(tpl: string) {
  currentTemplate.value = tpl;
  exec('Template', tpl);
}

function setTheme(theme: string) {
  currentTheme.value = theme;
  exec('Theme', theme);
}

function setFontSize(delta: number) {
  if (!minder) return;
  const current = minder.queryCommandValue('FontSize') || 14;
  const next = Math.max(10, Math.min(48, current + delta));
  exec('FontSize', next);
}

function toggleBold() {
  exec('Bold');
}

function toggleItalic() {
  exec('Italic');
}

function resetLayout() {
  if (!minder) return;
  try {
    minder.execCommand('resetlayout');
  } catch (err) {
    try {
      minder.execCommand('ResetLayout');
    } catch {}
  }
}

function zoomIn() {
  exec('ZoomIn');
}

function zoomOut() {
  exec('ZoomOut');
}

function zoomReset() {
  exec('Zoom', 100);
}

function centerView() {
  if (!minder) return;
  const root = minder.getRoot();
  if (root) {
    centerNodeInCanvas(root, 300);
  }
}

function selectAll() {
  exec('SelectAll');
}

function expandToLevel(level: number) {
  exec('ExpandToLevel', level);
}

// Export functions
async function exportAsXMind() {
  if (!minder) return;
  try {
    const data = minder.exportJson();
    await exportToXMind(data, localTitle.value || '思维导图');
  } catch (err) {
    console.error('Failed to export XMind', err);
  }
}

async function exportAsJson() {
  if (!minder) return;
  const data = minder.exportJson();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `${localTitle.value || '思维导图'}.km`);
}

async function exportAsMarkdown() {
  if (!minder) return;
  try {
    const md = await minder.exportData('markdown');
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    downloadBlob(blob, `${localTitle.value || '思维导图'}.md`);
  } catch (err) {
    console.error('Failed to export markdown', err);
  }
}

async function exportAsSvg() {
  if (!minder) return;
  try {
    const svgData = await minder.exportData('svg');
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    downloadBlob(blob, `${localTitle.value || '思维导图'}.svg`);
  } catch (err) {
    console.error('Failed to export SVG', err);
  }
}

async function exportAsPng() {
  if (!minder) return;
  try {
    const pngUrl = await minder.exportData('png');
    const a = document.createElement('a');
    a.href = pngUrl;
    a.download = `${localTitle.value || '思维导图'}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (err) {
    console.error('Failed to export PNG', err);
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Import JSON / XMind / Markdown file
function triggerImportFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xmind,.km,.json,.md';
  input.onchange = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file || !minder) return;
    try {
      if (file.name.toLowerCase().endsWith('.xmind')) {
        const xmindData = await importFromXMind(file);
        minder.importJson(xmindData);
      } else if (file.name.endsWith('.json') || file.name.endsWith('.km')) {
        const text = await file.text();
        const json = JSON.parse(text);
        minder.importJson(json);
      } else if (file.name.endsWith('.md')) {
        const text = await file.text();
        minder.importData('markdown', text);
      }

      // Re-layout and reset state for new tree
      if (typeof minder.layout === 'function') {
        try { minder.layout(); } catch {}
      }
      outlineExpandedState.value = {};
      activeSelectedNodeId.value = null;
      outlineTreeVersion.value++;
      handleContentChange();

      setTimeout(() => {
        outlineTreeVersion.value++;
        const root = minder.getRoot();
        if (root) {
          try {
            minder.select(root, true);
            centerNodeInCanvas(root, 300);
          } catch {}
        }
      }, 100);
    } catch (err) {
      console.error('Import failed', err);
    }
  };
  input.click();
}

// Node Note (备注)
function openNoteModal(targetNode?: any) {
  if (!minder) return;
  const node = isMinderNode(targetNode) ? targetNode : minder.getSelectedNode();
  if (node && isMinderNode(node)) {
    if (minder.getSelectedNode() !== node) {
      minder.select(node, true);
    }
    nodeNoteText.value = node.getData('note') || '';
    isNoteModalOpen.value = true;
    nextTick(() => {
      noteTextareaRef.value?.focus();
    });
  }
}

function clearNodeNote() {
  nodeNoteText.value = '';
  saveNodeNote();
}

function saveNodeNote() {
  exec('Note', nodeNoteText.value);
  isNoteModalOpen.value = false;
}

// Node Hyperlink (超链接)
function openLinkModal(targetNode?: any) {
  if (!minder) return;
  const node = isMinderNode(targetNode) ? targetNode : minder.getSelectedNode();
  if (node && isMinderNode(node)) {
    if (minder.getSelectedNode() !== node) {
      minder.select(node, true);
    }
    linkUrl.value = node.getData('hyperlink') || 'https://';
    linkTitle.value = node.getData('hyperlinkTitle') || '';
    isLinkModalOpen.value = true;
    nextTick(() => {
      linkInputRef.value?.focus();
    });
  }
}

function saveNodeLink() {
  exec('HyperLink', linkUrl.value, linkTitle.value);
  isLinkModalOpen.value = false;
}

// Search Navigation inside Mind Map
const isSearchNavOpen = ref(false);
const searchIncludeNotes = ref(true);
const searchViewMode = ref<'tree' | 'path'>('tree');
const currentMatchIndex = ref(0);
const searchModalInputRef = ref<HTMLInputElement | null>(null);
const searchNavContainerRef = ref<HTMLElement | null>(null);
const searchNavTriggerRef = ref<HTMLElement | null>(null);

interface SearchResultItem {
  id: string;
  node: any;
  text: string;
  note?: string;
  hyperlink?: string;
  priority?: number;
  progress?: number;
  path: string[];
  level: number;
  matchedField: 'text' | 'note' | 'hyperlink';
}

function getNodeText(node: any): string {
  if (!node) return '';
  return (typeof node.getText === 'function' ? node.getText() : node.getData('text')) || '未命名主题';
}

function getNodePath(node: any): string[] {
  const path: string[] = [];
  let p = node.parent;
  while (p) {
    path.unshift(getNodeText(p));
    p = p.parent;
  }
  return path;
}

function checkNodeMatch(node: any, keyword: string): { isMatch: boolean; field?: 'text' | 'note' | 'hyperlink' } {
  if (!node || !keyword) return { isMatch: false };
  const text = getNodeText(node).toLowerCase();
  if (text.includes(keyword)) {
    return { isMatch: true, field: 'text' };
  }
  if (searchIncludeNotes.value) {
    const note = (node.getData('note') || '').toLowerCase();
    if (note.includes(keyword)) {
      return { isMatch: true, field: 'note' };
    }
  }
  const link = (node.getData('hyperlink') || '').toLowerCase();
  const linkTitle = (node.getData('hyperlinkTitle') || '').toLowerCase();
  if (link.includes(keyword) || linkTitle.includes(keyword)) {
    return { isMatch: true, field: 'hyperlink' };
  }
  return { isMatch: false };
}

// Helper to get or generate a stable persistent ID for a KityMinder node
function getNodeStableId(node: any): string {
  if (!node) return '';
  const raw = toRaw(node);
  if (typeof raw.getData === 'function') {
    let id = raw.getData('id');
    if (!id) {
      id = 'node_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
      raw.setData('id', id);
    }
    return id;
  }
  return 'node_default';
}

// Helper to find the actual live minder node by reference, raw unwrapping, or stable ID / path
function findLiveNode(nodeOrId: any): any {
  if (!minder) return null;
  const root = minder.getRoot();
  if (!root) return null;

  if (!nodeOrId) return root;

  // Unwrap Vue 3 reactive Proxy
  const raw = toRaw(nodeOrId);

  // If passed an outline item or wrapper object with .node or .id
  if (raw && typeof raw === 'object' && !isMinderNode(raw)) {
    if (raw.node) {
      return findLiveNode(raw.node);
    }
    if (raw.id && typeof raw.id === 'string') {
      return findLiveNode(raw.id);
    }
  }

  // If already a valid live MinderNode in the current tree
  if (isMinderNode(raw)) {
    let check: any = raw;
    let isConnected = false;
    while (check) {
      if (check === root) {
        isConnected = true;
        break;
      }
      check = check.parent || (typeof check.getParent === 'function' ? check.getParent() : null);
    }
    if (isConnected) {
      return raw;
    }
  }

  // If not connected (e.g. tree was rebuilt or raw is an ID or old node), search by ID or text
  const targetId = typeof raw === 'string'
    ? raw
    : (raw && typeof raw.getData === 'function' ? (raw.getData('id') || (raw.getId && raw.getId())) : null);

  const targetText = raw && typeof raw.getText === 'function' ? raw.getText() : (raw?.data?.text || '');

  let foundNode: any = null;

  function traverseSearch(cur: any) {
    if (foundNode) return;
    if (cur === raw) {
      foundNode = cur;
      return;
    }
    const curId = cur.getData ? (cur.getData('id') || (cur.getId && cur.getId())) : null;
    if (targetId && curId === targetId) {
      foundNode = cur;
      return;
    }
    const children = cur.getChildren ? cur.getChildren() : [];
    for (const child of children) {
      traverseSearch(child);
    }
  }

  traverseSearch(root);
  if (foundNode) return foundNode;

  // Fallback: match by text if available
  if (targetText) {
    function traverseText(cur: any) {
      if (foundNode) return;
      if (cur.getText && cur.getText() === targetText) {
        foundNode = cur;
        return;
      }
      const children = cur.getChildren ? cur.getChildren() : [];
      for (const child of children) {
        traverseText(child);
      }
    }
    traverseText(root);
  }

  return foundNode || (isMinderNode(raw) ? raw : root);
}

// Flat list of matching results
const searchResults = computed<SearchResultItem[]>(() => {
  const _v = outlineTreeVersion.value;
  if (!minder) return [];
  const keyword = searchKeyword.value.trim().toLowerCase();
  if (!keyword) return [];

  const results: SearchResultItem[] = [];
  const root = minder.getRoot();
  if (!root) return [];

  function traverse(node: any) {
    const match = checkNodeMatch(node, keyword);
    if (match.isMatch) {
      results.push({
        id: getNodeStableId(node),
        node,
        text: getNodeText(node),
        note: node.getData('note'),
        hyperlink: node.getData('hyperlink'),
        priority: node.getData('priority'),
        progress: node.getData('progress'),
        path: getNodePath(node),
        level: typeof node.getLevel === 'function' ? node.getLevel() : 0,
        matchedField: match.field || 'text'
      });
    }
    const children = node.getChildren ? node.getChildren() : [];
    for (const child of children) {
      traverse(child);
    }
  }

  traverse(root);
  return results;
});

// Tree structure containing only branches leading to matched nodes
const searchTree = computed<SearchTreeNode[]>(() => {
  const _v = outlineTreeVersion.value;
  if (!minder) return [];
  const keyword = searchKeyword.value.trim().toLowerCase();
  if (!keyword) return [];

  const root = minder.getRoot();
  if (!root) return [];

  function buildBranch(node: any): SearchTreeNode | null {
    const match = checkNodeMatch(node, keyword);
    const childTrees: SearchTreeNode[] = [];
    const children = node.getChildren ? node.getChildren() : [];
    
    for (const child of children) {
      const childBranch = buildBranch(child);
      if (childBranch) {
        childTrees.push(childBranch);
      }
    }

    const matchCountInSubtree = (match.isMatch ? 1 : 0) + childTrees.reduce((sum, c) => sum + c.matchCountInSubtree, 0);

    if (matchCountInSubtree === 0) {
      return null;
    }

    return {
      id: getNodeStableId(node),
      node,
      text: getNodeText(node),
      isMatch: match.isMatch,
      matchedField: match.field,
      note: node.getData('note'),
      priority: node.getData('priority'),
      progress: node.getData('progress'),
      children: childTrees,
      expanded: true,
      matchCountInSubtree
    };
  }

  const rootBranch = buildBranch(root);
  return rootBranch ? [rootBranch] : [];
});

// High-performance, interruptible smooth pan controller (immune to rapid switching & stuck animation queues)
let currentPanRaf: number | null = null;

function smoothPanTo(targetX: number, targetY: number, duration = 250) {
  if (!minder) return;
  const dragger = minder.getViewDragger ? minder.getViewDragger() : minder._viewDragger;
  if (!dragger) return;

  // 1. Cancel any active pan animation immediately
  if (currentPanRaf !== null) {
    cancelAnimationFrame(currentPanRaf);
    currentPanRaf = null;
  }

  // 2. Clear any stuck Kity animation queue or move timelines
  try {
    const rc = minder.getRenderContainer ? minder.getRenderContainer() : null;
    if (rc) {
      if (typeof rc.stop === 'function') rc.stop();
      if (rc._KityAnimateQueue && Array.isArray(rc._KityAnimateQueue)) {
        rc._KityAnimateQueue.length = 0;
      }
    }
    if (dragger._moveTimeline) {
      try {
        dragger._moveTimeline.stop();
      } catch {}
      dragger._moveTimeline = null;
    }
  } catch {}

  const kity = (window as any).kity;
  if (!kity || !kity.Point) return;

  const currentMovement = typeof dragger.getMovement === 'function' ? dragger.getMovement() : null;
  const startX = currentMovement && typeof currentMovement.x === 'number' && !isNaN(currentMovement.x) ? currentMovement.x : targetX;
  const startY = currentMovement && typeof currentMovement.y === 'number' && !isNaN(currentMovement.y) ? currentMovement.y : targetY;

  const diffX = targetX - startX;
  const diffY = targetY - startY;

  // If already at target position or zero duration, apply instantly
  if (duration <= 0 || (Math.abs(diffX) < 1 && Math.abs(diffY) < 1)) {
    dragger.moveTo(new kity.Point(Math.round(targetX), Math.round(targetY)));
    return;
  }

  const startTime = performance.now();

  function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  function step(now: number) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = easeOutCubic(progress);

    const curX = Math.round(startX + diffX * eased);
    const curY = Math.round(startY + diffY * eased);

    dragger.moveTo(new kity.Point(curX, curY));

    if (progress < 1) {
      currentPanRaf = requestAnimationFrame(step);
    } else {
      currentPanRaf = null;
    }
  }

  currentPanRaf = requestAnimationFrame(step);
}

// Move view center directly and accurately to target node
function centerNodeInCanvas(node: any, duration = 250) {
  if (!minder || !node) return;
  const rawNode = findLiveNode(node);
  if (!rawNode || !isMinderNode(rawNode)) return;

  const nodeId = getNodeStableId(rawNode);
  const nodeText = rawNode.getText ? rawNode.getText() : (rawNode.data?.text || '<unnamed>');
  console.log(`[MindMap:centerNode] Centering on node: id=${nodeId}, text=${nodeText}`);

  try {
    const dragger = minder.getViewDragger ? minder.getViewDragger() : minder._viewDragger;
    if (!dragger) return;

    if (typeof rawNode.render === 'function') {
      try { rawNode.render(); } catch {}
    }

    const targetElem = minder.getRenderTarget ? minder.getRenderTarget() : minderContainerRef.value;
    const clientW = targetElem?.clientWidth || 800;
    const clientH = targetElem?.clientHeight || 600;
    const centerX = clientW / 2;
    const centerY = clientH / 2;

    const isRoot = (typeof rawNode.isRoot === 'function' && rawNode.isRoot()) || rawNode === minder.getRoot();
    let worldX = 0;
    let worldY = 0;

    if (!isRoot) {
      if (typeof rawNode.getLayoutBox === 'function') {
        try {
          const layoutBox = rawNode.getLayoutBox();
          if (layoutBox) {
            if (typeof layoutBox.cx === 'number' && !isNaN(layoutBox.cx)) {
              worldX = layoutBox.cx;
            } else if (typeof layoutBox.x === 'number' && !isNaN(layoutBox.x)) {
              worldX = layoutBox.x + (layoutBox.width || 0) / 2;
            }
            if (typeof layoutBox.cy === 'number' && !isNaN(layoutBox.cy)) {
              worldY = layoutBox.cy;
            } else if (typeof layoutBox.y === 'number' && !isNaN(layoutBox.y)) {
              worldY = layoutBox.y + (layoutBox.height || 0) / 2;
            }
          }
        } catch {}
      }

      if (worldX === 0 && worldY === 0 && typeof rawNode.getLayoutPoint === 'function') {
        try {
          const pt = rawNode.getLayoutPoint();
          if (pt && typeof pt.x === 'number' && !isNaN(pt.x) && typeof pt.y === 'number' && !isNaN(pt.y)) {
            worldX = pt.x;
            worldY = pt.y;
          }
        } catch {}
      }
    }

    const targetTx = Math.round(centerX - worldX);
    const targetTy = Math.round(centerY - worldY);

    console.log(`[MindMap:centerNode] Centering viewport to world(${worldX}, ${worldY}), dragger translate target=(${targetTx}, ${targetTy})`);
    smoothPanTo(targetTx, targetTy, duration);
  } catch (err: any) {
    console.warn('[MindMap:centerNode] Center exception:', String(err?.message || err));
  }
}

function locateNode(targetNodeOrId: any) {
  const safeParamDesc = typeof targetNodeOrId === 'string'
    ? targetNodeOrId
    : (typeof targetNodeOrId === 'object' ? (targetNodeOrId?.id || targetNodeOrId?.text || 'node_obj') : String(targetNodeOrId));
  console.log(`[MindMap:locateNode] Invoked locateNode for: ${safeParamDesc}`);
  if (!minder) return;
  const liveNode = findLiveNode(targetNodeOrId);
  if (!liveNode || !isMinderNode(liveNode)) {
    console.warn(`[MindMap:locateNode] Live node not found for param: ${safeParamDesc}`);
    return;
  }

  const liveNodeId = getNodeStableId(liveNode);
  const liveNodeText = liveNode.getText ? liveNode.getText() : (liveNode.data?.text || '');
  console.log(`[MindMap:locateNode] Resolved liveNode: id=${liveNodeId}, text=${liveNodeText}`);

  // 1. Expand all collapsed ancestors so liveNode is visible
  let cur = liveNode.parent || (typeof liveNode.getParent === 'function' ? liveNode.getParent() : null);
  let needLayout = false;
  let expandedAncestorsCount = 0;

  while (cur) {
    const isCollapsed = (typeof cur.isCollapsed === 'function' && cur.isCollapsed()) || cur.getData('expandState') === 'collapse';
    if (isCollapsed) {
      cur.setData('expandState', 'expand');
      if (typeof cur.expand === 'function') {
        try { cur.expand(); } catch {}
      }
      needLayout = true;
      expandedAncestorsCount++;
    }
    cur = cur.parent || (typeof cur.getParent === 'function' ? cur.getParent() : null);
  }

  if (needLayout) {
    console.log(`[MindMap:locateNode] Expanded ${expandedAncestorsCount} collapsed ancestors, triggering renderTree and layout.`);
    const root = minder.getRoot();
    if (root && typeof root.renderTree === 'function') {
      try { root.renderTree(); } catch {}
    }
    if (typeof minder.layout === 'function') {
      try {
        minder.layout(0);
      } catch {}
    }
  }

  // 2. Select target node
  try {
    minder.select(liveNode, true);
  } catch (e: any) {
    console.warn('[MindMap:locateNode] Select node warning:', String(e?.message || e));
  }

  const targetId = liveNodeId;
  activeSelectedNodeId.value = targetId;
  outlineTreeVersion.value++;

  // Update currentMatchIndex if matching in results
  const idx = searchResults.value.findIndex(r => {
    const rRaw = toRaw(r.node);
    return rRaw === liveNode || r.id === targetId;
  });
  if (idx !== -1) {
    currentMatchIndex.value = idx;
  }

  // Scroll into view in outline if outline is open
  if (isOutlineOpen.value && targetId) {
    expandAncestorsInOutline(liveNode);
    scrollOutlineNodeIntoView(targetId);
  }

  // 3. Move view center directly to the target node
  if (needLayout) {
    nextTick(() => {
      requestAnimationFrame(() => {
        centerNodeInCanvas(liveNode, 300);
      });
    });
  } else {
    centerNodeInCanvas(liveNode, 300);
  }
}

function handleSearchNodes() {
  const keyword = searchKeyword.value.trim();
  if (!keyword) {
    isSearchNavOpen.value = true;
    nextTick(() => {
      searchModalInputRef.value?.focus();
    });
    return;
  }
  isSearchNavOpen.value = true;
  currentMatchIndex.value = 0;
  
  nextTick(() => {
    if (searchResults.value.length > 0) {
      locateNode(searchResults.value[0].node);
    }
    searchModalInputRef.value?.focus();
  });
}

function goToNextMatch() {
  if (searchResults.value.length === 0) return;
  const nextIdx = (currentMatchIndex.value + 1) % searchResults.value.length;
  currentMatchIndex.value = nextIdx;
  locateNode(searchResults.value[nextIdx].node);
}

function goToPrevMatch() {
  if (searchResults.value.length === 0) return;
  const prevIdx = (currentMatchIndex.value - 1 + searchResults.value.length) % searchResults.value.length;
  currentMatchIndex.value = prevIdx;
  locateNode(searchResults.value[prevIdx].node);
}

function toggleTreeNodeExpand(treeNode: SearchTreeNode) {
  treeNode.expanded = !treeNode.expanded;
}

function openSearchPanel() {
  isSearchNavOpen.value = true;
  nextTick(() => {
    searchModalInputRef.value?.focus();
    searchModalInputRef.value?.select();
  });
}

function closeSearchPanel() {
  isSearchNavOpen.value = false;
}

// Mind Map Outline (大纲导航) State & Methods
const isOutlineOpen = ref(false);
const outlineFilterKeyword = ref('');
const outlineExpandedState = ref<Record<string, boolean>>({});
const outlineTreeVersion = ref(0);
const outlineWidth = ref(340);
const isOutlineTextWrap = ref(false);
let isResizingOutline = false;
let resizeStartX = 0;
let resizeStartWidth = 340;

function startResizeOutline(e: MouseEvent) {
  isResizingOutline = true;
  resizeStartX = e.clientX;
  resizeStartWidth = outlineWidth.value;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';

  const onMouseMove = (moveEvent: MouseEvent) => {
    if (!isResizingOutline) return;
    const deltaX = moveEvent.clientX - resizeStartX;
    const newWidth = Math.min(Math.max(260, resizeStartWidth + deltaX), 700);
    outlineWidth.value = newWidth;
  };

  const onMouseUp = () => {
    isResizingOutline = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}

const outlineTree = computed<OutlineTreeNode[]>(() => {
  // Trigger on version updates
  const _v = outlineTreeVersion.value;
  if (!minder) return [];
  const root = minder.getRoot();
  if (!root) return [];

  function buildNode(node: any): OutlineTreeNode {
    const id = getNodeStableId(node);
    const children = node.getChildren ? node.getChildren() : [];
    const childNodes: OutlineTreeNode[] = [];
    let totalDescendants = 0;

    for (const child of children) {
      const childItem = buildNode(child);
      childNodes.push(childItem);
      totalDescendants += 1 + childItem.totalDescendants;
    }

    const isExpanded = outlineExpandedState.value[id] !== undefined ? outlineExpandedState.value[id] : true;

    return {
      id,
      node,
      text: getNodeText(node),
      level: typeof node.getLevel === 'function' ? node.getLevel() : 0,
      note: node.getData('note'),
      hyperlink: node.getData('hyperlink'),
      priority: node.getData('priority'),
      progress: node.getData('progress'),
      children: childNodes,
      expanded: isExpanded,
      totalDescendants
    };
  }

  return [buildNode(root)];
});

// Recursive Filter that preserves matching nodes and all their parent ancestors
function filterOutlineTreeNode(nodeItem: OutlineTreeNode, keyword: string): OutlineTreeNode | null {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return nodeItem;

  const selfTextMatch = (nodeItem.text || '').toLowerCase().includes(kw);
  const selfNoteMatch = (nodeItem.note || '').toLowerCase().includes(kw);
  const isSelfMatch = selfTextMatch || selfNoteMatch;

  const filteredChildren: OutlineTreeNode[] = [];
  for (const child of nodeItem.children) {
    const filteredChild = filterOutlineTreeNode(child, keyword);
    if (filteredChild) {
      filteredChildren.push(filteredChild);
    }
  }

  // If this node matches OR any of its descendants match, keep this branch and auto-expand path
  if (isSelfMatch || filteredChildren.length > 0) {
    return {
      ...nodeItem,
      children: filteredChildren,
      isSelfMatch,
      expanded: true
    };
  }

  return null;
}

// Display outline tree (filtered when searching, or standard tree with user expansion state)
const displayOutlineTree = computed<OutlineTreeNode[]>(() => {
  const tree = outlineTree.value;
  const kw = outlineFilterKeyword.value.trim();
  if (!kw) return tree;

  const results: OutlineTreeNode[] = [];
  for (const rootNode of tree) {
    const filtered = filterOutlineTreeNode(rootNode, kw);
    if (filtered) {
      results.push(filtered);
    }
  }
  return results;
});

const totalOutlineNodeCount = computed(() => {
  if (outlineTree.value.length === 0) return 0;
  return 1 + (outlineTree.value[0]?.totalDescendants || 0);
});

const maxOutlineDepth = computed(() => {
  function getDepth(node: OutlineTreeNode): number {
    if (!node.children || node.children.length === 0) return node.level + 1;
    return Math.max(...node.children.map(getDepth));
  }
  if (outlineTree.value.length === 0) return 1;
  return getDepth(outlineTree.value[0]);
});

function expandAncestorsInOutline(targetNode: any) {
  if (!targetNode) return;
  const liveNode = findLiveNode(targetNode);
  if (!liveNode) return;
  let curr = liveNode.parent || (typeof liveNode.getParent === 'function' ? liveNode.getParent() : null);
  let changed = false;
  const newExpandedState = { ...outlineExpandedState.value };
  while (curr) {
    const pid = getNodeStableId(curr);
    if (newExpandedState[pid] === false || newExpandedState[pid] === undefined) {
      newExpandedState[pid] = true;
      changed = true;
    }
    curr = curr.parent || (typeof curr.getParent === 'function' ? curr.getParent() : null);
  }
  if (changed) {
    outlineExpandedState.value = newExpandedState;
    outlineTreeVersion.value++;
  }
}

function scrollOutlineNodeIntoView(nodeId: string) {
  if (!nodeId) return;
  nextTick(() => {
    const el = document.getElementById('outline-node-' + nodeId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      setTimeout(() => {
        const el2 = document.getElementById('outline-node-' + nodeId);
        if (el2) {
          el2.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 100);
    }
  });
}

function toggleOutline() {
  isOutlineOpen.value = !isOutlineOpen.value;
  if (isOutlineOpen.value) {
    outlineTreeVersion.value++;
    nextTick(() => {
      const selected = minder?.getSelectedNode();
      if (selected) {
        expandAncestorsInOutline(selected);
        const nodeId = getNodeStableId(selected);
        scrollOutlineNodeIntoView(nodeId);
      }
    });
  }
}

function toggleOutlineItem(item: OutlineTreeNode) {
  const current = outlineExpandedState.value[item.id] !== undefined ? outlineExpandedState.value[item.id] : true;
  const nextExp = !current;
  outlineExpandedState.value = {
    ...outlineExpandedState.value,
    [item.id]: nextExp
  };
  outlineTreeVersion.value++;
}

function expandAllOutline() {
  const nextState: Record<string, boolean> = {};
  function traverse(nodes: OutlineTreeNode[]) {
    for (const n of nodes) {
      nextState[n.id] = true;
      if (n.children && n.children.length > 0) {
        traverse(n.children);
      }
    }
  }
  traverse(outlineTree.value);
  outlineExpandedState.value = nextState;
  outlineTreeVersion.value++;
}

function collapseAllOutline() {
  const nextState: Record<string, boolean> = {};
  function traverse(nodes: OutlineTreeNode[]) {
    for (const n of nodes) {
      nextState[n.id] = false;
      if (n.children && n.children.length > 0) {
        traverse(n.children);
      }
    }
  }
  traverse(outlineTree.value);
  outlineExpandedState.value = nextState;
  outlineTreeVersion.value++;
}

function highlightMatch(text: string, keyword: string) {
  if (!keyword || !text) return [{ text, isMatch: false }];
  const parts: { text: string; isMatch: boolean }[] = [];
  const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const tokens = text.split(regex);
  for (const token of tokens) {
    if (!token) continue;
    if (token.toLowerCase() === keyword.toLowerCase()) {
      parts.push({ text: token, isMatch: true });
    } else {
      parts.push({ text: token, isMatch: false });
    }
  }
  return parts;
}

// Markdown Mind Map Editing Modal State & Handlers
const isMarkdownModalOpen = ref(false);
const currentMarkdownMindData = ref<any>(null);

function openMarkdownEditor() {
  if (minder) {
    try {
      currentMarkdownMindData.value = minder.exportJson();
    } catch {
      currentMarkdownMindData.value = null;
    }
  }
  isMarkdownModalOpen.value = true;
}

function handleApplyMarkdown(mindJson: any) {
  if (!minder || !mindJson) return;
  try {
    minder.importJson(mindJson);
    if (typeof minder.layout === 'function') {
      try { minder.layout(); } catch {}
    }
    outlineExpandedState.value = {};
    activeSelectedNodeId.value = null;
    outlineTreeVersion.value++;
    handleContentChange();

    setTimeout(() => {
      outlineTreeVersion.value++;
      const root = minder.getRoot();
      if (root) {
        try {
          minder.select(root, true);
          centerNodeInCanvas(root, 300);
        } catch {}
      }
    }, 100);
  } catch (err) {
    console.error('Failed to import mindmap JSON from Markdown', err);
  }
}

// Keyboard shortcuts for Mind Map Editor
function handleKeyDown(e: KeyboardEvent) {
  const isMod = e.metaKey || e.ctrlKey;

  // Global Search shortcut (Cmd+F / Ctrl+F) - highest priority everywhere
  if (isMod && (e.key.toLowerCase() === 'f' || e.code === 'KeyF')) {
    e.preventDefault();
    e.stopPropagation();
    openSearchPanel();
    return;
  }

  if (justFinishedEditing) {
    e.stopPropagation();
    e.preventDefault();
    return;
  }

  // If modals are open, allow Escape to close them
  if (isNoteModalOpen.value || isLinkModalOpen.value || isSearchNavOpen.value || isMarkdownModalOpen.value) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      isNoteModalOpen.value = false;
      isLinkModalOpen.value = false;
      isSearchNavOpen.value = false;
      isMarkdownModalOpen.value = false;
      return;
    }
    if (isNoteModalOpen.value || isLinkModalOpen.value || isMarkdownModalOpen.value) {
      return;
    }
  }

  // If in text editing mode (inline floating input)
  if (isEditingNode.value) {
    if (e.key === 'Enter') {
      e.stopPropagation();
      e.preventDefault();
      finishEditing(true);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      finishEditing(false);
    } else if (e.key === 'Tab') {
      e.stopPropagation();
      e.preventDefault();
      finishEditing(true);
      if (e.shiftKey) {
        appendParentNode();
      } else {
        appendChildNode();
      }
    }
    return;
  }

  // Ignore general map manipulation keystrokes when typing in actual form inputs
  const activeEl = document.activeElement;
  const isKmReceiver = activeEl?.classList?.contains('km-receiver') || activeEl?.closest?.('#minder-view-container');
  const activeTag = (activeEl?.tagName || '').toLowerCase();
  if (!isKmReceiver && (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select')) {
    return;
  }

  // Save shortcut (Cmd+S / Ctrl+S)
  if (isMod && e.key.toLowerCase() === 's' && !e.shiftKey) {
    e.preventDefault();
    handleManualSave();
    return;
  }

  // Undo / Redo
  if (isMod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) {
      redo();
    } else {
      undo();
    }
    return;
  }
  if (isMod && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    redo();
    return;
  }

  // Select All (Cmd+A / Ctrl+A)
  if (isMod && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    selectAll();
    return;
  }

  // Bold & Italic
  if (isMod && e.key.toLowerCase() === 'b') {
    e.preventDefault();
    toggleBold();
    return;
  }
  if (isMod && e.key.toLowerCase() === 'i') {
    e.preventDefault();
    toggleItalic();
    return;
  }

  // Priority Shortcuts (Cmd/Ctrl + 1..5)
  if (isMod && ['1', '2', '3', '4', '5'].includes(e.key)) {
    e.preventDefault();
    setPriority(parseInt(e.key, 10));
    return;
  }
  if (isMod && e.key === '0') {
    e.preventDefault();
    setPriority(null);
    return;
  }

  // Start Editing Selected Node (F2 / Space)
  if (e.key === 'F2' || e.key === ' ' || e.code === 'Space') {
    e.preventDefault();
    startEditingNode();
    return;
  }

  // Insert Child Topic (Tab / Insert)
  if (e.key === 'Tab' || e.key === 'Insert') {
    e.preventDefault();
    if (e.shiftKey) {
      appendParentNode();
    } else {
      appendChildNode();
    }
    return;
  }

  // Insert Sibling Topic (Enter)
  if (e.key === 'Enter') {
    e.preventDefault();
    if (e.shiftKey) {
      appendParentNode();
    } else {
      appendSiblingNode();
    }
    return;
  }

  // Delete Selected Node (Delete / Backspace)
  if (e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault();
    removeNode();
    return;
  }

  // Arrow Key Navigation & Move
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (e.altKey) {
      arrangeUp();
    } else {
      handleArrowNavigation('up');
    }
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (e.altKey) {
      arrangeDown();
    } else {
      handleArrowNavigation('down');
    }
    return;
  }
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    handleArrowNavigation('left');
    return;
  }
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    handleArrowNavigation('right');
    return;
  }

  // Zoom (+ / - / 0)
  if (e.key === '=' || e.key === '+') {
    e.preventDefault();
    zoomIn();
    return;
  }
  if (e.key === '-' || e.key === '_') {
    e.preventDefault();
    zoomOut();
    return;
  }

  // Toggle expand/collapse of node (/)
  if (e.key === '/') {
    e.preventDefault();
    exec('Expand');
    return;
  }
}

function handleDocumentClick(e: MouseEvent) {
  const target = e.target as HTMLElement;

  // Close breadcrumb dropdown if clicked outside
  if (activeBreadcrumbDropdown.value) {
    const dropdownEl = document.getElementById('breadcrumb-teleport-dropdown');
    const triggerEl = target.closest('.breadcrumb-dropdown-trigger');
    if (!triggerEl && (!dropdownEl || !dropdownEl.contains(target))) {
      activeBreadcrumbDropdown.value = null;
    }
  }

  if (!isSearchNavOpen.value) return;
  if (
    searchNavContainerRef.value &&
    !searchNavContainerRef.value.contains(target) &&
    searchNavTriggerRef.value &&
    !searchNavTriggerRef.value.contains(target)
  ) {
    isSearchNavOpen.value = false;
  }
}

function addTag() {
  const val = newTagInput.value.trim();
  if (val && !localTags.value.includes(val)) {
    localTags.value.push(val);
    newTagInput.value = '';
    handleContentChange();
  }
}

function removeTag(tag: string) {
  localTags.value = localTags.value.filter((t) => t !== tag);
  handleContentChange();
}

function handleWindowResize() {
  if (minder) {
    try {
      if (typeof minder.layout === 'function') {
        minder.layout();
      }
    } catch {}
  }
}

watch(
  () => props.note.id,
  () => {
    localTitle.value = props.note.title;
    localFolderId.value = props.note.folderId;
    localTags.value = [...props.note.tags];
    nextTick(() => {
      initKityMinder();
    });
  }
);

watch(isFullscreen, () => {
  nextTick(() => {
    setTimeout(() => {
      if (minder) {
        try {
          if (typeof minder.layout === 'function') {
            minder.layout();
          }
          const root = minder.getRoot();
          if (root) {
            centerNodeInCanvas(root, 200);
          }
        } catch {}
      }
    }, 100);
  });
});

onMounted(() => {
  nextTick(() => {
    initKityMinder();
  });
  window.addEventListener('keydown', handleKeyDown, true);
  window.addEventListener('resize', handleWindowResize);
  document.addEventListener('mousedown', handleDocumentClick);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown, true);
  window.removeEventListener('resize', handleWindowResize);
  document.removeEventListener('mousedown', handleDocumentClick);
  if (saveTimeout) clearTimeout(saveTimeout);
  minderInstance.value = null;
});
</script>

<template>
  <div
    id="mindmap-editor-modal-container"
    class="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150"
  >
    <div
      id="mindmap-editor-dialog"
      :class="[
        'bg-white w-full rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 transition-all',
        isFullscreen ? 'fixed inset-0 rounded-none h-full' : 'max-w-7xl h-[94vh]'
      ]"
    >
      <!-- Top Title & Global Controls Bar -->
      <div class="h-14 px-3 sm:px-5 bg-white border-b border-gray-100 flex items-center justify-between shrink-0 select-none z-30">
        <!-- Close button, Title & Folder info -->
        <div class="flex items-center gap-2.5 sm:gap-3 flex-1 mr-3 sm:mr-4 min-w-0">
          <!-- Close Editor Button at top-left corner -->
          <button
            id="btn-close-mindmap"
            @click="emit('close')"
            class="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer shrink-0"
            title="关闭思维导图"
          >
            <X class="w-5 h-5" />
          </button>

          <div class="h-4 w-px bg-gray-200 shrink-0"></div>

          <!-- Green Mindmap File Icon matching image.png -->
          <MindmapIcon size="sm" />

          <input
            id="mindmap-title-input"
            v-model="localTitle"
            @input="handleContentChange"
            placeholder="输入思维导图标题..."
            class="text-base sm:text-lg font-bold text-gray-900 placeholder-gray-300 border-none outline-none focus:ring-0 bg-transparent flex-1 truncate"
          />

          <!-- Folder Picker -->
          <div class="hidden md:flex items-center gap-1.5 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-md text-xs text-gray-600">
            <FolderIcon class="w-3.5 h-3.5 text-amber-500" />
            <select
              v-model="localFolderId"
              @change="handleContentChange"
              class="bg-transparent border-none outline-none text-xs text-gray-700 cursor-pointer"
            >
              <option v-for="f in hierarchicalFolders" :key="f.id" :value="f.id">
                {{ f.prefix }}📁 {{ f.name }}
              </option>
            </select>
          </div>
        </div>

        <!-- Mode Switches & Actions -->
        <div class="flex items-center gap-2 shrink-0">
          <!-- Star & Favorite Buttons -->
          <button
            @click="emit('toggleStar', note.id)"
            class="p-1.5 text-gray-400 hover:text-amber-500 hover:bg-gray-50 rounded-md transition-colors cursor-pointer"
            title="标星"
          >
            <Star class="w-4 h-4" :class="note.isStarred ? 'text-amber-500 fill-amber-500' : ''" />
          </button>

          <button
            @click="emit('toggleFavorite', note.id)"
            class="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-gray-50 rounded-md transition-colors cursor-pointer"
            title="收藏"
          >
            <Box class="w-4 h-4" :class="note.isFavorite ? 'text-indigo-600' : ''" />
          </button>

          <!-- Share Button -->
          <button
            @click="emit('openShare', note)"
            class="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors text-xs flex items-center gap-1 font-medium cursor-pointer"
            title="分享导图"
          >
            <Share2 class="w-4 h-4 text-blue-600" />
            <span class="hidden sm:inline text-blue-600">分享</span>
          </button>

          <!-- Fullscreen Toggle -->
          <button
            @click="isFullscreen = !isFullscreen"
            class="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-50 rounded-md transition-colors cursor-pointer"
            :title="isFullscreen ? '退出全屏' : '全屏模式'"
          >
            <Minimize2 v-if="isFullscreen" class="w-4 h-4" />
            <Maximize2 v-else class="w-4 h-4" />
          </button>

          <!-- Manual Save Button -->
          <button
            @click="handleManualSave"
            :title="'即时保存 (' + (isMac ? '⌘S' : 'Ctrl+S') + ')'"
            class="px-2.5 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors flex items-center gap-1 border border-emerald-200 cursor-pointer"
          >
            <Save class="w-3.5 h-3.5" />
            <span class="hidden sm:inline">保存</span>
            <kbd class="text-[9px] font-mono text-emerald-500 hidden sm:inline">{{ isMac ? '⌘S' : 'Ctrl+S' }}</kbd>
          </button>
        </div>
      </div>

      <!-- KityMinder Ribbon Navigation Tab Headers (Inspired by vue-kityminder) -->
      <div class="h-10 px-4 bg-slate-50 border-b border-gray-200 flex items-center justify-between shrink-0 select-none z-20 text-xs">
        <!-- Tabs -->
        <div class="flex items-center gap-1">
          <button
            @click="activeTab = 'common'"
            :class="[
              'px-3.5 py-1.5 rounded-t-md font-medium transition-all flex items-center gap-1.5 cursor-pointer border-b-2',
              activeTab === 'common'
                ? 'bg-white text-emerald-700 border-emerald-600 shadow-xs'
                : 'text-gray-600 hover:text-gray-900 border-transparent'
            ]"
          >
            <Sliders class="w-3.5 h-3.5" />
            <span>常用操作</span>
          </button>

          <button
            @click="activeTab = 'idea'"
            :class="[
              'px-3.5 py-1.5 rounded-t-md font-medium transition-all flex items-center gap-1.5 cursor-pointer border-b-2',
              activeTab === 'idea'
                ? 'bg-white text-emerald-700 border-emerald-600 shadow-xs'
                : 'text-gray-600 hover:text-gray-900 border-transparent'
            ]"
          >
            <Sparkles class="w-3.5 h-3.5" />
            <span>思路 (节点操作)</span>
          </button>

          <button
            @click="activeTab = 'appearance'"
            :class="[
              'px-3.5 py-1.5 rounded-t-md font-medium transition-all flex items-center gap-1.5 cursor-pointer border-b-2',
              activeTab === 'appearance'
                ? 'bg-white text-emerald-700 border-emerald-600 shadow-xs'
                : 'text-gray-600 hover:text-gray-900 border-transparent'
            ]"
          >
            <Palette class="w-3.5 h-3.5" />
            <span>外观 (主题与结构)</span>
          </button>

          <button
            @click="activeTab = 'data'"
            :class="[
              'px-3.5 py-1.5 rounded-t-md font-medium transition-all flex items-center gap-1.5 cursor-pointer border-b-2',
              activeTab === 'data'
                ? 'bg-white text-emerald-700 border-emerald-600 shadow-xs'
                : 'text-gray-600 hover:text-gray-900 border-transparent'
            ]"
          >
            <FileDown class="w-3.5 h-3.5" />
            <span>数据与导出</span>
          </button>

          <button
            @click="activeTab = 'view'"
            :class="[
              'px-3.5 py-1.5 rounded-t-md font-medium transition-all flex items-center gap-1.5 cursor-pointer border-b-2',
              activeTab === 'view'
                ? 'bg-white text-emerald-700 border-emerald-600 shadow-xs'
                : 'text-gray-600 hover:text-gray-900 border-transparent'
            ]"
          >
            <Layers class="w-3.5 h-3.5" />
            <span>视图控制</span>
          </button>
        </div>

        <!-- Outline & Quick Search Controls -->
        <div class="flex items-center gap-2">
          <!-- Outline Toggle Button -->
          <button
            @click="toggleOutline"
            :class="[
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-all cursor-pointer shadow-2xs',
              isOutlineOpen
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-1 ring-emerald-400'
                : 'bg-white text-gray-700 hover:text-emerald-600 hover:border-emerald-300 border-gray-200'
            ]"
            title="侧边栏大纲树状展示 (查看完整节点目录)"
          >
            <ListTree class="w-3.5 h-3.5" :class="isOutlineOpen ? 'text-emerald-600' : 'text-gray-500'" />
            <span>大纲</span>
          </button>

          <!-- Markdown Mind Map Editor Button -->
          <button
            @click="openMarkdownEditor"
            class="flex items-center gap-1.5 px-2.5 py-1 rounded-md border bg-white hover:bg-emerald-50 text-gray-700 hover:text-emerald-700 hover:border-emerald-300 border-gray-200 text-xs font-medium transition-all cursor-pointer shadow-2xs"
            title="以 Markdown 语法模式编辑思维导图"
          >
            <FileCode2 class="w-3.5 h-3.5 text-emerald-600" />
            <span>Markdown</span>
          </button>

          <!-- Inline Quick Search & Navigation Trigger -->
          <div
            ref="searchNavTriggerRef"
            @click="openSearchPanel"
            class="flex items-center gap-1.5 bg-white border border-gray-200 hover:border-emerald-500 rounded-md px-2 py-0.5 shadow-2xs cursor-pointer transition-all group"
            title="搜索导图节点与层级导航 (快捷键: Ctrl+F / ⌘F)"
          >
            <Search class="w-3.5 h-3.5 text-gray-400 group-hover:text-emerald-600 transition-colors" />
            <input
              v-model="searchKeyword"
              @keydown.enter.stop="handleSearchNodes"
              @click.stop="openSearchPanel"
              placeholder="搜索节点... (Ctrl+F)"
              class="bg-transparent border-none outline-none text-xs text-gray-700 w-28 sm:w-36 cursor-pointer"
            />
            <button
              @click.stop="handleSearchNodes"
              class="text-[10px] bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-1.5 py-0.5 rounded cursor-pointer font-medium"
            >
              {{ searchKeyword ? '导航' : '查找' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Ribbon Toolbar Panels depending on Active Tab -->
      <div class="h-12 px-4 bg-white border-b border-gray-100 flex items-center gap-3 overflow-x-auto text-xs text-gray-700 shrink-0 select-none z-10 shadow-2xs">
        
        <!-- TAB 0: 常用操作 (Common Actions: Undo, Redo, Note, Outline, Markdown, Nodes) -->
        <template v-if="activeTab === 'common'">
          <!-- Undo / Redo Group -->
          <div class="flex items-center gap-1 bg-gray-50/90 p-1 rounded-lg border border-gray-100">
            <button
              @click="undo"
              :disabled="!canUndo"
              :class="[
                'px-2.5 py-1 rounded transition-all flex items-center gap-1 font-medium',
                canUndo
                  ? 'bg-white hover:bg-emerald-50 hover:text-emerald-700 text-gray-700 shadow-2xs cursor-pointer'
                  : 'text-gray-300 cursor-not-allowed opacity-40'
              ]"
              :title="'撤销 (' + (isMac ? '⌘Z' : 'Ctrl+Z') + ')'"
            >
              <RotateCcw class="w-3.5 h-3.5" />
              <span>撤销</span>
              <kbd class="text-[9px] font-mono text-gray-400">{{ isMac ? '⌘Z' : 'Ctrl+Z' }}</kbd>
            </button>
            <button
              @click="redo"
              :disabled="!canRedo"
              :class="[
                'px-2.5 py-1 rounded transition-all flex items-center gap-1 font-medium',
                canRedo
                  ? 'bg-white hover:bg-emerald-50 hover:text-emerald-700 text-gray-700 shadow-2xs cursor-pointer'
                  : 'text-gray-300 cursor-not-allowed opacity-40'
              ]"
              :title="'重做 (' + (isMac ? '⌘⇧Z' : 'Ctrl+Y') + ')'"
            >
              <RotateCw class="w-3.5 h-3.5" />
              <span>重做</span>
              <kbd class="text-[9px] font-mono text-gray-400">{{ isMac ? '⌘⇧Z' : 'Ctrl+Y' }}</kbd>
            </button>
          </div>

          <div class="h-4 w-px bg-gray-200"></div>

          <!-- Note (备注) Button -->
          <button
            @click="openNoteModal()"
            class="px-2.5 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs flex items-center gap-1.5 cursor-pointer transition-colors border border-amber-200/70 font-medium shadow-2xs"
            title="添加或编辑当前选中节点的备注信息"
          >
            <FileText class="w-3.5 h-3.5 text-amber-600" />
            <span>备注</span>
          </button>

          <!-- Outline (大纲) Button -->
          <button
            @click="toggleOutline"
            :class="[
              'px-2.5 py-1 rounded text-xs flex items-center gap-1.5 cursor-pointer font-medium border transition-all shadow-2xs',
              isOutlineOpen
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-1 ring-emerald-400'
                : 'bg-white hover:bg-emerald-50 text-gray-700 hover:text-emerald-700 hover:border-emerald-300 border-gray-200'
            ]"
            title="切换侧边栏大纲树状目录"
          >
            <ListTree class="w-3.5 h-3.5" :class="isOutlineOpen ? 'text-emerald-600' : 'text-gray-500'" />
            <span>大纲</span>
          </button>

          <!-- Markdown Mind Map Button -->
          <button
            @click="openMarkdownEditor"
            class="px-2.5 py-1 rounded bg-white hover:bg-emerald-50 text-gray-700 hover:text-emerald-700 hover:border-emerald-300 border border-gray-200 text-xs flex items-center gap-1.5 cursor-pointer transition-all font-medium shadow-2xs"
            title="以 Markdown 文本语法编辑思维导图结构"
          >
            <FileCode2 class="w-3.5 h-3.5 text-emerald-600" />
            <span>Markdown</span>
          </button>

          <div class="h-4 w-px bg-gray-200"></div>

          <!-- Quick Node Creation Group in Common Tab -->
          <div class="flex items-center gap-1 bg-gray-50/90 p-1 rounded-lg border border-gray-100">
            <button
              @click="startEditingNode()"
              class="px-2.5 py-1 rounded bg-white hover:bg-emerald-50 hover:text-emerald-700 text-gray-700 shadow-2xs transition-colors flex items-center gap-1 cursor-pointer font-medium"
              title="编辑节点文字 (快捷键: 双击 / 空格 / F2)"
            >
              <Type class="w-3.5 h-3.5 text-amber-600" />
              <span>编辑文字</span>
            </button>

            <button
              @click="appendChildNode"
              class="px-2.5 py-1 rounded bg-white hover:bg-emerald-50 hover:text-emerald-700 text-gray-700 shadow-2xs transition-colors flex items-center gap-1 cursor-pointer font-medium"
              title="插入下级主题 (快捷键: Tab)"
            >
              <Plus class="w-3.5 h-3.5 text-emerald-600" />
              <span>下级主题</span>
              <kbd class="text-[9px] font-mono text-gray-400">Tab</kbd>
            </button>

            <button
              @click="appendSiblingNode"
              class="px-2.5 py-1 rounded bg-white hover:bg-emerald-50 hover:text-emerald-700 text-gray-700 shadow-2xs transition-colors flex items-center gap-1 cursor-pointer font-medium"
              title="插入同级主题 (快捷键: Enter)"
            >
              <Plus class="w-3.5 h-3.5 text-blue-600" />
              <span>同级主题</span>
              <kbd class="text-[9px] font-mono text-gray-400">Enter</kbd>
            </button>

            <button
              @click="removeNode"
              class="p-1 rounded hover:bg-red-50 hover:text-red-600 text-gray-500 transition-colors cursor-pointer"
              title="删除选中节点 (快捷键: Delete)"
            >
              <Trash2 class="w-3.5 h-3.5 text-red-500" />
            </button>
          </div>
        </template>
        
        <!-- TAB 1: 思路 (Node Insertion, Arrange, Annotations) -->
        <template v-if="activeTab === 'idea'">
          <!-- Append Node Group -->
          <div class="flex items-center gap-1 bg-gray-50/90 p-1 rounded-lg border border-gray-100">
            <button
              @click="startEditingNode()"
              class="px-2.5 py-1 rounded bg-white hover:bg-emerald-50 hover:text-emerald-700 text-gray-700 shadow-2xs transition-colors flex items-center gap-1 cursor-pointer font-medium"
              title="编辑节点文字 (快捷键: 双击 / 空格 / F2)"
            >
              <Type class="w-3.5 h-3.5 text-amber-600" />
              <span>编辑文字</span>
              <kbd class="text-[9px] font-mono text-gray-400">F2</kbd>
            </button>

            <button
              @click="appendChildNode"
              class="px-2.5 py-1 rounded bg-white hover:bg-emerald-50 hover:text-emerald-700 text-gray-700 shadow-2xs transition-colors flex items-center gap-1 cursor-pointer font-medium"
              title="插入下级主题 (快捷键: Tab)"
            >
              <Plus class="w-3.5 h-3.5 text-emerald-600" />
              <span>下级主题</span>
              <kbd class="text-[9px] font-mono text-gray-400">Tab</kbd>
            </button>

            <button
              @click="appendSiblingNode"
              class="px-2.5 py-1 rounded bg-white hover:bg-emerald-50 hover:text-emerald-700 text-gray-700 shadow-2xs transition-colors flex items-center gap-1 cursor-pointer font-medium"
              title="插入同级主题 (快捷键: Enter)"
            >
              <Plus class="w-3.5 h-3.5 text-blue-600" />
              <span>同级主题</span>
              <kbd class="text-[9px] font-mono text-gray-400">Enter</kbd>
            </button>

            <button
              @click="appendParentNode"
              class="px-2.5 py-1 rounded bg-white hover:bg-emerald-50 hover:text-emerald-700 text-gray-700 shadow-2xs transition-colors flex items-center gap-1 cursor-pointer font-medium"
              title="插入上级主题 (快捷键: Shift+Tab)"
            >
              <Plus class="w-3.5 h-3.5 text-purple-600" />
              <span>上级主题</span>
              <kbd class="text-[9px] font-mono text-gray-400">⇧Tab</kbd>
            </button>

            <button
              @click="removeNode"
              class="p-1 rounded hover:bg-red-50 hover:text-red-600 text-gray-500 transition-colors cursor-pointer"
              title="删除选中节点 (快捷键: Delete)"
            >
              <Trash2 class="w-3.5 h-3.5 text-red-500" />
            </button>
          </div>

          <div class="h-4 w-px bg-gray-200"></div>

          <!-- History & Arrange -->
          <div class="flex items-center gap-1">
            <button
              @click="undo"
              :disabled="!canUndo"
              :class="[
                'p-1.5 rounded transition-colors',
                canUndo
                  ? 'hover:bg-gray-100 text-gray-700 hover:text-gray-900 cursor-pointer'
                  : 'text-gray-300 cursor-not-allowed opacity-40'
              ]"
              :title="'撤销 (' + (isMac ? '⌘Z' : 'Ctrl+Z') + ')'"
            >
              <RotateCcw class="w-3.5 h-3.5" />
            </button>
            <button
              @click="redo"
              :disabled="!canRedo"
              :class="[
                'p-1.5 rounded transition-colors',
                canRedo
                  ? 'hover:bg-gray-100 text-gray-700 hover:text-gray-900 cursor-pointer'
                  : 'text-gray-300 cursor-not-allowed opacity-40'
              ]"
              :title="'重做 (' + (isMac ? '⌘⇧Z' : 'Ctrl+Y') + ')'"
            >
              <RotateCw class="w-3.5 h-3.5" />
            </button>
            <button
              @click="arrangeUp"
              class="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
              title="上移节点 (Alt+Up)"
            >
              <ArrowUp class="w-3.5 h-3.5" />
            </button>
            <button
              @click="arrangeDown"
              class="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
              title="下移节点 (Alt+Down)"
            >
              <ArrowDown class="w-3.5 h-3.5" />
            </button>
          </div>

          <div class="h-4 w-px bg-gray-200"></div>

          <!-- Priority Badges -->
          <div class="flex items-center gap-1">
            <span class="text-[11px] text-gray-400 font-medium mr-0.5">优先级:</span>
            <button
              v-for="p in PRIORITY_LIST"
              :key="p.value"
              @click="setPriority(p.value)"
              :style="{ backgroundColor: p.bg, color: p.text }"
              class="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shadow-2xs hover:scale-110 transition-transform cursor-pointer"
              :title="p.label"
            >
              {{ p.value }}
            </button>
            <button
              @click="setPriority(null)"
              class="text-[10px] text-gray-400 hover:text-gray-700 px-1 py-0.5 rounded hover:bg-gray-100 transition-colors cursor-pointer"
              title="清除优先级"
            >
              无
            </button>
          </div>

          <div class="h-4 w-px bg-gray-200"></div>

          <!-- Progress Badges -->
          <div class="flex items-center gap-1">
            <span class="text-[11px] text-gray-400 font-medium mr-0.5">进度:</span>
            <button
              v-for="prog in PROGRESS_LIST"
              :key="prog.value"
              @click="setProgress(prog.value)"
              class="px-1.5 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-medium transition-colors cursor-pointer border border-emerald-100"
              :title="prog.text"
            >
              {{ prog.label }}
            </button>
            <button
              @click="setProgress(null)"
              class="text-[10px] text-gray-400 hover:text-gray-700 px-1 py-0.5 rounded hover:bg-gray-100 transition-colors cursor-pointer"
              title="清除进度"
            >
              无
            </button>
          </div>

          <div class="h-4 w-px bg-gray-200"></div>

          <!-- Rich Attributes: Note & Hyperlink -->
          <div class="flex items-center gap-1">
            <button
              @click="openNoteModal()"
              class="px-2 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs flex items-center gap-1 cursor-pointer transition-colors border border-amber-200/60"
              title="添加/编辑节点备注"
            >
              <FileText class="w-3.5 h-3.5 text-amber-600" />
              <span>备注</span>
            </button>

            <button
              @click="openLinkModal()"
              class="px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs flex items-center gap-1 cursor-pointer transition-colors border border-blue-200/60"
              title="添加/编辑节点超链接"
            >
              <LinkIcon class="w-3.5 h-3.5 text-blue-600" />
              <span>链接</span>
            </button>
          </div>
        </template>

        <!-- TAB 2: 外观 (Templates & Themes & Fonts) -->
        <template v-if="activeTab === 'appearance'">
          <!-- Templates Selector -->
          <div class="flex items-center gap-1.5">
            <span class="text-[11px] text-gray-400 font-medium">结构模板:</span>
            <div class="flex items-center gap-1">
              <button
                v-for="tpl in TEMPLATE_LIST"
                :key="tpl.id"
                @click="setTemplate(tpl.id)"
                :class="[
                  'px-2.5 py-1 rounded text-xs transition-colors cursor-pointer font-medium',
                  currentTemplate === tpl.id
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                ]"
                :title="tpl.desc"
              >
                {{ tpl.name }}
              </button>
            </div>
          </div>

          <div class="h-4 w-px bg-gray-200"></div>

          <!-- Themes Palette -->
          <div class="flex items-center gap-1.5">
            <span class="text-[11px] text-gray-400 font-medium">主题配色:</span>
            <div class="flex items-center gap-1 overflow-x-auto max-w-sm">
              <button
                v-for="thm in THEME_LIST"
                :key="thm.id"
                @click="setTheme(thm.id)"
                :style="{ backgroundColor: thm.bg }"
                :class="[
                  'px-2 py-1 rounded text-[11px] text-white font-medium shadow-2xs hover:opacity-90 transition-all cursor-pointer border',
                  currentTheme === thm.id ? 'ring-2 ring-emerald-500 ring-offset-1 border-white' : 'border-transparent'
                ]"
                :title="thm.name"
              >
                {{ thm.name }}
              </button>
            </div>
          </div>

          <div class="h-4 w-px bg-gray-200"></div>

          <!-- Font Size & Styles -->
          <div class="flex items-center gap-1">
            <button
              @click="setFontSize(2)"
              class="p-1 rounded hover:bg-gray-100 text-gray-700 transition-colors cursor-pointer text-xs font-bold"
              title="字号加大"
            >
              A+
            </button>
            <button
              @click="setFontSize(-2)"
              class="p-1 rounded hover:bg-gray-100 text-gray-700 transition-colors cursor-pointer text-xs font-bold"
              title="字号减小"
            >
              A-
            </button>
            <button
              @click="toggleBold"
              class="p-1.5 rounded hover:bg-gray-100 text-gray-700 transition-colors cursor-pointer"
              title="粗体"
            >
              <Bold class="w-3.5 h-3.5" />
            </button>
            <button
              @click="toggleItalic"
              class="p-1.5 rounded hover:bg-gray-100 text-gray-700 transition-colors cursor-pointer"
              title="斜体"
            >
              <Italic class="w-3.5 h-3.5" />
            </button>
          </div>
        </template>

        <!-- TAB 3: 数据与导出 (Import & Export) -->
        <template v-if="activeTab === 'data'">
          <div class="flex items-center gap-2">
            <!-- Export Options -->
            <button
              @click="exportAsXMind"
              class="px-2.5 py-1 rounded bg-red-50 hover:bg-red-100 text-red-800 text-xs flex items-center gap-1.5 cursor-pointer transition-colors border border-red-200/60 font-semibold"
              title="导出为标准 XMind (.xmind) 文件格式，可直接在 XMind 软件中打开"
            >
              <Download class="w-3.5 h-3.5 text-red-600" />
              <span>导出 XMind (.xmind)</span>
            </button>

            <button
              @click="exportAsPng"
              class="px-2.5 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs flex items-center gap-1.5 cursor-pointer transition-colors border border-emerald-200/60 font-medium"
              title="导出为高清 PNG 图片"
            >
              <ImageIcon class="w-3.5 h-3.5 text-emerald-600" />
              <span>导出 PNG 图片</span>
            </button>

            <button
              @click="exportAsSvg"
              class="px-2.5 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs flex items-center gap-1.5 cursor-pointer transition-colors border border-blue-200/60 font-medium"
              title="导出为矢量 SVG 图片"
            >
              <FileDown class="w-3.5 h-3.5 text-blue-600" />
              <span>导出 SVG</span>
            </button>

            <button
              @click="exportAsMarkdown"
              class="px-2.5 py-1 rounded bg-orange-50 hover:bg-orange-100 text-orange-800 text-xs flex items-center gap-1.5 cursor-pointer transition-colors border border-orange-200/60 font-medium"
              title="导出为大纲 Markdown"
            >
              <FileText class="w-3.5 h-3.5 text-orange-600" />
              <span>导出 Markdown</span>
            </button>

            <button
              @click="exportAsJson"
              class="px-2.5 py-1 rounded bg-purple-50 hover:bg-purple-100 text-purple-800 text-xs flex items-center gap-1.5 cursor-pointer transition-colors border border-purple-200/60 font-medium"
              title="导出完整脑图 JSON / KM"
            >
              <Download class="w-3.5 h-3.5 text-purple-600" />
              <span>导出 JSON 文件</span>
            </button>

            <div class="h-4 w-px bg-gray-200 mx-1"></div>

            <!-- Import File Button -->
            <button
              @click="triggerImportFile"
              class="px-2.5 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs flex items-center gap-1.5 cursor-pointer transition-colors font-medium"
              title="导入 XMind (.xmind)、JSON/KM 或 Markdown 大纲"
            >
              <FileUp class="w-3.5 h-3.5 text-gray-600" />
              <span>导入文件 (.xmind / .km / .md)</span>
            </button>
          </div>
        </template>

        <!-- TAB 4: 视图控制 (Zoom, Center, SelectAll) -->
        <template v-if="activeTab === 'view'">
          <div class="flex items-center gap-2">
            <!-- Expand Levels -->
            <div class="flex items-center gap-1">
              <span class="text-[11px] text-gray-400 font-medium mr-1">展开层级:</span>
              <button
                @click="expandToLevel(1)"
                class="px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-xs font-medium cursor-pointer"
              >
                1级
              </button>
              <button
                @click="expandToLevel(2)"
                class="px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-xs font-medium cursor-pointer"
              >
                2级
              </button>
              <button
                @click="expandToLevel(3)"
                class="px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-xs font-medium cursor-pointer"
              >
                3级
              </button>
              <button
                @click="expandToLevel(99)"
                class="px-2 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-medium cursor-pointer"
              >
                全部展开
              </button>
            </div>

            <div class="h-4 w-px bg-gray-200"></div>

            <!-- Zoom & Center Controls -->
            <div class="flex items-center gap-1">
              <button
                @click="zoomIn"
                class="p-1 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
                title="放大 (快捷键: +)"
              >
                <ZoomIn class="w-3.5 h-3.5" />
              </button>
              <span class="text-xs font-mono text-gray-600 px-1">{{ zoomPercent }}%</span>
              <button
                @click="zoomOut"
                class="p-1 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
                title="缩小 (快捷键: -)"
              >
                <ZoomOut class="w-3.5 h-3.5" />
              </button>
              <button
                @click="zoomReset"
                class="px-1.5 py-0.5 rounded hover:bg-gray-100 text-[11px] text-gray-600 transition-colors cursor-pointer font-mono"
                title="重置缩放为 100%"
              >
                1:1
              </button>
              <button
                @click="centerView"
                class="p-1 rounded hover:bg-gray-100 text-emerald-600 hover:text-emerald-800 transition-colors cursor-pointer"
                title="视野居中定位"
              >
                <Compass class="w-3.5 h-3.5" />
              </button>
            </div>

            <div class="h-4 w-px bg-gray-200"></div>

            <button
              @click="toggleOutline"
              :class="[
                'px-2 py-1 rounded text-xs flex items-center gap-1 cursor-pointer font-medium border transition-colors',
                isOutlineOpen
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border-transparent'
              ]"
              title="切换侧边导图大纲窗口"
            >
              <ListTree class="w-3.5 h-3.5" :class="isOutlineOpen ? 'text-emerald-600' : 'text-gray-500'" />
              <span>大纲侧栏</span>
            </button>

            <div class="h-4 w-px bg-gray-200"></div>

            <button
              @click="selectAll"
              class="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs flex items-center gap-1 cursor-pointer font-medium"
            >
              <span>全选节点</span>
              <kbd class="text-[9px] font-mono text-gray-400">⌘A</kbd>
            </button>
          </div>
        </template>
      </div>

      <!-- Main Workspace Area: Left Outline Drawer + Canvas -->
      <div class="flex-1 relative flex overflow-hidden w-full h-full min-h-[450px]">
        
        <!-- Left Side Outline Navigation Panel (大纲导航窗口) -->
        <transition
          enter-active-class="transition-all duration-200 ease-out"
          enter-from-class="-ml-96 opacity-0"
          enter-to-class="ml-0 opacity-100"
          leave-active-class="transition-all duration-150 ease-in"
          leave-from-class="ml-0 opacity-100"
          leave-to-class="-ml-96 opacity-0"
        >
          <div
            v-if="isOutlineOpen"
            class="h-full bg-white border-r border-gray-200 flex flex-col z-20 shadow-lg shrink-0 select-none relative group/outline"
            :style="{ width: `${outlineWidth}px` }"
          >
            <!-- Outline Header -->
            <div class="p-3 bg-gray-50/90 border-b border-gray-100 flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0">
                <ListTree class="w-4 h-4 text-emerald-600 shrink-0" />
                <span class="font-bold text-xs text-gray-800 truncate">思维导图大纲</span>
                <span class="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-full font-mono font-medium shrink-0">
                  {{ totalOutlineNodeCount }} 节点
                </span>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <!-- Wrap Text Toggle -->
                <button
                  @click="isOutlineTextWrap = !isOutlineTextWrap"
                  :class="[
                    'p-1 rounded text-xs transition-colors cursor-pointer flex items-center gap-0.5',
                    isOutlineTextWrap
                      ? 'bg-emerald-100 text-emerald-800 font-medium'
                      : 'text-gray-500 hover:text-emerald-700 hover:bg-emerald-50'
                  ]"
                  :title="isOutlineTextWrap ? '切换为单行截断模式' : '切换为多行自动换行模式'"
                >
                  <WrapText class="w-3.5 h-3.5" />
                </button>
                <span class="text-gray-300">|</span>
                <button
                  @click="expandAllOutline"
                  class="px-1.5 py-0.5 rounded text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 text-[11px] font-medium transition-colors cursor-pointer"
                  title="全部展开"
                >
                  展开
                </button>
                <span class="text-gray-300">|</span>
                <button
                  @click="collapseAllOutline"
                  class="px-1.5 py-0.5 rounded text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 text-[11px] font-medium transition-colors cursor-pointer"
                  title="全部折叠"
                >
                  折叠
                </button>
                <button
                  @click="isOutlineOpen = false"
                  class="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 ml-1 transition-colors cursor-pointer"
                  title="收起大纲"
                >
                  <X class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <!-- Outline Filter Input -->
            <div class="p-2 border-b border-gray-100 bg-white">
              <div class="relative flex items-center">
                <Search class="w-3.5 h-3.5 text-gray-400 absolute left-2 pointer-events-none" />
                <input
                  v-model="outlineFilterKeyword"
                  placeholder="筛选大纲节点..."
                  class="w-full pl-7 pr-6 py-1 text-xs bg-gray-50 border border-gray-200 rounded-md outline-none focus:border-emerald-500 focus:bg-white text-gray-800 placeholder-gray-400"
                />
                <button
                  v-if="outlineFilterKeyword"
                  @click="outlineFilterKeyword = ''"
                  class="absolute right-1.5 text-gray-400 hover:text-gray-600 p-0.5"
                >
                  <X class="w-3 h-3" />
                </button>
              </div>
            </div>

            <!-- Outline Tree Content List (Supports horizontal & vertical scrolling and text wrapping) -->
            <div
              id="mindmap-outline-scroll-container"
              class="flex-1 overflow-y-auto overflow-x-auto p-2 space-y-1 scrollbar-thin"
            >
              <div :class="[isOutlineTextWrap ? 'w-full' : 'min-w-max w-full']">
                <template v-if="displayOutlineTree.length > 0">
                  <MindMapOutlineTreeItem
                    v-for="rootNode in displayOutlineTree"
                    :key="rootNode.id"
                    :item="rootNode"
                    :active-id="activeSelectedNodeId"
                    :filter-keyword="outlineFilterKeyword"
                    :level="0"
                    :wrap-text="isOutlineTextWrap"
                    @locate="locateNode"
                    @toggle="toggleOutlineItem"
                  />
                </template>
                <div v-else class="py-8 text-center text-xs text-gray-400">
                  <span v-if="outlineFilterKeyword">未匹配到包含 "{{ outlineFilterKeyword }}" 的节点</span>
                  <span v-else>暂无节点数据</span>
                </div>
              </div>
            </div>

            <!-- Outline Footer Tip -->
            <div class="px-3 py-1.5 bg-gray-50 border-t border-gray-100 text-[10px] text-gray-400 flex items-center justify-between">
              <span>点击节点定位 · 拖动右边缘调节宽度</span>
              <span>共 {{ maxOutlineDepth }} 级结构</span>
            </div>

            <!-- Drag Handle to Resize Outline Width -->
            <div
              @mousedown.prevent="startResizeOutline"
              class="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-emerald-500/30 transition-colors z-30"
              title="拖拽调节大纲栏宽度"
            ></div>
          </div>
        </transition>

        <!-- Mind Map Interactive Canvas Container -->
        <div id="mindmap-canvas-wrapper" class="flex-1 relative bg-slate-50/50 overflow-hidden w-full h-full flex flex-col">
          
          <!-- Top Floating Breadcrumb Bar (面包屑导航栏) -->
          <div
            id="mindmap-breadcrumb-bar"
            class="h-8 px-3 bg-white/95 backdrop-blur-xs border-b border-gray-200/80 flex items-center gap-1 text-xs text-gray-600 shrink-0 z-20 shadow-2xs select-none overflow-x-auto scrollbar-none"
          >
            <div class="flex items-center gap-1 text-gray-400 shrink-0 mr-1 text-[11px] font-medium">
              <Compass class="w-3.5 h-3.5 text-emerald-600" />
              <span>当前路径:</span>
            </div>

            <template v-if="breadcrumbTrail.length > 0">
              <div
                v-for="(item, idx) in breadcrumbTrail"
                :key="item.id"
                class="flex items-center gap-1 shrink-0"
              >
                <!-- Separator Chevron -->
                <ChevronRight v-if="idx > 0" class="w-3 h-3 text-gray-300 shrink-0" />

                <!-- Breadcrumb Node Pill + Dropdown Container -->
                <div class="breadcrumb-node-pill relative inline-flex items-center">
                  <!-- Main Jump Button -->
                  <button
                    @click="locateNode(item.node)"
                    :class="[
                      'px-2 py-0.5 rounded-l text-xs font-medium transition-all max-w-44 truncate flex items-center gap-1 cursor-pointer',
                      idx === breadcrumbTrail.length - 1
                        ? 'bg-emerald-50 text-emerald-700 font-bold border border-emerald-300/80 shadow-2xs'
                        : 'text-gray-600 hover:text-emerald-700 hover:bg-gray-100'
                    ]"
                    :title="`定位至: ${item.text}`"
                  >
                    <span v-if="item.isRoot" class="text-[10px] bg-emerald-100 text-emerald-800 px-1 rounded">根</span>
                    <span class="truncate">{{ item.text || '未命名主题' }}</span>
                  </button>

                  <!-- Sibling Dropdown Trigger (for switching among peer nodes) -->
                  <button
                    v-if="item.siblings && item.siblings.length > 0"
                    @click.stop="toggleBreadcrumbDropdown(item.id, $event)"
                    :class="[
                      'breadcrumb-dropdown-trigger px-1 py-0.5 rounded-r text-xs transition-colors cursor-pointer border-l flex items-center justify-center',
                      idx === breadcrumbTrail.length - 1
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                        : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100 border-gray-200'
                    ]"
                    :title="`展开同级分支 (共 ${item.siblings.length} 个同级节点)`"
                  >
                    <ChevronDown
                      class="w-3 h-3 transition-transform"
                      :class="activeBreadcrumbDropdown === item.id ? 'rotate-180 text-emerald-600' : ''"
                    />
                  </button>
                </div>
              </div>
            </template>

            <template v-else>
              <span class="text-xs text-gray-400 italic">点击画布节点查看层级路径</span>
            </template>
          </div>

          <div
            id="minder-view-container"
            ref="minderContainerRef"
            class="km-minder-view w-full flex-1 cursor-grab active:cursor-grabbing outline-none relative"
            style="min-height: 0;"
          ></div>

        <!-- Floating Inline Node Text Editor -->
        <div
          v-if="isEditingNode"
          id="km-inline-node-editor"
          class="absolute z-30"
          :style="{
            left: `${inlineEditorPosition.left}px`,
            top: `${inlineEditorPosition.top}px`,
            minWidth: `${inlineEditorPosition.width}px`,
            minHeight: `${inlineEditorPosition.height}px`
          }"
        >
          <input
            ref="editingInputRef"
            v-model="editingNodeText"
            @blur="finishEditing(true)"
            @keydown.enter.stop.prevent="finishEditing(true)"
            @keydown.esc.stop.prevent="finishEditing(false)"
            @keydown.tab.stop.prevent="handleEditingTab"
            class="w-full h-full px-2 py-1 bg-white text-gray-900 font-medium text-xs sm:text-sm rounded-md shadow-lg border-2 border-emerald-500 outline-none ring-2 ring-emerald-500/20"
          />
        </div>

        <!-- Floating Minimap (小地图/鹰眼导航器) Widget -->
        <div class="absolute bottom-16 right-4 z-20 pointer-events-auto">
          <MindMapMinimap
            :minder="minderInstance"
            :is-open="isMinimapOpen"
            @update:is-open="isMinimapOpen = $event"
            @close="isMinimapOpen = false"
          />
        </div>

        <!-- Floating Bottom Right Canvas Controls -->
        <div class="absolute bottom-4 right-4 z-20 flex items-center gap-1 bg-white/95 backdrop-blur-xs p-1.5 rounded-xl shadow-lg border border-gray-200 select-none">
          <button
            @click="isMinimapOpen = !isMinimapOpen"
            :class="[
              'p-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-xs',
              isMinimapOpen ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-gray-100 text-gray-600'
            ]"
            title="切换小地图 (缩略全景与快速拖拽漫游)"
          >
            <MapIcon class="w-4 h-4" :class="isMinimapOpen ? 'text-emerald-600' : 'text-gray-500'" />
            <span class="text-[11px] font-medium hidden sm:inline">小地图</span>
          </button>
          <div class="h-4 w-px bg-gray-200 mx-0.5"></div>
          <button
            @click="zoomOut"
            class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors cursor-pointer"
            title="缩小 (Ctrl + -)"
          >
            <ZoomOut class="w-4 h-4" />
          </button>
          <span class="text-xs font-mono text-gray-700 font-semibold px-1 min-w-10 text-center">{{ zoomPercent }}%</span>
          <button
            @click="zoomIn"
            class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors cursor-pointer"
            title="放大 (Ctrl + +)"
          >
            <ZoomIn class="w-4 h-4" />
          </button>
          <div class="h-4 w-px bg-gray-200 mx-0.5"></div>
          <button
            @click="resetLayout"
            class="p-1.5 rounded-lg hover:bg-emerald-50 text-gray-600 hover:text-emerald-700 transition-colors cursor-pointer flex items-center gap-1 text-xs"
            title="重置布局 (恢复默认节点排布与整齐排列)"
          >
            <LayoutGrid class="w-4 h-4 text-emerald-600" />
            <span class="text-[11px] font-medium text-gray-700 hidden sm:inline">重置布局</span>
          </button>
          <div class="h-4 w-px bg-gray-200 mx-0.5"></div>
          <button
            @click="centerView"
            class="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 transition-colors cursor-pointer"
            title="居中视野"
          >
            <Compass class="w-4 h-4" />
          </button>
        </div>
      </div>
      </div>

      <!-- Editor Footer: Tags & Status -->
      <div class="h-10 px-6 bg-white border-t border-gray-100 flex items-center justify-between text-xs text-gray-400 shrink-0 select-none z-20">
        <!-- Tag List -->
        <div class="flex items-center gap-1.5 overflow-x-auto py-1 mr-4">
          <span
            v-for="tag in localTags"
            :key="tag"
            class="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-[11px] flex items-center gap-1 shrink-0"
          >
            #{{ tag }}
            <button @click="removeTag(tag)" class="hover:text-emerald-900 text-xs cursor-pointer">×</button>
          </span>
          <input
            v-model="newTagInput"
            @keydown.enter.prevent="addTag"
            placeholder="+ 添加导图标签 (回车)"
            class="bg-transparent border-none outline-none text-[11px] text-gray-600 placeholder-gray-300 w-28"
          />
        </div>

        <!-- Sync & Status -->
        <div class="flex items-center gap-4 shrink-0 text-gray-400 text-[11px]">
          <span v-if="selectedNodeText" class="text-gray-500 truncate max-w-48">
            选中: <strong class="text-gray-800">{{ selectedNodeText }}</strong>
          </span>
          <span class="flex items-center gap-1 text-emerald-600 font-medium">
            <Check class="w-3 h-3" /> {{ saveStatus }}
          </span>
        </div>
      </div>
    </div>

    <!-- Mind Map Search & Tree Navigation Window (搜索导航窗口) -->
    <div
      v-if="isSearchNavOpen"
      ref="searchNavContainerRef"
      class="absolute top-24 right-4 z-50 w-96 max-h-[calc(100vh-140px)] flex flex-col bg-white/95 backdrop-blur-md rounded-xl shadow-2xl border border-gray-200/90 overflow-hidden select-none animate-in fade-in zoom-in-95 duration-150"
    >
      <!-- Header -->
      <div class="px-3.5 py-2.5 bg-gray-50/90 border-b border-gray-100 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Compass class="w-4 h-4 text-emerald-600" />
          <span class="font-bold text-xs text-gray-800">导图节点搜索导航</span>
          <span
            v-if="searchKeyword"
            class="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-full font-medium"
          >
            共 {{ searchResults.length }} 处匹配
          </span>
        </div>
        <div class="flex items-center gap-1">
          <button
            @click="isSearchNavOpen = false"
            class="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 transition-colors cursor-pointer"
            title="关闭导航面板 (Esc)"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- Search Input & Quick Controls -->
      <div class="p-3 border-b border-gray-100 space-y-2 bg-white">
        <div class="relative flex items-center">
          <Search class="w-3.5 h-3.5 text-gray-400 absolute left-2.5 pointer-events-none" />
          <input
            ref="searchModalInputRef"
            v-model="searchKeyword"
            @keydown.enter.prevent="goToNextMatch"
            @keydown.shift.enter.prevent="goToPrevMatch"
            placeholder="输入搜索关键词... (Enter / Shift+Enter 切换)"
            class="w-full pl-8 pr-16 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-emerald-500 focus:bg-white transition-all text-gray-800 placeholder-gray-400"
          />
          <div class="absolute right-2 flex items-center gap-0.5">
            <button
              v-if="searchKeyword"
              @click="searchKeyword = ''"
              class="text-gray-400 hover:text-gray-600 p-0.5"
              title="清空"
            >
              <X class="w-3 h-3" />
            </button>
            <span v-if="searchResults.length > 0" class="text-[10px] font-mono text-gray-400 pl-1 border-l border-gray-200">
              {{ currentMatchIndex + 1 }}/{{ searchResults.length }}
            </span>
          </div>
        </div>

        <!-- Filter & View Switcher -->
        <div class="flex items-center justify-between text-[11px] text-gray-500 pt-0.5">
          <!-- View Modes -->
          <div class="flex items-center gap-1 bg-gray-100 p-0.5 rounded-md">
            <button
              @click="searchViewMode = 'tree'"
              :class="[
                'px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1',
                searchViewMode === 'tree'
                  ? 'bg-white text-emerald-700 shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              ]"
            >
              <GitBranch class="w-3 h-3" />
              <span>树形层级</span>
            </button>
            <button
              @click="searchViewMode = 'path'"
              :class="[
                'px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1',
                searchViewMode === 'path'
                  ? 'bg-white text-emerald-700 shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              ]"
            >
              <ListTree class="w-3 h-3" />
              <span>完整路径</span>
            </button>
          </div>

          <!-- Options & Step Buttons -->
          <div class="flex items-center gap-2">
            <label class="flex items-center gap-1 cursor-pointer select-none text-[11px] text-gray-600 hover:text-gray-900">
              <input type="checkbox" v-model="searchIncludeNotes" class="rounded text-emerald-600 focus:ring-0 cursor-pointer w-3 h-3" />
              <span>搜备注</span>
            </label>

            <div v-if="searchResults.length > 1" class="flex items-center gap-0.5 border-l border-gray-200 pl-1.5">
              <button
                @click="goToPrevMatch"
                class="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-900 cursor-pointer"
                title="上一个匹配项 (Shift+Enter)"
              >
                <ArrowUp class="w-3 h-3" />
              </button>
              <button
                @click="goToNextMatch"
                class="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-900 cursor-pointer"
                title="下一个匹配项 (Enter)"
              >
                <ArrowDown class="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Results Body -->
      <div class="flex-1 overflow-y-auto max-h-[380px] p-2 space-y-1">
        <!-- Empty State -->
        <div v-if="!searchKeyword.trim()" class="py-8 text-center text-xs text-gray-400 space-y-1">
          <Search class="w-6 h-6 mx-auto text-gray-300 stroke-1" />
          <p>输入关键词搜索导图主题与备注</p>
          <p class="text-[10px] text-gray-400">支持树形层级与路径定位</p>
        </div>

        <div v-else-if="searchResults.length === 0" class="py-8 text-center text-xs text-gray-400 space-y-1">
          <HelpCircle class="w-6 h-6 mx-auto text-amber-400 stroke-1" />
          <p>未找到匹配 “{{ searchKeyword }}” 的节点</p>
          <p class="text-[10px] text-gray-400">请尝试更换关键词或开启搜备注</p>
        </div>

        <!-- 1. Tree View Mode -->
        <template v-else-if="searchViewMode === 'tree'">
          <MindMapSearchTreeItem
            v-for="treeRoot in searchTree"
            :key="treeRoot.id"
            :item="treeRoot"
            :keyword="searchKeyword"
            :active-id="activeSelectedNodeId"
            @locate="locateNode"
            @toggle="toggleTreeNodeExpand"
          />
        </template>

        <!-- 2. Path List View Mode -->
        <template v-else>
          <div
            v-for="res in searchResults"
            :key="res.id"
            @click="locateNode(res.node)"
            :class="[
              'group p-2 rounded-lg cursor-pointer transition-all text-xs border space-y-1',
              activeSelectedNodeId === res.id
                ? 'bg-emerald-50/90 border-emerald-300 text-emerald-900 shadow-2xs'
                : 'bg-white hover:bg-gray-50 border-gray-100 text-gray-800'
            ]"
          >
            <!-- Breadcrumbs Path -->
            <div class="flex items-center gap-1 text-[10px] text-gray-400 font-mono truncate">
              <template v-for="(pName, pIdx) in res.path" :key="pIdx">
                <span class="truncate max-w-24">{{ pName }}</span>
                <span class="text-gray-300">/</span>
              </template>
              <span class="text-emerald-600 font-medium">当前</span>
            </div>

            <!-- Main Title with highlighted match -->
            <div class="font-medium flex items-center justify-between gap-1">
              <div class="truncate flex-1">
                <template v-for="(part, pIdx) in highlightMatch(res.text, searchKeyword)" :key="pIdx">
                  <mark
                    v-if="part.isMatch"
                    class="bg-amber-200 text-amber-900 rounded-xs px-0.5 font-semibold not-italic"
                  >
                    {{ part.text }}
                  </mark>
                  <span v-else>{{ part.text }}</span>
                </template>
              </div>

              <!-- Priority / Progress -->
              <div class="flex items-center gap-1 shrink-0">
                <span
                  v-if="res.priority"
                  class="w-3.5 h-3.5 rounded-full bg-red-100 text-red-700 text-[9px] font-bold flex items-center justify-center"
                >
                  {{ res.priority }}
                </span>
                <span
                  v-if="res.matchedField === 'note'"
                  class="text-[9px] bg-amber-100 text-amber-800 px-1 py-0.2 rounded font-normal"
                >
                  备注匹配
                </span>
              </div>
            </div>

            <!-- Note preview snippet if matched in note -->
            <div v-if="res.note" class="text-[11px] text-gray-500 bg-gray-50/80 p-1 rounded font-mono truncate">
              <FileText class="w-2.5 h-2.5 inline text-amber-500 mr-1" />
              <span>{{ res.note }}</span>
            </div>
          </div>
        </template>
      </div>

      <!-- Footer Help -->
      <div class="px-3 py-1.5 bg-gray-50 border-t border-gray-100 text-[10px] text-gray-400 flex items-center justify-between">
        <span>点击节点直接在导图中定位居中</span>
        <div class="flex items-center gap-2 font-mono">
          <span><kbd class="bg-white border border-gray-200 px-1 py-0.5 rounded shadow-2xs">Enter</kbd> 下一个</span>
          <span><kbd class="bg-white border border-gray-200 px-1 py-0.5 rounded shadow-2xs">Esc</kbd> 关闭</span>
        </div>
      </div>
    </div>

    <!-- Node Note Modal (备注) -->
    <div
      v-if="isNoteModalOpen"
      class="fixed inset-0 z-60 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
    >
      <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-5 border border-gray-200 space-y-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <FileText class="w-4 h-4 text-amber-500" />
            <h3 class="font-bold text-sm text-gray-900">节点备注</h3>
          </div>
          <button @click="isNoteModalOpen = false" class="text-gray-400 hover:text-gray-700">
            <X class="w-4 h-4" />
          </button>
        </div>
        <textarea
          ref="noteTextareaRef"
          v-model="nodeNoteText"
          @keydown.meta.enter="saveNodeNote"
          @keydown.ctrl.enter="saveNodeNote"
          placeholder="在此输入节点的详细 Markdown 备注信息... (支持 Ctrl+Enter 快捷保存)"
          rows="6"
          class="w-full p-3 text-xs sm:text-sm border border-gray-200 rounded-lg outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono resize-none"
        ></textarea>
        <div class="flex items-center justify-between pt-1">
          <button
            v-if="nodeNoteText"
            @click="clearNodeNote"
            class="px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-md cursor-pointer flex items-center gap-1 transition-colors"
          >
            <Trash2 class="w-3.5 h-3.5" />
            <span>清空备注</span>
          </button>
          <div v-else></div>

          <div class="flex items-center gap-2">
            <button
              @click="isNoteModalOpen = false"
              class="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-md cursor-pointer"
            >
              取消
            </button>
            <button
              @click="saveNodeNote"
              class="px-3.5 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md cursor-pointer shadow-xs"
            >
              保存备注
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Node Hyperlink Modal (超链接) -->
    <div
      v-if="isLinkModalOpen"
      class="fixed inset-0 z-60 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
    >
      <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-5 border border-gray-200 space-y-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <LinkIcon class="w-4 h-4 text-blue-500" />
            <h3 class="font-bold text-sm text-gray-900">插入超链接</h3>
          </div>
          <button @click="isLinkModalOpen = false" class="text-gray-400 hover:text-gray-700">
            <X class="w-4 h-4" />
          </button>
        </div>
        <div class="space-y-2">
          <div>
            <label class="text-xs text-gray-500 block mb-1">链接地址 (URL):</label>
            <input
              ref="linkInputRef"
              v-model="linkUrl"
              @keydown.enter.prevent="saveNodeLink"
              placeholder="https://..."
              class="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label class="text-xs text-gray-500 block mb-1">链接提示说明 (可选):</label>
            <input
              v-model="linkTitle"
              @keydown.enter.prevent="saveNodeLink"
              placeholder="例如：参考文档"
              class="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-emerald-500"
            />
          </div>
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button
            @click="isLinkModalOpen = false"
            class="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-md cursor-pointer"
          >
            取消
          </button>
          <button
            @click="saveNodeLink"
            class="px-3.5 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md cursor-pointer shadow-xs"
          >
            保存链接
          </button>
        </div>
      </div>
    </div>

    <!-- Markdown Mind Map Dual Editing Modal -->
    <MindMapMarkdownModal
      :is-open="isMarkdownModalOpen"
      :current-mind-data="currentMarkdownMindData"
      @close="isMarkdownModalOpen = false"
      @apply="handleApplyMarkdown"
    />

    <!-- Teleported Breadcrumb Sibling Dropdown Menu -->
    <Teleport to="body">
      <div
        v-if="activeBreadcrumbDropdown && activeBreadcrumbItem"
        id="breadcrumb-teleport-dropdown"
        class="fixed z-[99999] min-w-52 max-w-72 max-h-72 overflow-y-auto bg-white rounded-lg shadow-2xl border border-gray-200 py-1.5 animate-in fade-in zoom-in-95 duration-100 select-none text-xs"
        :style="{
          top: `${breadcrumbDropdownPos.top}px`,
          left: `${breadcrumbDropdownPos.left}px`
        }"
      >
        <div class="px-2.5 py-1 text-[10px] font-semibold text-gray-500 border-b border-gray-100 flex items-center justify-between bg-gray-50/80">
          <span class="flex items-center gap-1 text-gray-600">
            <ListTree class="w-3 h-3 text-emerald-600" />
            <span>同级分支</span>
          </span>
          <span class="text-emerald-700 font-mono bg-emerald-100/70 px-1.5 py-0.5 rounded text-[10px]">
            {{ activeBreadcrumbItem.siblings.length }} 个节点
          </span>
        </div>

        <div class="py-1">
          <button
            v-for="sibling in activeBreadcrumbItem.siblings"
            :key="sibling.id"
            @click="locateNode(sibling.node); closeBreadcrumbDropdown()"
            :class="[
              'w-full px-2.5 py-1.5 text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer',
              sibling.isActive
                ? 'bg-emerald-50 text-emerald-800 font-bold'
                : 'text-gray-700 hover:bg-emerald-50/50 hover:text-emerald-700'
            ]"
          >
            <span class="truncate">{{ sibling.text || '未命名主题' }}</span>
            <Check v-if="sibling.isActive" class="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style>
/* KityMinder Core SVG Layout & text editor */
.km-minder-view,
#minder-view-container {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  overflow: hidden !important;
  outline: none;
}

#minder-view-container svg {
  width: 100% !important;
  height: 100% !important;
  display: block !important;
  outline: none;
}

#minder-view-container .km-editor,
#minder-view-container .km-receiver {
  font-family: inherit;
}
</style>
