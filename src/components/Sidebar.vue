<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import {
  Plus,
  FileDown,
  Folder as FolderIcon,
  ChevronDown,
  ChevronRight,
  Share2,
  Star,
  Box,
  Trash2,
  FolderPlus,
  Layers,
  Clock
} from 'lucide-vue-next';
import { Folder, ViewType } from '../types';
import FolderTreeItem from './FolderTreeItem.vue';
import FileFormatIcon from './icons/FileFormatIcon.vue';
import MindmapIcon from './icons/MindmapIcon.vue';

const props = defineProps<{
  folders: Folder[];
  currentView: ViewType;
  activeFolderId: string;
  getFolderNoteCount: (id: string) => number;
  sharedCount: number;
  starredCount: number;
  favoriteCount: number;
  trashCount: number;
}>();

const emit = defineEmits<{
  (e: 'selectFolder', folderId: string): void;
  (e: 'selectView', view: ViewType): void;
  (e: 'createNewNote'): void;
  (e: 'createNewMindMap'): void;
  (e: 'openImport'): void;
  (e: 'openNewFolder', parentFolder?: Folder): void;
  (e: 'renameFolder', folder: Folder): void;
  (e: 'deleteFolder', folderId: string): void;
  (e: 'toggleCollapse', folderId: string): void;
  (e: 'moveFolder', draggedFolderId: string, targetParentId: string | null, position?: 'inside' | 'before' | 'after', targetFolderId?: string): void;
  (e: 'moveNote', draggedNoteId: string, targetFolderId: string): void;
}>();

const isMyNotesExpanded = ref(true);
const isNewDropdownOpen = ref(false);
const newDropdownContainerRef = ref<HTMLElement | null>(null);
const draggedOverFolderId = ref<string | null>(null);
const draggedDropPosition = ref<'inside' | 'before' | 'after' | null>(null);
const isRootDropOver = ref(false);

function handleNewNoteClick() {
  isNewDropdownOpen.value = false;
  emit('createNewNote');
}

function handleNewMindMapClick() {
  isNewDropdownOpen.value = false;
  emit('createNewMindMap');
}

// Root folders (no parent)
const rootFolders = computed(() => {
  return props.folders
    .filter((f) => !f.parentId)
    .sort((a, b) => a.order - b.order);
});

function toggleMyNotes() {
  isMyNotesExpanded.value = !isMyNotesExpanded.value;
}

function handleFolderDragStart(folder: Folder, e: DragEvent) {
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'folder', id: folder.id }));
  }
}

function handleFolderDragOver(folderId: string, position: 'inside' | 'before' | 'after', e: DragEvent) {
  e.preventDefault();
  draggedOverFolderId.value = folderId;
  draggedDropPosition.value = position;
}

function handleFolderDragLeave(folderId: string) {
  if (draggedOverFolderId.value === folderId) {
    draggedOverFolderId.value = null;
    draggedDropPosition.value = null;
  }
}

function handleFolderDrop(targetFolderId: string, position: 'inside' | 'before' | 'after', e: DragEvent) {
  e.preventDefault();
  draggedOverFolderId.value = null;
  draggedDropPosition.value = null;
  const rawData = e.dataTransfer?.getData('application/json');
  if (rawData) {
    try {
      const data = JSON.parse(rawData);
      if (data.type === 'folder') {
        if (position === 'inside') {
          emit('moveFolder', data.id, targetFolderId, 'inside');
        } else {
          // Find target folder to get its parentId
          const target = props.folders.find((f) => f.id === targetFolderId);
          const targetParentId = target?.parentId || null;
          emit('moveFolder', data.id, targetParentId, position, targetFolderId);
        }
      } else if (data.type === 'note') {
        emit('moveNote', data.id, targetFolderId);
      }
    } catch (err) {
      console.error(err);
    }
  }
}

// Drag over root "我的笔记" to move to top level
function handleRootDragOver(e: DragEvent) {
  e.preventDefault();
  isRootDropOver.value = true;
}

function handleRootDragLeave() {
  isRootDropOver.value = false;
}

function handleRootDrop(e: DragEvent) {
  e.preventDefault();
  isRootDropOver.value = false;
  const rawData = e.dataTransfer?.getData('application/json');
  if (rawData) {
    try {
      const data = JSON.parse(rawData);
      if (data.type === 'folder') {
        emit('moveFolder', data.id, null, 'inside');
      }
    } catch (err) {
      console.error(err);
    }
  }
}
const isMac = computed(() => {
  return typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
});

function handleWindowClick(e: MouseEvent) {
  if (newDropdownContainerRef.value && !newDropdownContainerRef.value.contains(e.target as Node)) {
    isNewDropdownOpen.value = false;
  }
}

function handleWindowKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isNewDropdownOpen.value) {
    isNewDropdownOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', handleWindowClick);
  document.addEventListener('keydown', handleWindowKeyDown);
});

onUnmounted(() => {
  document.removeEventListener('click', handleWindowClick);
  document.removeEventListener('keydown', handleWindowKeyDown);
});
</script>

<template>
  <aside id="app-sidebar" class="w-64 bg-white border-r border-gray-100 flex flex-col justify-between h-full select-none shrink-0 z-20">
    <div class="p-3.5 space-y-4 overflow-y-auto flex-1">
      <!-- Top Action Buttons (Matches screenshot with split/dropdown selection) -->
      <div id="sidebar-top-actions" class="space-y-2">
        <!-- "+ 新建" Button with Dropdown selection for Note vs Mindmap -->
        <div ref="newDropdownContainerRef" class="relative">
          <div class="flex items-stretch w-full rounded-md shadow-sm overflow-hidden">
            <!-- Main Click Area -->
            <button
              id="btn-create-note-main"
              @click="isNewDropdownOpen = !isNewDropdownOpen"
              class="flex-1 h-9 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-sm flex items-center justify-between px-3 transition-colors cursor-pointer group"
              :title="'点击选择新建笔记或思维导图 (' + (isMac ? '⌘N' : 'Ctrl+N') + ')'"
            >
              <div class="flex items-center gap-1.5 mx-auto">
                <Plus class="w-4 h-4 stroke-[2.5]" />
                <span>新建</span>
              </div>
              <ChevronDown
                class="w-3.5 h-3.5 text-blue-200 transition-transform"
                :class="isNewDropdownOpen ? 'rotate-180' : ''"
              />
            </button>
          </div>

          <!-- New Option Dropdown Popup -->
          <div
            v-if="isNewDropdownOpen"
            id="sidebar-new-dropdown-menu"
            class="absolute left-0 right-0 top-10 bg-white rounded-xl shadow-2xl border border-gray-100 py-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-100 space-y-1"
          >
            <!-- Option 1: 新建 Markdown 笔记 -->
            <button
              id="btn-new-markdown-note"
              @click="handleNewNoteClick"
              class="w-full px-3 py-2 text-left hover:bg-orange-50/60 flex items-center gap-2.5 transition-colors cursor-pointer group"
            >
              <!-- Orange Markdown Document Badge -->
              <FileFormatIcon format="markdown" size="xs" />
              <div class="flex-1 truncate">
                <div class="flex items-center justify-between">
                  <span class="font-bold text-gray-800 group-hover:text-orange-600">新建笔记</span>
                  <kbd class="text-[10px] font-mono text-gray-400 group-hover:text-orange-500">{{ isMac ? '⌘N' : 'Ctrl+N' }}</kbd>
                </div>
                <p class="text-[11px] text-gray-400 line-clamp-1">Markdown 富文本与代码笔记</p>
              </div>
            </button>

            <!-- Option 2: 新建思维导图 (Mind Map) with emerald green icon -->
            <button
              id="btn-new-mindmap-note"
              @click="handleNewMindMapClick"
              class="w-full px-3 py-2 text-left hover:bg-emerald-50/60 flex items-center gap-2.5 transition-colors cursor-pointer group border-t border-gray-50"
            >
              <!-- Emerald Green Mindmap Document Badge -->
              <MindmapIcon size="xs" />
              <div class="flex-1 truncate">
                <div class="flex items-center justify-between">
                  <span class="font-bold text-gray-800 group-hover:text-emerald-600">新建思维导图</span>
                  <kbd class="text-[10px] font-mono text-gray-400 group-hover:text-emerald-500">{{ isMac ? '⌘M' : 'Ctrl+M' }}</kbd>
                </div>
                <p class="text-[11px] text-gray-400 line-clamp-1">结构化发散、组织架构与鱼骨图</p>
              </div>
            </button>
          </div>
        </div>

        <button
          id="btn-import-file"
          @click="emit('openImport')"
          class="w-full h-9 bg-blue-50 hover:bg-blue-100/80 active:bg-blue-100 text-blue-600 rounded-md font-medium text-sm flex items-center justify-center gap-2 border border-blue-100/60 transition-colors cursor-pointer"
        >
          <FileDown class="w-4 h-4 text-blue-600" />
          <span>导入</span>
        </button>
      </div>

      <!-- Folder Navigation Section (Hierarchical & Draggable) -->
      <div id="sidebar-folders-tree" class="pt-1">
        <!-- Root Category: 我的笔记 (Supports dropping folders to move to root) -->
        <div
          @dragover="handleRootDragOver"
          @dragleave="handleRootDragLeave"
          @drop="handleRootDrop"
          :class="[
            'group flex items-center justify-between text-xs font-semibold text-gray-500 hover:text-gray-800 px-2 py-1.5 rounded-md cursor-pointer transition-all',
            isRootDropOver ? 'bg-blue-50 ring-2 ring-blue-400 text-blue-600' : ''
          ]"
        >
          <div class="flex items-center gap-1.5 flex-1" @click="toggleMyNotes">
            <button class="text-gray-400 hover:text-gray-600 p-0.5 rounded">
              <ChevronDown v-if="isMyNotesExpanded" class="w-3.5 h-3.5" />
              <ChevronRight v-else class="w-3.5 h-3.5" />
            </button>
            <FolderIcon class="w-4 h-4 text-gray-400" />
            <span class="text-[13px] text-gray-800">我的笔记</span>
            <span v-if="isRootDropOver" class="text-[10px] text-blue-600 bg-blue-100 px-1 rounded">移至根目录</span>
          </div>

          <!-- Add Root Folder Button -->
          <button
            @click.stop="emit('openNewFolder')"
            title="新建根文件夹"
            class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-600 p-1 hover:bg-gray-100 rounded transition-opacity"
          >
            <FolderPlus class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- Multi-Level Subfolders List -->
        <div v-show="isMyNotesExpanded" class="mt-0.5 space-y-0.5">
          <FolderTreeItem
            v-for="folder in rootFolders"
            :key="folder.id"
            :folder="folder"
            :all-folders="folders"
            :current-view="currentView"
            :active-folder-id="activeFolderId"
            :level="0"
            :get-folder-note-count="getFolderNoteCount"
            :dragged-over-folder-id="draggedOverFolderId"
            :dragged-drop-position="draggedDropPosition"
            @select-folder="(id) => emit('selectFolder', id)"
            @toggle-collapse="(id) => emit('toggleCollapse', id)"
            @open-new-subfolder="(f) => emit('openNewFolder', f)"
            @rename-folder="(f) => emit('renameFolder', f)"
            @delete-folder="(id) => emit('deleteFolder', id)"
            @folder-drag-start="handleFolderDragStart"
            @folder-drag-over="handleFolderDragOver"
            @folder-drag-leave="handleFolderDragLeave"
            @folder-drop="handleFolderDrop"
          />
        </div>
      </div>

      <!-- Divider -->
      <div class="h-px bg-gray-100 my-2"></div>

      <!-- Fixed Category Navigation -->
      <div id="sidebar-categories" class="space-y-0.5">
        <!-- 文件时间线 (新增) -->
        <div
          id="nav-timeline"
          @click="emit('selectView', 'timeline')"
          :class="[
            'flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm cursor-pointer transition-colors',
            currentView === 'timeline'
              ? 'bg-[#e8f1fd] text-blue-600 font-medium'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          ]"
        >
          <div class="flex items-center gap-2">
            <Clock class="w-4 h-4 text-gray-400" :class="{ 'text-blue-600': currentView === 'timeline' }" />
            <span class="text-[13px]">时间线</span>
          </div>
          <span class="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.2 rounded font-medium">动态</span>
        </div>

        <!-- 我的分享 -->
        <div
          id="nav-shared"
          @click="emit('selectView', 'shared')"
          :class="[
            'flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm cursor-pointer transition-colors',
            currentView === 'shared'
              ? 'bg-[#e8f1fd] text-blue-600 font-medium'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          ]"
        >
          <div class="flex items-center gap-2">
            <Share2 class="w-4 h-4 text-gray-400" :class="{ 'text-blue-600': currentView === 'shared' }" />
            <span class="text-[13px]">我的分享</span>
          </div>
          <span v-if="sharedCount > 0" class="text-xs text-gray-400">{{ sharedCount }}</span>
        </div>

        <!-- 我的标星 -->
        <div
          id="nav-starred"
          @click="emit('selectView', 'starred')"
          :class="[
            'flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm cursor-pointer transition-colors',
            currentView === 'starred'
              ? 'bg-[#e8f1fd] text-blue-600 font-medium'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          ]"
        >
          <div class="flex items-center gap-2">
            <Star class="w-4 h-4 text-gray-400" :class="{ 'text-amber-500 fill-amber-500': currentView === 'starred' }" />
            <span class="text-[13px]">我的标星</span>
          </div>
          <span v-if="starredCount > 0" class="text-xs text-gray-400">{{ starredCount }}</span>
        </div>

        <!-- 我的收藏 -->
        <div
          id="nav-favorite"
          @click="emit('selectView', 'favorite')"
          :class="[
            'flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm cursor-pointer transition-colors',
            currentView === 'favorite'
              ? 'bg-[#e8f1fd] text-blue-600 font-medium'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          ]"
        >
          <div class="flex items-center gap-2">
            <Box class="w-4 h-4 text-gray-400" :class="{ 'text-blue-600': currentView === 'favorite' }" />
            <span class="text-[13px]">我的收藏</span>
          </div>
          <span v-if="favoriteCount > 0" class="text-xs text-gray-400">{{ favoriteCount }}</span>
        </div>

        <!-- 我的回收站 -->
        <div
          id="nav-trash"
          @click="emit('selectView', 'trash')"
          :class="[
            'flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm cursor-pointer transition-colors',
            currentView === 'trash'
              ? 'bg-[#e8f1fd] text-blue-600 font-medium'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          ]"
        >
          <div class="flex items-center gap-2">
            <Trash2 class="w-4 h-4 text-gray-400" :class="{ 'text-blue-600': currentView === 'trash' }" />
            <span class="text-[13px]">我的回收站</span>
          </div>
          <span v-if="trashCount > 0" class="text-xs text-gray-400">{{ trashCount }}</span>
        </div>
      </div>
    </div>

    <!-- Bottom Quick New Folder & tip -->
    <div class="p-3 border-t border-gray-100 text-xs text-gray-400 flex items-center justify-between bg-gray-50/50">
      <button
        @click="emit('openNewFolder')"
        class="flex items-center gap-1.5 text-gray-600 hover:text-blue-600 transition-colors font-medium cursor-pointer"
      >
        <FolderPlus class="w-3.5 h-3.5" />
        <span>+ 新建文件夹</span>
      </button>
      <span class="text-[11px] text-gray-400 flex items-center gap-1" title="可拖拽文件夹或笔记进行组织">
        <Layers class="w-3 h-3" /> 支持拖拽移动
      </span>
    </div>
  </aside>
</template>
