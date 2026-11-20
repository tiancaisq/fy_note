<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { X, Folder as FolderIcon, AlertCircle } from 'lucide-vue-next';
import { BookmarkCategory } from '../types';

const props = defineProps<{
  category?: BookmarkCategory | null;
  parentCategory?: BookmarkCategory | null;
  existingCategories: BookmarkCategory[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'submit', payload: { id?: string; name: string; parentId: string | null }): void;
}>();

const isEdit = computed(() => Boolean(props.category));
const targetParentId = computed<string | null>(() => {
  if (props.category) return props.category.parentId || null;
  return props.parentCategory?.id || null;
});

const name = ref(props.category?.name || '');
const errorMsg = ref('');
const nameInputRef = ref<HTMLInputElement | null>(null);

function handleSubmit() {
  const trimmed = name.value.trim();
  if (!trimmed) {
    errorMsg.value = '请输入目录名称';
    nameInputRef.value?.focus();
    return;
  }

  const duplicate = props.existingCategories.some(
    (c) =>
      (c.parentId || null) === targetParentId.value &&
      c.name.trim().toLowerCase() === trimmed.toLowerCase() &&
      c.id !== props.category?.id
  );
  if (duplicate) {
    errorMsg.value = '同级目录下已存在同名目录，请更换名称';
    nameInputRef.value?.focus();
    return;
  }

  emit('submit', {
    id: props.category?.id,
    name: trimmed,
    parentId: targetParentId.value,
  });
}

let isMouseDownOnBackdrop = false;

function handleBackdropMouseDown(e: MouseEvent) {
  isMouseDownOnBackdrop = e.target === e.currentTarget;
}

function handleBackdropClick(e: MouseEvent) {
  if (isMouseDownOnBackdrop && e.target === e.currentTarget) {
    emit('close');
  }
  isMouseDownOnBackdrop = false;
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close');
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  nameInputRef.value?.focus();
  nameInputRef.value?.select();
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div
    id="bookmark-category-modal-overlay"
    class="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
    @mousedown="handleBackdropMouseDown"
    @click="handleBackdropClick"
  >
    <div
      id="bookmark-category-modal-container"
      class="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-gray-200/80 overflow-hidden flex flex-col"
    >
      <!-- Header -->
      <div class="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between bg-slate-50/70">
        <div class="flex items-center gap-2 min-w-0">
          <FolderIcon class="w-4 h-4 text-amber-500 shrink-0" />
          <h3 class="text-sm font-bold text-gray-900 truncate">
            {{ isEdit ? '重命名目录' : parentCategory ? '新建子目录' : '新建书签目录' }}
          </h3>
        </div>
        <button
          type="button"
          @click="emit('close')"
          class="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer shrink-0"
          title="关闭"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Body -->
      <form @submit.prevent="handleSubmit" class="p-5 space-y-4">
        <div
          v-if="!isEdit && parentCategory"
          class="px-3 py-2 rounded-lg bg-slate-50 border border-gray-200/80 text-xs text-gray-600 flex items-center gap-1.5"
        >
          <span class="text-gray-400 shrink-0">父级目录:</span>
          <span class="font-medium text-gray-800 truncate">{{ parentCategory.name }}</span>
        </div>

        <div class="space-y-1.5">
          <label class="block text-xs font-semibold text-gray-700">
            目录名称 <span class="text-red-500">*</span>
          </label>
          <input
            ref="nameInputRef"
            v-model="name"
            type="text"
            maxlength="30"
            placeholder="例如：开发文档、前端框架、常用工具"
            @input="errorMsg = ''"
            :class="[
              'w-full px-3 py-2 text-sm bg-slate-50 border rounded-lg focus:outline-none focus:bg-white focus:ring-2 transition-colors',
              errorMsg
                ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                : 'border-gray-200 focus:border-blue-400 focus:ring-blue-100',
            ]"
          />
          <p v-if="errorMsg" class="text-xs text-red-600 flex items-center gap-1">
            <AlertCircle class="w-3.5 h-3.5 shrink-0" />
            <span>{{ errorMsg }}</span>
          </p>
        </div>

        <div class="pt-2 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            type="button"
            @click="emit('close')"
            class="px-3.5 py-2 text-xs font-medium text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 rounded-lg transition-colors cursor-pointer"
          >
            取消
          </button>
          <button
            type="submit"
            id="btn-bookmark-category-submit"
            class="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs cursor-pointer"
          >
            {{ isEdit ? '保存' : '创建目录' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
