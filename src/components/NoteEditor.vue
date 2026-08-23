<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import Vditor from 'vditor';
import 'vditor/dist/index.css';
import {
  X,
  Save,
  Star,
  Box,
  Share2,
  Download,
  Tag as TagIcon,
  Folder as FolderIcon,
  Copy,
  Check,
  CheckCheck,
  Maximize2,
  Minimize2,
  Sparkles,
  FileEdit,
  LayoutTemplate,
  Columns
} from 'lucide-vue-next';
import { Note, Folder } from '../types';
import { compareFolders } from '../utils/folderSort';

const props = defineProps<{
  note: Note;
  folders: Folder[];
  mode?: 'split' | 'edit' | 'preview';
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'updateNote', id: string, updates: Partial<Note>): void;
  (e: 'toggleStar', noteId: string): void;
  (e: 'toggleFavorite', noteId: string): void;
  (e: 'openShare', note: Note): void;
  (e: 'exportNote', note: Note): void;
}>();

const isMac = computed(() => {
  return typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
});

const localTitle = ref(props.note.title);
const localContent = ref(props.note.content || '');
const localFolderId = ref(props.note.folderId);
const localTags = ref<string[]>([...props.note.tags]);
const newTagInput = ref('');
const isFullscreen = ref(true);
const isCopied = ref(false);
const saveStatus = ref('已自动同步');

// Vditor instance and container
const vditorContainerRef = ref<HTMLDivElement | null>(null);
let vditorInstance: Vditor | null = null;
const isVditorReady = ref(false);
const currentVditorMode = ref<'ir' | 'wysiwyg' | 'sv'>('ir');

// Hierarchical folders formatted with level indentation
const hierarchicalFolders = computed(() => {
  const result: { id: string; name: string; level: number; fullPath: string; prefix: string }[] = [];
  const list = props.folders || [];
  const validIds = new Set(list.map((f) => f.id));
  const firstId = list.find((f) => !f.parentId)?.id || list[0]?.id || '';

  function getChildren(pId: string | null = null) {
    if (!pId) {
      return list.filter((f) => !f.parentId).sort(compareFolders);
    }
    return list
      .filter((f) => {
        if (f.parentId === pId) return true;
        if (pId === firstId && f.parentId && !validIds.has(f.parentId) && f.id !== firstId) {
          return true;
        }
        return false;
      })
      .sort(compareFolders);
  }

  function traverse(parentId: string | null = null, level = 0, parentPath = '', visited = new Set<string>()) {
    const children = getChildren(parentId);

    for (const child of children) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      const currentPath = parentPath ? `${parentPath} / ${child.name}` : child.name;
      const indent = level === 0 ? '' : '　'.repeat(level) + '└ ';
      result.push({
        id: child.id,
        name: child.name,
        level,
        fullPath: currentPath,
        prefix: indent,
      });
      traverse(child.id, level + 1, currentPath, visited);
    }
  }

  traverse(null, 0, '');
  return result;
});

// Auto-save debounce
let saveTimeout: any = null;
function triggerAutoSave() {
  saveStatus.value = '保存中...';
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    emit('updateNote', props.note.id, {
      title: localTitle.value || '未命名笔记',
      content: localContent.value,
      folderId: localFolderId.value,
      tags: localTags.value,
    });
    saveStatus.value = '已自动同步';
  }, 400);
}

function handleManualSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  emit('updateNote', props.note.id, {
    title: localTitle.value || '未命名笔记',
    content: localContent.value,
    folderId: localFolderId.value,
    tags: localTags.value,
  });
  saveStatus.value = '已即时保存 ✓';
  setTimeout(() => {
    saveStatus.value = '已自动同步';
  }, 2000);
}

function handleTitleChange() {
  triggerAutoSave();
}

function handleFolderChange(e: Event) {
  const target = e.target as HTMLSelectElement;
  localFolderId.value = target.value;
  triggerAutoSave();
}

function addTag() {
  const val = newTagInput.value.trim();
  if (val && !localTags.value.includes(val)) {
    localTags.value.push(val);
    newTagInput.value = '';
    triggerAutoSave();
  }
}

function removeTag(tag: string) {
  localTags.value = localTags.value.filter((t) => t !== tag);
  triggerAutoSave();
}

// Word count & stats
const wordCount = computed(() => {
  return (localContent.value || '').replace(/\s+/g, '').length;
});

const readingTime = computed(() => {
  return Math.max(1, Math.ceil(wordCount.value / 300));
});

// Universal Copy function
async function copyContent() {
  try {
    const text = vditorInstance ? vditorInstance.getValue() : localContent.value;
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      textArea.remove();
    }
    isCopied.value = true;
    setTimeout(() => {
      isCopied.value = false;
    }, 2200);
  } catch (err) {
    console.error('Copy failed', err);
  }
}

// Switch Vditor Mode (ir: 即时渲染 / wysiwyg: 所见即所得 / sv: 分屏源码)
function switchMode(mode: 'ir' | 'wysiwyg' | 'sv') {
  currentVditorMode.value = mode;
  if (!vditorInstance) return;
  
  // Vditor provides internal mode switching by re-initializing or toolbar
  // Or we can safely recreate/switch
  initVditor(mode);
}

// Initialize Vditor instance
function initVditor(initialMode: 'ir' | 'wysiwyg' | 'sv' = 'ir') {
  if (!vditorContainerRef.value) return;

  if (vditorInstance) {
    try {
      vditorInstance.destroy();
    } catch (e) {
      console.warn('Vditor destroy error:', e);
    }
    vditorInstance = null;
    isVditorReady.value = false;
  }

  currentVditorMode.value = initialMode;

  vditorInstance = new Vditor(vditorContainerRef.value, {
    value: localContent.value,
    height: '100%',
    mode: initialMode,
    placeholder: '开始使用 Markdown 记录想法、文档或整理知识...',
    theme: 'classic',
    icon: 'material',
    cache: {
      enable: false, // 禁用默认 localstorage 缓存，避免多笔记切换污染
    },
    counter: {
      enable: false, // 使用我们自己的底部精致计数器
    },
    outline: {
      enable: true,
      position: 'left',
    },
    preview: {
      delay: 150,
      mode: 'both',
      hljs: {
        enable: true,
        style: 'github',
        lineNumber: true,
      },
      markdown: {
        toc: true,
        mark: true,
        footnotes: true,
        autoSpace: true,
      },
      math: {
        engine: 'KaTeX',
      },
    },
    toolbarConfig: {
      pin: true,
    },
    toolbar: [
      'emoji',
      'headings',
      'bold',
      'italic',
      'strike',
      'link',
      '|',
      'list',
      'ordered-list',
      'check',
      'outdent',
      'indent',
      '|',
      'quote',
      'line',
      'code',
      'inline-code',
      'insert-before',
      'insert-after',
      '|',
      'table',
      'undo',
      'redo',
      '|',
      'outline',
      'content-theme',
      'code-theme',
      'fullscreen',
    ],
    input: (val: string) => {
      localContent.value = val;
      triggerAutoSave();
    },
    after: () => {
      isVditorReady.value = true;
      if (vditorInstance && localContent.value !== vditorInstance.getValue()) {
        vditorInstance.setValue(localContent.value);
      }
    },
  });
}

// Synchronize when note changes
watch(
  () => props.note.id,
  () => {
    localTitle.value = props.note.title;
    localContent.value = props.note.content || '';
    localFolderId.value = props.note.folderId;
    localTags.value = [...props.note.tags];

    if (vditorInstance && isVditorReady.value) {
      vditorInstance.setValue(props.note.content || '', true);
    }
  }
);

// Keyboard shortcuts for save
function handleEditorKeyDown(e: KeyboardEvent) {
  const isMod = e.metaKey || e.ctrlKey;

  if (isMod && e.key.toLowerCase() === 's' && !e.shiftKey) {
    e.preventDefault();
    handleManualSave();
    return;
  }

  if (isMod && e.shiftKey && e.key.toLowerCase() === 's') {
    e.preventDefault();
    emit('toggleStar', props.note.id);
    return;
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleEditorKeyDown);
  nextTick(() => {
    initVditor('ir');
  });
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleEditorKeyDown);
  if (vditorInstance) {
    try {
      vditorInstance.destroy();
    } catch (e) {
      // ignore
    }
    vditorInstance = null;
  }
});
</script>

<template>
  <div
    id="note-editor-modal-container"
    class="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center animate-in fade-in duration-150 select-none"
    :class="isFullscreen ? 'p-0' : 'p-2 sm:p-4'"
  >
    <div
      id="note-editor-dialog"
      :class="[
        'bg-white flex flex-col overflow-hidden border border-gray-200 transition-all duration-200',
        isFullscreen
          ? 'w-full h-full rounded-none shadow-none'
          : 'w-full max-w-6xl h-[92vh] rounded-2xl shadow-2xl'
      ]"
    >
      <!-- Editor Top Bar -->
      <div class="h-14 px-3 sm:px-5 bg-white border-b border-gray-100 flex items-center justify-between shrink-0 select-none">
        <!-- Close button, Title & Folder info -->
        <div class="flex items-center gap-2.5 sm:gap-3 flex-1 mr-3 sm:mr-4 min-w-0">
          <!-- Close Editor Button at top-left corner -->
          <button
            id="btn-close-editor"
            @click="emit('close')"
            class="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer shrink-0"
            title="关闭编辑器"
          >
            <X class="w-5 h-5" />
          </button>

          <div class="h-4 w-px bg-gray-200 shrink-0"></div>

          <div class="w-7 h-7 rounded bg-[#ea580c] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
            <span>M↓</span>
          </div>

          <input
            id="editor-note-title-input"
            v-model="localTitle"
            @input="handleTitleChange"
            placeholder="输入笔记标题..."
            class="text-base sm:text-lg font-bold text-gray-900 placeholder-gray-300 border-none outline-none focus:ring-0 bg-transparent flex-1 truncate select-text"
          />

          <!-- Folder Picker -->
          <div class="hidden md:flex items-center gap-1.5 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-md text-xs text-gray-600">
            <FolderIcon class="w-3.5 h-3.5 text-amber-500" />
            <select
              :value="localFolderId"
              @change="handleFolderChange"
              class="bg-transparent border-none outline-none text-xs text-gray-700 cursor-pointer"
            >
              <option v-for="f in hierarchicalFolders" :key="f.id" :value="f.id">
                {{ f.prefix }}📁 {{ f.name }}
              </option>
            </select>
          </div>
        </div>

        <!-- Mode Switches & Actions -->
        <div class="flex items-center gap-2 shrink-0">
          <!-- Mode Toggle: WYSIWYG / Instant Rendering (IR) / Split View (SV) -->
          <div class="bg-gray-100 p-0.5 rounded-lg flex items-center text-xs text-gray-600">
            <button
              @click="switchMode('ir')"
              :class="[
                'px-2.5 py-1 rounded-md transition-all font-medium flex items-center gap-1 cursor-pointer',
                currentVditorMode === 'ir' ? 'bg-white shadow-xs text-emerald-700 font-semibold' : 'hover:text-gray-900'
              ]"
              title="即时渲染 (Typora 风格即时排版)"
            >
              <Sparkles class="w-3.5 h-3.5" />
              <span class="hidden md:inline">即时渲染</span>
            </button>
            <button
              @click="switchMode('wysiwyg')"
              :class="[
                'px-2.5 py-1 rounded-md transition-all font-medium flex items-center gap-1 cursor-pointer',
                currentVditorMode === 'wysiwyg' ? 'bg-white shadow-xs text-emerald-700 font-semibold' : 'hover:text-gray-900'
              ]"
              title="所见即所得 (富文本排版编辑)"
            >
              <LayoutTemplate class="w-3.5 h-3.5" />
              <span class="hidden md:inline">所见即所得</span>
            </button>
            <button
              @click="switchMode('sv')"
              :class="[
                'px-2.5 py-1 rounded-md transition-all font-medium hidden sm:flex items-center gap-1 cursor-pointer',
                currentVditorMode === 'sv' ? 'bg-white shadow-xs text-emerald-700 font-semibold' : 'hover:text-gray-900'
              ]"
              title="分屏对照 (源码与实时预览)"
            >
              <Columns class="w-3.5 h-3.5" />
              <span class="hidden md:inline">分屏对照</span>
            </button>
          </div>

          <div class="h-4 w-px bg-gray-200 mx-1"></div>

          <!-- Star & Favorite Buttons -->
          <button
            @click="emit('toggleStar', note.id)"
            class="p-1.5 text-gray-400 hover:text-amber-500 hover:bg-gray-50 rounded-md transition-colors cursor-pointer"
            title="标星"
          >
            <Star class="w-4 h-4" :class="note.isStarred ? 'text-amber-500 fill-amber-500' : ''" />
          </button>

          <button
            @click="emit('toggleFavorite', note.id)"
            class="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-gray-50 rounded-md transition-colors cursor-pointer"
            title="收藏"
          >
            <Box class="w-4 h-4" :class="note.isFavorite ? 'text-indigo-600' : ''" />
          </button>

          <!-- Share Button -->
          <button
            @click="emit('openShare', note)"
            class="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors text-xs flex items-center gap-1 font-medium cursor-pointer"
            title="分享"
          >
            <Share2 class="w-4 h-4 text-blue-600" />
            <span class="hidden sm:inline text-blue-600">分享</span>
          </button>

          <!-- Top Bar Universal Copy Content Button -->
          <button
            @click="copyContent"
            class="px-2.5 py-1 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="复制笔记全部内容"
          >
            <CheckCheck v-if="isCopied" class="w-3.5 h-3.5 text-emerald-600" />
            <Copy v-else class="w-3.5 h-3.5 text-gray-500" />
            <span :class="{ 'text-emerald-600 font-semibold': isCopied }">{{ isCopied ? '已复制' : '复制内容' }}</span>
          </button>

          <!-- Export .md -->
          <button
            @click="emit('exportNote', note)"
            class="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-50 rounded-md transition-colors cursor-pointer"
            title="导出 Markdown"
          >
            <Download class="w-4 h-4" />
          </button>

          <!-- Manual Save Button -->
          <button
            @click="handleManualSave"
            :title="'即时保存 (' + (isMac ? '⌘S' : 'Ctrl+S') + ')'"
            class="px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 rounded-md transition-colors flex items-center gap-1 border border-emerald-200 cursor-pointer"
          >
            <Save class="w-3.5 h-3.5 text-emerald-600" />
            <span class="hidden sm:inline">保存</span>
            <kbd class="text-[9px] font-mono text-emerald-500 hidden sm:inline">{{ isMac ? '⌘S' : 'Ctrl+S' }}</kbd>
          </button>

          <!-- Fullscreen Toggle Button -->
          <button
            @click="isFullscreen = !isFullscreen"
            class="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors cursor-pointer"
            :title="isFullscreen ? '还原窗口' : '最大化窗口'"
          >
            <Minimize2 v-if="isFullscreen" class="w-4 h-4" />
            <Maximize2 v-else class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- Main Vditor Container Body -->
      <div id="vditor-wrapper" class="flex-1 w-full overflow-hidden relative flex flex-col bg-white">
        <div ref="vditorContainerRef" id="vditor-editor-instance" class="w-full flex-1 overflow-hidden"></div>
      </div>

      <!-- Editor Footer: Tags & Status -->
      <div class="h-10 px-6 bg-white border-t border-gray-100 flex items-center justify-between text-xs text-gray-400 shrink-0 select-none">
        <!-- Tag List -->
        <div class="flex items-center gap-1.5 overflow-x-auto py-1 mr-4">
          <TagIcon class="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <span
            v-for="tag in localTags"
            :key="tag"
            class="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-[11px] flex items-center gap-1 shrink-0 select-text"
          >
            #{{ tag }}
            <button @click="removeTag(tag)" class="hover:text-emerald-900 text-xs cursor-pointer">×</button>
          </span>
          <input
            v-model="newTagInput"
            @keydown.enter.prevent="addTag"
            placeholder="+ 添加标签 (回车)"
            class="bg-transparent border-none outline-none text-[11px] text-gray-600 placeholder-gray-300 w-24 select-text"
          />
        </div>

        <!-- Stats & Auto Save -->
        <div class="flex items-center gap-4 shrink-0 text-gray-400 text-[11px]">
          <span>字数: <strong class="text-gray-600">{{ wordCount }}</strong></span>
          <span>阅读时间: ~{{ readingTime }} 分钟</span>
          <span class="flex items-center gap-1 text-emerald-600 font-medium">
            <Check class="w-3 h-3" /> {{ saveStatus }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* Vditor Container Custom Styling & Integration */
#vditor-editor-instance {
  border: none !important;
  border-radius: 0 !important;
}

#vditor-editor-instance .vditor-toolbar {
  border-bottom: 1px solid #f1f5f9 !important;
  background-color: #f8fafc !important;
  padding: 4px 12px !important;
}

#vditor-editor-instance .vditor-content {
  background-color: #ffffff !important;
}

#vditor-editor-instance .vditor-reset {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
  font-size: 15px !important;
  line-height: 1.7 !important;
  color: #1e293b !important;
}

#vditor-editor-instance .vditor-toolbar__item {
  color: #475569 !important;
}

#vditor-editor-instance .vditor-toolbar__item:hover {
  color: #059669 !important;
  background-color: #ecfdf5 !important;
}

#vditor-editor-instance .vditor-toolbar__item--current {
  color: #059669 !important;
  background-color: #d1fae5 !important;
}

#vditor-editor-instance .vditor-outline {
  border-right: 1px solid #e2e8f0 !important;
  background-color: #f8fafc !important;
}

#vditor-editor-instance .vditor-outline__item--current {
  background-color: #ecfdf5 !important;
  color: #059669 !important;
  font-weight: 600 !important;
}
</style>
