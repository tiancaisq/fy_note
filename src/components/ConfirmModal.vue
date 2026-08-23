<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import {
  X,
  AlertTriangle,
  Trash2,
  Folder as FolderIcon,
  FileText,
  AlertCircle,
  Info,
} from 'lucide-vue-next';
import FileFormatIcon from './icons/FileFormatIcon.vue';

const props = withDefaults(
  defineProps<{
    title: string;
    message: string;
    subMessage?: string;
    confirmText?: string;
    cancelText?: string;
    dangerLevel?: 'danger' | 'warning' | 'info';
    itemType?: 'note' | 'folder' | 'trash';
    itemName?: string;
    itemFormat?: 'markdown' | 'mindmap' | string;
    noteCount?: number;
    subFolderCount?: number;
  }>(),
  {
    confirmText: '确认删除',
    cancelText: '取消',
    dangerLevel: 'danger',
  }
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'confirm'): void;
}>();

const confirmButtonRef = ref<HTMLButtonElement | null>(null);

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close');
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  // Auto focus confirm button for seamless accessibility
  confirmButtonRef.value?.focus();
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div
    id="confirm-modal-overlay"
    class="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
    @click.self="emit('close')"
  >
    <div
      id="confirm-modal-container"
      class="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col animate-in zoom-in-95 duration-150"
    >
      <!-- Header with Icon & Close -->
      <div class="px-5 pt-5 pb-4 flex items-start justify-between gap-3">
        <div class="flex items-start gap-3.5">
          <!-- Danger / Warning Icon Badge -->
          <div
            v-if="dangerLevel === 'danger'"
            class="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0 shadow-2xs"
          >
            <Trash2 class="w-5 h-5" />
          </div>
          <div
            v-else-if="dangerLevel === 'warning'"
            class="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 shadow-2xs"
          >
            <AlertTriangle class="w-5 h-5" />
          </div>
          <div
            v-else
            class="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 shadow-2xs"
          >
            <Info class="w-5 h-5" />
          </div>

          <!-- Title and primary text -->
          <div class="pt-0.5">
            <h3 id="confirm-modal-title" class="text-base font-bold text-gray-900 leading-snug">
              {{ title }}
            </h3>
            <p id="confirm-modal-message" class="text-xs text-gray-600 mt-1 leading-relaxed">
              {{ message }}
            </p>
          </div>
        </div>

        <button
          id="btn-confirm-modal-close"
          @click="emit('close')"
          class="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer shrink-0"
          title="关闭"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Item Info Box (if item is specified) -->
      <div v-if="itemName || itemType === 'trash'" class="px-5 py-2">
        <div
          class="bg-gray-50 border border-gray-200/80 rounded-xl p-3 flex items-center justify-between gap-3 text-xs"
        >
          <!-- Item preview -->
          <div class="flex items-center gap-2.5 truncate flex-1 min-w-0">
            <!-- Format icon -->
            <template v-if="itemType === 'note'">
              <div class="shrink-0">
                <FileFormatIcon :format="itemFormat || 'markdown'" size="xs" />
              </div>
            </template>
            <template v-else-if="itemType === 'folder'">
              <FolderIcon class="w-4 h-4 text-amber-500 fill-amber-500/20 shrink-0" />
            </template>
            <template v-else-if="itemType === 'trash'">
              <Trash2 class="w-4 h-4 text-red-500 shrink-0" />
            </template>

            <span class="font-medium text-gray-800 truncate" :title="itemName">
              {{ itemName || (itemType === 'trash' ? '全部回收站内容' : '') }}
            </span>
          </div>

          <!-- Metadata badge -->
          <div class="shrink-0 text-[11px] text-gray-500 font-normal">
            <span
              v-if="itemType === 'folder'"
              class="px-2 py-0.5 bg-gray-200/70 text-gray-700 rounded-md font-mono"
            >
              {{ subFolderCount && subFolderCount > 0 ? `${subFolderCount} 个子目录 · ` : '' }}{{ noteCount ?? 0 }} 篇笔记
            </span>
            <span
              v-else-if="itemType === 'trash'"
              class="px-2 py-0.5 bg-red-100 text-red-700 rounded-md font-mono font-medium"
            >
              共 {{ noteCount ?? 0 }} 篇已删除笔记
            </span>
            <span
              v-else-if="itemType === 'note'"
              class="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md font-medium"
            >
              {{ itemFormat === 'mindmap' ? '思维导图' : 'Markdown 笔记' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Warning Callout / SubMessage -->
      <div v-if="subMessage" class="px-5 py-2">
        <div
          :class="[
            'rounded-xl p-3 text-xs flex items-start gap-2.5 leading-relaxed',
            dangerLevel === 'danger'
              ? 'bg-red-50/80 border border-red-200/70 text-red-700'
              : 'bg-amber-50/80 border border-amber-200/70 text-amber-800'
          ]"
        >
          <AlertCircle class="w-4 h-4 shrink-0 mt-0.5" />
          <span>{{ subMessage }}</span>
        </div>
      </div>

      <!-- Action Buttons Footer -->
      <div class="px-5 py-3.5 bg-gray-50/90 border-t border-gray-100 flex items-center justify-end gap-2.5 mt-2">
        <button
          id="btn-confirm-cancel"
          type="button"
          @click="emit('close')"
          class="px-4 py-2 text-xs font-medium text-gray-700 bg-white hover:bg-gray-100 active:bg-gray-200 border border-gray-300 rounded-lg transition-colors cursor-pointer shadow-2xs"
        >
          {{ cancelText }}
        </button>

        <button
          id="btn-confirm-action"
          ref="confirmButtonRef"
          type="button"
          @click="emit('confirm')"
          :class="[
            'px-4 py-2 text-xs font-medium text-white rounded-lg transition-colors cursor-pointer shadow-xs focus:ring-2 focus:ring-offset-1',
            dangerLevel === 'danger'
              ? 'bg-red-600 hover:bg-red-700 active:bg-red-800 focus:ring-red-500'
              : dangerLevel === 'warning'
              ? 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800 focus:ring-amber-500'
              : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 focus:ring-blue-500'
          ]"
        >
          {{ confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>
