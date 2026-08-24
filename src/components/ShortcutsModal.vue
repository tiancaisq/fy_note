<script setup lang="ts">
import { computed } from 'vue';
import { X, Command, Keyboard } from 'lucide-vue-next';

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const isMac = computed(() => {
  return typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
});

const modKey = computed(() => (isMac.value ? '⌘' : 'Ctrl'));
const altKey = computed(() => (isMac.value ? '⌥' : 'Alt'));
const shiftKey = computed(() => (isMac.value ? '⇧' : 'Shift'));

const shortcutGroups = computed(() => [
  {
    title: '全局快捷键',
    shortcuts: [
      { keys: [modKey.value, 'N'], desc: '新建 Markdown 笔记' },
      { keys: [modKey.value, 'M'], desc: '新建思维导图' },
      { keys: [modKey.value, 'D'], desc: '新建 Draw.io 图表' },
      { keys: [modKey.value, 'F'], desc: '聚焦并打开全局搜索' },
      { keys: ['/'], desc: '快速搜索 (未在输入框时)' },
      { keys: [modKey.value, shiftKey.value, 'N'], desc: '新建文件夹' },
      { keys: [modKey.value, shiftKey.value, 'I'], desc: '打开导入弹窗' },
      { keys: [modKey.value, shiftKey.value, 'E'], desc: '导出全量备份' },
      { keys: [modKey.value, '/'], desc: '查看快捷键帮助' },
      { keys: ['Esc'], desc: '关闭弹窗 / 搜索下拉' },
    ],
  },
  {
    title: 'Draw.io 图表快捷键 (流程图/工程图)',
    shortcuts: [
      { keys: [modKey.value, 'S'], desc: '保存图表到本地与云端' },
      { keys: [modKey.value, 'Z'], desc: '撤销上一步形状绘制' },
      { keys: [modKey.value, 'Y'], desc: '重做下一步形状绘制' },
      { keys: ['Space', '+拖拽'], desc: '平移平滑移动画布' },
      { keys: [modKey.value, '+滚轮'], desc: '缩放放大与缩小画布' },
      { keys: ['Delete'], desc: '删除选中图形/连接线' },
      { keys: ['双击形状'], desc: '编辑节点文本' },
      { keys: [modKey.value, 'E'], desc: '导出多种图表格式' },
    ],
  },
  {
    title: '思维导图快捷键 (脑图模式)',
    shortcuts: [
      { keys: ['Tab'], desc: '插入子主题节点' },
      { keys: ['Enter'], desc: '插入同级同辈节点' },
      { keys: ['Shift', 'Enter'], desc: '插入上级父主题节点' },
      { keys: ['F2', '或双击'], desc: '编辑节点文本' },
      { keys: ['Delete', '退格'], desc: '删除选中节点' },
      { keys: [modKey.value, 'Z'], desc: '撤销上一步操作' },
      { keys: [modKey.value, 'Y'], desc: '重做下一步操作' },
      { keys: ['Space', '+拖拽'], desc: '平移移动画布' },
    ],
  },
  {
    title: 'Markdown 编辑器快捷键',
    shortcuts: [
      { keys: [modKey.value, 'S'], desc: '即时保存笔记' },
      { keys: [modKey.value, 'B'], desc: '粗体文本 (**text**)' },
      { keys: [modKey.value, 'I'], desc: '斜体文本 (*text*)' },
      { keys: [modKey.value, 'K'], desc: '插入超链接' },
      { keys: [modKey.value, shiftKey.value, 'C'], desc: '插入代码块' },
      { keys: [modKey.value, 'P'], desc: '切换分屏 / 预览模式' },
      { keys: [modKey.value, shiftKey.value, 'S'], desc: '标星 / 取消标星' },
      { keys: ['Esc'], desc: '退出全屏编辑' },
    ],
  },
  {
    title: '列表与视图导航',
    shortcuts: [
      { keys: [altKey.value, '1'], desc: '切换到「我的笔记」' },
      { keys: [altKey.value, '2'], desc: '切换到「我的分享」' },
      { keys: [altKey.value, '3'], desc: '切换到「我的标星」' },
      { keys: [altKey.value, '4'], desc: '切换到「我的收藏」' },
      { keys: [altKey.value, '5'], desc: '切换到「我的回收站」' },
      { keys: [altKey.value, '6'], desc: '切换到「文件时间线」' },
    ],
  },
]);

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
</script>

<template>
  <div
    id="shortcuts-modal-overlay"
    class="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150 select-none"
    @mousedown="handleBackdropMouseDown"
    @click="handleBackdropClick"
  >
    <div class="bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col max-h-[85vh]">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Keyboard class="w-4 h-4" />
          </div>
          <div>
            <h3 class="text-sm font-bold text-gray-900">键盘快捷键指南</h3>
            <p class="text-[11px] text-gray-400">使用快捷键以更高效率管理和编写笔记</p>
          </div>
        </div>
        <button
          @click="emit('close')"
          class="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition-colors cursor-pointer"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Shortcuts List grouped -->
      <div class="p-6 space-y-6 overflow-y-auto">
        <div v-for="group in shortcutGroups" :key="group.title" class="space-y-2.5">
          <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider">{{ group.title }}</h4>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div
              v-for="item in group.shortcuts"
              :key="item.desc"
              class="flex items-center justify-between p-2 rounded-lg bg-gray-50/70 border border-gray-100 hover:bg-gray-100/60 transition-colors"
            >
              <span class="text-xs text-gray-700 font-medium">{{ item.desc }}</span>
              <div class="flex items-center gap-1">
                <kbd
                  v-for="k in item.keys"
                  :key="k"
                  class="px-1.5 py-0.5 text-[11px] font-mono font-semibold text-gray-700 bg-white border border-gray-200 rounded shadow-2xs"
                >
                  {{ k }}
                </kbd>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
        <span>按 <kbd class="px-1 py-0.2 bg-white border border-gray-200 rounded text-[11px] font-mono">Esc</kbd> 或点击外部关闭</span>
        <button
          @click="emit('close')"
          class="px-4 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium shadow-2xs cursor-pointer transition-colors"
        >
          我知道了
        </button>
      </div>
    </div>
  </div>
</template>
