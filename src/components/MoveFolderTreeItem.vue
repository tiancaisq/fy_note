<script setup lang="ts">
import { computed } from 'vue';
import {
  Folder as FolderIcon,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Check,
  CornerDownRight
} from 'lucide-vue-next';
import { Folder } from '../types';
import { compareFolders } from '../utils/folderSort';

const props = defineProps<{
  folder: Folder;
  allFolders: Folder[];
  selectedFolderId: string;
  currentNoteFolderId: string;
  level: number;
  expandedMap: Record<string, boolean>;
  searchKeyword: string;
}>();

const emit = defineEmits<{
  (e: 'select', folderId: string): void;
  (e: 'toggleExpand', folderId: string): void;
  (e: 'confirmMove', folderId: string): void;
}>();

// Direct subfolders
const subfolders = computed(() => {
  const list = props.allFolders || [];
  const validIds = new Set(list.map((f) => f.id));
  const firstId = list.find((f) => !f.parentId)?.id || list[0]?.id || '';
  const isFirstFolder = props.folder.id === firstId;

  return list
    .filter((f) => {
      if (f.parentId === props.folder.id) return true;
      if (isFirstFolder && f.parentId && !validIds.has(f.parentId) && f.id !== firstId) {
        return true;
      }
      return false;
    })
    .sort(compareFolders);
});

// Check if matches keyword or has descendant match
const isSelfMatch = computed(() => {
  if (!props.searchKeyword.trim()) return true;
  return props.folder.name.toLowerCase().includes(props.searchKeyword.trim().toLowerCase());
});

const hasMatchingDescendant = computed(() => {
  if (!props.searchKeyword.trim()) return true;
  const kw = props.searchKeyword.trim().toLowerCase();
  const validIds = new Set((props.allFolders || []).map((f) => f.id));
  const firstId = (props.allFolders || []).find((f) => !f.parentId)?.id || props.allFolders[0]?.id || '';

  function checkMatch(f: Folder): boolean {
    if (f.name.toLowerCase().includes(kw)) return true;
    const isFirst = f.id === firstId;
    const children = (props.allFolders || []).filter((child) => {
      if (child.parentId === f.id) return true;
      if (isFirst && child.parentId && !validIds.has(child.parentId) && child.id !== firstId) return true;
      return false;
    });
    return children.some(checkMatch);
  }
  return subfolders.value.some(checkMatch);
});

const shouldDisplay = computed(() => {
  if (!props.searchKeyword.trim()) return true;
  return isSelfMatch.value || hasMatchingDescendant.value;
});

const isExpanded = computed(() => {
  if (props.searchKeyword.trim()) return true;
  return props.expandedMap[props.folder.id] !== undefined ? props.expandedMap[props.folder.id] : true;
});

const isSelected = computed(() => props.folder.id === props.selectedFolderId);
const isCurrent = computed(() => props.folder.id === props.currentNoteFolderId);

function handleRowClick() {
  emit('select', props.folder.id);
}

function handleDoubleClick() {
  emit('select', props.folder.id);
  emit('confirmMove', props.folder.id);
}

function handleToggle(e: MouseEvent) {
  e.stopPropagation();
  emit('toggleExpand', props.folder.id);
}
</script>

<template>
  <div v-if="shouldDisplay" class="select-none">
    <!-- Folder Row -->
    <div
      :id="'move-folder-row-' + folder.id"
      @click="handleRowClick"
      @dblclick="handleDoubleClick"
      :style="{ paddingLeft: `${8 + level * 16}px` }"
      :class="[
        'group flex items-center justify-between pr-2.5 py-2 rounded-lg text-xs cursor-pointer transition-all border my-0.5',
        isSelected
          ? 'bg-blue-50/90 border-blue-300 text-blue-700 font-medium shadow-2xs'
          : 'border-transparent hover:bg-gray-50/80 hover:border-gray-200/60 text-gray-700'
      ]"
    >
      <!-- Left: Chevron, Icon, Name, Badge -->
      <div class="flex items-center gap-1.5 truncate flex-1 mr-2">
        <!-- Chevron Toggle -->
        <button
          v-if="subfolders.length > 0"
          type="button"
          @click="handleToggle"
          class="p-0.5 hover:bg-gray-200/70 rounded text-gray-400 hover:text-gray-700 transition-colors shrink-0 cursor-pointer"
          :title="isExpanded ? '折叠子文件夹' : '展开子文件夹'"
        >
          <ChevronDown v-if="isExpanded" class="w-3.5 h-3.5 text-gray-500" />
          <ChevronRight v-else class="w-3.5 h-3.5 text-gray-400" />
        </button>
        <span v-else class="w-4 h-4 inline-block shrink-0"></span>

        <!-- Subfolder branch marker on deeper levels -->
        <CornerDownRight v-if="level > 0" class="w-3 h-3 text-gray-300 shrink-0 -ml-1" />

        <!-- Folder Icon -->
        <component
          :is="isSelected || (isExpanded && subfolders.length > 0) ? FolderOpen : FolderIcon"
          :class="[
            'w-4 h-4 shrink-0 transition-colors',
            isSelected
              ? 'text-blue-600'
              : 'text-amber-500 fill-amber-500/20'
          ]"
        />

        <!-- Folder Name -->
        <span
          class="truncate text-xs tracking-tight"
          :class="{ 'font-semibold text-blue-800': isSelected }"
        >
          {{ folder.name }}
        </span>

        <!-- Subfolders count -->
        <span
          v-if="subfolders.length > 0"
          class="text-[10px] text-gray-400 font-normal shrink-0"
        >
          ({{ subfolders.length }}个子目录)
        </span>
      </div>

      <!-- Right: Badges -->
      <div class="flex items-center gap-1.5 shrink-0">
        <!-- Current Note Folder Badge -->
        <span
          v-if="isCurrent"
          class="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200/60"
        >
          当前所在
        </span>

        <!-- Selected Check Badge -->
        <span
          v-if="isSelected"
          class="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium flex items-center gap-0.5 border border-blue-200"
        >
          <Check class="w-3 h-3" />
          <span>目标</span>
        </span>
      </div>
    </div>

    <!-- Recursive Children Subfolders Rendering -->
    <div v-if="isExpanded && subfolders.length > 0" class="space-y-0.5 border-l border-gray-100 ml-4 pl-0.5">
      <MoveFolderTreeItem
        v-for="sub in subfolders"
        :key="sub.id"
        :folder="sub"
        :all-folders="allFolders"
        :selected-folder-id="selectedFolderId"
        :current-note-folder-id="currentNoteFolderId"
        :level="level + 1"
        :expanded-map="expandedMap"
        :search-keyword="searchKeyword"
        @select="(id) => emit('select', id)"
        @toggle-expand="(id) => emit('toggleExpand', id)"
        @confirm-move="(id) => emit('confirmMove', id)"
      />
    </div>
  </div>
</template>
