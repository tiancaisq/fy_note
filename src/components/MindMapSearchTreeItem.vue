<script setup lang="ts">
import { computed } from 'vue';
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Link as LinkIcon,
  GitBranch,
  Circle,
  Hash
} from 'lucide-vue-next';

export interface SearchTreeNode {
  id: string;
  node: any;
  text: string;
  isMatch: boolean;
  matchedField?: 'text' | 'note' | 'hyperlink';
  note?: string;
  priority?: number;
  progress?: number;
  children: SearchTreeNode[];
  expanded: boolean;
  matchCountInSubtree: number;
}

const props = defineProps<{
  item: SearchTreeNode;
  keyword: string;
  activeId: string | null;
  level?: number;
}>();

const emit = defineEmits<{
  (e: 'locate', node: any): void;
  (e: 'toggle', item: SearchTreeNode): void;
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
</script>

<template>
  <div class="select-none">
    <!-- Row Item -->
    <div
      @click="emit('locate', item.id || item.node)"
      :class="[
        'group flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-all text-xs',
        isActive
          ? 'bg-emerald-100/90 text-emerald-900 font-medium shadow-2xs border border-emerald-300'
          : item.isMatch
          ? 'hover:bg-emerald-50/80 text-gray-800 hover:text-emerald-800'
          : 'hover:bg-gray-100/80 text-gray-600'
      ]"
      :style="{ paddingLeft: `${currentLevel * 14 + 8}px` }"
      :title="item.isMatch ? '点击在导图中定位并聚焦此节点' : '点击定位此分支'"
    >
      <!-- Expand / Collapse Toggle -->
      <button
        v-if="item.children && item.children.length > 0"
        @click.stop="emit('toggle', item)"
        class="w-4 h-4 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 shrink-0 transition-colors"
      >
        <ChevronDown v-if="item.expanded" class="w-3 h-3" />
        <ChevronRight v-else class="w-3 h-3" />
      </button>
      <span v-else class="w-4 h-4 flex items-center justify-center shrink-0">
        <Circle class="w-1.5 h-1.5 text-gray-300 fill-gray-300" />
      </span>

      <!-- Level / Node Type Icon -->
      <div class="shrink-0 flex items-center">
        <GitBranch
          v-if="currentLevel === 0"
          class="w-3.5 h-3.5 text-purple-600"
        />
        <GitBranch
          v-else-if="item.children && item.children.length > 0"
          class="w-3.5 h-3.5 text-blue-500"
        />
        <Hash
          v-else
          class="w-3.5 h-3.5 text-gray-400"
        />
      </div>

      <!-- Node Text with Highlighted Keyword -->
      <div class="truncate flex-1 min-w-0 flex items-center gap-1">
        <span class="truncate">
          <template v-for="(part, pIdx) in highlightMatch(item.text, keyword)" :key="pIdx">
            <mark
              v-if="part.isMatch"
              class="bg-amber-200 text-amber-900 rounded-xs px-0.5 font-semibold not-italic"
            >
              {{ part.text }}
            </mark>
            <span v-else>{{ part.text }}</span>
          </template>
        </span>
      </div>

      <!-- Priority / Progress Badges -->
      <div class="shrink-0 flex items-center gap-1">
        <span
          v-if="item.priority"
          class="w-3.5 h-3.5 rounded-full bg-red-100 text-red-700 text-[9px] font-bold flex items-center justify-center"
          title="优先级"
        >
          {{ item.priority }}
        </span>

        <span
          v-if="item.note"
          class="text-amber-600"
          title="包含备注"
        >
          <FileText class="w-3 h-3" />
        </span>

        <span
          v-if="item.isMatch && item.matchedField === 'note'"
          class="text-[9px] bg-amber-100 text-amber-800 px-1 py-0.2 rounded font-mono font-normal"
        >
          备注匹配
        </span>

        <!-- Subtree Match Count Badge if not leaf or if current is parent -->
        <span
          v-if="item.children && item.children.length > 0"
          class="text-[10px] text-gray-400 font-mono group-hover:text-emerald-700 transition-colors"
          title="分支匹配结果数"
        >
          ({{ item.matchCountInSubtree }})
        </span>
      </div>
    </div>

    <!-- Recursive Children -->
    <div v-if="item.expanded && item.children && item.children.length > 0">
      <MindMapSearchTreeItem
        v-for="child in item.children"
        :key="child.id"
        :item="child"
        :keyword="keyword"
        :active-id="activeId"
        :level="currentLevel + 1"
        @locate="(n) => emit('locate', n)"
        @toggle="(i) => emit('toggle', i)"
      />
    </div>
  </div>
</template>
