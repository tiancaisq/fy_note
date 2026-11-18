<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import Vditor from 'vditor';
import 'vditor/dist/index.css';
import {
  X,
  Download,
  Tag as TagIcon,
  Copy,
  Check,
  CheckCheck,
  Maximize2,
  Minimize2,
  Sparkles,
  LayoutTemplate,
  Columns,
  Eye,
  EyeOff,
  Search,
  ChevronDown,
  ChevronUp,
  Replace,
  CaseSensitive
} from 'lucide-vue-next';
import { Note } from '../types';
import FileFormatIcon from './icons/FileFormatIcon.vue';

const props = withDefaults(
  defineProps<{
    note: Note;
    mode?: 'split' | 'edit' | 'preview';
    isActive?: boolean;
  }>(),
  {
    isActive: true,
  }
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'updateNote', id: string, updates: Partial<Note>): void;
  (e: 'exportNote', note: Note): void;
}>();

const isMac = computed(() => {
  return typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
});

const localTitle = ref(props.note.title);
const localContent = ref(props.note.content || '');
const localTags = ref<string[]>([...props.note.tags]);
const newTagInput = ref('');
const isFullscreen = ref(false);
const isCopied = ref(false);
const saveStatus = ref('已自动同步');

// Vditor instance and container
const vditorContainerRef = ref<HTMLDivElement | null>(null);
let vditorInstance: Vditor | null = null;
const isVditorReady = ref(false);
const currentVditorMode = ref<'wysiwyg' | 'ir' | 'sv'>('wysiwyg');
const isPreviewActive = ref(false);

// Search & Replace within editor
const isSearchOpen = ref(false);
const showReplace = ref(false);
const searchQuery = ref('');
const replaceQuery = ref('');
const isCaseSensitive = ref(false);
const currentMatchIndex = ref(0);
const totalMatchesCount = ref(0);
const searchInputRef = ref<HTMLInputElement | null>(null);

// Auto-save (instantaneous with minimal typing debounce & flush on unmount)
let saveTimeout: any = null;
function flushSaveNow() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  emit('updateNote', props.note.id, {
    title: localTitle.value || '未命名笔记',
    content: localContent.value,
    tags: localTags.value,
  });
  saveStatus.value = '已自动同步';
}

function triggerAutoSave() {
  saveStatus.value = '同步中...';
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveTimeout = null;
    emit('updateNote', props.note.id, {
      title: localTitle.value || '未命名笔记',
      content: localContent.value,
      tags: localTags.value,
    });
    saveStatus.value = '已自动同步';
  }, 150);
}

function handleTitleChange() {
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

// Switch Vditor Mode (wysiwyg: 所见即所得 / ir: 即时渲染 / sv: 分屏源码)
function switchMode(mode: 'wysiwyg' | 'ir' | 'sv') {
  clearHighlights();
  currentVditorMode.value = mode;
  isPreviewActive.value = false;
  if (!vditorInstance) return;
  initVditor(mode);
}

// Toggle Vditor native preview action
function togglePreview() {
  if (!vditorContainerRef.value) return;
  const previewBtn = vditorContainerRef.value.querySelector('.vditor-toolbar button[data-type="preview"]') as HTMLButtonElement | null;
  if (previewBtn) {
    previewBtn.click();
    isPreviewActive.value = previewBtn.classList.contains('vditor-menu--current');
    if (isSearchOpen.value) {
      nextTick(() => performSearch());
    }
  }
}

// Get active editable / rendered container element in Vditor
function getActiveContentElement(): HTMLElement | null {
  if (!vditorContainerRef.value) return null;
  const resets = vditorContainerRef.value.querySelectorAll<HTMLElement>('.vditor-reset');
  for (let i = 0; i < resets.length; i++) {
    const el = resets[i];
    if (el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0) {
      return el;
    }
  }
  return vditorContainerRef.value.querySelector<HTMLElement>('.vditor-reset') || null;
}

// Clean up search highlight marks from DOM
function clearHighlights() {
  const container = vditorContainerRef.value;
  if (!container) return;
  const marks = container.querySelectorAll('.vditor-search-match');
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (parent) {
      const textNode = document.createTextNode(mark.textContent || '');
      parent.replaceChild(textNode, mark);
      parent.normalize();
    }
  });
}

// Perform search and visually highlight all occurrences
function performSearch() {
  clearHighlights();
  const q = searchQuery.value;
  if (!q) {
    totalMatchesCount.value = 0;
    currentMatchIndex.value = 0;
    return;
  }

  const container = getActiveContentElement();
  if (!container) return;

  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!node.textContent || (!node.textContent.trim() && !node.textContent.includes(' '))) {
          return NodeFilter.FILTER_REJECT;
        }
        const parentTag = node.parentElement?.tagName.toUpperCase();
        if (parentTag === 'SCRIPT' || parentTag === 'STYLE') {
          return NodeFilter.FILTER_REJECT;
        }
        if (node.parentElement?.classList.contains('vditor-search-match')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let n: Text | null;
  while ((n = walker.nextNode() as Text | null)) {
    textNodes.push(n);
  }

  const lowerQ = isCaseSensitive.value ? q : q.toLowerCase();
  const createdMarks: HTMLElement[] = [];

  for (const node of textNodes) {
    const text = node.textContent || '';
    const compText = isCaseSensitive.value ? text : text.toLowerCase();
    let index = compText.indexOf(lowerQ);
    if (index === -1) continue;

    let currentTextNode: Text = node;
    while (index !== -1) {
      const parent = currentTextNode.parentNode;
      if (!parent) break;

      try {
        const matchNode = currentTextNode.splitText(index);
        const remainderNode = matchNode.splitText(q.length);

        const mark = document.createElement('mark');
        mark.className = 'vditor-search-match';
        mark.textContent = matchNode.textContent;
        parent.replaceChild(mark, matchNode);
        createdMarks.push(mark);

        currentTextNode = remainderNode;
        const remText = currentTextNode.textContent || '';
        const remCompText = isCaseSensitive.value ? remText : remText.toLowerCase();
        index = remCompText.indexOf(lowerQ);
      } catch (err) {
        break;
      }
    }
  }

  totalMatchesCount.value = createdMarks.length;
  if (totalMatchesCount.value > 0) {
    if (currentMatchIndex.value >= totalMatchesCount.value || currentMatchIndex.value < 0) {
      currentMatchIndex.value = 0;
    }
    focusCurrentMatch();
  } else {
    currentMatchIndex.value = 0;
  }
}

// Scroll and focus on the current match
function focusCurrentMatch() {
  const container = vditorContainerRef.value;
  if (!container) return;
  const marks = container.querySelectorAll<HTMLElement>('.vditor-search-match');
  if (!marks.length) return;

  marks.forEach((m, idx) => {
    if (idx === currentMatchIndex.value) {
      m.classList.add('vditor-search-match-active');
      m.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });

      // Highlight with range selection for clear focus
      try {
        const sel = window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.selectNodeContents(m);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } catch (e) {
        // ignore selection error
      }
    } else {
      m.classList.remove('vditor-search-match-active');
    }
  });
}

function openSearch() {
  isSearchOpen.value = true;
  nextTick(() => {
    searchInputRef.value?.focus();
    searchInputRef.value?.select();
    performSearch();
  });
}

function closeSearch() {
  isSearchOpen.value = false;
  searchQuery.value = '';
  currentMatchIndex.value = 0;
  totalMatchesCount.value = 0;
  clearHighlights();
}

function nextMatch() {
  if (!totalMatchesCount.value) return;
  currentMatchIndex.value = (currentMatchIndex.value + 1) % totalMatchesCount.value;
  focusCurrentMatch();
}

function prevMatch() {
  if (!totalMatchesCount.value) return;
  currentMatchIndex.value = (currentMatchIndex.value - 1 + totalMatchesCount.value) % totalMatchesCount.value;
  focusCurrentMatch();
}

function handleReplaceOne() {
  const q = searchQuery.value;
  if (!q || totalMatchesCount.value === 0) return;

  clearHighlights();

  const currentVal = vditorInstance ? vditorInstance.getValue() : localContent.value;
  const flags = isCaseSensitive.value ? 'g' : 'gi';
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, flags);

  let matchIndex = 0;
  let replaced = false;
  const targetIdx = currentMatchIndex.value;

  const newVal = currentVal.replace(regex, (match) => {
    if (!replaced && matchIndex === targetIdx) {
      replaced = true;
      return replaceQuery.value;
    }
    matchIndex++;
    return match;
  });

  if (replaced) {
    localContent.value = newVal;
    if (vditorInstance) {
      vditorInstance.setValue(newVal);
    }
    triggerAutoSave();
    nextTick(() => {
      performSearch();
    });
  } else {
    // Fallback: replace first occurrence
    const fallbackVal = currentVal.replace(regex, replaceQuery.value);
    localContent.value = fallbackVal;
    if (vditorInstance) {
      vditorInstance.setValue(fallbackVal);
    }
    triggerAutoSave();
    nextTick(() => {
      performSearch();
    });
  }
}

function handleReplaceAll() {
  const q = searchQuery.value;
  if (!q || totalMatchesCount.value === 0) return;

  clearHighlights();

  const currentVal = vditorInstance ? vditorInstance.getValue() : localContent.value;
  const flags = isCaseSensitive.value ? 'g' : 'gi';
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, flags);

  const newVal = currentVal.replace(regex, replaceQuery.value);
  localContent.value = newVal;
  if (vditorInstance) {
    vditorInstance.setValue(newVal);
  }
  triggerAutoSave();
  currentMatchIndex.value = 0;
  nextTick(() => {
    performSearch();
  });
}

// Initialize Vditor instance
function initVditor(initialMode: 'wysiwyg' | 'ir' | 'sv' = 'wysiwyg') {
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
      'preview',
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
    localTags.value = [...props.note.tags];

    if (vditorInstance && isVditorReady.value) {
      vditorInstance.setValue(props.note.content || '', true);
    }
  }
);

watch(
  () => props.note.title,
  (newTitle) => {
    if (newTitle !== localTitle.value) {
      localTitle.value = newTitle;
    }
  }
);

// Keyboard shortcuts for in-editor actions
function handleEditorKeyDown(e: KeyboardEvent) {
  if (props.isActive === false) return;
  const isMod = e.metaKey || e.ctrlKey;

  // Ctrl/Cmd + F: In-editor search
  if (isMod && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    e.stopPropagation();
    openSearch();
    return;
  }

  // Esc: Close search bar or exit focus fullscreen
  if (e.key === 'Escape') {
    if (isSearchOpen.value) {
      e.preventDefault();
      closeSearch();
      return;
    }
    if (isFullscreen.value) {
      e.preventDefault();
      isFullscreen.value = false;
      return;
    }
  }

  // Ctrl/Cmd + S: Flush auto-save quietly & block browser save dialog
  if (isMod && e.key.toLowerCase() === 's' && !e.shiftKey) {
    e.preventDefault();
    flushSaveNow();
    return;
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleEditorKeyDown, true);
  nextTick(() => {
    initVditor('wysiwyg');
  });
});

onUnmounted(() => {
  if (saveTimeout) {
    flushSaveNow();
  }
  window.removeEventListener('keydown', handleEditorKeyDown, true);
  clearHighlights();
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
    :class="[
      'flex flex-col bg-white overflow-hidden transition-all duration-150',
      isFullscreen
        ? 'fixed inset-0 z-50 w-screen h-screen'
        : 'w-full h-full'
    ]"
  >
    <!-- Document Tab Header Toolbar -->
    <div class="h-12 px-4 sm:px-5 bg-white border-b border-gray-100 flex items-center justify-between shrink-0 select-none gap-3">
      <!-- Left: Format Icon + Document Title -->
      <div class="flex items-center gap-2.5 flex-1 min-w-0">
        <FileFormatIcon format="markdown" size="sm" class="shrink-0" />

        <input
          id="editor-note-title-input"
          v-model="localTitle"
          @input="handleTitleChange"
          @blur="flushSaveNow"
          placeholder="输入笔记标题..."
          class="text-sm sm:text-base font-bold text-gray-900 placeholder-gray-300 border border-transparent hover:border-gray-200 focus:border-blue-300 focus:bg-slate-50/60 rounded-md px-2 py-1 outline-none bg-transparent flex-1 min-w-[120px] truncate select-text transition-colors"
        />
      </div>

        <!-- Mode Switches & Actions -->
        <div class="flex items-center gap-2 shrink-0">
          <!-- Mode Toggle: WYSIWYG (所见即所得，默认) / Instant Rendering (IR) / Split View (SV) / Preview -->
          <div class="bg-gray-100 p-0.5 rounded-lg flex items-center text-xs text-gray-600">
            <button
              @click="switchMode('wysiwyg')"
              :class="[
                'px-2.5 py-1 rounded-md transition-all font-medium flex items-center gap-1 cursor-pointer',
                currentVditorMode === 'wysiwyg' ? 'bg-white shadow-xs text-emerald-700 font-semibold' : 'hover:text-gray-900'
              ]"
              title="所见即所得 (富文本排版编辑，默认)"
            >
              <LayoutTemplate class="w-3.5 h-3.5" />
              <span class="hidden md:inline">所见即所得</span>
            </button>
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
            <!-- 预览按钮 (Toggle Preview) -->
            <button
              @click="togglePreview"
              :class="[
                'px-2.5 py-1 rounded-md transition-all font-medium flex items-center gap-1 cursor-pointer',
                isPreviewActive ? 'bg-emerald-600 text-white shadow-xs font-semibold' : 'hover:text-gray-900'
              ]"
              title="切换渲染预览"
            >
              <EyeOff v-if="isPreviewActive" class="w-3.5 h-3.5" />
              <Eye v-else class="w-3.5 h-3.5" />
              <span class="hidden md:inline">{{ isPreviewActive ? '退出预览' : '预览' }}</span>
            </button>
          </div>

          <!-- In-Editor Search Button -->
          <button
            @click="isSearchOpen ? closeSearch() : openSearch()"
            :class="[
              'p-1.5 rounded-md transition-colors cursor-pointer text-xs flex items-center gap-1 font-medium',
              isSearchOpen ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
            ]"
            :title="'页内查找 (' + (isMac ? '⌘F' : 'Ctrl+F') + ')'"
          >
            <Search class="w-4 h-4" />
          </button>

          <div class="h-4 w-px bg-gray-200 mx-0.5"></div>

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

          <!-- Focus Fullscreen Toggle Button -->
          <button
            @click="isFullscreen = !isFullscreen"
            class="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors cursor-pointer"
            :title="isFullscreen ? '退出专注全屏 (Esc)' : '专注全屏模式'"
          >
            <Minimize2 v-if="isFullscreen" class="w-4 h-4" />
            <Maximize2 v-else class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- Main Vditor Container Body & Floating Search Bar -->
      <div id="vditor-wrapper" class="flex-1 w-full overflow-hidden relative flex flex-col bg-white">
        <!-- Floating In-Editor Search Bar (Ctrl+F) -->
        <transition name="slide-fade">
          <div
            v-if="isSearchOpen"
            class="absolute top-3 right-5 z-40 bg-white/95 backdrop-blur-md rounded-xl shadow-2xl border border-gray-200 p-2.5 flex flex-col gap-2 min-w-[340px] max-w-[440px] animate-in fade-in zoom-in-95 duration-150 select-none"
          >
            <!-- Search Row -->
            <div class="flex items-center gap-1.5">
              <div class="relative flex-1 flex items-center">
                <Search class="w-3.5 h-3.5 text-gray-400 absolute left-2.5 pointer-events-none" />
                <input
                  ref="searchInputRef"
                  v-model="searchQuery"
                  @input="performSearch"
                  @keydown.enter.exact.prevent="nextMatch"
                  @keydown.shift.enter.prevent="prevMatch"
                  @keydown.esc="closeSearch"
                  placeholder="在笔记中查找..."
                  class="w-full pl-8 pr-16 py-1 text-xs text-gray-800 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-emerald-500 focus:bg-white select-text font-normal"
                />
                <!-- Match count indicator -->
                <span class="absolute right-2 text-[10px] text-gray-400 font-mono font-medium">
                  {{ searchQuery ? (totalMatchesCount > 0 ? `${currentMatchIndex + 1}/${totalMatchesCount}` : '无匹配') : '' }}
                </span>
              </div>

              <!-- Case Sensitive Button -->
              <button
                @click="isCaseSensitive = !isCaseSensitive; performSearch();"
                :class="[
                  'p-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer',
                  isCaseSensitive ? 'bg-emerald-100 text-emerald-800' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
                ]"
                title="区分大小写"
              >
                <CaseSensitive class="w-3.5 h-3.5" />
              </button>

              <!-- Prev / Next Match Buttons -->
              <button
                @click="prevMatch"
                :disabled="totalMatchesCount === 0"
                class="p-1 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                title="上一个匹配项 (Shift + Enter)"
              >
                <ChevronUp class="w-4 h-4" />
              </button>
              <button
                @click="nextMatch"
                :disabled="totalMatchesCount === 0"
                class="p-1 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                title="下一个匹配项 (Enter)"
              >
                <ChevronDown class="w-4 h-4" />
              </button>

              <!-- Toggle Replace -->
              <button
                @click="showReplace = !showReplace"
                :class="[
                  'p-1 rounded-md transition-colors cursor-pointer',
                  showReplace ? 'bg-emerald-100 text-emerald-800' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                ]"
                title="切换替换模式"
              >
                <Replace class="w-4 h-4" />
              </button>

              <!-- Close Search -->
              <button
                @click="closeSearch"
                class="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
                title="关闭 (Esc)"
              >
                <X class="w-4 h-4" />
              </button>
            </div>

            <!-- Replace Row -->
            <div v-if="showReplace" class="flex items-center gap-1.5 pt-1 border-t border-gray-100">
              <input
                v-model="replaceQuery"
                @keydown.enter.prevent="handleReplaceOne"
                placeholder="替换为..."
                class="flex-1 px-2.5 py-1 text-xs text-gray-800 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-emerald-500 focus:bg-white select-text"
              />
              <button
                @click="handleReplaceOne"
                :disabled="totalMatchesCount === 0"
                class="px-2 py-1 text-[11px] font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                替换
              </button>
              <button
                @click="handleReplaceAll"
                :disabled="totalMatchesCount === 0"
                class="px-2 py-1 text-[11px] font-medium bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                全部替换
              </button>
            </div>
          </div>
        </transition>

        <div ref="vditorContainerRef" class="vditor-editor-instance w-full flex-1 overflow-hidden"></div>
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
</template>

<style>
/* Vditor Container Custom Styling & Integration */
.vditor-editor-instance {
  border: none !important;
  border-radius: 0 !important;
}

.vditor-editor-instance .vditor-toolbar {
  border-bottom: 1px solid #f1f5f9 !important;
  background-color: #f8fafc !important;
  padding: 4px 12px !important;
  position: relative !important;
  z-index: 25 !important;
}

/* Tooltips: 强制将工具栏悬浮提示向下弹出，避免被顶部 Editor Top Bar 遮挡或被父容器 overflow 裁切 */
.vditor-editor-instance .vditor-toolbar .vditor-tooltipped::after {
  top: 100% !important;
  bottom: auto !important;
  margin-top: 6px !important;
  margin-bottom: 0 !important;
  right: 50% !important;
  left: auto !important;
  transform: translateX(50%) !important;
  background-color: #1e293b !important;
  color: #f8fafc !important;
  padding: 4px 8px !important;
  font-size: 11px !important;
  font-weight: 500 !important;
  line-height: 1.4 !important;
  border-radius: 4px !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
  white-space: nowrap !important;
  z-index: 99999 !important;
}

.vditor-editor-instance .vditor-toolbar .vditor-tooltipped::before {
  top: auto !important;
  bottom: -6px !important;
  right: 50% !important;
  left: auto !important;
  margin-right: -5px !important;
  margin-bottom: 0 !important;
  border-top-color: transparent !important;
  border-bottom-color: #1e293b !important;
  border-left-color: transparent !important;
  border-right-color: transparent !important;
  z-index: 100000 !important;
}

/* 靠右侧的工具栏按钮提示框向左对齐，防止超出右侧屏幕边界 */
.vditor-editor-instance .vditor-toolbar .vditor-tooltipped__nw::after,
.vditor-editor-instance .vditor-toolbar .vditor-tooltipped__sw::after,
.vditor-editor-instance .vditor-toolbar .vditor-tooltipped__w::after {
  right: 0 !important;
  left: auto !important;
  transform: none !important;
}
.vditor-editor-instance .vditor-toolbar .vditor-tooltipped__nw::before,
.vditor-editor-instance .vditor-toolbar .vditor-tooltipped__sw::before,
.vditor-editor-instance .vditor-toolbar .vditor-tooltipped__w::before {
  right: 12px !important;
  left: auto !important;
  margin-right: 0 !important;
}

/* 靠左侧的工具栏按钮提示框向右对齐 */
.vditor-editor-instance .vditor-toolbar .vditor-tooltipped__ne::after,
.vditor-editor-instance .vditor-toolbar .vditor-tooltipped__se::after,
.vditor-editor-instance .vditor-toolbar .vditor-tooltipped__e::after {
  left: 0 !important;
  right: auto !important;
  transform: none !important;
}
.vditor-editor-instance .vditor-toolbar .vditor-tooltipped__ne::before,
.vditor-editor-instance .vditor-toolbar .vditor-tooltipped__se::before,
.vditor-editor-instance .vditor-toolbar .vditor-tooltipped__e::before {
  left: 12px !important;
  right: auto !important;
  margin-right: 0 !important;
}

.vditor-editor-instance .vditor-content {
  background-color: #ffffff !important;
}

/* Ensure preview mode and all editor text is fully selectable and copyable */
.vditor-editor-instance .vditor,
.vditor-editor-instance .vditor-reset,
.vditor-editor-instance .vditor-preview,
.vditor-editor-instance .vditor-preview__action,
.vditor-editor-instance .vditor-sv,
.vditor-editor-instance .vditor-ir,
.vditor-editor-instance .vditor-wysiwyg,
.vditor-editor-instance .vditor-reset * {
  user-select: text !important;
  -webkit-user-select: text !important;
}

.vditor-editor-instance .vditor-reset {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
  font-size: 15px !important;
  line-height: 1.7 !important;
  color: #1e293b !important;
  user-select: text !important;
  -webkit-user-select: text !important;
}

/* Code block copy icon enhancement */
.vditor-editor-instance .vditor-copy {
  cursor: pointer !important;
  user-select: none !important;
  opacity: 0.75;
  transition: opacity 0.15s ease-in-out;
}
.vditor-editor-instance .vditor-copy:hover {
  opacity: 1;
}

.vditor-editor-instance .vditor-toolbar__item {
  color: #475569 !important;
}

.vditor-editor-instance .vditor-toolbar__item:hover {
  color: #059669 !important;
  background-color: #ecfdf5 !important;
}

.vditor-editor-instance .vditor-toolbar__item--current {
  color: #059669 !important;
  background-color: #d1fae5 !important;
}

.vditor-editor-instance .vditor-panel {
  z-index: 50 !important;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1) !important;
  border: 1px solid #e2e8f0 !important;
}

.vditor-editor-instance .vditor-outline {
  border-right: 1px solid #e2e8f0 !important;
  background-color: #f8fafc !important;
}

.vditor-editor-instance .vditor-outline__item--current {
  background-color: #ecfdf5 !important;
  color: #059669 !important;
  font-weight: 600 !important;
}

/* Search match visual highlights */
mark.vditor-search-match {
  background-color: #fef08a !important; /* bright soft yellow */
  color: #713f12 !important;
  border-radius: 2px !important;
  padding: 1px 2px !important;
  box-shadow: 0 0 0 1px #facc15 !important;
  display: inline !important;
  transition: all 0.12s ease-in-out !important;
}

mark.vditor-search-match-active {
  background-color: #f97316 !important; /* energetic orange */
  color: #ffffff !important;
  font-weight: 600 !important;
  box-shadow: 0 0 0 2px #ea580c, 0 0 10px rgba(234, 88, 12, 0.6) !important;
  border-radius: 3px !important;
  outline: 1px solid #ffffff !important;
  animation: pulse-search-match 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes pulse-search-match {
  0% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

.slide-fade-enter-active {
  transition: all 0.2s ease-out;
}
.slide-fade-leave-active {
  transition: all 0.15s ease-in;
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(-8px);
  opacity: 0;
}
</style>
