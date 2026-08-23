<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import {
  X,
  Save,
  Star,
  Box,
  Share2,
  Download,
  Folder as FolderIcon,
  Maximize2,
  Minimize2,
  Sparkles,
  Check,
  CheckCheck,
  LayoutGrid,
  ChevronDown,
  RefreshCw,
  Eye,
  FileCode2,
  Tag as TagIcon,
  Palette,
  Layers,
  FileDown,
  AlertCircle,
  HelpCircle,
  Undo2,
  Redo2,
  Sliders,
  FileImage,
  ArrowLeft
} from 'lucide-vue-next';
import { Note, Folder } from '../types';
import { compareFolders } from '../utils/folderSort';
import DrawioIcon from './icons/DrawioIcon.vue';
import {
  DRAWIO_TEMPLATES,
  DrawioTemplateInfo,
  createDefaultDrawioXml,
  extractDrawioXml,
  extractDrawioTextNodes,
  generateFallbackSvgPreview
} from '../utils/drawioTemplates';

const props = withDefaults(
  defineProps<{
    note: Note;
    folders?: Folder[];
  }>(),
  {
    folders: () => [],
  }
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'updateNote', id: string, updates: Partial<Note>): void;
  (e: 'toggleStar', noteId: string): void;
  (e: 'toggleFavorite', noteId: string): void;
  (e: 'openShare', note: Note): void;
}>();

const isMac = computed(() => {
  return typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
});

// Local state
const localTitle = ref(props.note.title || '无标题图表');
const localFolderId = ref(props.note.folderId);
const localTags = ref<string[]>([...(props.note.tags || [])]);
const newTagInput = ref('');
const isFullscreen = ref(true);
const saveStatus = ref<'saved' | 'saving' | 'ready'>('saved');
const lastSavedTime = ref<string>('');

// Draw.io UI and Configuration options
const drawioUiTheme = ref<'atlas' | 'min' | 'sketch' | 'kennedy'>('atlas');
const isDarkMode = ref(false);
const isGridEnabled = ref(true);

// Editor View Modes: 'iframe' (Embedded Draw.io app) or 'xml' (Raw XML Source view) or 'preview' (SVG Preview)
const activeViewTab = ref<'editor' | 'xml' | 'preview'>('editor');

// Templates modal / dropdown
const isTemplateModalOpen = ref(false);
const selectedTemplateToApply = ref<DrawioTemplateInfo | null>(null);

// Export dropdown
const isExportMenuOpen = ref(false);
const exportMenuRef = ref<HTMLElement | null>(null);

// UI Styles dropdown
const isUiThemeMenuOpen = ref(false);
const uiThemeMenuRef = ref<HTMLElement | null>(null);

// Iframe reference & state
const iframeRef = ref<HTMLIFrameElement | null>(null);
const isIframeLoaded = ref(false);
const isIframeReady = ref(false);
const iframeError = ref(false);
const iframeErrorMessage = ref('');
let iframeInitTimeout: any = null;

// Current XML Content
const currentXml = ref<string>(extractDrawioXml(props.note.content));
const rawXmlDraft = ref<string>(currentXml.value);

// Hierarchical folders
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

// Build Draw.io Embed URL
const drawioEmbedUrl = computed(() => {
  const params = new URLSearchParams({
    embed: '1',
    ui: drawioUiTheme.value,
    spin: '1',
    proto: 'json',
    configure: '1',
    noSaveBtn: '0',
    saveAndExit: '0',
    lang: 'zh',
    libraries: '1',
    dark: isDarkMode.value ? '1' : '0',
  });
  return `https://embed.diagrams.net/?${params.toString()}`;
});

// Format timestamp helper
function formatCurrentTime() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// PostMessage Sender to Draw.io
function postToDrawio(msg: any) {
  if (iframeRef.value && iframeRef.value.contentWindow) {
    try {
      iframeRef.value.contentWindow.postMessage(JSON.stringify(msg), '*');
    } catch (e) {
      console.warn('Failed to postMessage to Draw.io iframe', e);
    }
  }
}

// Save logic
function saveDiagram(newXml?: string) {
  const xmlToSave = newXml || currentXml.value;
  currentXml.value = xmlToSave;
  rawXmlDraft.value = xmlToSave;

  saveStatus.value = 'saving';
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const nowStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  lastSavedTime.value = formatCurrentTime();

  // Extract text labels for search indexing
  const textNodes = extractDrawioTextNodes(xmlToSave);
  const fallbackSvg = generateFallbackSvgPreview(localTitle.value, textNodes);

  emit('updateNote', props.note.id, {
    title: localTitle.value,
    content: xmlToSave,
    folderId: localFolderId.value,
    tags: localTags.value,
    updatedAt: nowStr,
    previewSvg: props.note.previewSvg || fallbackSvg,
  });

  setTimeout(() => {
    saveStatus.value = 'saved';
  }, 350);

  // Request SVG export to update preview thumbnail
  if (isIframeReady.value) {
    postToDrawio({ action: 'export', format: 'xmlsvg', spin: '0' });
  }
}

// Handle Draw.io postMessage protocol
function handleWindowMessage(event: MessageEvent) {
  // Only accept string data from postMessage
  if (typeof event.data !== 'string') return;

  try {
    const msg = JSON.parse(event.data);
    if (!msg || !msg.event) return;

    // 1. Initial configuration request from Draw.io
    if (msg.event === 'configure') {
      postToDrawio({
        action: 'configure',
        config: {
          defaultFonts: ['PingFang SC', 'Microsoft YaHei', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
          defaultCustomShapes: [],
          enableCustomLibraries: true,
          compressXml: false,
        },
      });
      return;
    }

    // 2. Init Event: Draw.io is loaded and waiting for document XML
    if (msg.event === 'init') {
      isIframeLoaded.value = true;
      isIframeReady.value = true;
      iframeError.value = false;
      if (iframeInitTimeout) clearTimeout(iframeInitTimeout);

      // Send the current diagram XML to draw.io
      postToDrawio({
        action: 'load',
        autosave: 1,
        xml: currentXml.value,
        title: localTitle.value,
      });

      // Request SVG preview
      setTimeout(() => {
        postToDrawio({ action: 'export', format: 'xmlsvg', spin: '0' });
      }, 500);
      return;
    }

    // 3. Save Event: User clicked Save button inside Draw.io
    if (msg.event === 'save') {
      if (msg.xml) {
        saveDiagram(msg.xml);
      }
      return;
    }

    // 4. Autosave Event: Draw.io autosaved changes
    if (msg.event === 'autosave') {
      if (msg.xml) {
        currentXml.value = msg.xml;
        rawXmlDraft.value = msg.xml;
        saveDiagram(msg.xml);
      }
      return;
    }

    // 5. Export Event: Received exported format data
    if (msg.event === 'export') {
      if (msg.format === 'xmlsvg' || msg.format === 'svg') {
        if (msg.data && msg.data.startsWith('data:image/svg+xml')) {
          try {
            const svgContent = decodeURIComponent(msg.data.split(',')[1]);
            emit('updateNote', props.note.id, {
              previewSvg: svgContent,
            });
          } catch {}
        }
      } else if (msg.message && msg.message.format) {
        handleDownloadExportedData(msg.data, msg.message.format);
      }
      return;
    }

    // 6. Exit Event
    if (msg.event === 'exit') {
      saveDiagram();
      emit('close');
      return;
    }
  } catch (err) {
    // Ignore non-JSON messages from other browser extensions
  }
}

// Download exported file
function handleDownloadExportedData(dataUri: string, format: string) {
  const filename = `${localTitle.value || 'Drawio图表'}.${format}`;
  const a = document.createElement('a');
  a.href = dataUri;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Export actions
function triggerExport(format: 'drawio' | 'xml' | 'svg' | 'png') {
  isExportMenuOpen.value = false;

  if (format === 'drawio' || format === 'xml') {
    const blob = new Blob([currentXml.value], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${localTitle.value || '图表'}.${format === 'drawio' ? 'drawio' : 'xml'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }

  if (isIframeReady.value) {
    postToDrawio({
      action: 'export',
      format: format,
      spin: '1',
    });
  } else {
    // Fallback export for SVG when iframe is not ready
    const textNodes = extractDrawioTextNodes(currentXml.value);
    const svgStr = generateFallbackSvgPreview(localTitle.value, textNodes);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${localTitle.value || '图表'}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// Apply selected template
function handleApplyTemplate(template: DrawioTemplateInfo) {
  currentXml.value = template.xml;
  rawXmlDraft.value = template.xml;
  saveDiagram(template.xml);

  if (isIframeReady.value) {
    postToDrawio({
      action: 'load',
      autosave: 1,
      xml: template.xml,
      title: localTitle.value,
    });
  }

  isTemplateModalOpen.value = false;
}

// Update title on blur / enter
function handleTitleBlur() {
  if (!localTitle.value.trim()) {
    localTitle.value = '无标题图表';
  }
  saveDiagram();
}

// Folder change
function handleFolderChange() {
  saveDiagram();
}

// Tag operations
function addTag() {
  const val = newTagInput.value.trim();
  if (val && !localTags.value.includes(val)) {
    localTags.value.push(val);
    newTagInput.value = '';
    saveDiagram();
  }
}

function removeTag(tag: string) {
  localTags.value = localTags.value.filter((t) => t !== tag);
  saveDiagram();
}

// Reload iframe in case of network freeze or error
function reloadIframe() {
  isIframeLoaded.value = false;
  isIframeReady.value = false;
  iframeError.value = false;

  if (iframeRef.value) {
    iframeRef.value.src = drawioEmbedUrl.value;
  }

  setupIframeTimeout();
}

function setupIframeTimeout() {
  if (iframeInitTimeout) clearTimeout(iframeInitTimeout);
  iframeInitTimeout = setTimeout(() => {
    if (!isIframeReady.value) {
      iframeError.value = true;
      iframeErrorMessage.value = '连接 Draw.io 服务耗时较长，请检查网络或切换至离线源码模式。';
    }
  }, 10000);
}

// Save raw XML changes from XML tab
function applyRawXmlChanges() {
  currentXml.value = rawXmlDraft.value;
  saveDiagram(rawXmlDraft.value);
  activeViewTab.value = 'editor';

  if (isIframeReady.value) {
    postToDrawio({
      action: 'load',
      autosave: 1,
      xml: rawXmlDraft.value,
      title: localTitle.value,
    });
  }
}

// Click outside handling for dropdowns
function handleClickOutside(e: MouseEvent) {
  const target = e.target as Node;
  if (exportMenuRef.value && !exportMenuRef.value.contains(target)) {
    isExportMenuOpen.value = false;
  }
  if (uiThemeMenuRef.value && !uiThemeMenuRef.value.contains(target)) {
    isUiThemeMenuOpen.value = false;
  }
}

// Keyboard shortcuts inside Drawio Editor
function handleKeyDown(e: KeyboardEvent) {
  const isMod = e.metaKey || e.ctrlKey;
  if (isMod && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveDiagram();
  }
  if (e.key === 'Escape' && isFullscreen.value && !isTemplateModalOpen.value) {
    // If modal is open, let modal close first
  }
}

onMounted(() => {
  window.addEventListener('message', handleWindowMessage);
  window.addEventListener('click', handleClickOutside);
  window.addEventListener('keydown', handleKeyDown);
  lastSavedTime.value = formatCurrentTime();
  setupIframeTimeout();
});

onUnmounted(() => {
  window.removeEventListener('message', handleWindowMessage);
  window.removeEventListener('click', handleClickOutside);
  window.removeEventListener('keydown', handleKeyDown);
  if (iframeInitTimeout) clearTimeout(iframeInitTimeout);
});
</script>

<template>
  <div
    id="drawio-editor-container"
    :class="[
      'fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center transition-all duration-200 select-none',
      isFullscreen ? 'p-0' : 'p-3 sm:p-6'
    ]"
  >
    <div
      :class="[
        'bg-white flex flex-col overflow-hidden shadow-2xl transition-all duration-200 border border-gray-200/80',
        isFullscreen ? 'w-screen h-screen rounded-none' : 'w-full max-w-[96vw] h-[94vh] rounded-2xl'
      ]"
    >
      <!-- Top Navigation & Action Header -->
      <header class="h-14 px-4 bg-white border-b border-gray-200 flex items-center justify-between shrink-0 z-20 shadow-2xs">
        <!-- Left: Back Button + Format Badge + Title Input -->
        <div class="flex items-center gap-3 min-w-0 flex-1">
          <!-- Close / Back Button -->
          <button
            id="drawio-close-btn"
            @click="emit('close')"
            class="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer shrink-0"
            title="保存并返回 (Esc)"
          >
            <ArrowLeft class="w-4 h-4 text-gray-500" />
            <span class="hidden sm:inline">返回</span>
          </button>

          <div class="h-4 w-px bg-gray-200 shrink-0"></div>

          <!-- Drawio Format Icon -->
          <div class="flex items-center gap-1.5 shrink-0">
            <DrawioIcon size="xs" />
            <span class="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/60 hidden md:inline">
              Draw.io 流程图
            </span>
          </div>

          <!-- Note Title Input -->
          <div class="relative flex-1 max-w-sm sm:max-w-md">
            <input
              id="drawio-title-input"
              v-model="localTitle"
              @blur="handleTitleBlur"
              @keydown.enter="($event.target as HTMLElement)?.blur()"
              type="text"
              class="w-full h-8 px-2.5 text-sm font-bold text-gray-800 bg-transparent hover:bg-gray-50 focus:bg-white border border-transparent hover:border-gray-200 focus:border-amber-500 rounded-lg outline-none transition-all truncate"
              placeholder="请输入图表名称..."
            />
          </div>

          <!-- Folder Select -->
          <div class="hidden lg:flex items-center gap-1 text-xs text-gray-500 shrink-0">
            <FolderIcon class="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <select
              id="drawio-folder-select"
              v-model="localFolderId"
              @change="handleFolderChange"
              class="h-7 px-2 text-xs bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md text-gray-700 outline-none focus:border-amber-500 cursor-pointer max-w-[130px] truncate"
            >
              <option v-for="f in hierarchicalFolders" :key="f.id" :value="f.id">
                {{ f.prefix }}📁 {{ f.name }}
              </option>
            </select>
          </div>
        </div>

        <!-- Center / Right: Tabs + Save Status + Actions -->
        <div class="flex items-center gap-2 shrink-0">
          <!-- View Tabs (Editor / XML / Preview) -->
          <div class="flex items-center bg-gray-100 p-0.5 rounded-lg border border-gray-200 text-xs font-medium">
            <button
              id="tab-editor-btn"
              @click="activeViewTab = 'editor'"
              :class="[
                'px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5',
                activeViewTab === 'editor' ? 'bg-white text-amber-600 shadow-2xs font-semibold' : 'text-gray-600 hover:text-gray-900'
              ]"
            >
              <Layers class="w-3.5 h-3.5" />
              <span class="hidden sm:inline">可视化画布</span>
            </button>
            <button
              id="tab-preview-btn"
              @click="activeViewTab = 'preview'"
              :class="[
                'px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5',
                activeViewTab === 'preview' ? 'bg-white text-amber-600 shadow-2xs font-semibold' : 'text-gray-600 hover:text-gray-900'
              ]"
            >
              <Eye class="w-3.5 h-3.5" />
              <span class="hidden sm:inline">预览</span>
            </button>
            <button
              id="tab-xml-btn"
              @click="activeViewTab = 'xml'"
              :class="[
                'px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5',
                activeViewTab === 'xml' ? 'bg-white text-amber-600 shadow-2xs font-semibold' : 'text-gray-600 hover:text-gray-900'
              ]"
            >
              <FileCode2 class="w-3.5 h-3.5" />
              <span class="hidden sm:inline">XML 源码</span>
            </button>
          </div>

          <!-- Template Presets Button -->
          <button
            id="drawio-templates-btn"
            @click="isTemplateModalOpen = true"
            class="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors cursor-pointer"
            title="选择内置图表模板"
          >
            <Sparkles class="w-3.5 h-3.5 text-amber-600" />
            <span class="hidden md:inline">图表模板</span>
          </button>

          <!-- UI Style Theme Dropdown -->
          <div class="relative" ref="uiThemeMenuRef">
            <button
              id="drawio-theme-btn"
              @click="isUiThemeMenuOpen = !isUiThemeMenuOpen"
              class="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors cursor-pointer"
              title="界面风格与主题"
            >
              <Palette class="w-3.5 h-3.5 text-gray-500" />
              <span class="hidden xl:inline">样式</span>
              <ChevronDown class="w-3 h-3 text-gray-400" />
            </button>

            <!-- Theme Dropdown Menu -->
            <div
              v-if="isUiThemeMenuOpen"
              class="absolute right-0 mt-1 w-44 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-30 animate-in fade-in slide-in-from-top-1 duration-150 text-xs"
            >
              <div class="px-3 py-1 font-bold text-gray-400 text-[10px] uppercase">Draw.io 界面模式</div>
              <button
                @click="drawioUiTheme = 'atlas'; isUiThemeMenuOpen = false; reloadIframe()"
                :class="['w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-amber-50', drawioUiTheme === 'atlas' ? 'text-amber-600 font-bold' : 'text-gray-700']"
              >
                <span>现代版 (Atlas)</span>
                <Check v-if="drawioUiTheme === 'atlas'" class="w-3.5 h-3.5" />
              </button>
              <button
                @click="drawioUiTheme = 'min'; isUiThemeMenuOpen = false; reloadIframe()"
                :class="['w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-amber-50', drawioUiTheme === 'min' ? 'text-amber-600 font-bold' : 'text-gray-700']"
              >
                <span>极简模式 (Minimal)</span>
                <Check v-if="drawioUiTheme === 'min'" class="w-3.5 h-3.5" />
              </button>
              <button
                @click="drawioUiTheme = 'sketch'; isUiThemeMenuOpen = false; reloadIframe()"
                :class="['w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-amber-50', drawioUiTheme === 'sketch' ? 'text-amber-600 font-bold' : 'text-gray-700']"
              >
                <span>手绘风格 (Sketch)</span>
                <Check v-if="drawioUiTheme === 'sketch'" class="w-3.5 h-3.5" />
              </button>
              <div class="h-px bg-gray-100 my-1"></div>
              <button
                @click="isDarkMode = !isDarkMode; isUiThemeMenuOpen = false; reloadIframe()"
                class="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-amber-50 text-gray-700"
              >
                <span>深色夜间主题</span>
                <span class="text-[10px] px-1.5 py-0.2 rounded bg-gray-100 font-mono">{{ isDarkMode ? '开' : '关' }}</span>
              </button>
            </div>
          </div>

          <!-- Export Dropdown -->
          <div class="relative" ref="exportMenuRef">
            <button
              id="drawio-export-btn"
              @click="isExportMenuOpen = !isExportMenuOpen"
              class="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors cursor-pointer"
            >
              <Download class="w-3.5 h-3.5 text-gray-600" />
              <span class="hidden sm:inline">导出</span>
              <ChevronDown class="w-3 h-3 text-gray-400" />
            </button>

            <!-- Export Dropdown Menu -->
            <div
              v-if="isExportMenuOpen"
              class="absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-30 animate-in fade-in slide-in-from-top-1 duration-150 text-xs"
            >
              <div class="px-3 py-1 font-bold text-gray-400 text-[10px] uppercase">导出文件格式</div>
              <button
                @click="triggerExport('drawio')"
                class="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-amber-50 text-gray-700 hover:text-amber-700 cursor-pointer"
              >
                <DrawioIcon size="xs" />
                <div class="flex flex-col">
                  <span class="font-semibold">.drawio 格式</span>
                  <span class="text-[10px] text-gray-400">Draw.io 原生项目文件</span>
                </div>
              </button>
              <button
                @click="triggerExport('svg')"
                class="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-amber-50 text-gray-700 hover:text-amber-700 cursor-pointer"
              >
                <FileImage class="w-4 h-4 text-emerald-600" />
                <div class="flex flex-col">
                  <span class="font-semibold">SVG 矢量图</span>
                  <span class="text-[10px] text-gray-400">无限缩放不失真矢量格式</span>
                </div>
              </button>
              <button
                @click="triggerExport('png')"
                class="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-amber-50 text-gray-700 hover:text-amber-700 cursor-pointer"
              >
                <FileDown class="w-4 h-4 text-blue-600" />
                <div class="flex flex-col">
                  <span class="font-semibold">PNG 高清图片</span>
                  <span class="text-[10px] text-gray-400">嵌入图表数据的标准位图</span>
                </div>
              </button>
              <button
                @click="triggerExport('xml')"
                class="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-amber-50 text-gray-700 hover:text-amber-700 cursor-pointer"
              >
                <FileCode2 class="w-4 h-4 text-purple-600" />
                <div class="flex flex-col">
                  <span class="font-semibold">XML 源码</span>
                  <span class="text-[10px] text-gray-400">图表数据结构纯文本</span>
                </div>
              </button>
            </div>
          </div>

          <!-- Star & Favorite Buttons -->
          <button
            id="drawio-star-btn"
            @click="emit('toggleStar', props.note.id)"
            :class="[
              'p-2 rounded-lg border transition-colors cursor-pointer',
              props.note.isStarred
                ? 'bg-amber-50 border-amber-300 text-amber-500'
                : 'border-gray-200 text-gray-400 hover:text-amber-500 hover:bg-gray-50'
            ]"
            title="标星图表"
          >
            <Star class="w-3.5 h-3.5" :fill="props.note.isStarred ? 'currentColor' : 'none'" />
          </button>

          <button
            id="drawio-favorite-btn"
            @click="emit('toggleFavorite', props.note.id)"
            :class="[
              'p-2 rounded-lg border transition-colors cursor-pointer',
              props.note.isFavorite
                ? 'bg-blue-50 border-blue-300 text-blue-500'
                : 'border-gray-200 text-gray-400 hover:text-blue-500 hover:bg-gray-50'
            ]"
            title="收藏图表"
          >
            <Box class="w-3.5 h-3.5" :fill="props.note.isFavorite ? 'currentColor' : 'none'" />
          </button>

          <!-- Share Button -->
          <button
            id="drawio-share-btn"
            @click="emit('openShare', props.note)"
            class="p-2 border border-gray-200 text-gray-600 hover:text-blue-600 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer"
            title="分享图表"
          >
            <Share2 class="w-3.5 h-3.5" />
          </button>

          <!-- Save Button / Status Indicator -->
          <button
            id="drawio-save-btn"
            @click="saveDiagram()"
            class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-2xs transition-all cursor-pointer"
          >
            <Save class="w-3.5 h-3.5" />
            <span class="hidden sm:inline">保存</span>
          </button>

          <!-- Fullscreen Toggle Button -->
          <button
            id="drawio-fullscreen-btn"
            @click="isFullscreen = !isFullscreen"
            class="p-2 border border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer hidden md:flex"
            :title="isFullscreen ? '退出全屏' : '全屏显示'"
          >
            <Minimize2 v-if="isFullscreen" class="w-3.5 h-3.5" />
            <Maximize2 v-else class="w-3.5 h-3.5" />
          </button>

          <!-- Close Modal X -->
          <button
            id="drawio-modal-close-x"
            @click="emit('close')"
            class="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
            title="关闭 (Esc)"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </header>

      <!-- Sub-Bar: Tags & Real-time Save Status -->
      <div class="h-9 px-4 bg-gray-50/80 border-b border-gray-200/70 flex items-center justify-between text-xs text-gray-500 shrink-0">
        <!-- Tags Bar -->
        <div class="flex items-center gap-1.5 overflow-x-auto py-1">
          <TagIcon class="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <span
            v-for="t in localTags"
            :key="t"
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-medium shrink-0"
          >
            {{ t }}
            <button @click="removeTag(t)" class="hover:text-red-500 cursor-pointer ml-0.5 text-xs">×</button>
          </span>
          <input
            v-model="newTagInput"
            @keydown.enter.prevent="addTag"
            @blur="addTag"
            type="text"
            placeholder="+ 添加标签 (回车)"
            class="h-6 px-1.5 text-[11px] bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-amber-300 rounded outline-none transition-all w-24 focus:w-32"
          />
        </div>

        <!-- Save Indicator & Iframe Status -->
        <div class="flex items-center gap-3 shrink-0">
          <div class="flex items-center gap-1.5 text-[11px]">
            <span
              :class="[
                'w-2 h-2 rounded-full',
                saveStatus === 'saving' ? 'bg-amber-400 animate-ping' : 'bg-emerald-500'
              ]"
            ></span>
            <span class="text-gray-500">
              {{ saveStatus === 'saving' ? '正在同步图表...' : `已自动保存 (${lastSavedTime || '刚刚'})` }}
            </span>
          </div>

          <button
            v-if="activeViewTab === 'editor'"
            @click="reloadIframe"
            class="text-[11px] text-gray-400 hover:text-amber-600 flex items-center gap-1 cursor-pointer transition-colors"
            title="刷新 Draw.io 画布连接"
          >
            <RefreshCw class="w-3 h-3" :class="{'animate-spin': !isIframeReady && !iframeError}" />
            <span class="hidden sm:inline">重新加载</span>
          </button>
        </div>
      </div>

      <!-- Main Canvas Workspace -->
      <main class="flex-1 relative bg-slate-50 overflow-hidden">
        <!-- 1. Visual Draw.io Iframe View -->
        <div v-show="activeViewTab === 'editor'" class="w-full h-full relative">
          <!-- Loading Overlay -->
          <div
            v-if="!isIframeReady && !iframeError"
            class="absolute inset-0 z-10 bg-white flex flex-col items-center justify-center gap-3 animate-in fade-in duration-200"
          >
            <div class="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center shadow-xs">
              <DrawioIcon size="md" />
            </div>
            <div class="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <RefreshCw class="w-4 h-4 text-amber-500 animate-spin" />
              <span>正在加载 Draw.io 图表工作区...</span>
            </div>
            <p class="text-xs text-gray-400">基于 diagrams.net / draw.io 官方嵌入式架构</p>
          </div>

          <!-- Network Fallback Overlay if Draw.io fails to connect -->
          <div
            v-if="iframeError"
            class="absolute inset-0 z-10 bg-white/95 flex flex-col items-center justify-center p-6 text-center gap-3"
          >
            <div class="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
              <AlertCircle class="w-6 h-6" />
            </div>
            <h4 class="text-base font-bold text-gray-800">Draw.io 云端服务连接超时</h4>
            <p class="text-xs text-gray-500 max-w-md">
              {{ iframeErrorMessage || '可能由于网络波动或环境代理原因无法加载在线绘图界面。您可以切换至 XML 源码模式直接编辑，或重试连接。' }}
            </p>
            <div class="flex items-center gap-3 mt-2">
              <button
                @click="reloadIframe"
                class="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                重试连接
              </button>
              <button
                @click="activeViewTab = 'xml'"
                class="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                使用 XML 源码编辑
              </button>
              <button
                @click="activeViewTab = 'preview'"
                class="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                查看 SVG 预览
              </button>
            </div>
          </div>

          <!-- Draw.io Iframe -->
          <iframe
            ref="iframeRef"
            :src="drawioEmbedUrl"
            class="w-full h-full border-none"
            allow="fullscreen; clipboard-read; clipboard-write"
          ></iframe>
        </div>

        <!-- 2. Standalone SVG Preview View -->
        <div
          v-if="activeViewTab === 'preview'"
          class="w-full h-full flex flex-col items-center justify-center p-6 bg-slate-100 overflow-auto"
        >
          <div class="bg-white rounded-xl shadow-lg border border-gray-200 p-8 max-w-4xl w-full flex flex-col items-center gap-4">
            <div class="w-full flex items-center justify-between border-b border-gray-100 pb-3">
              <div class="flex items-center gap-2">
                <DrawioIcon size="sm" />
                <span class="text-sm font-bold text-gray-800">{{ localTitle }} - 矢量预览</span>
              </div>
              <div class="flex items-center gap-2">
                <button
                  @click="triggerExport('svg')"
                  class="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-2xs cursor-pointer"
                >
                  下载 SVG
                </button>
                <button
                  @click="activeViewTab = 'editor'"
                  class="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer"
                >
                  返回画布编辑
                </button>
              </div>
            </div>

            <!-- Render cached SVG if exists, otherwise fallback preview -->
            <div
              v-if="props.note.previewSvg"
              class="w-full max-h-[65vh] flex items-center justify-center overflow-auto p-4 bg-gray-50 rounded-lg border border-gray-100"
              v-html="props.note.previewSvg"
            ></div>
            <div
              v-else
              class="w-full max-h-[65vh] flex items-center justify-center p-4 bg-gray-50 rounded-lg border border-gray-100"
              v-html="generateFallbackSvgPreview(localTitle, extractDrawioTextNodes(currentXml))"
            ></div>
          </div>
        </div>

        <!-- 3. Raw XML Source View -->
        <div
          v-if="activeViewTab === 'xml'"
          class="w-full h-full flex flex-col p-4 bg-slate-900 text-slate-100 font-mono text-xs overflow-hidden"
        >
          <div class="flex items-center justify-between pb-3 border-b border-slate-700">
            <div class="flex items-center gap-2">
              <FileCode2 class="w-4 h-4 text-amber-400" />
              <span class="font-bold text-slate-200">Draw.io XML 结构源码</span>
              <span class="text-[10px] text-slate-400">({{ rawXmlDraft.length }} 字符)</span>
            </div>
            <div class="flex items-center gap-2">
              <button
                @click="applyRawXmlChanges"
                class="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-sans font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                应用更改并返回画布
              </button>
            </div>
          </div>
          <textarea
            v-model="rawXmlDraft"
            class="flex-1 w-full mt-3 p-3 bg-slate-950 text-emerald-400 border border-slate-800 rounded-lg outline-none focus:border-amber-500 resize-none font-mono text-xs leading-relaxed"
            placeholder="在这里查看或编辑 Draw.io XML..."
            spellcheck="false"
          ></textarea>
        </div>
      </main>
    </div>

    <!-- Template Selection Modal -->
    <div
      v-if="isTemplateModalOpen"
      id="drawio-template-modal"
      class="fixed inset-0 z-60 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      @click.self="isTemplateModalOpen = false"
    >
      <div class="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col max-h-[85vh]">
        <!-- Header -->
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-amber-50/50 to-orange-50/50">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
              <Sparkles class="w-4 h-4" />
            </div>
            <div>
              <h3 class="text-sm font-bold text-gray-900">选择 Draw.io 图表模板</h3>
              <p class="text-[11px] text-gray-500">选择预设工程图、流程图或架构设计模板快速开启绘制</p>
            </div>
          </div>
          <button @click="isTemplateModalOpen = false" class="text-gray-400 hover:text-gray-600 p-1 rounded-md cursor-pointer">
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- Templates Grid -->
        <div class="p-6 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div
            v-for="tpl in DRAWIO_TEMPLATES"
            :key="tpl.id"
            @click="selectedTemplateToApply = tpl"
            :class="[
              'p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-3 text-left relative group',
              selectedTemplateToApply?.id === tpl.id
                ? 'border-amber-500 bg-amber-50/40 ring-1 ring-amber-400'
                : 'border-gray-200 hover:border-amber-300 hover:bg-gray-50/70'
            ]"
          >
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <span class="text-xs font-bold text-gray-900 group-hover:text-amber-700 transition-colors">
                  {{ tpl.name }}
                </span>
                <span class="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                  {{ tpl.category }}
                </span>
              </div>
              <p class="text-[11px] text-gray-500 leading-relaxed">
                {{ tpl.description }}
              </p>
            </div>

            <div class="flex items-center justify-between pt-2 border-t border-gray-100">
              <span class="text-[10px] text-amber-600 font-medium">Draw.io XML 标准模板</span>
              <button
                @click.stop="handleApplyTemplate(tpl)"
                class="px-2.5 py-1 text-[11px] font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-md shadow-2xs cursor-pointer transition-colors"
              >
                应用模板
              </button>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
          <span>提示：应用新模板将覆盖当前画布内容</span>
          <button
            @click="isTemplateModalOpen = false"
            class="px-4 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
