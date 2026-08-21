<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { marked } from 'marked';
import {
  X,
  Save,
  Eye,
  Edit3,
  Columns,
  Star,
  Box,
  Share2,
  Download,
  Bold,
  Italic,
  Code,
  List,
  ListOrdered,
  CheckSquare,
  Heading1,
  Heading2,
  Quote,
  Table as TableIcon,
  Link as LinkIcon,
  Tag as TagIcon,
  Folder as FolderIcon,
  Copy,
  Check,
  CheckCheck,
  Maximize2,
  Minimize2,
  RotateCcw,
  RotateCw
} from 'lucide-vue-next';
import { Note, Folder } from '../types';
import { compareFolders } from '../utils/folderSort';

const props = defineProps<{
  note: Note;
  folders: Folder[];
  mode: 'split' | 'edit' | 'preview';
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
const localContent = ref(props.note.content);
const localFolderId = ref(props.note.folderId);
const localTags = ref<string[]>([...props.note.tags]);
const newTagInput = ref('');
const currentMode = ref<'split' | 'edit' | 'preview'>(props.mode);
const isFullscreen = ref(true);
const isCopied = ref(false);
const saveStatus = ref('已自动同步');
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const previewContainerRef = ref<HTMLElement | null>(null);

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

// Synchronize when note changes
watch(
  () => props.note.id,
  () => {
    localTitle.value = props.note.title;
    localContent.value = props.note.content;
    localFolderId.value = props.note.folderId;
    localTags.value = [...props.note.tags];
    contentHistory.value = [props.note.content || ''];
    contentHistoryIndex.value = 0;
  }
);

// History management for Markdown Note (Undo / Redo)
const contentHistory = ref<string[]>([props.note.content || '']);
const contentHistoryIndex = ref(0);
const isHistoryNavigating = ref(false);
const MAX_NOTE_HISTORY = 60;

const canUndo = computed(() => contentHistoryIndex.value > 0);
const canRedo = computed(() => contentHistoryIndex.value < contentHistory.value.length - 1);

function recordContentHistory(text: string) {
  if (isHistoryNavigating.value) return;
  if (contentHistory.value[contentHistoryIndex.value] === text) return;
  
  const next = contentHistory.value.slice(0, contentHistoryIndex.value + 1);
  next.push(text);
  if (next.length > MAX_NOTE_HISTORY) {
    next.shift();
  }
  contentHistory.value = next;
  contentHistoryIndex.value = next.length - 1;
}

function undo() {
  if (!canUndo.value) return;
  isHistoryNavigating.value = true;
  contentHistoryIndex.value--;
  localContent.value = contentHistory.value[contentHistoryIndex.value];
  triggerAutoSave();
  setTimeout(() => {
    isHistoryNavigating.value = false;
  }, 50);
}

function redo() {
  if (!canRedo.value) return;
  isHistoryNavigating.value = true;
  contentHistoryIndex.value++;
  localContent.value = contentHistory.value[contentHistoryIndex.value];
  triggerAutoSave();
  setTimeout(() => {
    isHistoryNavigating.value = false;
  }, 50);
}

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

// Editor-specific keyboard shortcuts
function handleEditorKeyDown(e: KeyboardEvent) {
  const isMod = e.metaKey || e.ctrlKey;

  // Undo / Redo
  if (isMod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) {
      redo();
    } else {
      undo();
    }
    return;
  }

  if (isMod && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    redo();
    return;
  }

  if (isMod && e.key.toLowerCase() === 's' && !e.shiftKey) {
    e.preventDefault();
    handleManualSave();
    return;
  }

  if (isMod && e.key.toLowerCase() === 'b') {
    e.preventDefault();
    insertFormat('**', '**', '加粗文字');
    return;
  }

  if (isMod && e.key.toLowerCase() === 'i') {
    e.preventDefault();
    insertFormat('*', '*', '斜体文字');
    return;
  }

  if (isMod && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    insertFormat('[', '](https://)', '链接标题');
    return;
  }

  if (isMod && e.shiftKey && e.key.toLowerCase() === 'c') {
    e.preventDefault();
    insertFormat('```typescript\n', '\n```', '// 代码内容');
    return;
  }

  if (isMod && e.key.toLowerCase() === 'p') {
    e.preventDefault();
    if (currentMode.value === 'split') currentMode.value = 'preview';
    else if (currentMode.value === 'preview') currentMode.value = 'edit';
    else currentMode.value = 'split';
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
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleEditorKeyDown);
});

function handleTitleChange() {
  triggerAutoSave();
}

let contentDebounceTimeout: any = null;
function handleContentChange() {
  triggerAutoSave();
  if (contentDebounceTimeout) clearTimeout(contentDebounceTimeout);
  contentDebounceTimeout = setTimeout(() => {
    recordContentHistory(localContent.value);
  }, 350);
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

// Markdown rendering with GFM
const renderedHtml = computed(() => {
  try {
    return marked.parse(localContent.value || '', { gfm: true, breaks: true });
  } catch (e) {
    return '<p class="text-red-500">Markdown 解析出错</p>';
  }
});

// Word count & stats
const wordCount = computed(() => {
  return localContent.value.replace(/\s+/g, '').length;
});

const readingTime = computed(() => {
  return Math.max(1, Math.ceil(wordCount.value / 300));
});

// Markdown Toolbar Helpers
function insertFormat(before: string, after = '', defaultText = '') {
  const el = textareaRef.value;
  if (!el) return;

  const start = el.selectionStart;
  const end = el.selectionEnd;
  const selectedText = el.value.substring(start, end) || defaultText;

  const replacement = before + selectedText + after;
  localContent.value =
    el.value.substring(0, start) + replacement + el.value.substring(end);

  recordContentHistory(localContent.value);
  triggerAutoSave();

  setTimeout(() => {
    el.focus();
    el.setSelectionRange(
      start + before.length,
      start + before.length + selectedText.length
    );
  }, 0);
}

// Universal Copy function
async function copyContent() {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(localContent.value);
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = localContent.value;
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
</script>

<template>
  <div
    id="note-editor-modal-container"
    class="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center animate-in fade-in duration-150"
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
          <!-- Mode Toggle: Edit / Split / Preview -->
          <div class="bg-gray-100 p-0.5 rounded-lg flex items-center text-xs text-gray-600">
            <button
              @click="currentMode = 'edit'"
              :class="['px-2.5 py-1 rounded-md transition-all font-medium cursor-pointer', currentMode === 'edit' ? 'bg-white shadow-xs text-blue-600' : 'hover:text-gray-900']"
              title="仅编辑"
            >
              <Edit3 class="w-3.5 h-3.5" />
            </button>
            <button
              @click="currentMode = 'split'"
              :class="['px-2.5 py-1 rounded-md transition-all font-medium hidden sm:block cursor-pointer', currentMode === 'split' ? 'bg-white shadow-xs text-blue-600' : 'hover:text-gray-900']"
              title="分屏对照"
            >
              <Columns class="w-3.5 h-3.5" />
            </button>
            <button
              @click="currentMode = 'preview'"
              :class="['px-2.5 py-1 rounded-md transition-all font-medium cursor-pointer', currentMode === 'preview' ? 'bg-white shadow-xs text-blue-600' : 'hover:text-gray-900']"
              title="仅预览"
            >
              <Eye class="w-3.5 h-3.5" />
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
            class="px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-md transition-colors flex items-center gap-1 border border-blue-200 cursor-pointer"
          >
            <Save class="w-3.5 h-3.5" />
            <span class="hidden sm:inline">保存</span>
            <kbd class="text-[9px] font-mono text-blue-400 hidden sm:inline">{{ isMac ? '⌘S' : 'Ctrl+S' }}</kbd>
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

      <!-- Markdown Quick Toolbar (Only shown when not in preview-only mode) -->
      <div
        v-if="currentMode !== 'preview'"
        id="markdown-toolbar"
        class="h-10 px-4 bg-gray-50/80 border-b border-gray-100 flex items-center gap-1 overflow-x-auto text-gray-600 shrink-0 select-none"
      >
        <!-- Undo / Redo -->
        <button
          @click="undo"
          :disabled="!canUndo"
          :class="[
            'p-1.5 rounded transition-all',
            canUndo
              ? 'hover:bg-white hover:shadow-xs text-gray-600 hover:text-gray-900 cursor-pointer'
              : 'text-gray-300 cursor-not-allowed opacity-40'
          ]"
          :title="'撤销 (' + (isMac ? '⌘Z' : 'Ctrl+Z') + ')'"
        >
          <RotateCcw class="w-3.5 h-3.5" />
        </button>
        <button
          @click="redo"
          :disabled="!canRedo"
          :class="[
            'p-1.5 rounded transition-all',
            canRedo
              ? 'hover:bg-white hover:shadow-xs text-gray-600 hover:text-gray-900 cursor-pointer'
              : 'text-gray-300 cursor-not-allowed opacity-40'
          ]"
          :title="'重做 (' + (isMac ? '⌘⇧Z' : 'Ctrl+Y') + ')'"
        >
          <RotateCw class="w-3.5 h-3.5" />
        </button>
        <div class="h-3.5 w-px bg-gray-200 mx-1"></div>

        <button
          @click="insertFormat('**', '**', '加粗文字')"
          class="p-1.5 hover:bg-white hover:shadow-xs rounded text-gray-600 hover:text-gray-900 transition-all cursor-pointer"
          :title="'粗体 (' + (isMac ? '⌘B' : 'Ctrl+B') + ')'"
        >
          <Bold class="w-3.5 h-3.5" />
        </button>
        <button
          @click="insertFormat('*', '*', '斜体文字')"
          class="p-1.5 hover:bg-white hover:shadow-xs rounded text-gray-600 hover:text-gray-900 transition-all cursor-pointer"
          :title="'斜体 (' + (isMac ? '⌘I' : 'Ctrl+I') + ')'"
        >
          <Italic class="w-3.5 h-3.5" />
        </button>
        <div class="h-3.5 w-px bg-gray-200 mx-1"></div>

        <button
          @click="insertFormat('# ', '', '一级标题')"
          class="p-1.5 hover:bg-white hover:shadow-xs rounded text-gray-600 hover:text-gray-900 transition-all cursor-pointer"
          title="一级标题"
        >
          <Heading1 class="w-3.5 h-3.5" />
        </button>
        <button
          @click="insertFormat('## ', '', '二级标题')"
          class="p-1.5 hover:bg-white hover:shadow-xs rounded text-gray-600 hover:text-gray-900 transition-all cursor-pointer"
          title="二级标题"
        >
          <Heading2 class="w-3.5 h-3.5" />
        </button>
        <div class="h-3.5 w-px bg-gray-200 mx-1"></div>

        <button
          @click="insertFormat('```typescript\n', '\n```', '// 在此编写代码')"
          class="p-1.5 hover:bg-white hover:shadow-xs rounded text-gray-600 hover:text-gray-900 transition-all cursor-pointer"
          :title="'代码块 (' + (isMac ? '⌘⇧C' : 'Ctrl+⇧+C') + ')'"
        >
          <Code class="w-3.5 h-3.5" />
        </button>
        <button
          @click="insertFormat('> ', '', '引用内容')"
          class="p-1.5 hover:bg-white hover:shadow-xs rounded text-gray-600 hover:text-gray-900 transition-all cursor-pointer"
          title="引用"
        >
          <Quote class="w-3.5 h-3.5" />
        </button>
        <button
          @click="insertFormat('- ', '', '列表项')"
          class="p-1.5 hover:bg-white hover:shadow-xs rounded text-gray-600 hover:text-gray-900 transition-all cursor-pointer"
          title="无序列表"
        >
          <List class="w-3.5 h-3.5" />
        </button>
        <button
          @click="insertFormat('1. ', '', '有序列表项')"
          class="p-1.5 hover:bg-white hover:shadow-xs rounded text-gray-600 hover:text-gray-900 transition-all cursor-pointer"
          title="有序列表"
        >
          <ListOrdered class="w-3.5 h-3.5" />
        </button>
        <button
          @click="insertFormat('- [ ] ', '', '待办任务')"
          class="p-1.5 hover:bg-white hover:shadow-xs rounded text-gray-600 hover:text-gray-900 transition-all cursor-pointer"
          title="任务清单"
        >
          <CheckSquare class="w-3.5 h-3.5" />
        </button>
        <button
          @click="insertFormat('| 列 1 | 列 2 |\n| :--- | :--- |\n| 单元格 1 | 单元格 2 |\n')"
          class="p-1.5 hover:bg-white hover:shadow-xs rounded text-gray-600 hover:text-gray-900 transition-all cursor-pointer"
          title="插入表格"
        >
          <TableIcon class="w-3.5 h-3.5" />
        </button>
        <button
          @click="insertFormat('[', '](https://)', '链接描述')"
          class="p-1.5 hover:bg-white hover:shadow-xs rounded text-gray-600 hover:text-gray-900 transition-all cursor-pointer"
          :title="'插入链接 (' + (isMac ? '⌘K' : 'Ctrl+K') + ')'"
        >
          <LinkIcon class="w-3.5 h-3.5" />
        </button>
      </div>

      <!-- Main Editor / Preview Body -->
      <div id="editor-split-body" class="flex-1 flex overflow-hidden">
        <!-- Editor Input Panel -->
        <div
          v-show="currentMode === 'edit' || currentMode === 'split'"
          :class="[
            'h-full flex flex-col bg-white border-r border-gray-100',
            currentMode === 'split' ? 'w-1/2' : 'w-full'
          ]"
        >
          <textarea
            id="markdown-source-textarea"
            ref="textareaRef"
            v-model="localContent"
            @input="handleContentChange"
            placeholder="使用 Markdown 语法书写你的笔记..."
            class="w-full flex-1 p-6 text-sm sm:text-base font-mono text-gray-800 bg-transparent border-none outline-none resize-none leading-relaxed selection:bg-blue-100 selection:text-blue-900 select-text cursor-text"
          ></textarea>
        </div>

        <!-- Markdown Rendered Preview Panel (Fully selectable & copyable) -->
        <div
          v-show="currentMode === 'preview' || currentMode === 'split'"
          ref="previewContainerRef"
          :class="[
            'h-full overflow-y-auto bg-[#fafafa]/60 p-6 sm:p-8 select-text cursor-text relative',
            currentMode === 'split' ? 'w-1/2' : 'w-full'
          ]"
        >
          <!-- Styled Markdown Preview -->
          <article
            id="rendered-markdown-article"
            class="prose prose-slate max-w-none text-gray-800 text-sm sm:text-base leading-relaxed space-y-4 select-text cursor-text selection:bg-blue-100 selection:text-blue-900"
            v-html="renderedHtml"
          ></article>
        </div>
      </div>

      <!-- Editor Footer: Tags & Status -->
      <div class="h-10 px-6 bg-white border-t border-gray-100 flex items-center justify-between text-xs text-gray-400 shrink-0 select-none">
        <!-- Tag List -->
        <div class="flex items-center gap-1.5 overflow-x-auto py-1 mr-4">
          <TagIcon class="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <span
            v-for="tag in localTags"
            :key="tag"
            class="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-[11px] flex items-center gap-1 shrink-0 select-text"
          >
            #{{ tag }}
            <button @click="removeTag(tag)" class="hover:text-blue-800 text-xs cursor-pointer">×</button>
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
/* Ensure text inside preview article and all children can be selected and copied */
#rendered-markdown-article,
#rendered-markdown-article * {
  user-select: text !important;
  -webkit-user-select: text !important;
  -moz-user-select: text !important;
  -ms-user-select: text !important;
  cursor: text;
}

#rendered-markdown-article a,
#rendered-markdown-article input[type="checkbox"] {
  cursor: pointer;
}

#rendered-markdown-article ::selection {
  background-color: #bfdbfe !important;
  color: #1e3a8a !important;
}

/* Markdown Content Typography and styling */
#rendered-markdown-article h1 {
  font-size: 1.6rem;
  font-weight: 700;
  color: #0f172a;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 0.4rem;
  margin-top: 1rem;
  margin-bottom: 0.8rem;
}
#rendered-markdown-article h2 {
  font-size: 1.3rem;
  font-weight: 600;
  color: #1e293b;
  margin-top: 1.2rem;
  margin-bottom: 0.6rem;
}
#rendered-markdown-article h3 {
  font-size: 1.1rem;
  font-weight: 600;
  color: #334155;
  margin-top: 1rem;
  margin-bottom: 0.4rem;
}
#rendered-markdown-article p {
  margin-bottom: 0.8rem;
  line-height: 1.7;
}
#rendered-markdown-article ul {
  list-style-type: disc;
  padding-left: 1.5rem;
  margin-bottom: 0.8rem;
}
#rendered-markdown-article ol {
  list-style-type: decimal;
  padding-left: 1.5rem;
  margin-bottom: 0.8rem;
}
#rendered-markdown-article li {
  margin-bottom: 0.3rem;
}
#rendered-markdown-article blockquote {
  border-left: 4px solid #3b82f6;
  background-color: #eff6ff;
  padding: 0.6rem 1rem;
  margin: 0.8rem 0;
  color: #1e40af;
  border-radius: 0 0.375rem 0.375rem 0;
}
#rendered-markdown-article code {
  background-color: #f1f5f9;
  color: #ea580c;
  padding: 0.15rem 0.35rem;
  border-radius: 0.25rem;
  font-size: 0.88em;
  font-family: monospace;
}
#rendered-markdown-article pre {
  background-color: #1e293b;
  color: #f8fafc;
  padding: 1rem;
  border-radius: 0.5rem;
  overflow-x: auto;
  margin: 1rem 0;
  position: relative;
}
#rendered-markdown-article pre code {
  background-color: transparent;
  color: inherit;
  padding: 0;
}
#rendered-markdown-article table {
  width: 100%;
  border-collapse: collapse;
  margin: 1rem 0;
  font-size: 0.9em;
}
#rendered-markdown-article th,
#rendered-markdown-article td {
  border: 1px solid #e2e8f0;
  padding: 0.5rem 0.75rem;
  text-align: left;
}
#rendered-markdown-article th {
  background-color: #f8fafc;
  font-weight: 600;
}
#rendered-markdown-article input[type="checkbox"] {
  margin-right: 0.4rem;
}
</style>
