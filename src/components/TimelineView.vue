<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  Clock,
  ChevronRight,
  Activity,
  Sparkles,
  Layers,
  Folder as FolderIcon,
  Search,
  X,
  Tag
} from 'lucide-vue-next';
import { Note, Folder, ViewType, BreadcrumbItem } from '../types';
import FileFormatIcon from './icons/FileFormatIcon.vue';
import MindmapIcon from './icons/MindmapIcon.vue';
import DrawioIcon from './icons/DrawioIcon.vue';

const props = defineProps<{
  notes: Note[];
  folders: Folder[];
  currentView: ViewType;
  breadcrumbItems: BreadcrumbItem[];
  getFolderFullPath: (folderId: string) => string;
}>();

const emit = defineEmits<{
  (e: 'switchToTableView'): void;
  (e: 'openNote', note: Note): void;
  (e: 'selectFolder', folderId: string): void;
}>();

// Timeline sorting mode: 'updated' (最近修改) vs 'created' (最近创建)
const timelineMode = ref<'updated' | 'created'>('updated');

// Format Filter: 'all' | 'markdown' | 'mindmap' | 'drawio'
const selectedFormat = ref<'all' | 'markdown' | 'mindmap' | 'drawio'>('all');

// Folder Filter
const selectedFolderId = ref<string>('all');

// Search query for quick viewing filter
const searchQuery = ref('');

// Helper to format relative time in Chinese
function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return '';
  const now = new Date();
  const normalizedStr = dateStr.replace(' ', 'T');
  const date = new Date(normalizedStr);
  if (isNaN(date.getTime())) return dateStr;

  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟前`;
  if (diffHour < 24) return `${diffHour} 小时前`;
  if (diffDay === 1) return '昨天';
  if (diffDay === 2) return '前天';
  if (diffDay < 7) return `${diffDay} 天前`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)} 周前`;
  if (diffDay < 365) return `${Math.floor(diffDay / 30)} 个月前`;
  return `${Math.floor(diffDay / 365)} 年前`;
}

// Get date group label for a date string
function getDateGroupKey(dateStr: string): { key: string; label: string; badge: string; isToday: boolean } {
  if (!dateStr) return { key: 'unknown', label: '未知时间', badge: '未知', isToday: false };
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const thisWeekStart = todayStart - now.getDay() * 86400000;

  const normalizedStr = dateStr.replace(' ', 'T');
  const d = new Date(normalizedStr);
  if (isNaN(d.getTime())) return { key: 'other', label: dateStr.slice(0, 10), badge: '历史', isToday: false };

  const time = d.getTime();
  const dateOnly = dateStr.slice(0, 10);

  if (time >= todayStart) {
    return { key: 'today', label: '今天', badge: dateOnly, isToday: true };
  } else if (time >= yesterdayStart) {
    return { key: 'yesterday', label: '昨天', badge: dateOnly, isToday: false };
  } else if (time >= thisWeekStart) {
    return { key: `week-${dateOnly}`, label: '本周', badge: dateOnly, isToday: false };
  } else {
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    return { key: `${year}-${month}`, label: `${year}年${month}月`, badge: dateOnly, isToday: false };
  }
}

// Filtered and Sorted Timeline Notes
const filteredTimelineNotes = computed(() => {
  let list = props.notes.filter((n) => !n.isDeleted);

  // 1. Format Filter
  if (selectedFormat.value !== 'all') {
    list = list.filter((n) => n.format === selectedFormat.value);
  }

  // 2. Folder Filter
  if (selectedFolderId.value !== 'all') {
    list = list.filter((n) => n.folderId === selectedFolderId.value);
  }

  // 3. Search Filter
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase();
    list = list.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q))
    );
  }

  // 4. Sort according to mode
  return [...list].sort((a, b) => {
    const timeA = timelineMode.value === 'updated' ? a.updatedAt : a.createdAt;
    const timeB = timelineMode.value === 'updated' ? b.updatedAt : b.createdAt;
    return (timeB || '').localeCompare(timeA || '');
  });
});

// Group notes by date groups
interface TimelineGroup {
  key: string;
  label: string;
  badge: string;
  isToday: boolean;
  notes: Note[];
}

const groupedTimeline = computed<TimelineGroup[]>(() => {
  const groupsMap = new Map<string, TimelineGroup>();

  filteredTimelineNotes.value.forEach((note) => {
    const timeStr = timelineMode.value === 'updated' ? note.updatedAt : note.createdAt;
    const { key, label, badge, isToday } = getDateGroupKey(timeStr);

    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        key,
        label,
        badge,
        isToday,
        notes: [],
      });
    }

    groupsMap.get(key)!.notes.push(note);
  });

  return Array.from(groupsMap.values());
});

function getFolderName(folderId: string): string {
  const f = props.folders.find((x) => x.id === folderId);
  return f ? f.name : '我的笔记';
}
</script>

<template>
  <div id="timeline-view-container" class="flex-1 flex flex-col bg-slate-50/50 overflow-hidden select-none">
    <!-- Top Compact Header Bar (Read-only view) -->
    <div id="timeline-header" class="bg-white px-5 py-3 border-b border-gray-100 shrink-0">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <!-- Title & Breadcrumb -->
        <div class="flex items-center gap-2 text-xs sm:text-sm">
          <button
            id="btn-nav-back-folder"
            @click="emit('switchToTableView')"
            class="text-gray-500 hover:text-blue-600 font-medium transition-colors cursor-pointer"
          >
            我的笔记
          </button>
          <ChevronRight class="w-3.5 h-3.5 text-gray-400" />
          <div class="flex items-center gap-1.5 font-bold text-gray-900">
            <Clock class="w-4 h-4 text-blue-600" />
            <span>时间线</span>
          </div>
          <span class="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium ml-1">
            共 {{ filteredTimelineNotes.length }} 条记录
          </span>
        </div>

        <!-- Mode & Format Controls -->
        <div class="flex flex-wrap items-center gap-2">
          <!-- Mode Tabs (最近修改 vs 最近创建) -->
          <div class="bg-gray-100 p-0.5 rounded-lg flex items-center text-xs font-medium">
            <button
              id="tab-mode-updated"
              @click="timelineMode = 'updated'"
              :class="[
                'flex items-center gap-1 px-2.5 py-1 rounded-md transition-all cursor-pointer',
                timelineMode === 'updated'
                  ? 'bg-white text-blue-600 font-bold shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              ]"
            >
              <Activity class="w-3 h-3 text-blue-500" />
              <span>按修改时间</span>
            </button>
            <button
              id="tab-mode-created"
              @click="timelineMode = 'created'"
              :class="[
                'flex items-center gap-1 px-2.5 py-1 rounded-md transition-all cursor-pointer',
                timelineMode === 'created'
                  ? 'bg-white text-emerald-600 font-bold shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              ]"
            >
              <Sparkles class="w-3 h-3 text-emerald-500" />
              <span>按创建时间</span>
            </button>
          </div>

          <!-- Format Filter -->
          <div class="flex items-center bg-gray-100 p-0.5 rounded-lg text-xs">
            <button
              @click="selectedFormat = 'all'"
              :class="['px-2 py-1 rounded-md transition-colors cursor-pointer', selectedFormat === 'all' ? 'bg-white text-gray-800 font-medium shadow-xs' : 'text-gray-500 hover:text-gray-800']"
            >
              全部
            </button>
            <button
              @click="selectedFormat = 'markdown'"
              :class="['px-2 py-1 rounded-md flex items-center gap-1 transition-colors cursor-pointer', selectedFormat === 'markdown' ? 'bg-white text-orange-600 font-medium shadow-xs' : 'text-gray-500 hover:text-gray-800']"
            >
              <FileFormatIcon format="markdown" size="xs" />
              <span>MD</span>
            </button>
            <button
              @click="selectedFormat = 'mindmap'"
              :class="['px-2 py-1 rounded-md flex items-center gap-1 transition-colors cursor-pointer', selectedFormat === 'mindmap' ? 'bg-white text-emerald-600 font-medium shadow-xs' : 'text-gray-500 hover:text-gray-800']"
            >
              <MindmapIcon size="xs" />
              <span>导图</span>
            </button>
            <button
              @click="selectedFormat = 'drawio'"
              :class="['px-2 py-1 rounded-md flex items-center gap-1 transition-colors cursor-pointer', selectedFormat === 'drawio' ? 'bg-white text-amber-600 font-medium shadow-xs' : 'text-gray-500 hover:text-gray-800']"
            >
              <DrawioIcon size="xs" />
              <span>图表</span>
            </button>
          </div>

          <!-- Folder Filter Dropdown -->
          <select
            v-model="selectedFolderId"
            class="bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 max-w-[130px] truncate focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            <option value="all">全部目录</option>
            <option v-for="folder in folders" :key="folder.id" :value="folder.id">
              {{ folder.name }}
            </option>
          </select>

          <!-- Search Filter -->
          <div class="relative w-36 sm:w-44">
            <Search class="w-3 h-3 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="快速过滤..."
              class="w-full bg-white border border-gray-200 rounded-lg pl-6 pr-6 py-1 text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              v-if="searchQuery"
              @click="searchQuery = ''"
              class="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <X class="w-3 h-3" />
            </button>
          </div>

          <!-- Back to Table View Button -->
          <button
            id="btn-switch-table-view"
            @click="emit('switchToTableView')"
            class="px-2.5 py-1 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-medium border border-gray-200 flex items-center gap-1 transition-colors cursor-pointer shrink-0"
            title="返回常规笔记列表"
          >
            <Layers class="w-3.5 h-3.5 text-gray-500" />
            <span>返回列表</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Main Timeline Stream Container (Clean, Compact, Read-only) -->
    <div id="timeline-stream-scroll" class="flex-1 overflow-y-auto px-5 sm:px-8 py-5 space-y-6">
      <!-- Empty State -->
      <div
        v-if="groupedTimeline.length === 0"
        class="flex flex-col items-center justify-center py-16 text-center"
      >
        <div class="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-gray-400 mb-3">
          <Clock class="w-6 h-6" />
        </div>
        <h3 class="text-xs font-medium text-gray-600">暂无符合条件的时间线记录</h3>
      </div>

      <!-- Timeline Groups -->
      <div
        v-for="group in groupedTimeline"
        :key="group.key"
        class="relative"
      >
        <!-- Date Milestone Header -->
        <div class="sticky top-0 z-10 py-1 mb-2.5 flex items-center gap-2.5">
          <div class="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-white/95 backdrop-blur border border-gray-200/80 rounded-full shadow-xs text-xs font-semibold text-gray-800">
            <span
              class="w-1.5 h-1.5 rounded-full"
              :class="group.isToday ? 'bg-emerald-500' : 'bg-blue-500'"
            ></span>
            <span>{{ group.label }}</span>
            <span class="text-[11px] font-normal text-gray-400">({{ group.badge }})</span>
            <span class="text-[10px] bg-gray-100 text-gray-500 px-1.5 rounded-full font-medium">
              {{ group.notes.length }}
            </span>
          </div>
          <div class="flex-1 h-px bg-gray-200/70"></div>
        </div>

        <!-- Vertical Spine & Compact Items (Strictly Read-Only, No Click Interactions) -->
        <div class="relative pl-5 sm:pl-6 ml-2 sm:ml-2.5 border-l border-gray-200 space-y-2">
          <!-- Timeline Node Item -->
          <div
            v-for="note in group.notes"
            :key="note.id"
            class="relative"
          >
            <!-- Timeline Dot on Spine -->
            <div
              class="absolute -left-[25px] sm:-left-[29px] top-2.5 w-3.5 h-3.5 rounded-full bg-white border-2 flex items-center justify-center pointer-events-none"
              :class="[
                note.format === 'drawio' || note.type === 'drawio'
                  ? 'border-amber-500'
                  : note.format === 'mindmap' || note.type === 'mindmap'
                  ? 'border-emerald-500'
                  : 'border-orange-500'
              ]"
            >
              <span
                class="w-1 h-1 rounded-full"
                :class="[
                  note.format === 'drawio' || note.type === 'drawio'
                    ? 'bg-amber-500'
                    : note.format === 'mindmap' || note.type === 'mindmap'
                    ? 'bg-emerald-500'
                    : 'bg-orange-500'
                ]"
              ></span>
            </div>

            <!-- Compact Row with Click-to-Open Jump in New Tab -->
            <div
              @click="emit('openNote', note)"
              class="group bg-white hover:bg-blue-50/40 hover:border-blue-200/80 rounded-lg border border-gray-200/75 px-3.5 py-2 flex items-center justify-between gap-3 text-xs cursor-pointer transition-all duration-150 shadow-2xs hover:shadow-xs"
              :title="`在新建网页中打开：${note.title || '无标题文档'}`"
            >
              <!-- Left: Format icon, Title, Folder, Tag -->
              <div class="flex items-center gap-2 min-w-0 flex-1">
                <div class="shrink-0">
                  <FileFormatIcon :format="note.format || note.type" size="xs" />
                </div>

                <span class="font-medium text-gray-800 group-hover:text-blue-600 truncate transition-colors">
                  {{ note.title || '无标题文档' }}
                </span>

                <button
                  type="button"
                  @click.stop="emit('selectFolder', note.folderId)"
                  class="text-[11px] text-gray-500 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 px-1.5 py-0.5 rounded border border-gray-100 hover:border-blue-200 flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                  :title="`跳转到目录：${getFolderName(note.folderId)}`"
                >
                  <FolderIcon class="w-2.5 h-2.5 text-gray-400" />
                  <span class="hover:underline">{{ getFolderName(note.folderId) }}</span>
                </button>

                <span
                  v-if="note.tags && note.tags.length"
                  class="hidden sm:inline-flex items-center gap-0.5 text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded shrink-0"
                >
                  <Tag class="w-2.5 h-2.5" />
                  <span>{{ note.tags[0] }}</span>
                </span>
              </div>

              <!-- Right: Timestamp info -->
              <div class="flex items-center gap-2.5 shrink-0 text-gray-400">
                <span class="text-[11px] font-mono">
                  {{ (timelineMode === 'updated' ? note.updatedAt : note.createdAt).slice(11, 16) }}
                </span>
                <span class="text-[11px] text-gray-500 font-medium group-hover:text-blue-500 transition-colors">
                  {{ formatRelativeTime(timelineMode === 'updated' ? note.updatedAt : note.createdAt) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
