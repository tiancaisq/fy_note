<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import {
  X,
  FolderInput,
  FolderPlus,
  Search,
  Check,
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  Info,
  FolderTree
} from 'lucide-vue-next';
import { Note, Folder as FolderType } from '../types';
import { compareFolders } from '../utils/folderSort';
import MoveFolderTreeItem from './MoveFolderTreeItem.vue';

const props = withDefaults(
  defineProps<{
    note?: Note | null;
    notes?: Note[];
    folders: FolderType[];
  }>(),
  {
    note: null,
    notes: () => [],
  }
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'move', noteId: string, targetFolderId: string): void;
  (e: 'batchMove', noteIds: string[], targetFolderId: string): void;
  (e: 'createFolder', name: string, parentId?: string | null): void;
}>();

const activeNotes = computed<Note[]>(() => {
  if (props.notes && props.notes.length > 0) {
    return props.notes;
  }
  if (props.note) {
    return [props.note];
  }
  return [];
});

const isBatch = computed(() => activeNotes.value.length > 1);

const targetFolderId = ref(
  props.note?.folderId || props.notes?.[0]?.folderId || props.folders[0]?.id || ''
);
const searchKeyword = ref('');
const expandedMap = ref<Record<string, boolean>>({});

// Inline new folder creation state
const isCreatingNewFolder = ref(false);
const newFolderName = ref('');
const createAsSubfolder = ref(true); // default: subfolder under selected target
const newFolderInputRef = ref<HTMLInputElement | null>(null);

// Initialize all folders with subfolders as expanded by default
function initExpandedMap() {
  const map: Record<string, boolean> = {};
  props.folders.forEach((f) => {
    map[f.id] = expandedMap.value[f.id] !== undefined ? expandedMap.value[f.id] : true;
  });
  expandedMap.value = map;
}

onMounted(() => {
  initExpandedMap();
});

// Watch folders changes (e.g. when a new folder is created)
watch(
  () => props.folders,
  (newFolders, oldFolders) => {
    if (newFolders && oldFolders && newFolders.length > oldFolders.length) {
      // Find the new folder
      const added = newFolders.find((f) => !oldFolders.some((old) => old.id === f.id));
      if (added) {
        targetFolderId.value = added.id;
        const newMap = { ...expandedMap.value };
        if (added.parentId) {
          newMap[added.parentId] = true;
        }
        newMap[added.id] = true;
        expandedMap.value = newMap;
      }
    } else {
      initExpandedMap();
    }
  },
  { deep: true }
);

// Root folders (no parent)
const rootFolders = computed(() => {
  return props.folders
    .filter((f) => !f.parentId)
    .sort(compareFolders);
});

// Target folder object
const selectedFolder = computed(() => {
  return props.folders.find((f) => f.id === targetFolderId.value) || null;
});

// Full path of selected target folder
function getFolderPath(folderId: string): string[] {
  const parts: string[] = [];
  const list = props.folders || [];
  const validIds = new Set(list.map((f) => f.id));
  const firstId = list.find((f) => !f.parentId)?.id || list[0]?.id || '';
  const visited = new Set<string>();

  let curr = list.find((f) => f.id === folderId);
  if (!curr) {
    const firstF = list.find((f) => f.id === firstId);
    return firstF ? [firstF.name] : ['我的笔记'];
  }

  while (curr && !visited.has(curr.id)) {
    visited.add(curr.id);
    parts.unshift(curr.name);
    if (curr.parentId) {
      if (validIds.has(curr.parentId)) {
        curr = list.find((f) => f.id === curr!.parentId);
      } else {
        if (firstId && curr.id !== firstId) {
          const firstFolderObj = list.find((f) => f.id === firstId);
          if (firstFolderObj && !visited.has(firstFolderObj.id)) {
            parts.unshift(firstFolderObj.name);
          }
        }
        break;
      }
    } else {
      break;
    }
  }
  return parts.length > 0 ? parts : ['我的笔记'];
}

const targetFolderPath = computed(() => {
  return getFolderPath(targetFolderId.value);
});

const currentNoteFolderPath = computed(() => {
  if (isBatch.value) {
    return ['多个目录'];
  }
  return getFolderPath(activeNotes.value[0]?.folderId || '');
});

const isMovingToSameFolder = computed(() => {
  if (!isBatch.value) {
    return targetFolderId.value === activeNotes.value[0]?.folderId;
  }
  return activeNotes.value.length > 0 && activeNotes.value.every((n) => n.folderId === targetFolderId.value);
});

function handleSelect(folderId: string) {
  targetFolderId.value = folderId;
}

function handleToggleExpand(folderId: string) {
  const current = expandedMap.value[folderId] !== undefined ? expandedMap.value[folderId] : true;
  expandedMap.value = {
    ...expandedMap.value,
    [folderId]: !current
  };
}

function expandAll() {
  const map: Record<string, boolean> = {};
  props.folders.forEach((f) => {
    map[f.id] = true;
  });
  expandedMap.value = map;
}

function collapseAll() {
  const map: Record<string, boolean> = {};
  props.folders.forEach((f) => {
    map[f.id] = false;
  });
  expandedMap.value = map;
}

function submitMove() {
  if (!targetFolderId.value || activeNotes.value.length === 0) return;
  if (isBatch.value) {
    emit('batchMove', activeNotes.value.map((n) => n.id), targetFolderId.value);
  } else {
    emit('move', activeNotes.value[0].id, targetFolderId.value);
  }
  emit('close');
}

function handleConfirmMove(folderId: string) {
  targetFolderId.value = folderId;
  submitMove();
}

function toggleCreateFolderForm() {
  isCreatingNewFolder.value = !isCreatingNewFolder.value;
  if (isCreatingNewFolder.value) {
    newFolderName.value = '';
    createAsSubfolder.value = true;
    nextTick(() => {
      newFolderInputRef.value?.focus();
    });
  }
}

function cancelCreateFolder() {
  isCreatingNewFolder.value = false;
  newFolderName.value = '';
}

function submitCreateFolder() {
  const name = newFolderName.value.trim();
  if (!name) return;
  const parentId = createAsSubfolder.value ? (targetFolderId.value || null) : null;
  emit('createFolder', name, parentId);
  isCreatingNewFolder.value = false;
  newFolderName.value = '';
}
</script>

<template>
  <div
    id="move-note-modal"
    class="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
    @click.self="emit('close')"
  >
    <div class="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col max-h-[85vh]">
      <!-- Header -->
      <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
        <h3 class="text-sm font-bold text-gray-900 flex items-center gap-2">
          <FolderInput class="w-4 h-4 text-blue-600" />
          <span>{{ isBatch ? `批量移动笔记至文件夹 (${activeNotes.length} 篇)` : '移动笔记至文件夹' }}</span>
        </h3>
        <button
          @click="emit('close')"
          class="text-gray-400 hover:text-gray-600 p-1 rounded-md transition-colors cursor-pointer"
          title="关闭"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Note Info & Current Location -->
      <div class="px-5 pt-3 pb-2.5 bg-slate-50/70 border-b border-gray-100 text-xs shrink-0 space-y-1">
        <div class="flex items-center gap-1.5 text-gray-600 truncate">
          <span class="text-gray-400 shrink-0">{{ isBatch ? '批量移动：' : '正在移动：' }}</span>
          <span v-if="isBatch" class="font-bold text-gray-800 truncate" :title="activeNotes.map((n) => n.title).join(', ')">
            已选 {{ activeNotes.length }} 篇笔记（{{ activeNotes.slice(0, 3).map((n) => n.title).join('、') }}{{ activeNotes.length > 3 ? ' 等' : '' }}）
          </span>
          <span v-else class="font-bold text-gray-800 truncate" :title="activeNotes[0]?.title">
            「{{ activeNotes[0]?.title || '未命名笔记' }}」
          </span>
        </div>
        <div class="flex items-center gap-1.5 text-gray-500 text-[11px] truncate">
          <span class="text-gray-400 shrink-0">当前所在：</span>
          <span class="text-gray-600 bg-white px-1.5 py-0.5 rounded border border-gray-200/60 truncate font-mono text-[10px]">
            {{ currentNoteFolderPath.join(' / ') }}
          </span>
        </div>
      </div>

      <!-- Search & Expand/Collapse Toolbar -->
      <div class="px-5 py-2.5 border-b border-gray-100 flex items-center gap-2 shrink-0 bg-white">
        <!-- Search Input -->
        <div class="relative flex-1">
          <Search class="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            v-model="searchKeyword"
            placeholder="搜索一级/二级/子文件夹..."
            class="w-full pl-8 pr-7 py-1.5 bg-gray-50 hover:bg-gray-100/80 focus:bg-white border border-gray-200 rounded-lg text-xs text-gray-800 outline-none focus:ring-1.5 focus:ring-blue-500 transition-colors"
          />
          <button
            v-if="searchKeyword"
            @click="searchKeyword = ''"
            class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer p-0.5"
          >
            <X class="w-3 h-3" />
          </button>
        </div>

        <!-- Expand / Collapse All Controls -->
        <div class="flex items-center gap-1 shrink-0">
          <button
            type="button"
            @click="expandAll"
            class="px-2 py-1 text-[11px] text-gray-600 hover:text-blue-600 hover:bg-blue-50/70 border border-gray-200/70 rounded-md transition-colors cursor-pointer flex items-center gap-1"
            title="展开所有层级"
          >
            <ChevronDown class="w-3.5 h-3.5 text-gray-500" />
            <span>展开</span>
          </button>
          <button
            type="button"
            @click="collapseAll"
            class="px-2 py-1 text-[11px] text-gray-600 hover:text-blue-600 hover:bg-blue-50/70 border border-gray-200/70 rounded-md transition-colors cursor-pointer flex items-center gap-1"
            title="折叠所有层级"
          >
            <ChevronUp class="w-3.5 h-3.5 text-gray-500" />
            <span>折叠</span>
          </button>
        </div>
      </div>

      <!-- New Folder Quick Inline Form (Top Sticky Banner) -->
      <div
        v-if="isCreatingNewFolder"
        class="px-5 py-3 bg-blue-50/90 border-b border-blue-200/80 text-xs shrink-0 animate-in slide-in-from-top-2 duration-150"
      >
        <div class="flex items-center justify-between mb-2">
          <span class="font-semibold text-blue-900 flex items-center gap-1.5 text-xs">
            <FolderPlus class="w-3.5 h-3.5 text-blue-600" />
            <span>新建文件夹</span>
          </span>
          <!-- Creation Mode Selector -->
          <div class="flex items-center gap-3 text-[11px] text-blue-800">
            <label class="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                :value="true"
                v-model="createAsSubfolder"
                name="folder_type"
                class="text-blue-600 focus:ring-0"
              />
              <span>作为「{{ selectedFolder?.name || '当前选中' }}」的子目录</span>
            </label>
            <label class="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                :value="false"
                v-model="createAsSubfolder"
                name="folder_type"
                class="text-blue-600 focus:ring-0"
              />
              <span>作为一级目录</span>
            </label>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <input
            ref="newFolderInputRef"
            v-model="newFolderName"
            @keydown.enter="submitCreateFolder"
            @keydown.esc="cancelCreateFolder"
            placeholder="输入新文件夹名称..."
            class="flex-1 px-3 py-1.5 bg-white border border-blue-300 rounded-lg text-xs text-gray-800 outline-none focus:ring-1.5 focus:ring-blue-500 shadow-2xs"
          />
          <button
            type="button"
            @click="submitCreateFolder"
            :disabled="!newFolderName.trim()"
            class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium cursor-pointer transition-colors shrink-0"
          >
            确认创建
          </button>
          <button
            type="button"
            @click="cancelCreateFolder"
            class="px-2.5 py-1.5 text-gray-600 hover:bg-gray-200/70 rounded-lg text-xs cursor-pointer transition-colors shrink-0"
          >
            取消
          </button>
        </div>
      </div>

      <!-- Folder Tree Directory List -->
      <div class="p-4 flex-1 overflow-y-auto space-y-1 min-h-[220px]">
        <div class="text-[11px] text-gray-400 font-medium px-1 mb-1.5 flex items-center justify-between">
          <span class="flex items-center gap-1 text-gray-500">
            <FolderTree class="w-3.5 h-3.5 text-blue-500" />
            <span>选择目标目录（支持多级目录，双击可直接移动）：</span>
          </span>
          <span class="text-[10px] text-gray-400">共 {{ folders.length }} 个目录</span>
        </div>

        <!-- Hierarchical Tree Items -->
        <div v-if="folders.length > 0" class="space-y-0.5">
          <MoveFolderTreeItem
            v-for="rootF in rootFolders"
            :key="rootF.id"
            :folder="rootF"
            :all-folders="folders"
            :selected-folder-id="targetFolderId"
            :current-note-folder-id="isBatch ? '' : (activeNotes[0]?.folderId || '')"
            :level="0"
            :expanded-map="expandedMap"
            :search-keyword="searchKeyword"
            @select="handleSelect"
            @toggle-expand="handleToggleExpand"
            @confirm-move="handleConfirmMove"
          />
        </div>

        <div v-else class="py-8 text-center text-xs text-gray-400">
          暂无可用的文件夹
        </div>
      </div>

      <!-- Destination Target Path Footer Display -->
      <div class="px-5 py-2.5 bg-slate-50 border-t border-gray-100 flex items-center justify-between text-xs shrink-0">
        <div class="flex items-center gap-1.5 truncate mr-2">
          <CornerDownRight class="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span class="text-gray-500 shrink-0">目标路径：</span>
          <span class="font-semibold text-blue-700 truncate" :title="targetFolderPath.join(' > ')">
            {{ targetFolderPath.join(' > ') }}
          </span>
        </div>

        <span v-if="isMovingToSameFolder" class="text-[11px] text-amber-600 font-medium shrink-0 flex items-center gap-1">
          <Info class="w-3 h-3" />
          <span>与当前目录相同</span>
        </span>
      </div>

      <!-- Footer Buttons -->
      <div class="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-2 text-xs shrink-0">
        <!-- New Folder Toggle Button (Always visible) -->
        <button
          type="button"
          @click="toggleCreateFolderForm"
          :class="[
            'px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer font-medium border',
            isCreatingNewFolder
              ? 'bg-blue-100/80 text-blue-700 border-blue-300'
              : 'text-gray-600 hover:text-blue-600 hover:bg-gray-100 border-transparent'
          ]"
        >
          <FolderPlus class="w-3.5 h-3.5 text-blue-500" />
          <span>{{ isCreatingNewFolder ? '收起新建' : '新建文件夹' }}</span>
        </button>

        <div class="flex items-center gap-2">
          <button
            type="button"
            @click="emit('close')"
            class="px-3.5 py-1.5 text-gray-600 hover:bg-gray-200/60 rounded-lg transition-colors cursor-pointer font-medium"
          >
            取消
          </button>
          <button
            type="button"
            @click="submitMove"
            :disabled="!targetFolderId || isMovingToSameFolder"
            class="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Check class="w-3.5 h-3.5" />
            <span>确认移动</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
