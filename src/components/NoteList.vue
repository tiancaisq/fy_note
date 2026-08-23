<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import {
  Plus,
  ArrowUpDown,
  Filter,
  MoreHorizontal,
  Star,
  Box,
  Share2,
  Trash2,
  RotateCcw,
  Download,
  FolderInput,
  Edit2,
  Copy,
  ChevronRight,
  ChevronDown,
  Check,
  Minus,
  Clock,
  ExternalLink,
  AppWindow,
  X
} from 'lucide-vue-next';
import { Note, SortField, SortOrder, FilterOptions, ViewType, BreadcrumbItem } from '../types';
import FileFormatIcon from './icons/FileFormatIcon.vue';
import MindmapIcon from './icons/MindmapIcon.vue';
import DrawioIcon from './icons/DrawioIcon.vue';

const props = defineProps<{
  notes: Note[];
  breadcrumbItems: BreadcrumbItem[];
  currentView: ViewType;
  sortField: SortField;
  sortOrder: SortOrder;
  filterOptions: FilterOptions;
}>();

const emit = defineEmits<{
  (e: 'openNote', note: Note): void;
  (e: 'openNoteInCurrentWindow', note: Note): void;
  (e: 'openNoteInNewTab', note: Note): void;
  (e: 'createNewNote'): void;
  (e: 'createNewMindMap'): void;
  (e: 'createNewDrawio'): void;
  (e: 'breadcrumbClick', item: BreadcrumbItem): void;
  (e: 'toggleStar', noteId: string): void;
  (e: 'toggleFavorite', noteId: string): void;
  (e: 'moveToTrash', noteId: string): void;
  (e: 'restoreFromTrash', noteId: string): void;
  (e: 'permanentlyDelete', noteId: string): void;
  (e: 'emptyTrash'): void;
  (e: 'openShareModal', note: Note): void;
  (e: 'openMoveModal', note: Note): void;
  (e: 'duplicateNote', note: Note): void;
  (e: 'exportNote', note: Note): void;
  (e: 'renameNote', note: Note): void;
  (e: 'switchToTimeline'): void;
  (e: 'update:sortField', val: SortField): void;
  (e: 'update:sortOrder', val: SortOrder): void;
  (e: 'update:filterOptions', val: FilterOptions): void;
  // Batch action events
  (e: 'batchMove', notes: Note[]): void;
  (e: 'batchToggleStar', noteIds: string[]): void;
  (e: 'batchToggleFavorite', noteIds: string[]): void;
  (e: 'batchMoveToTrash', noteIds: string[]): void;
  (e: 'batchRestoreFromTrash', noteIds: string[]): void;
  (e: 'batchPermanentlyDelete', noteIds: string[]): void;
  (e: 'batchExport', notes: Note[]): void;
}>();

const activeDropdownNoteId = ref<string | null>(null);
const isSortMenuOpen = ref(false);
const isFilterMenuOpen = ref(false);
const isHeaderNewMenuOpen = ref(false);

const headerNewMenuRef = ref<HTMLElement | null>(null);
const sortMenuRef = ref<HTMLElement | null>(null);
const filterMenuRef = ref<HTMLElement | null>(null);

// Multi-Selection State
const selectedNoteIds = ref<string[]>([]);
const lastSelectedIndex = ref<number | null>(null);

// Clear selection when view changes
watch(
  () => props.currentView,
  () => {
    selectedNoteIds.value = [];
    lastSelectedIndex.value = null;
  }
);

// Keep only valid note IDs when notes list changes
watch(
  () => props.notes,
  (newNotes) => {
    const validIds = new Set(newNotes.map((n) => n.id));
    selectedNoteIds.value = selectedNoteIds.value.filter((id) => validIds.has(id));
  }
);

const isAllSelected = computed(() => {
  if (props.notes.length === 0) return false;
  return props.notes.every((n) => selectedNoteIds.value.includes(n.id));
});

const isIndeterminate = computed(() => {
  return selectedNoteIds.value.length > 0 && !isAllSelected.value;
});

const selectedNotes = computed(() => {
  const set = new Set(selectedNoteIds.value);
  return props.notes.filter((n) => set.has(n.id));
});

function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedNoteIds.value = [];
  } else {
    selectedNoteIds.value = props.notes.map((n) => n.id);
  }
}

function clearSelection() {
  selectedNoteIds.value = [];
  lastSelectedIndex.value = null;
}

function toggleSelectNote(noteId: string, e?: MouseEvent) {
  const currentIndex = props.notes.findIndex((n) => n.id === noteId);

  // Range selection with Shift key
  if (e?.shiftKey && lastSelectedIndex.value !== null && currentIndex !== -1) {
    const start = Math.min(lastSelectedIndex.value, currentIndex);
    const end = Math.max(lastSelectedIndex.value, currentIndex);
    const rangeIds = props.notes.slice(start, end + 1).map((n) => n.id);
    const combined = new Set([...selectedNoteIds.value, ...rangeIds]);
    selectedNoteIds.value = Array.from(combined);
  } else {
    const index = selectedNoteIds.value.indexOf(noteId);
    if (index > -1) {
      selectedNoteIds.value = selectedNoteIds.value.filter((id) => id !== noteId);
    } else {
      selectedNoteIds.value = [...selectedNoteIds.value, noteId];
    }
  }

  if (currentIndex !== -1) {
    lastSelectedIndex.value = currentIndex;
  }
}

function isNoteSelected(noteId: string): boolean {
  return selectedNoteIds.value.includes(noteId);
}

function toggleRowMenu(e: MouseEvent, noteId: string) {
  e.stopPropagation();
  isSortMenuOpen.value = false;
  isFilterMenuOpen.value = false;
  isHeaderNewMenuOpen.value = false;
  activeDropdownNoteId.value = activeDropdownNoteId.value === noteId ? null : noteId;
}

function handleRowClick(note: Note, e: MouseEvent) {
  // If Shift or Ctrl/Cmd is pressed, toggle selection instead of opening
  if (e.shiftKey || e.ctrlKey || e.metaKey) {
    toggleSelectNote(note.id, e);
    return;
  }

  if (props.currentView !== 'trash') {
    emit('openNote', note);
  }
}

function handleNoteDragStart(note: Note, e: DragEvent) {
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    // If dragging a selected note while multiple are selected, include all selected IDs
    if (selectedNoteIds.value.includes(note.id) && selectedNoteIds.value.length > 1) {
      e.dataTransfer.setData(
        'application/json',
        JSON.stringify({ type: 'batchNotes', ids: selectedNoteIds.value })
      );
    } else {
      e.dataTransfer.setData('application/json', JSON.stringify({ type: 'note', id: note.id }));
    }
  }
}

function setSort(field: SortField, order: SortOrder) {
  emit('update:sortField', field);
  emit('update:sortOrder', order);
  isSortMenuOpen.value = false;
}

function toggleFilter(key: 'starredOnly' | 'favoriteOnly') {
  emit('update:filterOptions', {
    ...props.filterOptions,
    [key]: !props.filterOptions[key],
  });
}

function handleDocumentClick(e: MouseEvent) {
  const target = e.target as Node;

  // Auto close note row more-actions dropdown if clicking outside
  if (activeDropdownNoteId.value) {
    const dropdownEl = document.getElementById(`dropdown-menu-${activeDropdownNoteId.value}`);
    const triggerEl = document.getElementById(`btn-more-actions-${activeDropdownNoteId.value}`);
    if (
      dropdownEl &&
      !dropdownEl.contains(target) &&
      triggerEl &&
      !triggerEl.contains(target)
    ) {
      activeDropdownNoteId.value = null;
    }
  }

  // Auto close header new menu
  if (isHeaderNewMenuOpen.value && headerNewMenuRef.value && !headerNewMenuRef.value.contains(target)) {
    isHeaderNewMenuOpen.value = false;
  }

  // Auto close sort menu
  if (isSortMenuOpen.value && sortMenuRef.value && !sortMenuRef.value.contains(target)) {
    isSortMenuOpen.value = false;
  }

  // Auto close filter menu
  if (isFilterMenuOpen.value && filterMenuRef.value && !filterMenuRef.value.contains(target)) {
    isFilterMenuOpen.value = false;
  }
}

function handleDocumentKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (activeDropdownNoteId.value) {
      activeDropdownNoteId.value = null;
    } else if (selectedNoteIds.value.length > 0) {
      clearSelection();
    }
    isSortMenuOpen.value = false;
    isFilterMenuOpen.value = false;
    isHeaderNewMenuOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('keydown', handleDocumentKeyDown);
});

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick);
  document.removeEventListener('keydown', handleDocumentKeyDown);
});
</script>

<template>
  <main id="notes-content-area" class="flex-1 flex flex-col bg-white overflow-hidden select-none">
    <!-- Top Breadcrumb & Action Toolbar -->
    <div id="notes-header-toolbar" class="px-6 py-3.5 flex items-center justify-between border-b border-gray-100 shrink-0 bg-white">
      <!-- Clickable Breadcrumb Navigation -->
      <div id="breadcrumb-navigation" class="flex items-center gap-1.5 text-sm tracking-tight overflow-x-auto">
        <template v-for="(item, index) in breadcrumbItems" :key="item.id">
          <!-- Chevron Separator -->
          <ChevronRight v-if="index > 0" class="w-3.5 h-3.5 text-gray-400 shrink-0" />

          <!-- Breadcrumb Link / Label -->
          <button
            v-if="item.clickable"
            @click="emit('breadcrumbClick', item)"
            class="text-gray-500 hover:text-blue-600 hover:underline font-medium transition-colors cursor-pointer truncate"
            :title="'跳转到 ' + item.label"
          >
            {{ item.label }}
          </button>
          <span v-else class="font-bold text-gray-900 truncate">
            {{ item.label }}
          </span>
        </template>

        <span class="text-xs font-normal text-gray-400 ml-2 shrink-0">({{ notes.length }} 篇)</span>
      </div>

      <!-- Right Action Tools: + 新建, ⇅ Sort, Filter -->
      <div id="notes-header-tools" class="flex items-center gap-3 relative shrink-0">
        <!-- "+ 新建" Dropdown Button -->
        <div v-if="currentView !== 'trash'" ref="headerNewMenuRef" class="relative">
          <button
            id="btn-header-new-note"
            @click="isHeaderNewMenuOpen = !isHeaderNewMenuOpen; isSortMenuOpen = false; isFilterMenuOpen = false; activeDropdownNoteId = null;"
            class="flex items-center gap-1 text-sm text-gray-700 hover:text-blue-600 font-medium px-2 py-1 rounded hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <Plus class="w-4 h-4" />
            <span>新建</span>
            <ChevronDown class="w-3 h-3 text-gray-400" />
          </button>

          <!-- Header New Dropdown Menu -->
          <div
            v-if="isHeaderNewMenuOpen"
            class="absolute right-0 mt-1.5 w-44 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-40 text-xs animate-in fade-in zoom-in-95 duration-100 space-y-0.5"
            @click.stop
          >
            <button
              @click="emit('createNewNote'); isHeaderNewMenuOpen = false;"
              class="w-full px-3 py-2 text-left hover:bg-orange-50/60 flex items-center gap-2 text-gray-700 hover:text-orange-600 cursor-pointer"
            >
              <FileFormatIcon format="markdown" size="xs" />
              <span>新建 Markdown 笔记</span>
            </button>
            <button
              @click="emit('createNewMindMap'); isHeaderNewMenuOpen = false;"
              class="w-full px-3 py-2 text-left hover:bg-emerald-50/60 flex items-center gap-2 text-gray-700 hover:text-emerald-600 cursor-pointer"
            >
              <MindmapIcon size="xs" />
              <span>新建思维导图</span>
            </button>
            <button
              @click="emit('createNewDrawio'); isHeaderNewMenuOpen = false;"
              class="w-full px-3 py-2 text-left hover:bg-amber-50/60 flex items-center gap-2 text-gray-700 hover:text-amber-700 cursor-pointer"
            >
              <DrawioIcon size="xs" />
              <span>新建 Draw.io 图表</span>
            </button>
          </div>
        </div>

        <!-- Empty Trash Button (when in trash view) -->
        <button
          v-if="currentView === 'trash' && notes.length > 0"
          @click="emit('emptyTrash')"
          class="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-medium px-2.5 py-1 rounded bg-red-50 hover:bg-red-100 transition-colors cursor-pointer"
        >
          <Trash2 class="w-3.5 h-3.5" />
          <span>清空回收站</span>
        </button>

        <!-- Timeline View Button -->
        <button
          id="btn-goto-timeline"
          @click="emit('switchToTimeline')"
          class="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer flex items-center gap-1"
          title="切换至文件时间线视图"
        >
          <Clock class="w-4 h-4" />
          <span class="text-xs hidden sm:inline">时间线</span>
        </button>

        <!-- Sort Icon Button: ⇅ -->
        <div ref="sortMenuRef" class="relative">
          <button
            id="btn-sort-menu"
            @click="isSortMenuOpen = !isSortMenuOpen; isFilterMenuOpen = false; isHeaderNewMenuOpen = false; activeDropdownNoteId = null;"
            class="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors cursor-pointer"
            title="排序方式"
          >
            <ArrowUpDown class="w-4 h-4" />
          </button>

          <!-- Sort Dropdown -->
          <div
            v-if="isSortMenuOpen"
            class="absolute right-0 mt-2 w-44 bg-white rounded-lg shadow-xl border border-gray-100 py-1.5 z-40 text-xs animate-in fade-in zoom-in-95 duration-100"
            @click.stop
          >
            <div class="px-3 py-1 font-semibold text-gray-400 text-[11px] border-b border-gray-50">排序方式</div>
            <button
              @click="setSort('createdAt', 'desc')"
              class="w-full px-3 py-1.5 text-left text-gray-700 hover:bg-gray-50 flex items-center justify-between cursor-pointer"
            >
              <span>创建时间 (最新优先)</span>
              <Check v-if="sortField === 'createdAt' && sortOrder === 'desc'" class="w-3.5 h-3.5 text-blue-600" />
            </button>
            <button
              @click="setSort('createdAt', 'asc')"
              class="w-full px-3 py-1.5 text-left text-gray-700 hover:bg-gray-50 flex items-center justify-between cursor-pointer"
            >
              <span>创建时间 (最早优先)</span>
              <Check v-if="sortField === 'createdAt' && sortOrder === 'asc'" class="w-3.5 h-3.5 text-blue-600" />
            </button>
            <button
              @click="setSort('updatedAt', 'desc')"
              class="w-full px-3 py-1.5 text-left text-gray-700 hover:bg-gray-50 flex items-center justify-between cursor-pointer"
            >
              <span>最后修改时间</span>
              <Check v-if="sortField === 'updatedAt' && sortOrder === 'desc'" class="w-3.5 h-3.5 text-blue-600" />
            </button>
            <button
              @click="setSort('title', 'asc')"
              class="w-full px-3 py-1.5 text-left text-gray-700 hover:bg-gray-50 flex items-center justify-between cursor-pointer"
            >
              <span>文件名 (A - Z)</span>
              <Check v-if="sortField === 'title' && sortOrder === 'asc'" class="w-3.5 h-3.5 text-blue-600" />
            </button>
          </div>
        </div>

        <!-- Filter Icon Button: T / Funnel -->
        <div ref="filterMenuRef" class="relative">
          <button
            id="btn-filter-menu"
            @click="isFilterMenuOpen = !isFilterMenuOpen; isSortMenuOpen = false; isHeaderNewMenuOpen = false; activeDropdownNoteId = null;"
            class="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors cursor-pointer"
            title="筛选视图"
          >
            <Filter class="w-4 h-4" />
          </button>

          <!-- Filter Dropdown -->
          <div
            v-if="isFilterMenuOpen"
            class="absolute right-0 mt-2 w-40 bg-white rounded-lg shadow-xl border border-gray-100 py-1.5 z-40 text-xs animate-in fade-in zoom-in-95 duration-100"
            @click.stop
          >
            <div class="px-3 py-1 font-semibold text-gray-400 text-[11px] border-b border-gray-50">过滤条件</div>
            <button
              @click="toggleFilter('starredOnly')"
              class="w-full px-3 py-1.5 text-left text-gray-700 hover:bg-gray-50 flex items-center justify-between cursor-pointer"
            >
              <span>仅看标星笔记</span>
              <Check v-if="filterOptions.starredOnly" class="w-3.5 h-3.5 text-blue-600" />
            </button>
            <button
              @click="toggleFilter('favoriteOnly')"
              class="w-full px-3 py-1.5 text-left text-gray-700 hover:bg-gray-50 flex items-center justify-between cursor-pointer"
            >
              <span>仅看收藏笔记</span>
              <Check v-if="filterOptions.favoriteOnly" class="w-3.5 h-3.5 text-blue-600" />
            </button>
            <div class="h-px bg-gray-100 my-1"></div>
            <div class="px-3 py-0.5 font-semibold text-gray-400 text-[10px] uppercase">格式筛选</div>
            <button
              @click="emit('update:filterOptions', { ...filterOptions, format: 'all' })"
              class="w-full px-3 py-1.5 text-left text-gray-700 hover:bg-gray-50 flex items-center justify-between cursor-pointer"
            >
              <span>全部格式</span>
              <Check v-if="filterOptions.format === 'all' || !filterOptions.format" class="w-3.5 h-3.5 text-blue-600" />
            </button>
            <button
              @click="emit('update:filterOptions', { ...filterOptions, format: 'markdown' })"
              class="w-full px-3 py-1.5 text-left text-gray-700 hover:bg-gray-50 flex items-center justify-between cursor-pointer"
            >
              <span>仅 Markdown</span>
              <Check v-if="filterOptions.format === 'markdown'" class="w-3.5 h-3.5 text-blue-600" />
            </button>
            <button
              @click="emit('update:filterOptions', { ...filterOptions, format: 'mindmap' })"
              class="w-full px-3 py-1.5 text-left text-gray-700 hover:bg-gray-50 flex items-center justify-between cursor-pointer"
            >
              <span>仅思维导图</span>
              <Check v-if="filterOptions.format === 'mindmap'" class="w-3.5 h-3.5 text-blue-600" />
            </button>
            <button
              @click="emit('update:filterOptions', { ...filterOptions, format: 'drawio' })"
              class="w-full px-3 py-1.5 text-left text-gray-700 hover:bg-gray-50 flex items-center justify-between cursor-pointer"
            >
              <span>仅 Draw.io 图表</span>
              <Check v-if="filterOptions.format === 'drawio'" class="w-3.5 h-3.5 text-blue-600" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Batch Operations Floating Banner Bar (Displays when items are selected) -->
    <div
      v-if="selectedNoteIds.length > 0"
      id="batch-actions-bar"
      class="bg-blue-50/95 border-b border-blue-200 px-6 py-2.5 flex items-center justify-between gap-3 text-xs text-blue-900 shrink-0 animate-in slide-in-from-top-1 duration-150 shadow-xs z-10"
    >
      <div class="flex items-center gap-2">
        <span class="inline-flex items-center justify-center bg-blue-600 text-white font-bold px-2 py-0.5 rounded-full text-[11px] shadow-2xs">
          已选 {{ selectedNoteIds.length }} 项
        </span>
        <span class="text-blue-700 hidden sm:inline text-xs">
          (共 {{ notes.length }} 篇)
        </span>
        <button
          @click="toggleSelectAll"
          class="ml-1 text-xs text-blue-700 hover:text-blue-900 hover:underline cursor-pointer font-medium"
        >
          {{ isAllSelected ? '取消全选' : '全选所有' }}
        </button>
      </div>

      <!-- Action Buttons for Selected Notes -->
      <div class="flex items-center gap-1.5 flex-wrap justify-end">
        <!-- If non-trash view -->
        <template v-if="currentView !== 'trash'">
          <!-- Batch Move to Folder -->
          <button
            @click="emit('batchMove', selectedNotes)"
            class="px-2.5 py-1.5 bg-white hover:bg-blue-100/80 border border-blue-200 text-blue-800 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
            title="批量移动至指定文件夹"
          >
            <FolderInput class="w-3.5 h-3.5 text-blue-600" />
            <span>移动至...</span>
          </button>

          <!-- Batch Star / Unstar -->
          <button
            @click="emit('batchToggleStar', selectedNoteIds)"
            class="px-2.5 py-1.5 bg-white hover:bg-amber-50 border border-amber-200 text-amber-800 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
            title="批量标星/取消标星"
          >
            <Star class="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
            <span class="hidden md:inline">标星/取消</span>
          </button>

          <!-- Batch Favorite / Unfavorite -->
          <button
            @click="emit('batchToggleFavorite', selectedNoteIds)"
            class="px-2.5 py-1.5 bg-white hover:bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
            title="批量收藏/移出收藏"
          >
            <Box class="w-3.5 h-3.5 text-indigo-600" />
            <span class="hidden md:inline">收藏/取消</span>
          </button>

          <!-- Batch Export -->
          <button
            @click="emit('batchExport', selectedNotes)"
            class="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-gray-200 text-gray-700 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
            title="批量导出文件"
          >
            <Download class="w-3.5 h-3.5 text-gray-600" />
            <span>导出 ({{ selectedNoteIds.length }})</span>
          </button>

          <!-- Batch Move to Trash -->
          <button
            @click="emit('batchMoveToTrash', selectedNoteIds)"
            class="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
            title="批量移入回收站"
          >
            <Trash2 class="w-3.5 h-3.5 text-red-600" />
            <span>移入回收站</span>
          </button>
        </template>

        <!-- If trash view -->
        <template v-else>
          <!-- Batch Restore -->
          <button
            @click="emit('batchRestoreFromTrash', selectedNoteIds)"
            class="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
            title="批量还原选中的笔记"
          >
            <RotateCcw class="w-3.5 h-3.5 text-emerald-600" />
            <span>批量还原</span>
          </button>

          <!-- Batch Permanent Delete -->
          <button
            @click="emit('batchPermanentlyDelete', selectedNoteIds)"
            class="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
            title="批量彻底删除选中的笔记"
          >
            <Trash2 class="w-3.5 h-3.5 text-red-600" />
            <span>彻底删除</span>
          </button>
        </template>

        <!-- Clear Selection Button -->
        <button
          @click="clearSelection"
          class="p-1 text-gray-400 hover:text-gray-700 hover:bg-white/80 rounded transition-colors cursor-pointer ml-1"
          title="取消多选 (Esc)"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Notes Table / List (Matches exact columns & styling) -->
    <div id="notes-table-container" class="flex-1 overflow-y-auto">
      <!-- Table Header with Checkbox -->
      <div id="notes-table-header" class="grid grid-cols-12 px-6 py-2.5 text-xs text-gray-500 font-medium border-b border-gray-100 items-center bg-gray-50/50">
        <!-- Checkbox + File Name Column -->
        <div class="col-span-7 md:col-span-7 flex items-center gap-3">
          <button
            type="button"
            @click.stop="toggleSelectAll"
            class="w-4 h-4 rounded border flex items-center justify-center transition-colors cursor-pointer shrink-0"
            :class="[
              isAllSelected || isIndeterminate
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'border-gray-300 bg-white hover:border-blue-400'
            ]"
            :title="isAllSelected ? '取消全选' : '全选所有'"
          >
            <Check v-if="isAllSelected" class="w-3 h-3 stroke-[3]" />
            <Minus v-else-if="isIndeterminate" class="w-3 h-3 stroke-[3]" />
          </button>

          <span>文件名</span>
        </div>

        <!-- Created Time Column -->
        <div class="col-span-3 md:col-span-3">创建时间</div>

        <!-- More Operations Column -->
        <div class="col-span-2 text-right pr-2">更多操作</div>
      </div>

      <!-- Empty State -->
      <div v-if="notes.length === 0" id="notes-empty-state" class="py-20 flex flex-col items-center justify-center text-center">
        <div class="w-14 h-14 rounded-full bg-blue-50 text-blue-400 flex items-center justify-center mb-3">
          <Edit2 class="w-6 h-6" />
        </div>
        <p class="text-sm font-medium text-gray-700">当前没有内容</p>
        <p class="text-xs text-gray-400 mt-1">创建第一篇 Markdown 笔记或思维导图</p>
        <div v-if="currentView !== 'trash'" class="mt-4 flex items-center gap-3">
          <button
            @click="emit('createNewNote')"
            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>新建笔记</span>
          </button>
          <button
            @click="emit('createNewMindMap')"
            class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <MindmapIcon size="xs" />
            <span>新建思维导图</span>
          </button>
        </div>
      </div>

      <!-- Table Rows List -->
      <div v-else class="divide-y divide-gray-50">
        <div
          v-for="note in notes"
          :key="note.id"
          :id="'note-row-' + note.id"
          draggable="true"
          @dragstart="handleNoteDragStart(note, $event)"
          @click="handleRowClick(note, $event)"
          class="grid grid-cols-12 px-6 py-3 items-center text-sm group transition-colors cursor-pointer relative"
          :class="[
            isNoteSelected(note.id)
              ? 'bg-blue-50/70 hover:bg-blue-50/90 border-l-2 border-l-blue-600 pl-[22px]'
              : 'hover:bg-[#f8fafc]'
          ]"
        >
          <!-- Column 1: Checkbox + File Name with Badge Icon (Markdown orange or Mindmap green) -->
          <div class="col-span-7 md:col-span-7 flex items-center gap-3 truncate pr-2">
            <!-- Row Multi-Select Checkbox -->
            <button
              type="button"
              @click.stop="toggleSelectNote(note.id, $event)"
              class="w-4 h-4 rounded border flex items-center justify-center transition-colors cursor-pointer shrink-0"
              :class="[
                isNoteSelected(note.id)
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'border-gray-300 bg-white hover:border-blue-400 group-hover:border-gray-400'
              ]"
              :title="isNoteSelected(note.id) ? '取消选择' : '选择此项 (支持 Shift 连续多选)'"
            >
              <Check v-if="isNoteSelected(note.id)" class="w-3 h-3 stroke-[3]" />
            </button>

            <FileFormatIcon :format="note.format || note.type" size="sm" />

            <!-- Title & Star/Favorite/Shared Indicators -->
            <div class="truncate flex items-center gap-2">
              <span
                class="font-medium truncate transition-colors"
                :class="isNoteSelected(note.id) ? 'text-blue-900' : 'text-gray-800 group-hover:text-blue-600'"
              >
                {{ note.title }}
              </span>

              <!-- Star badge -->
              <Star
                v-if="note.isStarred"
                class="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0"
                title="已标星"
              />

              <!-- Favorite badge -->
              <Box
                v-if="note.isFavorite"
                class="w-3.5 h-3.5 text-indigo-500 shrink-0"
                title="已收藏"
              />

              <!-- Shared badge -->
              <span
                v-if="note.isShared"
                class="text-[10px] text-blue-600 bg-blue-50 px-1 py-0.2 rounded shrink-0"
              >
                已分享
              </span>
            </div>
          </div>

          <!-- Column 2: Created Time (Matches screenshot format e.g. 2025-12-30 10:06) -->
          <div class="col-span-3 md:col-span-3 text-xs text-gray-500 truncate">
            {{ note.createdAt }}
          </div>

          <!-- Column 3: More Operations ("...") -->
          <div class="col-span-2 flex items-center justify-end pr-2 relative">
            <button
              :id="'btn-more-actions-' + note.id"
              @click="toggleRowMenu($event, note.id)"
              class="text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 p-1.5 rounded-md transition-colors cursor-pointer"
              title="更多操作"
            >
              <MoreHorizontal class="w-4 h-4" />
            </button>

            <!-- Dropdown Menu for Single Note -->
            <div
              v-if="activeDropdownNoteId === note.id"
              :id="'dropdown-menu-' + note.id"
              class="absolute right-0 top-8 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-40 text-xs animate-in fade-in zoom-in-95 duration-100"
              @click.stop
            >
              <!-- If NOT in trash -->
              <template v-if="!note.isDeleted">
                <!-- Open in Current Window (Requested by User) -->
                <button
                  @click="emit('openNoteInCurrentWindow', note); activeDropdownNoteId = null;"
                  class="w-full px-3.5 py-1.5 text-left text-gray-800 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2 cursor-pointer font-medium"
                >
                  <AppWindow class="w-3.5 h-3.5 text-blue-600" />
                  <span>当前窗口打开</span>
                </button>

                <!-- Open in New Tab (Requested by User) -->
                <button
                  @click="emit('openNoteInNewTab', note); activeDropdownNoteId = null;"
                  class="w-full px-3.5 py-1.5 text-left text-gray-700 hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
                >
                  <ExternalLink class="w-3.5 h-3.5 text-gray-400" />
                  <span>新建网页打开</span>
                </button>

                <div class="h-px bg-gray-100 my-1"></div>

                <button
                  @click="emit('toggleStar', note.id); activeDropdownNoteId = null;"
                  class="w-full px-3.5 py-1.5 text-left text-gray-700 hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
                >
                  <Star class="w-3.5 h-3.5" :class="note.isStarred ? 'text-amber-500 fill-amber-500' : 'text-gray-400'" />
                  <span>{{ note.isStarred ? '取消标星' : '标星笔记' }}</span>
                </button>
                <button
                  @click="emit('toggleFavorite', note.id); activeDropdownNoteId = null;"
                  class="w-full px-3.5 py-1.5 text-left text-gray-700 hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
                >
                  <Box class="w-3.5 h-3.5" :class="note.isFavorite ? 'text-indigo-600' : 'text-gray-400'" />
                  <span>{{ note.isFavorite ? '移出收藏' : '加入收藏' }}</span>
                </button>
                <button
                  @click="emit('openShareModal', note); activeDropdownNoteId = null;"
                  class="w-full px-3.5 py-1.5 text-left text-gray-700 hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
                >
                  <Share2 class="w-3.5 h-3.5 text-gray-400" />
                  <span>分享笔记链接</span>
                </button>
                <button
                  @click="emit('openMoveModal', note); activeDropdownNoteId = null;"
                  class="w-full px-3.5 py-1.5 text-left text-gray-700 hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
                >
                  <FolderInput class="w-3.5 h-3.5 text-gray-400" />
                  <span>移动至文件夹...</span>
                </button>
                <button
                  @click="emit('duplicateNote', note); activeDropdownNoteId = null;"
                  class="w-full px-3.5 py-1.5 text-left text-gray-700 hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
                >
                  <Copy class="w-3.5 h-3.5 text-gray-400" />
                  <span>创建副本</span>
                </button>
                <button
                  @click="emit('exportNote', note); activeDropdownNoteId = null;"
                  class="w-full px-3.5 py-1.5 text-left text-gray-700 hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
                >
                  <Download class="w-3.5 h-3.5 text-gray-400" />
                  <span>{{ (note.format === 'mindmap' || note.type === 'mindmap') ? '导出为 XMind (.xmind)' : '导出为 Markdown' }}</span>
                </button>
                <button
                  @click="emit('renameNote', note); activeDropdownNoteId = null;"
                  class="w-full px-3.5 py-1.5 text-left text-gray-700 hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
                >
                  <Edit2 class="w-3.5 h-3.5 text-gray-400" />
                  <span>重命名</span>
                </button>

                <div class="h-px bg-gray-100 my-1"></div>

                <button
                  @click="emit('moveToTrash', note.id); activeDropdownNoteId = null;"
                  class="w-full px-3.5 py-1.5 text-left text-red-600 hover:bg-red-50 flex items-center gap-2 cursor-pointer"
                >
                  <Trash2 class="w-3.5 h-3.5 text-red-500" />
                  <span>移入回收站</span>
                </button>
              </template>

              <!-- If in trash -->
              <template v-else>
                <button
                  @click="emit('restoreFromTrash', note.id); activeDropdownNoteId = null;"
                  class="w-full px-3.5 py-1.5 text-left text-emerald-600 hover:bg-emerald-50 flex items-center gap-2 cursor-pointer"
                >
                  <RotateCcw class="w-3.5 h-3.5 text-emerald-600" />
                  <span>还原笔记</span>
                </button>
                <button
                  @click="emit('permanentlyDelete', note.id); activeDropdownNoteId = null;"
                  class="w-full px-3.5 py-1.5 text-left text-red-600 hover:bg-red-50 flex items-center gap-2 cursor-pointer"
                >
                  <Trash2 class="w-3.5 h-3.5 text-red-500" />
                  <span>彻底删除</span>
                </button>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>
