<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { X, Link2, AlertCircle } from 'lucide-vue-next';
import { Bookmark, BookmarkCategory } from '../types';
import {
  normalizeBookmarkUrl,
  deriveTitleFromUrl,
  getBookmarkBadgeInfo,
} from '../utils/bookmarkHelpers';

const props = defineProps<{
  bookmark?: Bookmark | null;
  categories: BookmarkCategory[];
  defaultCategoryId?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (
    e: 'submit',
    payload: {
      id?: string;
      title: string;
      url: string;
      description: string;
      categoryId: string;
      tags: string[];
      isPinned: boolean;
    }
  ): void;
}>();

const isEdit = computed(() => Boolean(props.bookmark));

const url = ref(props.bookmark?.url || '');
const title = ref(props.bookmark?.title || '');
const categoryId = ref(
  props.bookmark ? props.bookmark.categoryId : props.defaultCategoryId || ''
);
const urlError = ref('');
const urlInputRef = ref<HTMLInputElement | null>(null);

watch(url, () => {
  if (urlError.value) {
    const check = normalizeBookmarkUrl(url.value);
    if (check.valid) urlError.value = '';
  }
});

const previewBadge = computed(() => getBookmarkBadgeInfo(url.value || 'example.com', title.value));

interface CategorySelectOption {
  id: string;
  label: string;
}

// Build hierarchical tree-indented options for the folder <select>
const folderSelectOptions = computed<CategorySelectOption[]>(() => {
  const result: CategorySelectOption[] = [];
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
      const prefix = depth === 0 ? '' : `${'　'.repeat(depth - 1)}└─ `;
      result.push({
        id: cat.id,
        label: `${prefix}${cat.name}`,
      });
      walk(cat.id, depth + 1);
    }
  }

  walk(null, 0);
  return result;
});

function handleUrlBlur() {
  const trimmed = url.value.trim();
  if (!trimmed) return;
  const check = normalizeBookmarkUrl(trimmed);
  if (check.valid) {
    url.value = check.url;
    urlError.value = '';
    if (!title.value.trim()) {
      title.value = deriveTitleFromUrl(check.url);
    }
  } else {
    urlError.value = check.error || '网址格式无效';
  }
}

function handleSubmit() {
  const normalized = normalizeBookmarkUrl(url.value);
  if (!normalized.valid) {
    urlError.value = normalized.error || '请输入有效的网站链接';
    urlInputRef.value?.focus();
    return;
  }

  emit('submit', {
    id: props.bookmark?.id,
    title: title.value.trim() || deriveTitleFromUrl(normalized.url),
    url: normalized.url,
    description: props.bookmark?.description || '',
    categoryId: categoryId.value,
    tags: props.bookmark?.tags || [],
    isPinned: props.bookmark?.isPinned ?? false,
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
  urlInputRef.value?.focus();
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div
    id="bookmark-modal-overlay"
    class="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
    @mousedown="handleBackdropMouseDown"
    @click="handleBackdropClick"
  >
    <div
      id="bookmark-modal-container"
      class="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-gray-200/80 overflow-hidden flex flex-col"
    >
      <!-- Header -->
      <div class="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between bg-slate-50/70">
        <div class="flex items-center gap-2.5">
          <div
            class="w-7 h-7 rounded-lg border flex items-center justify-center text-xs font-semibold shrink-0"
            :class="[previewBadge.bg, previewBadge.text, previewBadge.border]"
          >
            {{ previewBadge.letter }}
          </div>
          <h3 class="text-sm font-bold text-gray-900">
            {{ isEdit ? '编辑书签' : '添加书签' }}
          </h3>
        </div>
        <button
          type="button"
          @click="emit('close')"
          class="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
          title="关闭"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Minimal 3-Field Form -->
      <form @submit.prevent="handleSubmit" class="p-5 space-y-4 text-sm">
        <!-- 1. URL -->
        <div class="space-y-1.5">
          <label class="block text-xs font-semibold text-gray-700">
            网址 <span class="text-red-500">*</span>
          </label>
          <div class="relative">
            <Link2 class="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref="urlInputRef"
              v-model="url"
              type="text"
              placeholder="例如: https://vuejs.org 或 github.com"
              @blur="handleUrlBlur"
              :class="[
                'w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border rounded-lg focus:outline-none focus:bg-white focus:ring-2 transition-colors font-mono',
                urlError
                  ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                  : 'border-gray-200 focus:border-blue-400 focus:ring-blue-100',
              ]"
            />
          </div>
          <p v-if="urlError" class="text-xs text-red-600 flex items-center gap-1">
            <AlertCircle class="w-3.5 h-3.5 shrink-0" />
            <span>{{ urlError }}</span>
          </p>
        </div>

        <!-- 2. Title -->
        <div class="space-y-1.5">
          <label class="block text-xs font-semibold text-gray-700">名称</label>
          <input
            v-model="title"
            type="text"
            placeholder="留空则根据域名自动生成"
            class="w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-colors"
          />
        </div>

        <!-- 3. Parent Tree Folder -->
        <div class="space-y-1.5">
          <label class="block text-xs font-semibold text-gray-700">所属目录</label>
          <select
            v-model="categoryId"
            class="w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-colors cursor-pointer"
          >
            <option value="">根目录（不归属子目录）</option>
            <option v-for="opt in folderSelectOptions" :key="opt.id" :value="opt.id">
              {{ opt.label }}
            </option>
          </select>
        </div>

        <!-- Footer -->
        <div class="pt-3 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            type="button"
            @click="emit('close')"
            class="px-3.5 py-2 text-xs font-medium text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 rounded-lg transition-colors cursor-pointer"
          >
            取消
          </button>
          <button
            type="submit"
            id="btn-bookmark-modal-submit"
            class="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg transition-colors shadow-xs cursor-pointer"
          >
            {{ isEdit ? '保存' : '添加书签' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
