<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import {
  Folder as FolderIcon,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Edit2,
  Trash2,
  FolderPlus
} from 'lucide-vue-next';
import { Folder, ViewType } from '../types';

export type DropPosition = 'before' | 'inside' | 'after';

const props = defineProps<{
  folder: Folder;
  allFolders: Folder[];
  currentView: ViewType;
  activeFolderId: string;
  level: number;
  getFolderNoteCount: (id: string) => number;
  draggedOverFolderId: string | null;
  draggedDropPosition: DropPosition | null;
}>();

const emit = defineEmits<{
  (e: 'selectFolder', folderId: string): void;
  (e: 'toggleCollapse', folderId: string): void;
  (e: 'openNewSubfolder', parentFolder: Folder): void;
  (e: 'renameFolder', folder: Folder): void;
  (e: 'deleteFolder', folderId: string): void;
  (e: 'folderDragStart', folder: Folder, event: DragEvent): void;
  (e: 'folderDragOver', folderId: string, position: DropPosition, event: DragEvent): void;
  (e: 'folderDragLeave', folderId: string): void;
  (e: 'folderDrop', targetFolderId: string, position: DropPosition, event: DragEvent): void;
}>();

const isMenuOpen = ref(false);
const menuContainerRef = ref<HTMLElement | null>(null);

// Direct children of this folder
const subfolders = computed(() => {
  return props.allFolders
    .filter((f) => f.parentId === props.folder.id)
    .sort((a, b) => a.order - b.order);
});

function handleFolderClick() {
  emit('selectFolder', props.folder.id);
}

function handleToggleCollapse(e: MouseEvent) {
  e.stopPropagation();
  emit('toggleCollapse', props.folder.id);
}

function handleMenuToggle(e: MouseEvent) {
  e.stopPropagation();
  isMenuOpen.value = !isMenuOpen.value;
}

function handleDocumentClick(e: MouseEvent) {
  if (isMenuOpen.value) {
    if (menuContainerRef.value && !menuContainerRef.value.contains(e.target as Node)) {
      isMenuOpen.value = false;
    }
  }
}

function handleDocumentKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isMenuOpen.value) {
    isMenuOpen.value = false;
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

function onDragStart(e: DragEvent) {
  emit('folderDragStart', props.folder, e);
}

function calculateDropPosition(e: DragEvent): DropPosition {
  const target = e.currentTarget as HTMLElement;
  if (!target) return 'inside';
  const rect = target.getBoundingClientRect();
  const offsetY = e.clientY - rect.top;
  const height = rect.height;

  // Top 25% => insert before, Bottom 25% => insert after, Middle 50% => insert inside
  if (offsetY < height * 0.28) {
    return 'before';
  } else if (offsetY > height * 0.72) {
    return 'after';
  } else {
    return 'inside';
  }
}

function onDragOver(e: DragEvent) {
  e.preventDefault();
  const position = calculateDropPosition(e);
  emit('folderDragOver', props.folder.id, position, e);
}

function onDragLeave() {
  emit('folderDragLeave', props.folder.id);
}

function onDrop(e: DragEvent) {
  e.preventDefault();
  const position = calculateDropPosition(e);
  emit('folderDrop', props.folder.id, position, e);
}
</script>

<template>
  <div class="select-none">
    <!-- Folder Item Row Container for positioning indicator lines -->
    <div class="relative">
      <!-- Top Indicator Line for 'before' reordering -->
      <div
        v-if="draggedOverFolderId === folder.id && draggedDropPosition === 'before'"
        class="absolute left-0 right-0 -top-0.5 z-30 h-1 bg-blue-500 rounded-full pointer-events-none flex items-center shadow-xs"
        :style="{ left: `${8 + level * 14}px` }"
      >
        <div class="w-2 h-2 rounded-full bg-blue-600 -ml-1 border-2 border-white shadow-xs"></div>
      </div>

      <!-- Folder Item Row -->
      <div
        :id="'folder-row-' + folder.id"
        draggable="true"
        @dragstart="onDragStart"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
        @click="handleFolderClick"
        :style="{ paddingLeft: `${8 + level * 14}px` }"
        :class="[
          'group relative flex items-center justify-between pr-2 py-1.5 rounded-md text-sm cursor-pointer transition-all duration-150',
          currentView === 'folder' && activeFolderId === folder.id
            ? 'bg-[#e8f1fd] text-blue-600 font-medium shadow-xs'
            : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900',
          draggedOverFolderId === folder.id && draggedDropPosition === 'inside'
            ? 'ring-2 ring-blue-500 bg-blue-50/90 scale-[1.01]'
            : '',
          draggedOverFolderId === folder.id && (draggedDropPosition === 'before' || draggedDropPosition === 'after')
            ? 'bg-blue-50/40'
            : ''
        ]"
      >
        <!-- Left: Expand Arrow, Icon & Name -->
        <div class="flex items-center gap-1.5 truncate flex-1 mr-1">
          <!-- Expand/Collapse Chevron (if has subfolders or can toggle) -->
          <button
            @click="handleToggleCollapse"
            class="p-0.5 hover:bg-gray-200/60 rounded text-gray-400 hover:text-gray-700 transition-colors shrink-0"
            :title="folder.isOpen ? '折叠' : '展开'"
          >
            <template v-if="subfolders.length > 0">
              <ChevronDown v-if="folder.isOpen" class="w-3.5 h-3.5" />
              <ChevronRight v-else class="w-3.5 h-3.5" />
            </template>
            <span v-else class="w-3.5 h-3.5 inline-block"></span>
          </button>

          <!-- Folder Icon -->
          <component
            :is="currentView === 'folder' && activeFolderId === folder.id ? FolderOpen : FolderIcon"
            :class="[
              'w-4 h-4 shrink-0 transition-colors',
              currentView === 'folder' && activeFolderId === folder.id
                ? 'text-blue-600'
                : 'text-amber-400 fill-amber-400/20'
            ]"
          />

          <span class="truncate text-[13px] tracking-tight">{{ folder.name }}</span>
        </div>

        <!-- Right: Note count & Quick actions -->
        <div class="flex items-center gap-1 shrink-0">
          <!-- Count badge -->
          <span
            class="text-[11px] px-1.5 py-0.2 rounded text-gray-400 group-hover:text-gray-500"
            :class="{ 'text-blue-600 font-normal': currentView === 'folder' && activeFolderId === folder.id }"
          >
            {{ getFolderNoteCount(folder.id) }}
          </span>

          <!-- Quick Add Subfolder button on hover -->
          <button
            @click.stop="emit('openNewSubfolder', folder)"
            class="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200/60 rounded text-gray-400 hover:text-blue-600 transition-all"
            title="在此文件夹下新建子文件夹"
          >
            <FolderPlus class="w-3.5 h-3.5" />
          </button>

          <!-- Menu button & Dropdown Container -->
          <div ref="menuContainerRef" class="relative">
            <button
              @click="handleMenuToggle"
              class="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200/60 rounded text-gray-400 hover:text-gray-600 transition-all cursor-pointer"
              :class="{ '!opacity-100 bg-gray-200/80 text-gray-700': isMenuOpen }"
              title="更多操作"
            >
              <MoreHorizontal class="w-3.5 h-3.5" />
            </button>

            <!-- Context Menu Dropdown -->
            <div
              v-if="isMenuOpen"
              class="absolute right-0 top-7 w-40 bg-white rounded-lg shadow-xl border border-gray-100 py-1 z-50 text-xs animate-in fade-in zoom-in-95 duration-100"
              @click.stop
            >
              <button
                @click="emit('openNewSubfolder', folder); isMenuOpen = false;"
                class="w-full px-3 py-1.5 text-left text-gray-700 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2 cursor-pointer transition-colors"
              >
                <FolderPlus class="w-3.5 h-3.5 text-blue-500" />
                <span>新建子文件夹</span>
              </button>
              <button
                @click="emit('renameFolder', folder); isMenuOpen = false;"
                class="w-full px-3 py-1.5 text-left text-gray-700 hover:bg-gray-50 flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Edit2 class="w-3.5 h-3.5 text-gray-400" />
                <span>重命名</span>
              </button>
              <div class="h-px bg-gray-100 my-1"></div>
              <button
                @click="emit('deleteFolder', folder.id); isMenuOpen = false;"
                class="w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50 flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Trash2 class="w-3.5 h-3.5 text-red-500" />
                <span>删除文件夹</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom Indicator Line for 'after' reordering -->
      <div
        v-if="draggedOverFolderId === folder.id && draggedDropPosition === 'after'"
        class="absolute left-0 right-0 -bottom-0.5 z-30 h-1 bg-blue-500 rounded-full pointer-events-none flex items-center shadow-xs"
        :style="{ left: `${8 + level * 14}px` }"
      >
        <div class="w-2 h-2 rounded-full bg-blue-600 -ml-1 border-2 border-white shadow-xs"></div>
      </div>
    </div>

    <!-- Recursive Subfolder rendering -->
    <div v-if="folder.isOpen && subfolders.length > 0" class="mt-0.5 space-y-0.5">
      <FolderTreeItem
        v-for="sub in subfolders"
        :key="sub.id"
        :folder="sub"
        :all-folders="allFolders"
        :current-view="currentView"
        :active-folder-id="activeFolderId"
        :level="level + 1"
        :get-folder-note-count="getFolderNoteCount"
        :dragged-over-folder-id="draggedOverFolderId"
        :dragged-drop-position="draggedDropPosition"
        @select-folder="(id) => emit('selectFolder', id)"
        @toggle-collapse="(id) => emit('toggleCollapse', id)"
        @open-new-subfolder="(f) => emit('openNewSubfolder', f)"
        @rename-folder="(f) => emit('renameFolder', f)"
        @delete-folder="(id) => emit('deleteFolder', id)"
        @folder-drag-start="(f, e) => emit('folderDragStart', f, e)"
        @folder-drag-over="(id, pos, e) => emit('folderDragOver', id, pos, e)"
        @folder-drag-leave="(id) => emit('folderDragLeave', id)"
        @folder-drop="(id, pos, e) => emit('folderDrop', id, pos, e)"
      />
    </div>
  </div>
</template>
