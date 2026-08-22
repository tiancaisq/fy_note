<script setup lang="ts">
import { computed } from 'vue';
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Link as LinkIcon,
  Circle,
  ArrowLeftRight
} from 'lucide-vue-next';

export interface OutlineTreeNode {
  id: string;
  node: any;
  text: string;
  level: number;
  note?: string;
  hyperlink?: string;
  priority?: number;
  progress?: number;
  links?: Array<{ id: string; text?: string }>;
  children: OutlineTreeNode[];
  expanded: boolean;
  totalDescendants: number;
  isSelfMatch?: boolean;
}

const props = defineProps<{
  item: OutlineTreeNode;
  activeId: string | null;
  filterKeyword: string;
  level?: number;
  wrapText?: boolean;
}>();

const emit = defineEmits<{
  (e: 'locate', node: any): void;
  (e: 'toggle', item: OutlineTreeNode): void;
  (e: 'open-bilink', node: any): void;
}>();

const currentLevel = computed(() => props.level || 0);
const isActive = computed(() => props.activeId === props.item.id);

function highlightMatch(text: string, keyword: string) {
  if (!keyword || !text) return [{ text, isMatch: false }];
  const parts: { text: string; isMatch: boolean }[] = [];
  const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const tokens = text.split(regex);
  for (const token of tokens) {
    if (!token) continue;
    if (token.toLowerCase() === keyword.toLowerCase()) {
      parts.push({ text: token, isMatch: true });
    } else {
      parts.push({ text: token, isMatch: false });
    }
  }
  return parts;
}

function handleItemClick() {
  const itemId = String(props.item?.id || '');
  console.log('[MindMap:OutlineClick] Outline item clicked:', {
    id: itemId,
    text: String(props.item?.text || ''),
    level: Number(props.level || 0)
  });
  emit('locate', props.item.node || props.item.id || props.item);
}
</script>

<template>
  <div :class="['select-none text-xs', wrapText ? 'w-full min-w-0' : 'min-w-max w-full']">
    <!-- Item Row -->
    <div
      :id="'outline-node-' + item.id"
      :data-node-id="item.id"
      @click.stop="handleItemClick"
      :class="[
        'group flex items-center gap-1.5 py-1.5 px-2 rounded-lg cursor-pointer transition-all duration-150 relative border',
        wrapText ? 'w-full min-w-0' : 'min-w-0',
        isActive
          ? 'bg-emerald-100 text-emerald-950 border-emerald-400 font-semibold shadow-xs ring-1 ring-emerald-400/40'
          : item.isSelfMatch && filterKeyword
          ? 'bg-amber-50/90 text-amber-900 border-amber-300 font-medium'
          : 'border-transparent hover:bg-gray-100/90 text-gray-700 hover:text-gray-900'
      ]"
      :style="{ paddingLeft: `${Math.min(currentLevel * 12 + 6, 160)}px` }"
      :title="`第 ${currentLevel + 1} 级: ${item.text || '未命名分支'} (点击在导图中平滑定位)`"
    >
      <!-- Expand / Collapse Toggle -->
      <button
        v-if="item.children && item.children.length > 0"
        type="button"
        @click.stop.prevent="emit('toggle', item)"
        class="w-4 h-4 flex items-center justify-center rounded text-gray-400 hover:text-gray-800 hover:bg-gray-200/80 shrink-0 transition-colors cursor-pointer"
        :title="item.expanded ? '折叠子分支' : '展开子分支'"
      >
        <ChevronDown v-if="item.expanded" class="w-3.5 h-3.5 text-gray-600" />
        <ChevronRight v-else class="w-3.5 h-3.5 text-gray-500" />
      </button>
      <span v-else class="w-4 h-4 flex items-center justify-center shrink-0">
        <Circle class="w-1.5 h-1.5 text-gray-300 fill-gray-300" />
      </span>

      <!-- Node Hierarchy Level Indicator Icon -->
      <div class="shrink-0 flex items-center">
        <span
          v-if="currentLevel === 0"
          class="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold shadow-2xs"
        >
          根
        </span>
        <span
          v-else-if="currentLevel === 1"
          class="w-3.5 h-3.5 rounded bg-blue-500 text-white flex items-center justify-center text-[9px] font-semibold"
        >
          L1
        </span>
        <span
          v-else
          class="w-3.5 h-3.5 rounded bg-gray-100 border border-gray-200 text-gray-600 flex items-center justify-center text-[8px] font-mono"
        >
          L{{ currentLevel }}
        </span>
      </div>

      <!-- Priority Badge -->
      <span
        v-if="item.priority"
        class="shrink-0 text-[10px] font-bold px-1.5 py-0.2 rounded shadow-2xs text-white"
        :class="[
          item.priority === 1 ? 'bg-red-500' :
          item.priority === 2 ? 'bg-amber-500' :
          item.priority === 3 ? 'bg-yellow-500 text-gray-900' :
          item.priority === 4 ? 'bg-blue-500' : 'bg-gray-500'
        ]"
        :title="`优先级: P${item.priority}`"
      >
        P{{ item.priority }}
      </span>

      <!-- Progress Badge -->
      <span
        v-if="item.progress"
        class="shrink-0 text-[10px] px-1 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono"
        :title="`进度: ${Math.round((item.progress / 8) * 100)}%`"
      >
        {{ Math.round((item.progress / 8) * 100) }}%
      </span>

      <!-- Node Text (with keyword highlight and text wrapping / truncate mode) -->
      <div
        :class="[
          'flex-1 leading-relaxed min-w-0',
          wrapText ? 'whitespace-normal break-words break-all' : 'truncate whitespace-nowrap'
        ]"
        :title="item.text || '未命名节点'"
      >
        <template v-if="filterKeyword">
          <span
            v-for="(part, idx) in highlightMatch(item.text || '未命名节点', filterKeyword)"
            :key="idx"
            :class="part.isMatch ? 'bg-amber-200 text-amber-900 font-bold px-0.5 rounded' : ''"
          >
            {{ part.text }}
          </span>
        </template>
        <span v-else>
          {{ item.text || '未命名节点' }}
        </span>
      </div>

      <!-- Note Indicator -->
      <span
        v-if="item.note"
        class="shrink-0 text-amber-600 p-0.5 rounded hover:bg-amber-100/60"
        :title="`备注: ${item.note}`"
      >
        <FileText class="w-3 h-3" />
      </span>

      <!-- Hyperlink Indicator -->
      <span
        v-if="item.hyperlink"
        class="shrink-0 text-blue-600 p-0.5 rounded hover:bg-blue-100/60"
        :title="`超链接: ${item.hyperlink}`"
      >
        <LinkIcon class="w-3 h-3" />
      </span>

      <!-- Bidirectional Link Indicator -->
      <button
        v-if="item.links && item.links.length > 0"
        type="button"
        @click.stop.prevent="emit('open-bilink', item.node || item.id || item)"
        class="shrink-0 text-cyan-700 bg-cyan-50 border border-cyan-200 hover:bg-cyan-100 hover:border-cyan-300 px-1.5 py-0.2 rounded text-[9px] flex items-center gap-0.5 font-medium transition-colors cursor-pointer"
        :title="`双向链接 (${item.links.length} 个关联节点): ${item.links.map(l => l.text || l.id).join(', ')} (点击管理或跳转)`"
      >
        <ArrowLeftRight class="w-2.5 h-2.5 text-cyan-600" />
        <span>{{ item.links.length }}</span>
      </button>

      <!-- Child Count Badge -->
      <span
        v-if="item.children && item.children.length > 0"
        class="shrink-0 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.2 rounded-full font-mono group-hover:bg-gray-200 transition-colors"
        :title="`子节点数量: ${item.children.length} (总后代: ${item.totalDescendants})`"
      >
        {{ item.children.length }}
      </span>
    </div>

    <!-- Recursive Children -->
    <div
      v-if="item.expanded && item.children && item.children.length > 0"
      class="border-l border-gray-200/80 ml-2.5 space-y-0.5 mt-0.5"
    >
      <MindMapOutlineTreeItem
        v-for="child in item.children"
        :key="child.id"
        :item="child"
        :active-id="activeId"
        :filter-keyword="filterKeyword"
        :level="currentLevel + 1"
        :wrap-text="wrapText"
        @locate="emit('locate', $event)"
        @toggle="emit('toggle', $event)"
        @open-bilink="emit('open-bilink', $event)"
      />
    </div>
  </div>
</template>
