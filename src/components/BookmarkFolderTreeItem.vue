<script setup lang="ts">
import { computed } from 'vue';
import {
  ChevronRight,
  ChevronDown,
  Folder as FolderIcon,
  FolderOpen,
  Plus,
  Edit3,
  Trash2,
} from 'lucide-vue-next';
import { BookmarkCategory } from '../types';

defineOptions({
  name: 'BookmarkFolderTreeItem',
});

const props = withDefaults(
  defineProps<{
    category: BookmarkCategory;
    allCategories: BookmarkCategory[];
    activeCategoryId: string;
    level?: number;
    getCategoryBookmarkCount: (categoryId: string) => number;
    draggedOverCategoryId: string | null;
  }>(),
  {
    level: 0,
  }
);

const emit = defineEmits<{
  (e: 'select', id: string): void;
  (e: 'toggle-collapse', id: string): void;
  (e: 'add-subfolder', parent: BookmarkCategory): void;
  (e: 'edit', category: BookmarkCategory): void;
  (e: 'delete', category: BookmarkCategory): void;
  (e: 'drag-over-category', id: string | null): void;
  (e: 'drop-bookmark', bookmarkId: string, targetCategoryId: string): void;
}>();

const children = computed(() =>
  props.allCategories
    .filter((c) => c.parentId === props.category.id)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
);

const hasChildren = computed(() => children.value.length > 0);
const isOpen = computed(() => props.category.isOpen !== false);
const isSelected = computed(() => props.activeCategoryId === props.category.id);
const isDragOver = computed(() => props.draggedOverCategoryId === props.category.id);
const bookmarkCount = computed(() => props.getCategoryBookmarkCount(props.category.id));

function handleDragOver(e: DragEvent) {
  e.preventDefault();
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move';
  }
  if (props.draggedOverCategoryId !== props.category.id) {
    emit('drag-over-category', props.category.id);
  }
}

function handleDragLeave(e: DragEvent) {
  const currentTarget = e.currentTarget as HTMLElement | null;
  const related = e.relatedTarget as Node | null;
  if (currentTarget && related && currentTarget.contains(related)) {
    return;
  }
  if (props.draggedOverCategoryId === props.category.id) {
    emit('drag-over-category', null);
  }
}

function handleDrop(e: DragEvent) {
  e.preventDefault();
  emit('drag-over-category', null);
  const raw = e.dataTransfer?.getData('application/json');
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.type === 'bookmark' && parsed?.id) {
      emit('drop-bookmark', parsed.id, props.category.id);
    }
  } catch {
    // ignore invalid drag payload
  }
}
</script>

<template>
  <div>
    <div
      :id="`bookmark-tree-node-${category.id}`"
      @click="emit('select', category.id)"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
      :style="{ paddingLeft: `${8 + level * 14}px` }"
      :class="[
        'group flex items-center gap-1 pr-1.5 py-1.5 rounded-lg text-[13px] cursor-pointer transition-colors select-none',
        isDragOver
          ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-400'
          : isSelected
            ? 'bg-blue-50/90 text-blue-700 font-medium'
            : 'text-slate-700 hover:bg-slate-200/55',
      ]"
    >
      <!-- Expand / Collapse Toggle -->
      <button
        v-if="hasChildren"
        type="button"
        @click.stop="emit('toggle-collapse', category.id)"
        class="w-4 h-4 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 shrink-0 cursor-pointer transition-colors"
        :title="isOpen ? '收起子目录' : '展开子目录'"
      >
        <ChevronDown v-if="isOpen" class="w-3.5 h-3.5" />
        <ChevronRight v-else class="w-3.5 h-3.5" />
      </button>
      <span v-else class="w-4 h-4 shrink-0"></span>

      <!-- Folder Icon -->
      <FolderOpen
        v-if="isSelected || (hasChildren && isOpen)"
        class="w-4 h-4 shrink-0"
        :class="isSelected ? 'text-blue-600' : 'text-amber-500/85'"
      />
      <FolderIcon
        v-else
        class="w-4 h-4 shrink-0 text-amber-500/80"
      />

      <!-- Name -->
      <span class="flex-1 truncate min-w-0 ml-0.5" :title="category.name">
        {{ category.name }}
      </span>

      <!-- Count (hidden on hover to reveal compact actions cleanly) -->
      <span
        v-if="bookmarkCount > 0"
        class="text-[11px] tabular-nums shrink-0 px-1 group-hover:hidden"
        :class="isSelected ? 'text-blue-600/80' : 'text-slate-400'"
      >
        {{ bookmarkCount }}
      </span>

      <!-- Hover Actions -->
      <div class="hidden group-hover:flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          @click.stop="emit('add-subfolder', category)"
          class="p-0.5 rounded text-slate-400 hover:text-blue-600 hover:bg-white/90 transition-colors cursor-pointer"
          title="新建子目录"
        >
          <Plus class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          @click.stop="emit('edit', category)"
          class="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-white/90 transition-colors cursor-pointer"
          title="重命名目录"
        >
          <Edit3 class="w-3 h-3" />
        </button>
        <button
          type="button"
          @click.stop="emit('delete', category)"
          class="p-0.5 rounded text-slate-400 hover:text-red-600 hover:bg-white/90 transition-colors cursor-pointer"
          title="删除目录"
        >
          <Trash2 class="w-3 h-3" />
        </button>
      </div>
    </div>

    <!-- Recursive Children -->
    <div v-if="hasChildren && isOpen" class="mt-0.5 space-y-0.5">
      <BookmarkFolderTreeItem
        v-for="child in children"
        :key="child.id"
        :category="child"
        :all-categories="allCategories"
        :active-category-id="activeCategoryId"
        :level="level + 1"
        :get-category-bookmark-count="getCategoryBookmarkCount"
        :dragged-over-category-id="draggedOverCategoryId"
        @select="(id) => emit('select', id)"
        @toggle-collapse="(id) => emit('toggle-collapse', id)"
        @add-subfolder="(p) => emit('add-subfolder', p)"
        @edit="(c) => emit('edit', c)"
        @delete="(c) => emit('delete', c)"
        @drag-over-category="(id) => emit('drag-over-category', id)"
        @drop-bookmark="(bmId, catId) => emit('drop-bookmark', bmId, catId)"
      />
    </div>
  </div>
</template>
