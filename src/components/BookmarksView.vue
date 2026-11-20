<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import {
  Bookmark as BookmarkIcon,
  Plus,
  Pin,
  Copy,
  Edit3,
  Trash2,
  FolderPlus,
  FolderInput,
  ChevronRight,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-vue-next';
import { Bookmark, BookmarkCategory } from '../types';
import { extractBookmarkHost } from '../utils/bookmarkHelpers';
import BookmarkFolderTreeItem from './BookmarkFolderTreeItem.vue';
import BookmarkIconBadge from './BookmarkIconBadge.vue';
import BookmarkModal from './BookmarkModal.vue';
import BookmarkCategoryModal from './BookmarkCategoryModal.vue';

const props = defineProps<{
  bookmarks: Bookmark[];
  categories: BookmarkCategory[];
  initialCategoryId?: string;
  highlightedBookmarkId?: string;
}>();

const emit = defineEmits<{
  (
    e: 'create-bookmark',
    input: {
      title?: string;
      url: string;
      description?: string;
      categoryId?: string;
      tags?: string[];
      isPinned?: boolean;
      iconUrl?: string;
    }
  ): void;
  (e: 'update-bookmark', id: string, updates: Partial<Bookmark>): void;
  (e: 'toggle-pin', id: string): void;
  (e: 'move-bookmark', bookmarkId: string, targetCategoryId: string): void;
  (e: 'request-delete-bookmark', bookmark: Bookmark): void;
  (e: 'request-batch-delete-bookmarks', ids: string[]): void;
  (e: 'batch-move-bookmarks', ids: string[], targetCategoryId: string): void;
  (e: 'batch-toggle-pin', ids: string[], forcePinned?: boolean): void;
  (e: 'toggle-category-collapse', id: string): void;
  (e: 'create-category', name: string, color?: string | null, parentId?: string | null): void;
  (
    e: 'update-category',
    id: string,
    updates: { name?: string; color?: string | null; parentId?: string | null }
  ): void;
  (
    e: 'request-delete-category',
    category: BookmarkCategory,
    bookmarkCount: number,
    subFolderCount: number
  ): void;
  (e: 'copy-success', message: string): void;
}>();

// Selected tree node: 'all' or a BookmarkCategory.id
const activeCategoryId = ref<string>(props.initialCategoryId || 'all');
const isTreeOpen = ref<boolean>(true);
const draggedOverCategoryId = ref<string | null>(null);

// Batch selection state
const selectedIds = ref<Set<string>>(new Set());
const lastSelectedIndex = ref<number | null>(null);
const isBatchMoveMenuOpen = ref<boolean>(false);
const batchMoveDropdownRef = ref<HTMLElement | null>(null);
const selectAllCheckboxRef = ref<HTMLInputElement | null>(null);

watch(
  () => props.initialCategoryId,
  (val) => {
    if (val !== undefined) {
      activeCategoryId.value = val || 'all';
    }
  }
);

// Fast lookup map for tree traversal
const categoryMap = computed(() => {
  const map = new Map<string, BookmarkCategory>();
  props.categories.forEach((c) => map.set(c.id, c));
  return map;
});

// Root categories (no parent or orphaned parent)
const rootCategories = computed(() =>
  props.categories
    .filter((c) => !c.parentId || !categoryMap.value.has(c.parentId))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
);

// Hierarchical flat options for batch move dropdown
interface MoveTargetOption {
  id: string;
  label: string;
  depth: number;
}

const moveTargetOptions = computed<MoveTargetOption[]>(() => {
  const result: MoveTargetOption[] = [];
  const catIds = new Set(props.categories.map((c) => c.id));
  const visited = new Set<string>();

  function walk(parentId: string | null, depth: number) {
    const siblings = props.categories
      .filter((c) => {
        const effectiveParent = c.parentId && catIds.has(c.parentId) ? c.parentId : null;
        return effectiveParent === parentId;
      })
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    for (const cat of siblings) {
      if (visited.has(cat.id)) continue;
      visited.add(cat.id);
      result.push({
        id: cat.id,
        label: cat.name,
        depth,
      });
      walk(cat.id, depth + 1);
    }
  }

  walk(null, 0);
  return result;
});

// Keep activeCategoryId valid if its folder was deleted
watch(
  () => props.categories,
  () => {
    if (activeCategoryId.value !== 'all' && !categoryMap.value.has(activeCategoryId.value)) {
      activeCategoryId.value = 'all';
    }
  },
  { deep: true }
);

function getDescendantCategoryIds(catId: string): string[] {
  const result: string[] = [];
  const visited = new Set<string>([catId]);
  const queue: string[] = [catId];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const c of props.categories) {
      if (c.parentId === curr && !visited.has(c.id)) {
        visited.add(c.id);
        result.push(c.id);
        queue.push(c.id);
      }
    }
  }
  return result;
}

// Memoized recursive bookmark count per folder
const categoryCountMap = computed(() => {
  const directCounts = new Map<string, number>();
  for (const bm of props.bookmarks) {
    if (bm.categoryId) {
      directCounts.set(bm.categoryId, (directCounts.get(bm.categoryId) || 0) + 1);
    }
  }

  const totalCounts = new Map<string, number>();
  for (const cat of props.categories) {
    const ids = [cat.id, ...getDescendantCategoryIds(cat.id)];
    let total = 0;
    for (const id of ids) {
      total += directCounts.get(id) || 0;
    }
    totalCounts.set(cat.id, total);
  }
  return totalCounts;
});

function getCategoryBookmarkCount(categoryId: string): number {
  return categoryCountMap.value.get(categoryId) || 0;
}

// Breadcrumb path for current folder selection
const folderBreadcrumbs = computed<BookmarkCategory[]>(() => {
  if (activeCategoryId.value === 'all') return [];
  const chain: BookmarkCategory[] = [];
  const visited = new Set<string>();
  let curr = categoryMap.value.get(activeCategoryId.value);
  while (curr && !visited.has(curr.id)) {
    visited.add(curr.id);
    chain.unshift(curr);
    curr = curr.parentId ? categoryMap.value.get(curr.parentId) : undefined;
  }
  return chain;
});

function getCategoryLabel(categoryId: string): string {
  if (!categoryId) return '';
  return categoryMap.value.get(categoryId)?.name || '';
}

// Filtered & sorted bookmarks (pinned float to top, then latest updated)
const displayedBookmarks = computed<Bookmark[]>(() => {
  let list = props.bookmarks;

  if (activeCategoryId.value !== 'all') {
    const allowedIds = new Set<string>([
      activeCategoryId.value,
      ...getDescendantCategoryIds(activeCategoryId.value),
    ]);
    list = list.filter((bm) => allowedIds.has(bm.categoryId));
  }

  return [...list].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return (b.updatedAtMs || 0) - (a.updatedAtMs || 0);
  });
});

// Clear selection when switching folder
watch(activeCategoryId, () => {
  selectedIds.value = new Set();
  lastSelectedIndex.value = null;
  isBatchMoveMenuOpen.value = false;
});

// Prune selection when bookmarks change (e.g. after delete or sync)
watch(
  displayedBookmarks,
  (list) => {
    if (selectedIds.value.size === 0) return;
    const validIds = new Set(list.map((b) => b.id));
    let changed = false;
    const next = new Set<string>();
    selectedIds.value.forEach((id) => {
      if (validIds.has(id)) {
        next.add(id);
      } else {
        changed = true;
      }
    });
    if (changed) {
      selectedIds.value = next;
    }
    if (next.size === 0) {
      isBatchMoveMenuOpen.value = false;
    }
  },
  { deep: false }
);

const selectedCount = computed(() => selectedIds.value.size);
const isAllSelected = computed(
  () =>
    displayedBookmarks.value.length > 0 &&
    selectedIds.value.size === displayedBookmarks.value.length
);
const isPartiallySelected = computed(
  () =>
    selectedIds.value.size > 0 &&
    selectedIds.value.size < displayedBookmarks.value.length
);

watch([isAllSelected, isPartiallySelected], () => {
  if (selectAllCheckboxRef.value) {
    selectAllCheckboxRef.value.indeterminate = isPartiallySelected.value;
  }
});

const areAllSelectedPinned = computed(() => {
  if (selectedIds.value.size === 0) return false;
  return displayedBookmarks.value
    .filter((bm) => selectedIds.value.has(bm.id))
    .every((bm) => bm.isPinned);
});

function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedIds.value = new Set();
  } else {
    selectedIds.value = new Set(displayedBookmarks.value.map((bm) => bm.id));
  }
  lastSelectedIndex.value = null;
}

function toggleSelectOne(id: string, index: number, e?: MouseEvent) {
  const next = new Set(selectedIds.value);
  if (e?.shiftKey && lastSelectedIndex.value !== null) {
    const start = Math.min(lastSelectedIndex.value, index);
    const end = Math.max(lastSelectedIndex.value, index);
    const shouldSelect = !next.has(id);
    for (let i = start; i <= end; i++) {
      const bm = displayedBookmarks.value[i];
      if (!bm) continue;
      if (shouldSelect) {
        next.add(bm.id);
      } else {
        next.delete(bm.id);
      }
    }
  } else {
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
  }
  selectedIds.value = next;
  lastSelectedIndex.value = index;
}

function clearSelection() {
  selectedIds.value = new Set();
  lastSelectedIndex.value = null;
  isBatchMoveMenuOpen.value = false;
}

function handleBatchMove(targetCategoryId: string) {
  const ids = Array.from(selectedIds.value);
  if (!ids.length) return;
  emit('batch-move-bookmarks', ids, targetCategoryId);
  clearSelection();
}

function handleBatchTogglePin() {
  const ids = Array.from(selectedIds.value);
  if (!ids.length) return;
  emit('batch-toggle-pin', ids, !areAllSelectedPinned.value);
  clearSelection();
}

function handleBatchDelete() {
  const ids = Array.from(selectedIds.value);
  if (!ids.length) return;
  isBatchMoveMenuOpen.value = false;
  emit('request-batch-delete-bookmarks', ids);
}

// Close batch move dropdown on outside click or Escape
function handleDocumentClick(e: MouseEvent) {
  if (
    isBatchMoveMenuOpen.value &&
    batchMoveDropdownRef.value &&
    !batchMoveDropdownRef.value.contains(e.target as Node)
  ) {
    isBatchMoveMenuOpen.value = false;
  }
}

function handleDocumentKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (isBatchMoveMenuOpen.value) {
      isBatchMoveMenuOpen.value = false;
    } else if (selectedIds.value.size > 0) {
      clearSelection();
    }
  }
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick);
  window.addEventListener('keydown', handleDocumentKeydown);
});

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick);
  window.removeEventListener('keydown', handleDocumentKeydown);
});

// Modals state
const isBookmarkModalOpen = ref(false);
const editingBookmark = ref<Bookmark | null>(null);

const isCategoryModalOpen = ref(false);
const editingCategory = ref<BookmarkCategory | null>(null);
const parentForNewCategory = ref<BookmarkCategory | null>(null);

function openCreateBookmark() {
  editingBookmark.value = null;
  isBookmarkModalOpen.value = true;
}

function openEditBookmark(bm: Bookmark) {
  editingBookmark.value = bm;
  isBookmarkModalOpen.value = true;
}

function handleBookmarkSubmit(payload: {
  id?: string;
  title: string;
  url: string;
  description: string;
  categoryId: string;
  tags: string[];
  isPinned: boolean;
  iconUrl?: string;
}) {
  if (payload.id) {
    emit('update-bookmark', payload.id, {
      title: payload.title,
      url: payload.url,
      description: payload.description,
      categoryId: payload.categoryId,
      tags: payload.tags,
      isPinned: payload.isPinned,
      iconUrl: payload.iconUrl,
    });
  } else {
    emit('create-bookmark', {
      title: payload.title,
      url: payload.url,
      description: payload.description,
      categoryId: payload.categoryId,
      tags: payload.tags,
      isPinned: payload.isPinned,
      iconUrl: payload.iconUrl,
    });
  }
  isBookmarkModalOpen.value = false;
  editingBookmark.value = null;
}

function openCreateCategory(parent?: BookmarkCategory | null) {
  editingCategory.value = null;
  parentForNewCategory.value = parent || null;
  isCategoryModalOpen.value = true;
}

function openEditCategory(cat: BookmarkCategory) {
  editingCategory.value = cat;
  parentForNewCategory.value = null;
  isCategoryModalOpen.value = true;
}

function handleCategorySubmit(payload: { id?: string; name: string; parentId: string | null }) {
  if (payload.id) {
    emit('update-category', payload.id, { name: payload.name });
  } else {
    emit('create-category', payload.name, null, payload.parentId);
  }
  isCategoryModalOpen.value = false;
  editingCategory.value = null;
  parentForNewCategory.value = null;
}

function handleDeleteCategory(cat: BookmarkCategory) {
  const descendantIds = getDescendantCategoryIds(cat.id);
  const count = getCategoryBookmarkCount(cat.id);
  emit('request-delete-category', cat, count, descendantIds.length);
}

// Drag-and-drop single or batch selected bookmarks into tree folders
function handleBookmarkDragStart(e: DragEvent, bm: Bookmark) {
  if (!e.dataTransfer) return;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('application/json', JSON.stringify({ type: 'bookmark', id: bm.id }));
}

function handleBookmarkDragEnd() {
  draggedOverCategoryId.value = null;
}

function moveDraggedBookmark(bookmarkId: string, targetCategoryId: string) {
  if (selectedIds.value.size > 1 && selectedIds.value.has(bookmarkId)) {
    emit('batch-move-bookmarks', Array.from(selectedIds.value), targetCategoryId);
    clearSelection();
  } else {
    emit('move-bookmark', bookmarkId, targetCategoryId);
  }
}

function handleRootDragOver(e: DragEvent) {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  draggedOverCategoryId.value = 'all';
}

function handleRootDragLeave() {
  if (draggedOverCategoryId.value === 'all') {
    draggedOverCategoryId.value = null;
  }
}

function handleRootDrop(e: DragEvent) {
  e.preventDefault();
  draggedOverCategoryId.value = null;
  const raw = e.dataTransfer?.getData('application/json');
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.type === 'bookmark' && parsed?.id) {
      moveDraggedBookmark(parsed.id, '');
    }
  } catch {}
}

function handleDropOnFolder(bookmarkId: string, targetCategoryId: string) {
  draggedOverCategoryId.value = null;
  moveDraggedBookmark(bookmarkId, targetCategoryId);
}

async function copyUrl(bm: Bookmark) {
  try {
    await navigator.clipboard.writeText(bm.url);
    emit('copy-success', `已复制链接：${extractBookmarkHost(bm.url)}`);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = bm.url;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    emit('copy-success', `已复制链接：${extractBookmarkHost(bm.url)}`);
  }
}

const showFolderColumn = computed(() => {
  if (activeCategoryId.value === 'all') return props.categories.length > 0;
  return getDescendantCategoryIds(activeCategoryId.value).length > 0;
});
</script>

<template>
  <div id="bookmarks-view" class="flex-1 flex min-h-0 overflow-hidden bg-white">
    <!-- Left Tree Navigation Pane -->
    <aside
      v-show="isTreeOpen"
      id="bookmarks-tree-pane"
      class="w-56 shrink-0 bg-[#F8FAFC] border-r border-gray-200/80 flex flex-col min-h-0 select-none"
    >
      <!-- Tree Header -->
      <div class="h-12 px-3 border-b border-gray-200/70 flex items-center justify-between shrink-0">
        <span class="text-xs font-semibold text-slate-600 tracking-wide">书签目录</span>
        <button
          id="btn-new-root-bookmark-folder"
          type="button"
          @click="openCreateCategory(null)"
          class="p-1 rounded-md text-slate-500 hover:text-blue-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
          title="新建根目录"
        >
          <FolderPlus class="w-4 h-4" />
        </button>
      </div>

      <!-- Tree List -->
      <div class="flex-1 overflow-y-auto p-2 space-y-0.5">
        <!-- All Bookmarks Root Node -->
        <div
          id="bookmark-tree-node-all"
          @click="activeCategoryId = 'all'"
          @dragover="handleRootDragOver"
          @dragleave="handleRootDragLeave"
          @drop="handleRootDrop"
          :class="[
            'flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[13px] cursor-pointer transition-colors',
            draggedOverCategoryId === 'all'
              ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-400'
              : activeCategoryId === 'all'
                ? 'bg-blue-50/90 text-blue-700 font-medium'
                : 'text-slate-700 hover:bg-slate-200/55',
          ]"
          title="查看全部书签（拖拽书签到此处可移回根目录）"
        >
          <BookmarkIcon
            class="w-4 h-4 shrink-0"
            :class="activeCategoryId === 'all' ? 'text-blue-600' : 'text-slate-400'"
          />
          <span class="flex-1 truncate">全部书签</span>
          <span
            class="text-[11px] tabular-nums shrink-0"
            :class="activeCategoryId === 'all' ? 'text-blue-600/80' : 'text-slate-400'"
          >
            {{ bookmarks.length }}
          </span>
        </div>

        <div v-if="rootCategories.length > 0" class="my-1.5 border-t border-gray-200/70"></div>

        <!-- Recursive Folder Tree -->
        <BookmarkFolderTreeItem
          v-for="cat in rootCategories"
          :key="cat.id"
          :category="cat"
          :all-categories="categories"
          :active-category-id="activeCategoryId"
          :level="0"
          :get-category-bookmark-count="getCategoryBookmarkCount"
          :dragged-over-category-id="draggedOverCategoryId"
          @select="(id) => (activeCategoryId = id)"
          @toggle-collapse="(id) => emit('toggle-category-collapse', id)"
          @add-subfolder="openCreateCategory"
          @edit="openEditCategory"
          @delete="handleDeleteCategory"
          @drag-over-category="(id) => (draggedOverCategoryId = id)"
          @drop-bookmark="handleDropOnFolder"
        />

        <!-- Empty Folder Tree Hint -->
        <div
          v-if="rootCategories.length === 0"
          class="px-3 py-6 text-center text-xs text-slate-400 leading-relaxed"
        >
          暂无目录，点击右上角创建树形书签目录
        </div>
      </div>
    </aside>

    <!-- Right Main Workspace (Container Query root for responsive columns) -->
    <section class="flex-1 flex flex-col min-w-0 min-h-0 bg-white @container">
      <!-- Top Toolbar (Switches cleanly to Contextual Batch Bar when items are selected) -->
      <div
        v-if="selectedCount > 0"
        id="bookmarks-batch-toolbar"
        class="h-12 px-4 border-b border-blue-200/80 bg-blue-50/75 flex items-center justify-between gap-2 shrink-0 overflow-x-auto"
      >
        <div class="flex items-center gap-2 min-w-0 shrink-0">
          <span class="text-xs font-semibold text-blue-700 tabular-nums whitespace-nowrap">
            已选 {{ selectedCount }} 项
          </span>
          <button
            id="btn-bookmark-batch-clear"
            type="button"
            @click="clearSelection"
            class="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:text-slate-900 hover:bg-white/80 rounded-md transition-colors cursor-pointer whitespace-nowrap"
          >
            <X class="w-3.5 h-3.5 shrink-0" />
            <span class="hidden @[480px]:inline">取消选择</span>
          </button>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <!-- Batch Move to Tree Folder Dropdown -->
          <div ref="batchMoveDropdownRef" class="relative">
            <button
              id="btn-bookmark-batch-move"
              type="button"
              @click.stop="isBatchMoveMenuOpen = !isBatchMoveMenuOpen"
              class="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-gray-200/90 rounded-lg transition-colors shadow-2xs cursor-pointer whitespace-nowrap"
            >
              <FolderInput class="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>移动到目录</span>
              <ChevronDown class="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>

            <div
              v-if="isBatchMoveMenuOpen"
              id="bookmark-batch-move-menu"
              class="absolute right-0 mt-1.5 w-56 max-h-64 overflow-y-auto bg-white rounded-xl shadow-lg border border-gray-200/90 py-1.5 z-30"
            >
              <button
                type="button"
                @click="handleBatchMove('')"
                class="w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 transition-colors cursor-pointer"
              >
                <BookmarkIcon class="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span class="truncate">根目录（不归属子目录）</span>
              </button>

              <div v-if="moveTargetOptions.length > 0" class="my-1 border-t border-gray-100"></div>

              <button
                v-for="opt in moveTargetOptions"
                :key="opt.id"
                type="button"
                @click="handleBatchMove(opt.id)"
                :style="{ paddingLeft: `${12 + opt.depth * 14}px` }"
                class="w-full pr-3 py-1.5 text-left text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                :title="opt.label"
              >
                <span v-if="opt.depth > 0" class="text-slate-300 text-[10px] shrink-0">└</span>
                <span class="truncate">{{ opt.label }}</span>
              </button>
            </div>
          </div>

          <!-- Batch Pin / Unpin -->
          <button
            id="btn-bookmark-batch-pin"
            type="button"
            @click="handleBatchTogglePin"
            class="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-gray-200/90 rounded-lg transition-colors shadow-2xs cursor-pointer whitespace-nowrap"
          >
            <Pin
              class="w-3.5 h-3.5 shrink-0"
              :class="areAllSelectedPinned ? 'text-amber-500 fill-amber-500/20' : 'text-slate-500'"
            />
            <span>{{ areAllSelectedPinned ? '取消置顶' : '批量置顶' }}</span>
          </button>

          <!-- Batch Permanent Delete -->
          <button
            id="btn-bookmark-batch-delete"
            type="button"
            @click="handleBatchDelete"
            class="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-red-600 bg-white hover:bg-red-50 border border-red-200/90 rounded-lg transition-colors shadow-2xs cursor-pointer whitespace-nowrap"
          >
            <Trash2 class="w-3.5 h-3.5 shrink-0" />
            <span>直接删除</span>
          </button>
        </div>
      </div>

      <!-- Default Clean Toolbar -->
      <div
        v-else
        id="bookmarks-default-toolbar"
        class="h-12 px-4 border-b border-gray-200/80 flex items-center justify-between gap-3 shrink-0"
      >
        <!-- Left: Tree Toggle + Breadcrumb + Count -->
        <div class="flex items-center gap-1.5 min-w-0">
          <button
            id="btn-toggle-bookmark-tree"
            type="button"
            @click="isTreeOpen = !isTreeOpen"
            class="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
            :title="isTreeOpen ? '收起书签目录' : '展开书签目录'"
          >
            <PanelLeftClose v-if="isTreeOpen" class="w-4 h-4" />
            <PanelLeftOpen v-else class="w-4 h-4" />
          </button>

          <nav class="flex items-center gap-1 text-sm min-w-0 overflow-hidden" aria-label="书签目录路径">
            <button
              type="button"
              @click="activeCategoryId = 'all'"
              :class="[
                'truncate whitespace-nowrap transition-colors cursor-pointer',
                folderBreadcrumbs.length === 0
                  ? 'font-semibold text-slate-900'
                  : 'text-slate-500 hover:text-blue-600',
              ]"
            >
              全部书签
            </button>

            <template v-for="(crumb, idx) in folderBreadcrumbs" :key="crumb.id">
              <ChevronRight class="w-3.5 h-3.5 text-slate-300 shrink-0" />
              <button
                type="button"
                @click="activeCategoryId = crumb.id"
                :class="[
                  'truncate whitespace-nowrap transition-colors cursor-pointer max-w-[160px]',
                  idx === folderBreadcrumbs.length - 1
                    ? 'font-semibold text-slate-900'
                    : 'text-slate-500 hover:text-blue-600',
                ]"
                :title="crumb.name"
              >
                {{ crumb.name }}
              </button>
            </template>
          </nav>

          <span class="text-xs text-slate-400 tabular-nums whitespace-nowrap shrink-0 ml-1">
            {{ displayedBookmarks.length }}
          </span>
        </div>

        <!-- Right: Primary Add CTA -->
        <button
          id="btn-add-bookmark"
          type="button"
          @click="openCreateBookmark"
          class="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg transition-colors shadow-2xs cursor-pointer shrink-0 whitespace-nowrap"
        >
          <Plus class="w-3.5 h-3.5 shrink-0" />
          <span>添加书签</span>
        </button>
      </div>

      <!-- Bookmarks List Body -->
      <div class="flex-1 overflow-auto">
        <!-- Empty State -->
        <div
          v-if="displayedBookmarks.length === 0"
          class="h-full min-h-[260px] flex flex-col items-center justify-center text-center px-4"
        >
          <div class="w-11 h-11 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
            <BookmarkIcon class="w-5 h-5" />
          </div>
          <p class="text-sm font-medium text-slate-700">当前目录暂无书签</p>
          <p class="text-xs text-slate-400 mt-1">
            添加常用网站，勾选支持批量移动、置顶或直接删除
          </p>
          <button
            type="button"
            @click="openCreateBookmark"
            class="mt-4 inline-flex items-center gap-1 px-3.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>添加书签</span>
          </button>
        </div>

        <!-- Clean List Table -->
        <div v-else id="bookmarks-list-container" class="flex flex-col min-w-[320px]">
          <!-- Sticky List Header -->
          <div
            class="sticky top-0 z-10 h-9 px-4 bg-slate-50/95 backdrop-blur-xs border-b border-gray-200/80 flex items-center gap-3 text-[11px] font-medium text-slate-500 select-none"
          >
            <input
              ref="selectAllCheckboxRef"
              id="checkbox-bookmarks-select-all"
              type="checkbox"
              :checked="isAllSelected"
              @change="toggleSelectAll"
              class="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
              title="全选 / 取消全选"
            />
            <span class="flex-1 min-w-[120px] truncate whitespace-nowrap">书签名称</span>
            <span
              v-if="showFolderColumn"
              class="hidden @[720px]:inline w-28 truncate whitespace-nowrap shrink-0"
            >
              所属目录
            </span>
            <span class="hidden @[540px]:inline w-40 @[760px]:w-48 truncate whitespace-nowrap shrink-0">
              网址
            </span>
            <span class="w-28 text-right whitespace-nowrap shrink-0">操作</span>
          </div>

          <!-- Bookmark Rows -->
          <div class="divide-y divide-gray-100">
            <div
              v-for="(bm, idx) in displayedBookmarks"
              :key="bm.id"
              :id="`bookmark-row-${bm.id}`"
              draggable="true"
              @dragstart="(e) => handleBookmarkDragStart(e, bm)"
              @dragend="handleBookmarkDragEnd"
              :class="[
                'group h-11 px-4 flex items-center gap-3 transition-colors',
                selectedIds.has(bm.id)
                  ? 'bg-blue-50/60 hover:bg-blue-50/80'
                  : highlightedBookmarkId === bm.id
                    ? 'bg-amber-50/60 hover:bg-amber-50/80'
                    : 'hover:bg-slate-50/85',
              ]"
            >
              <!-- Row Checkbox -->
              <input
                type="checkbox"
                :checked="selectedIds.has(bm.id)"
                @click.stop="(e) => toggleSelectOne(bm.id, idx, e)"
                class="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                :aria-label="`选择书签 ${bm.title}`"
              />

              <!-- Target Website Favicon + Pin + Title Link -->
              <div class="flex-1 min-w-[120px] flex items-center gap-2 overflow-hidden">
                <BookmarkIconBadge
                  :url="bm.url"
                  :title="bm.title"
                  :icon-url="bm.iconUrl"
                  size="sm"
                />

                <Pin
                  v-if="bm.isPinned"
                  class="w-3 h-3 text-amber-500 fill-amber-500/20 shrink-0"
                  title="已置顶"
                />

                <a
                  :href="bm.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="block flex-1 min-w-0 text-[13px] font-medium text-slate-800 hover:text-blue-600 truncate whitespace-nowrap transition-colors"
                  :title="`${bm.title}\n${bm.url}`"
                >
                  {{ bm.title }}
                </a>
              </div>

              <!-- Subtle Folder Column (shown when pane width >= 720px) -->
              <span
                v-if="showFolderColumn"
                class="hidden @[720px]:inline w-28 text-xs text-slate-400 truncate whitespace-nowrap shrink-0"
                :title="getCategoryLabel(bm.categoryId) || '根目录'"
              >
                {{ getCategoryLabel(bm.categoryId) || '根目录' }}
              </span>

              <!-- Clean Host Column (shown when pane width >= 540px) -->
              <span
                class="hidden @[540px]:inline w-40 @[760px]:w-48 text-xs font-mono text-slate-400 truncate whitespace-nowrap shrink-0"
                :title="bm.url"
              >
                {{ extractBookmarkHost(bm.url) }}
              </span>

              <!-- Compact Row Actions -->
              <div
                class="w-28 flex items-center justify-end gap-0.5 shrink-0 opacity-75 group-hover:opacity-100 transition-opacity"
              >
                <button
                  type="button"
                  @click="emit('toggle-pin', bm.id)"
                  class="p-1.5 rounded-md transition-colors cursor-pointer"
                  :class="
                    bm.isPinned
                      ? 'text-amber-500 hover:bg-amber-50'
                      : 'text-slate-400 hover:text-amber-500 hover:bg-slate-200/60'
                  "
                  :title="bm.isPinned ? '取消置顶' : '置顶书签'"
                >
                  <Pin class="w-3.5 h-3.5" :class="bm.isPinned ? 'fill-amber-500/20' : ''" />
                </button>
                <button
                  type="button"
                  @click="copyUrl(bm)"
                  class="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
                  title="复制链接"
                >
                  <Copy class="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  @click="openEditBookmark(bm)"
                  class="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
                  title="编辑书签"
                >
                  <Edit3 class="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  @click="emit('request-delete-bookmark', bm)"
                  class="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                  title="直接删除"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Add / Edit Bookmark Modal -->
    <BookmarkModal
      v-if="isBookmarkModalOpen"
      :bookmark="editingBookmark"
      :categories="categories"
      :default-category-id="activeCategoryId === 'all' ? '' : activeCategoryId"
      @close="isBookmarkModalOpen = false"
      @submit="handleBookmarkSubmit"
    />

    <!-- Create / Rename Bookmark Folder Modal -->
    <BookmarkCategoryModal
      v-if="isCategoryModalOpen"
      :category="editingCategory"
      :parent-category="parentForNewCategory"
      :existing-categories="categories"
      @close="isCategoryModalOpen = false"
      @submit="handleCategorySubmit"
    />
  </div>
</template>
