<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import {
  ArrowLeftRight,
  Search,
  X,
  Trash2,
  Plus,
  GitBranch,
  Navigation,
  FolderTree,
  Link2,
  Check,
  Layers
} from 'lucide-vue-next';
import {
  getNodeText,
  getNodePath,
  getNodeStableId,
  getNodeLinks,
  getAllLinkableNodes,
  type LinkableNodeInfo
} from '../utils/mindmapLinks';

const props = defineProps<{
  isOpen: boolean;
  currentNode: any;
  rootNode: any;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'add-link', targetNodeId: string): void;
  (e: 'remove-link', targetNodeId: string): void;
  (e: 'locate-node', targetNodeId: string): void;
}>();

const searchKeyword = ref('');
const searchInputRef = ref<HTMLInputElement | null>(null);
const isSearchFocused = ref(false);
const highlightedIndex = ref(0);
const linksVersion = ref(0);

// Focus search input when modal opens
watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      searchKeyword.value = '';
      highlightedIndex.value = 0;
      isSearchFocused.value = false;
      linksVersion.value++;
      nextTick(() => {
        searchInputRef.value?.focus();
      });
    }
  }
);

const currentId = computed(() => getNodeStableId(props.currentNode));
const currentText = computed(() => getNodeText(props.currentNode));
const currentPath = computed(() => getNodePath(props.currentNode));

// Fast lookup set for already linked node IDs
const linkedNodeIdSet = computed(() => {
  const _v = linksVersion.value;
  if (!props.currentNode) return new Set<string>();
  const links = getNodeLinks(props.currentNode);
  return new Set(links.map((l) => l.id));
});

// Current linked nodes list with rich details
const activeLinks = computed(() => {
  const _v = linksVersion.value;
  if (!props.currentNode || !props.rootNode) return [];
  const links = getNodeLinks(props.currentNode);
  const allNodes = getAllLinkableNodes(props.rootNode, currentId.value);
  const nodeMap = new Map<string, LinkableNodeInfo>();
  for (const n of allNodes) {
    nodeMap.set(n.id, n);
  }

  return links.map((link) => {
    const info = nodeMap.get(link.id);
    return {
      id: link.id,
      text: info ? info.text : (link.text || '已删除或未知节点'),
      path: info ? info.path : [],
      level: info ? info.level : 0,
      exists: !!info,
      node: info?.node
    };
  });
});

// All linkable nodes (excluding self)
const allCandidateNodes = computed(() => {
  const _v = linksVersion.value;
  if (!props.rootNode || !props.currentNode) return [];
  const all = getAllLinkableNodes(props.rootNode, currentId.value);
  return all.filter((n) => !n.isSelf);
});

// Filtered search results: ONLY populated when searchKeyword is non-empty!
const searchResults = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase();
  if (!kw) return [];
  return allCandidateNodes.value.filter((n) => {
    const matchTitle = (n.text || '').toLowerCase().includes(kw);
    const matchPath = (n.path || []).some((p) => p.toLowerCase().includes(kw));
    return matchTitle || matchPath;
  });
});

watch(searchResults, () => {
  highlightedIndex.value = 0;
});

function handleToggleLink(nodeId: string) {
  if (linkedNodeIdSet.value.has(nodeId)) {
    emit('remove-link', nodeId);
  } else {
    emit('add-link', nodeId);
  }
  linksVersion.value++;
}

function handleRemoveLink(nodeId: string) {
  emit('remove-link', nodeId);
  linksVersion.value++;
}

function handleLocate(nodeId: string) {
  emit('locate-node', nodeId);
  emit('close');
}

function handleClearSearch() {
  searchKeyword.value = '';
  searchInputRef.value?.focus();
}

function handleSearchKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (searchKeyword.value) {
      e.stopPropagation();
      searchKeyword.value = '';
      return;
    }
  }

  if (searchResults.value.length === 0) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    highlightedIndex.value = (highlightedIndex.value + 1) % searchResults.value.length;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    highlightedIndex.value = (highlightedIndex.value - 1 + searchResults.value.length) % searchResults.value.length;
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const target = searchResults.value[highlightedIndex.value];
    if (target) {
      handleToggleLink(target.id);
    }
  }
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
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-60 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in"
    @mousedown="handleBackdropMouseDown"
    @click="handleBackdropClick"
  >
    <div
      class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-200 overflow-hidden flex flex-col h-[600px] max-h-[92vh] animate-in zoom-in-95 duration-150 relative"
    >
      <!-- Header -->
      <div class="px-5 py-4 bg-gradient-to-r from-cyan-50 via-teal-50/60 to-white border-b border-gray-100 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-xl bg-cyan-600 text-white flex items-center justify-center shadow-xs">
            <ArrowLeftRight class="w-4 h-4" />
          </div>
          <div>
            <h3 class="font-bold text-sm sm:text-base text-gray-900 flex items-center gap-2">
              <span>节点双向链接</span>
              <span class="text-[11px] font-normal px-2 py-0.5 rounded-full bg-cyan-100/80 text-cyan-800 border border-cyan-200 font-mono">
                自动双向互联
              </span>
            </h3>
            <p class="text-xs text-gray-500 mt-0.5">
              关联后两个节点自动互相记录链接，点击节点内 ⇄ 徽章即可平滑跳转
            </p>
          </div>
        </div>
        <button
          @click="emit('close')"
          class="text-gray-400 hover:text-gray-700 hover:bg-gray-100 p-1.5 rounded-lg transition-colors cursor-pointer"
          title="关闭 (Esc)"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Current Node Card -->
      <div class="px-5 py-3 bg-gray-50/80 border-b border-gray-200/80 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-xs font-semibold text-gray-500 shrink-0 flex items-center gap-1">
            <GitBranch class="w-3.5 h-3.5 text-cyan-600" />
            当前节点:
          </span>
          <span class="text-xs font-bold text-gray-900 bg-white border border-gray-200 px-2.5 py-1 rounded-md shadow-2xs truncate max-w-xs sm:max-w-md">
            {{ currentText || '未命名节点' }}
          </span>
        </div>
        <div v-if="currentPath.length > 0" class="text-[11px] text-gray-400 flex items-center gap-1 overflow-hidden truncate">
          <FolderTree class="w-3 h-3 text-gray-400 shrink-0" />
          <span class="truncate">{{ currentPath.join(' / ') }}</span>
        </div>
      </div>

      <!-- Top Search Bar Container (With Relative Positioning for Floating Dropdown) -->
      <div class="px-5 pt-4 pb-2 shrink-0 relative z-30">
        <div class="space-y-1.5">
          <label class="text-xs font-semibold text-gray-700 flex items-center justify-between">
            <span class="flex items-center gap-1.5">
              <Search class="w-3.5 h-3.5 text-cyan-600" />
              搜索节点快速关联
            </span>
            <span v-if="searchKeyword.trim()" class="text-[11px] text-gray-400 font-normal">
              支持上下键移动选中，按 Enter 键快速关联，Esc 清空
            </span>
          </label>
          <div class="relative flex items-center">
            <Search class="w-4 h-4 text-cyan-600 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref="searchInputRef"
              v-model="searchKeyword"
              @focus="isSearchFocused = true"
              @blur="isSearchFocused = false"
              @keydown="handleSearchKeydown"
              placeholder="输入主题关键词搜索导图节点并快速关联..."
              class="w-full pl-9 pr-8 py-2.5 text-xs bg-white border border-cyan-200/90 rounded-xl outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all placeholder:text-gray-400 shadow-2xs"
            />
            <button
              v-if="searchKeyword"
              @click="handleClearSearch"
              class="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded cursor-pointer"
              title="清空搜索 (Esc)"
            >
              <X class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <!-- Floating Suspended Search Results Dropdown (Does NOT push content) -->
        <div
          v-if="searchKeyword.trim()"
          class="absolute left-5 right-5 top-full mt-1.5 z-40 bg-white/98 backdrop-blur-md border border-cyan-300 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-72 animate-in fade-in zoom-in-95 duration-100 ring-1 ring-black/5"
        >
          <!-- Floating Header -->
          <div class="px-4 py-2.5 bg-gradient-to-r from-cyan-50 to-teal-50/70 border-b border-cyan-100 flex items-center justify-between shrink-0">
            <div class="text-xs font-bold text-gray-800 flex items-center gap-1.5">
              <Layers class="w-3.5 h-3.5 text-cyan-600" />
              <span>匹配结果</span>
              <span class="text-[11px] bg-cyan-100 text-cyan-800 px-2 py-0.2 rounded-full font-mono font-medium border border-cyan-200">
                {{ searchResults.length }} 个节点
              </span>
            </div>
            <span class="text-[11px] text-gray-400">点击按钮添加或取消关联</span>
          </div>

          <!-- Floating Scrollable Candidates List -->
          <div v-if="searchResults.length > 0" class="flex-1 overflow-y-auto p-2 space-y-1.5 divide-y divide-gray-50">
            <div
              v-for="(candidate, index) in searchResults"
              :key="candidate.id"
              @click="handleToggleLink(candidate.id)"
              @mouseenter="highlightedIndex = index"
              :class="[
                'p-2.5 flex items-center justify-between gap-3 rounded-xl border transition-all cursor-pointer',
                linkedNodeIdSet.has(candidate.id)
                  ? 'bg-cyan-50/70 border-cyan-300 shadow-2xs'
                  : highlightedIndex === index
                    ? 'bg-cyan-50/40 border-cyan-400 shadow-xs'
                    : 'bg-white border-gray-100 hover:border-cyan-200'
              ]"
            >
              <div class="min-w-0 flex-1 flex items-center gap-2.5">
                <span
                  v-if="candidate.level === 0"
                  class="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 shadow-2xs"
                >
                  根
                </span>
                <span
                  v-else
                  class="text-[10px] font-mono text-gray-600 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded shrink-0"
                >
                  L{{ candidate.level }}
                </span>

                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-semibold text-gray-900 truncate">
                      {{ candidate.text }}
                    </span>
                    <span
                      v-if="linkedNodeIdSet.has(candidate.id)"
                      class="text-[10px] text-cyan-800 bg-cyan-100/90 font-medium px-1.5 py-0.2 rounded-full shrink-0 flex items-center gap-0.5 border border-cyan-200"
                    >
                      <Check class="w-2.5 h-2.5" />
                      已关联
                    </span>
                  </div>
                  <div v-if="candidate.path.length > 0" class="text-[10px] text-gray-400 truncate mt-0.5">
                    路径: {{ candidate.path.join(' > ') }}
                  </div>
                </div>
              </div>

              <!-- Action Link/Unlink Button with Status Linkage -->
              <button
                type="button"
                @click.stop="handleToggleLink(candidate.id)"
                :class="[
                  'px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 shrink-0 cursor-pointer shadow-2xs',
                  linkedNodeIdSet.has(candidate.id)
                    ? 'text-red-600 bg-white hover:bg-red-50 hover:text-red-700 border border-red-200 hover:border-red-300'
                    : 'text-cyan-700 bg-cyan-50 hover:bg-cyan-600 hover:text-white border border-cyan-300'
                ]"
              >
                <template v-if="linkedNodeIdSet.has(candidate.id)">
                  <X class="w-3.5 h-3.5" />
                  <span>取消关联</span>
                </template>
                <template v-else>
                  <Plus class="w-3.5 h-3.5" />
                  <span>添加关联</span>
                </template>
              </button>
            </div>
          </div>

          <!-- Empty search result inside floating box -->
          <div
            v-else
            class="p-6 text-center text-xs text-gray-400 bg-white"
          >
            未找到包含 "<span class="text-gray-700 font-medium">{{ searchKeyword }}</span>" 的可关联节点
          </div>
        </div>
      </div>

      <!-- Main Body: Dedicated to Established Links List (Takes full height smoothly) -->
      <div class="flex-1 overflow-y-auto px-5 pb-4 pt-2 space-y-3 relative z-10">
        <div class="flex items-center justify-between">
          <h4 class="text-xs font-bold text-gray-800 flex items-center gap-1.5">
            <Link2 class="w-3.5 h-3.5 text-cyan-600" />
            <span>已建立的双向链接</span>
            <span class="text-[11px] bg-cyan-100 text-cyan-800 px-1.5 py-0.2 rounded-full font-mono font-medium">
              {{ activeLinks.length }}
            </span>
          </h4>
          <span class="text-[11px] text-gray-400">可在导图中通过点击定位按钮直达聚焦</span>
        </div>

        <!-- Established Links List -->
        <div v-if="activeLinks.length > 0" class="space-y-2">
          <div
            v-for="link in activeLinks"
            :key="link.id"
            class="group flex items-center justify-between p-3 bg-cyan-50/40 hover:bg-cyan-50/90 border border-cyan-200/80 rounded-xl transition-all shadow-2xs"
          >
            <div class="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
              <div class="w-7 h-7 rounded-lg bg-cyan-600/10 text-cyan-700 flex items-center justify-center shrink-0">
                <ArrowLeftRight class="w-3.5 h-3.5" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-semibold text-gray-900 truncate">
                    {{ link.text }}
                  </span>
                  <span
                    v-if="!link.exists"
                    class="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.2 rounded"
                  >
                    目标节点已删除
                  </span>
                </div>
                <div v-if="link.path && link.path.length > 0" class="text-[10px] text-gray-400 truncate mt-0.5">
                  路径: {{ link.path.join(' > ') }}
                </div>
              </div>
            </div>

            <!-- Action buttons -->
            <div class="flex items-center gap-1.5 shrink-0">
              <button
                v-if="link.exists"
                @click="handleLocate(link.id)"
                class="px-2.5 py-1.5 text-xs font-medium text-cyan-700 bg-white hover:bg-cyan-600 hover:text-white border border-cyan-300 rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                title="在导图中定位并聚焦此节点"
              >
                <Navigation class="w-3 h-3" />
                <span>定位跳转</span>
              </button>
              <button
                @click="handleRemoveLink(link.id)"
                class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                title="解除双向链接"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <!-- Empty State when no links -->
        <div
          v-else
          class="p-10 bg-gray-50/80 border border-dashed border-gray-200 rounded-2xl text-center text-xs text-gray-400 space-y-2 mt-2"
        >
          <div class="w-12 h-12 rounded-2xl bg-cyan-50 text-cyan-600 flex items-center justify-center mx-auto mb-1 border border-cyan-100 shadow-2xs">
            <Link2 class="w-6 h-6" />
          </div>
          <p class="font-semibold text-gray-700 text-sm">当前节点暂无双向链接</p>
          <p class="text-xs text-gray-400 max-w-sm mx-auto">
            在上方搜索框输入主题关键词，在悬浮列表中点击「添加关联」即可建立双向互联
          </p>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs shrink-0 relative z-10">
        <span class="text-gray-400 text-[11px]">
          提示: 双向链接已在节点内以 <span class="text-cyan-700 font-bold">⇄</span> 图标呈现，点击可直接跳转
        </span>
        <button
          @click="emit('close')"
          class="px-4 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors shadow-2xs"
        >
          完成
        </button>
      </div>
    </div>
  </div>
</template>
