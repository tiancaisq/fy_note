<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { X, FolderPlus, Folder as FolderIcon, CornerDownRight } from 'lucide-vue-next';
import { Folder } from '../types';

const props = defineProps<{
  parentFolder?: Folder | null;
  initialName?: string;
  isEdit?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'submit', name: string, parentId?: string | null): void;
}>();

const folderName = ref(props.initialName || '');
const inputRef = ref<HTMLInputElement | null>(null);

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

onMounted(() => {
  inputRef.value?.focus();
});

function handleSubmit() {
  if (folderName.value.trim()) {
    emit('submit', folderName.value.trim(), props.parentFolder?.id || null);
    emit('close');
  }
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
    @mousedown="handleBackdropMouseDown"
    @click="handleBackdropClick"
  >
    <div class="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col">
      <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 class="text-sm font-bold text-gray-900 flex items-center gap-2">
          <FolderPlus class="w-4 h-4 text-blue-600" />
          <span v-if="isEdit">重命名文件夹</span>
          <span v-else-if="parentFolder">在「{{ parentFolder.name }}」下新建子文件夹</span>
          <span v-else>新建根文件夹</span>
        </h3>
        <button @click="emit('close')" class="text-gray-400 hover:text-gray-600 cursor-pointer">
          <X class="w-4 h-4" />
        </button>
      </div>

      <div class="p-5 space-y-3">
        <div v-if="parentFolder && !isEdit" class="text-xs text-gray-500 bg-blue-50/70 p-2.5 rounded-lg flex items-center gap-1.5 border border-blue-100">
          <CornerDownRight class="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span>所属父目录：<strong class="text-blue-800">{{ parentFolder.name }}</strong></span>
        </div>

        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1">文件夹名称</label>
          <input
            ref="inputRef"
            v-model="folderName"
            @keydown.enter="handleSubmit"
            placeholder="请输入文件夹名称..."
            class="w-full h-9 px-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-800 outline-none focus:ring-1.5 focus:ring-blue-500"
          />
        </div>
      </div>

      <div class="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2 text-xs">
        <button @click="emit('close')" class="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-md cursor-pointer">取消</button>
        <button
          @click="handleSubmit"
          :disabled="!folderName.trim()"
          class="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md font-medium shadow-xs cursor-pointer"
        >
          确定
        </button>
      </div>
    </div>
  </div>
</template>
