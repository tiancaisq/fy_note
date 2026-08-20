<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import {
  FileCode2,
  X,
  Check,
  Copy,
  RotateCcw,
  Sparkles,
  HelpCircle,
  Hash,
  List,
  MessageSquare,
  Link,
  Flag,
  Percent
} from 'lucide-vue-next';
import { mindmapToMarkdown, markdownToMindmap, MindMapRootJson } from '../utils/markdownMindmap';

const props = defineProps<{
  isOpen: boolean;
  currentMindData: any;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'apply', mindJson: MindMapRootJson): void;
}>();

const markdownText = ref('');
const isCopied = ref(false);
const showHelp = ref(false);
const textareaRef = ref<HTMLTextAreaElement | null>(null);

// When modal opens, serialize current mindmap data to Markdown
watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      if (props.currentMindData) {
        markdownText.value = mindmapToMarkdown(props.currentMindData);
      } else {
        markdownText.value = '# 中心主题\n\n## 分支主题 1\n- 子主题 1.1\n- 子主题 1.2\n\n## 分支主题 2\n- 子主题 2.1\n';
      }
      nextTick(() => {
        textareaRef.value?.focus();
      });
    }
  },
  { immediate: true }
);

function handleReset() {
  if (props.currentMindData) {
    markdownText.value = mindmapToMarkdown(props.currentMindData);
  }
}

function handleCopy() {
  if (!markdownText.value) return;
  navigator.clipboard.writeText(markdownText.value);
  isCopied.value = true;
  setTimeout(() => {
    isCopied.value = false;
  }, 2000);
}

function handleApply() {
  try {
    const mindJson = markdownToMindmap(markdownText.value);
    emit('apply', mindJson);
    emit('close');
  } catch (err) {
    console.error('Failed to parse markdown into mindmap:', err);
  }
}

// Handle Tab key in textarea for indentation
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Tab') {
    e.preventDefault();
    const textarea = textareaRef.value;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = markdownText.value;

    markdownText.value = value.substring(0, start) + '  ' + value.substring(end);
    nextTick(() => {
      textarea.selectionStart = textarea.selectionEnd = start + 2;
    });
  }
}

// Insert snippet helpers
function insertSnippet(prefix: string, suffix: string = '') {
  const textarea = textareaRef.value;
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = markdownText.value;
  const selected = value.substring(start, end) || '主题文字';

  const replacement = prefix + selected + suffix;
  markdownText.value = value.substring(0, start) + replacement + value.substring(end);

  nextTick(() => {
    textarea.focus();
    textarea.selectionStart = start + prefix.length;
    textarea.selectionEnd = start + prefix.length + selected.length;
  });
}

function insertTemplate() {
  markdownText.value = `# 项目规划导图

## 项目目标 [P1] [100%]
- 提升团队协同效率
- 打造极致思维导图体验
  > 包含大纲视图、快捷键与 Markdown 导入导出

## 核心功能清单 [P2] [50%]
- 节点层级自由增删
- 富文本与结构支持
  - 优先级与进度标识 [P1]
  - [官网文档链接](https://example.com)
  > 支持随时以 Markdown 格式双向编辑

## 迭代计划 [P3] [25%]
- 第一阶段: 基础编辑与渲染
- 第二阶段: 搜索、大纲与 Markdown 增强
`;
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150 select-none"
  >
    <div
      class="bg-white w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 h-[88vh] max-h-[780px]"
    >
      <!-- Header -->
      <div class="h-14 px-5 bg-white border-b border-gray-100 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <FileCode2 class="w-4 h-4" />
          </div>
          <div>
            <h3 class="text-sm font-bold text-gray-900 flex items-center gap-2">
              Markdown 编辑思维导图
              <span class="text-[10px] bg-emerald-100 text-emerald-800 font-medium px-2 py-0.5 rounded-full">
                双向解析
              </span>
            </h3>
            <p class="text-[11px] text-gray-400">使用标准 Markdown 标题和列表结构快速编辑并生成脑图节点</p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button
            @click="showHelp = !showHelp"
            class="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer text-xs flex items-center gap-1"
            title="语法说明"
          >
            <HelpCircle class="w-4 h-4" />
            <span class="text-xs hidden sm:inline">语法指引</span>
          </button>
          <button
            @click="emit('close')"
            class="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
            title="关闭 (Esc)"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- Quick Snippet Toolbar -->
      <div class="px-4 py-2 bg-slate-50 border-b border-gray-100 flex items-center gap-1.5 overflow-x-auto text-xs shrink-0">
        <span class="text-[11px] text-gray-400 mr-1 font-medium shrink-0">快捷插入:</span>
        <button
          @click="insertSnippet('# ')"
          class="px-2 py-1 bg-white hover:bg-emerald-50 hover:text-emerald-700 text-gray-700 rounded border border-gray-200 shadow-2xs font-mono text-[11px] transition-colors cursor-pointer shrink-0"
          title="插入一级主标题"
        >
          # 根节点
        </button>
        <button
          @click="insertSnippet('## ')"
          class="px-2 py-1 bg-white hover:bg-emerald-50 hover:text-emerald-700 text-gray-700 rounded border border-gray-200 shadow-2xs font-mono text-[11px] transition-colors cursor-pointer shrink-0"
          title="插入二级分支"
        >
          ## 二级分支
        </button>
        <button
          @click="insertSnippet('- ')"
          class="px-2 py-1 bg-white hover:bg-emerald-50 hover:text-emerald-700 text-gray-700 rounded border border-gray-200 shadow-2xs font-mono text-[11px] transition-colors cursor-pointer shrink-0"
          title="插入子列表项"
        >
          - 子项目
        </button>
        <button
          @click="insertSnippet('> ')"
          class="px-2 py-1 bg-white hover:bg-amber-50 hover:text-amber-700 text-gray-700 rounded border border-gray-200 shadow-2xs text-[11px] transition-colors cursor-pointer shrink-0"
          title="插入节点备注"
        >
          &gt; 备注
        </button>
        <button
          @click="insertSnippet('[P1] ')"
          class="px-2 py-1 bg-white hover:bg-red-50 hover:text-red-700 text-gray-700 rounded border border-gray-200 shadow-2xs text-[11px] font-bold transition-colors cursor-pointer shrink-0"
          title="插入优先级"
        >
          [P1]
        </button>
        <button
          @click="insertSnippet('[50%] ')"
          class="px-2 py-1 bg-white hover:bg-indigo-50 hover:text-indigo-700 text-gray-700 rounded border border-gray-200 shadow-2xs text-[11px] font-mono transition-colors cursor-pointer shrink-0"
          title="插入进度百分比"
        >
          [50%]
        </button>
        <button
          @click="insertSnippet('[', '](https://)')"
          class="px-2 py-1 bg-white hover:bg-blue-50 hover:text-blue-700 text-gray-700 rounded border border-gray-200 shadow-2xs text-[11px] transition-colors cursor-pointer shrink-0"
          title="插入超链接"
        >
          [链接](url)
        </button>

        <div class="h-4 w-px bg-gray-200 mx-1 shrink-0"></div>

        <button
          @click="insertTemplate"
          class="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded border border-emerald-200 text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1 shrink-0 ml-auto"
          title="载入示例模板"
        >
          <Sparkles class="w-3 h-3 text-emerald-600" />
          <span>示例模板</span>
        </button>
      </div>

      <!-- Collapsible Syntax Help Box -->
      <div v-if="showHelp" class="p-3.5 bg-emerald-50/70 border-b border-emerald-100 text-xs text-emerald-900 shrink-0 space-y-1.5">
        <div class="font-bold flex items-center gap-1.5">
          <HelpCircle class="w-3.5 h-3.5 text-emerald-600" />
          <span>Markdown 思维导图排版规则：</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-emerald-800">
          <div>• <code># 根节点</code> / <code>## 一级分支</code> / <code>### 二级分支</code> 定义层级</div>
          <div>• <code>- 列表项</code> 缩进 2 空格表示下级子节点</div>
          <div>• <code>&gt; 备注内容</code> 会作为上一节点的悬浮备注</div>
          <div>• <code>[P1]</code> 至 <code>[P9]</code> 表示优先级，<code>[50%]</code> 表示进度</div>
          <div>• <code>[显示文字](https://url)</code> 表示节点超链接</div>
        </div>
      </div>

      <!-- Code Editor Area -->
      <div class="flex-1 relative bg-slate-900 text-slate-100 overflow-hidden flex font-mono text-xs">
        <textarea
          ref="textareaRef"
          v-model="markdownText"
          @keydown="handleKeydown"
          placeholder="# 在此输入 Markdown 导图文本...&#10;&#10;## 分支 1&#10;- 子主题 1.1&#10;- 子主题 1.2&#10;&#10;## 分支 2&#10;- 子主题 2.1&#10;"
          class="w-full h-full p-4 bg-transparent text-slate-100 resize-none outline-none leading-relaxed selection:bg-emerald-500/30 select-text"
          spellcheck="false"
        ></textarea>
      </div>

      <!-- Footer Controls -->
      <div class="h-14 px-5 bg-white border-t border-gray-100 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-2">
          <button
            @click="handleCopy"
            class="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Check v-if="isCopied" class="w-3.5 h-3.5 text-emerald-600" />
            <Copy v-else class="w-3.5 h-3.5 text-gray-500" />
            <span>{{ isCopied ? '已复制' : '复制 Markdown' }}</span>
          </button>

          <button
            @click="handleReset"
            class="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            title="重新读取当前思维导图节点"
          >
            <RotateCcw class="w-3.5 h-3.5 text-gray-500" />
            <span class="hidden sm:inline">重置为当前导图</span>
          </button>
        </div>

        <div class="flex items-center gap-2.5">
          <button
            @click="emit('close')"
            class="px-4 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
          >
            取消
          </button>
          <button
            @click="handleApply"
            class="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Check class="w-4 h-4" />
            <span>应用并更新导图</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
