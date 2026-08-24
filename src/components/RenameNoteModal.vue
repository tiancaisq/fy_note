<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { X, Edit2 } from 'lucide-vue-next';
import { Note } from '../types';

const props = defineProps<{
  note: Note;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'submit', noteId: string, newTitle: string): void;
}>();

const title = ref(props.note.title);
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
  inputRef.value?.select();
});

function handleSubmit() {
  if (title.value.trim()) {
    emit('submit', props.note.id, title.value.trim());
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
          <Edit2 class="w-4 h-4 text-blue-600" />
          <span>重命名笔记</span>
        </h3>
        <button @click="emit('close')" class="text-gray-400 hover:text-gray-600">
          <X class="w-4 h-4" />
        </button>
      </div>

      <div class="p-5 space-y-3">
        <label class="block text-xs font-semibold text-gray-600">笔记名称</label>
        <input
          ref="inputRef"
          v-model="title"
          @keydown.enter="handleSubmit"
          placeholder="请输入笔记名称..."
          class="w-full h-9 px-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-800 outline-none focus:ring-1.5 focus:ring-blue-500"
        />
      </div>

      <div class="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2 text-xs">
        <button @click="emit('close')" class="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-md">取消</button>
        <button
          @click="handleSubmit"
          :disabled="!title.trim()"
          class="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md font-medium shadow-xs"
        >
          确定
        </button>
      </div>
    </div>
  </div>
</template>
