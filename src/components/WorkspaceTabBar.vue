<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import {
  X,
  FolderOpen,
  Clock,
  Star,
  Trash2,
  ExternalLink,
  XCircle
} from 'lucide-vue-next';
import { Note, ViewType } from '../types';
import FileFormatIcon from './icons/FileFormatIcon.vue';

const props = defineProps<{
  openTabs: Note[];
  activeTabId: string;
  currentView: ViewType;
  activeFolderName?: string;
}>();

const emit = defineEmits<{
  (e: 'switchTab', tabId: string): void;
  (e: 'closeTab', tabId: string): void;
  (e: 'closeOtherTabs', tabId: string): void;
  (e: 'closeRightTabs', tabId: string): void;
  (e: 'closeAllTabs'): void;
  (e: 'reorderTabs', fromIndex: number, toIndex: number): void;
  (e: 'openInNewBrowserTab', note: Note): void;
}>();

const tabsScrollRef = ref<HTMLElement | null>(null);
const contextMenuRef = ref<HTMLElement | null>(null);

// Drag & Drop Tab Reordering
const draggedIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);

// Right-Click Tab Context Menu
const contextMenu = ref<{
  visible: boolean;
  x: number;
  y: number;
  note: Note | null;
  index: number;
}>({
  visible: false,
  x: 0,
  y: 0,
  note: null,
  index: -1,
});

const workspaceTabLabel = computed(() => {
  switch (props.currentView) {
    case 'timeline':
      return '时间线';
    case 'starred':
      return '我的标星';
    case 'trash':
      return '我的回收站';
    case 'folder':
    default:
      return props.activeFolderName || '文件列表';
  }
});

const workspaceTabIcon = computed(() => {
  switch (props.currentView) {
    case 'timeline':
      return Clock;
    case 'starred':
      return Star;
    case 'trash':
      return Trash2;
    default:
      return FolderOpen;
  }
});

function getFormatAccentClass(note: Note): string {
  if (note.format === 'mindmap' || note.type === 'mindmap') {
    return 'border-t-emerald-500';
  }
  if (note.format === 'drawio' || note.type === 'drawio') {
    return 'border-t-amber-500';
  }
  return 'border-t-blue-600';
}

// Auto-scroll active tab into view
watch(
  () => props.activeTabId,
  async (newId) => {
    await nextTick();
    if (!tabsScrollRef.value) return;
    const el = tabsScrollRef.value.querySelector(`[data-tab-id="${CSS.escape(newId)}"]`) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }
);

function handleDragStart(index: number, e: DragEvent) {
  draggedIndex.value = index;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }
}

function handleDragOver(index: number, e: DragEvent) {
  if (draggedIndex.value === null) return;
  e.preventDefault();
  dragOverIndex.value = index;
}

function handleDrop(targetIndex: number, e: DragEvent) {
  e.preventDefault();
  if (draggedIndex.value !== null && draggedIndex.value !== targetIndex) {
    emit('reorderTabs', draggedIndex.value, targetIndex);
  }
  draggedIndex.value = null;
  dragOverIndex.value = null;
}

function handleDragEnd() {
  draggedIndex.value = null;
  dragOverIndex.value = null;
}

function openTabContextMenu(note: Note, index: number, e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();

  const menuWidth = 188;
  const menuHeight = 200;
  let x = e.clientX;
  let y = e.clientY;
  if (x + menuWidth > window.innerWidth) {
    x = Math.max(8, window.innerWidth - menuWidth - 8);
  }
  if (y + menuHeight > window.innerHeight) {
    y = Math.max(8, window.innerHeight - menuHeight - 8);
  }

  contextMenu.value = {
    visible: true,
    x,
    y,
    note,
    index,
  };
}

function closeContextMenu() {
  contextMenu.value.visible = false;
  contextMenu.value.note = null;
  contextMenu.value.index = -1;
}

function handleDocumentClick(e: MouseEvent) {
  const target = e.target as Node;
  if (contextMenu.value.visible && contextMenuRef.value && !contextMenuRef.value.contains(target)) {
    closeContextMenu();
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    closeContextMenu();
  }
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('keydown', handleKeyDown);
  window.addEventListener('resize', closeContextMenu);
  window.addEventListener('blur', closeContextMenu);
});

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick);
  document.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('resize', closeContextMenu);
  window.removeEventListener('blur', closeContextMenu);
});
</script>

<template>
  <div
    id="workspace-tab-bar"
    class="h-10 bg-slate-100/80 border-b border-gray-200/80 px-2 pt-1.5 flex items-end gap-1.5 shrink-0 select-none z-20"
  >
    <!-- Scrollable Tab Strip -->
    <div
      ref="tabsScrollRef"
      class="flex items-end gap-1 flex-1 min-w-0 overflow-x-auto scrollbar-none h-full"
    >
      <!-- Pinned Home / Workspace List Tab -->
      <button
        type="button"
        data-tab-id="workspace"
        @click="emit('switchTab', 'workspace')"
        :class="[
          'group relative h-full px-3 rounded-t-lg text-xs flex items-center gap-1.5 shrink-0 transition-all cursor-pointer border border-b-0',
          activeTabId === 'workspace'
            ? 'bg-white text-blue-600 font-semibold border-gray-200/90 border-t-2 border-t-blue-600 shadow-2xs z-10'
            : 'bg-transparent text-gray-600 border-transparent hover:bg-white/60 hover:text-gray-900'
        ]"
        :title="'返回列表视图: ' + workspaceTabLabel"
      >
        <component
          :is="workspaceTabIcon"
          class="w-3.5 h-3.5 shrink-0"
          :class="activeTabId === 'workspace' ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'"
        />
        <span class="max-w-[130px] truncate">{{ workspaceTabLabel }}</span>
      </button>

      <!-- Opened File Tabs -->
      <div
        v-for="(note, index) in openTabs"
        :key="note.id"
        :data-tab-id="note.id"
        draggable="true"
        @dragstart="handleDragStart(index, $event)"
        @dragover="handleDragOver(index, $event)"
        @drop="handleDrop(index, $event)"
        @dragend="handleDragEnd"
        @click="emit('switchTab', note.id)"
        @auxclick.middle.prevent="emit('closeTab', note.id)"
        @contextmenu="openTabContextMenu(note, index, $event)"
        :title="note.title || '无标题笔记'"
        :class="[
          'group relative h-full pl-2.5 pr-1.5 rounded-t-lg text-xs flex items-center gap-1.5 shrink-0 transition-all cursor-pointer border border-b-0 max-w-[200px]',
          activeTabId === note.id
            ? `bg-white text-gray-900 font-semibold border-gray-200/90 border-t-2 ${getFormatAccentClass(note)} shadow-2xs z-10`
            : 'bg-white/40 text-gray-600 border-transparent hover:bg-white/75 hover:text-gray-900',
          dragOverIndex === index && draggedIndex !== index ? 'ring-2 ring-blue-400/60' : '',
          draggedIndex === index ? 'opacity-50' : ''
        ]"
      >
        <FileFormatIcon :format="note.format || note.type" size="xs" class="shrink-0" />
        <span class="truncate flex-1 text-left">{{ note.title || '无标题笔记' }}</span>
        <Star
          v-if="note.isStarred"
          class="w-2.5 h-2.5 text-amber-500 fill-amber-500 shrink-0"
        />
        <button
          type="button"
          @click.stop="emit('closeTab', note.id)"
          class="p-0.5 rounded hover:bg-gray-200/80 text-gray-400 hover:text-gray-700 transition-colors shrink-0 cursor-pointer"
          :class="activeTabId === note.id ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'"
          title="关闭标签页"
        >
          <X class="w-3 h-3" />
        </button>
      </div>
    </div>

    <!-- Teleported Tab Right-Click Context Menu -->
    <Teleport to="body">
      <div
        v-if="contextMenu.visible && contextMenu.note"
        ref="contextMenuRef"
        class="fixed z-[70] w-48 bg-white rounded-xl shadow-2xl border border-gray-200/80 py-1.5 text-xs animate-in fade-in zoom-in-95 duration-100 select-none"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click.stop
        @contextmenu.prevent
      >
        <button
          @click="emit('closeTab', contextMenu.note!.id); closeContextMenu();"
          class="w-full px-3 py-1.5 text-left text-gray-700 hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
        >
          <X class="w-3.5 h-3.5 text-gray-400" />
          <span>关闭当前标签</span>
        </button>
        <button
          @click="emit('closeOtherTabs', contextMenu.note!.id); closeContextMenu();"
          :disabled="openTabs.length <= 1"
          class="w-full px-3 py-1.5 text-left text-gray-700 hover:bg-gray-50 flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <X class="w-3.5 h-3.5 text-gray-400" />
          <span>关闭其他标签</span>
        </button>
        <button
          @click="emit('closeRightTabs', contextMenu.note!.id); closeContextMenu();"
          :disabled="contextMenu.index >= openTabs.length - 1"
          class="w-full px-3 py-1.5 text-left text-gray-700 hover:bg-gray-50 flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <X class="w-3.5 h-3.5 text-gray-400" />
          <span>关闭右侧标签</span>
        </button>
        <button
          @click="emit('closeAllTabs'); closeContextMenu();"
          class="w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50 flex items-center gap-2 cursor-pointer"
        >
          <XCircle class="w-3.5 h-3.5 text-red-500" />
          <span>关闭全部标签</span>
        </button>
        <div class="h-px bg-gray-100 my-1"></div>
        <button
          @click="emit('openInNewBrowserTab', contextMenu.note!); closeContextMenu();"
          class="w-full px-3 py-1.5 text-left text-gray-700 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2 cursor-pointer"
        >
          <ExternalLink class="w-3.5 h-3.5 text-gray-400" />
          <span>在浏览器新标签页打开</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>
