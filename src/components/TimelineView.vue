<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  Clock,
  Sparkles,
  Calendar,
  Filter,
  Search,
  Folder as FolderIcon,
  Star,
  Box,
  Share2,
  Trash2,
  FolderInput,
  ArrowRight,
  Plus,
  FileText,
  Layers,
  ChevronRight,
  CalendarClock,
  Activity,
  Tag,
  Eye,
  SlidersHorizontal,
  LayoutGrid,
  List,
  Flame,
  CheckCircle2,
  X
} from 'lucide-vue-next';
import { Note, Folder, ViewType, BreadcrumbItem } from '../types';
import FileFormatIcon from './icons/FileFormatIcon.vue';
import MindmapIcon from './icons/MindmapIcon.vue';

const props = defineProps<{
  notes: Note[];
  folders: Folder[];
  currentView: ViewType;
  breadcrumbItems: BreadcrumbItem[];
  getFolderFullPath: (folderId: string) => string;
}>();

const emit = defineEmits<{
  (e: 'openNote', note: Note): void;
  (e: 'createNewNote'): void;
  (e: 'createNewMindMap'): void;
  (e: 'breadcrumbClick', item: BreadcrumbItem): void;
  (e: 'toggleStar', noteId: string): void;
  (e: 'toggleFavorite', noteId: string): void;
  (e: 'moveToTrash', noteId: string): void;
  (e: 'openShareModal', note: Note): void;
  (e: 'openMoveModal', note: Note): void;
  (e: 'switchToTableView'): void;
  (e: 'selectFolder', folderId: string): void;
}>();

// Timeline Mode: 'updated' (最近修改) vs 'created' (最近创建)
const timelineMode = ref<'updated' | 'created'>('updated');

// Format Filter: 'all' | 'markdown' | 'mindmap'
const selectedFormat = ref<'all' | 'markdown' | 'mindmap'>('all');

// Time Range Filter: 'all' | 'today' | '3days' | '7days' | '30days'
const selectedTimeRange = ref<'all' | 'today' | '3days' | '7days' | '30days'>('all');

// Folder Filter
const selectedFolderId = ref<string>('all');

// Local Search inside timeline
const searchQuery = ref('');

// Starred / Favorite quick filters
const filterStarredOnly = ref(false);
const filterFavoriteOnly = ref(false);

// View density: 'card' (vertical timeline cards) vs 'compact' (dense list)
const viewDensity = ref<'card' | 'compact'>('card');

// Helper to format relative time in Chinese
function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return '';
  const now = new Date();
  // Handle space or ISO format
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

// Get smart date group label for a date string
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

// Clean markdown text for preview
function cleanTextPreview(content: string, format: string): string {
  if (!content) return '无内容描述...';
  if (format === 'mindmap') {
    try {
      const data = JSON.parse(content);
      const rootText = data.root?.data?.text || '中心主题导图';
      const childrenText = (data.root?.children || [])
        .map((c: any) => c.data?.text)
        .filter(Boolean)
        .slice(0, 4)
        .join(' · ');
      return childrenText ? `[思维导图] ${rootText} ➔ ${childrenText}` : `[思维导图] ${rootText}`;
    } catch {
      return '[结构化思维导图]';
    }
  }

  // Strip markdown headers, bold, images, code blocks
  return content
    .replace(/^#+\s+/gm, '')
    .replace(/```[\s\S]*?```/g, ' [代码块] ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/[*_~>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160) || '无预览文本...';
}

// Calculate approximate stats
function getNoteWordCount(content: string, format: string): number {
  if (!content) return 0;
  if (format === 'mindmap') {
    try {
      const json = JSON.parse(content);
      let count = 0;
      function traverse(node: any) {
        if (node?.data?.text) count += node.data.text.length;
        if (node?.children) node.children.forEach(traverse);
      }
      traverse(json.root);
      return count;
    } catch {
      return 0;
    }
  }
  return content.replace(/\s/g, '').length;
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

  // 3. Starred / Favorite Filter
  if (filterStarredOnly.value) {
    list = list.filter((n) => n.isStarred);
  }
  if (filterFavoriteOnly.value) {
    list = list.filter((n) => n.isFavorite);
  }

  // 4. Time Range Filter
  if (selectedTimeRange.value !== 'all') {
    const now = Date.now();
    const targetField = timelineMode.value === 'updated' ? 'updatedAt' : 'createdAt';
    const dayMs = 86400000;

    list = list.filter((n) => {
      const timeStr = (n as any)[targetField];
      if (!timeStr) return false;
      const t = new Date(timeStr.replace(' ', 'T')).getTime();
      if (isNaN(t)) return true;

      const diff = now - t;
      if (selectedTimeRange.value === 'today') return diff <= dayMs;
      if (selectedTimeRange.value === '3days') return diff <= 3 * dayMs;
      if (selectedTimeRange.value === '7days') return diff <= 7 * dayMs;
      if (selectedTimeRange.value === '30days') return diff <= 30 * dayMs;
      return true;
    });
  }

  // 5. Local Search
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase();
    list = list.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q))
    );
  }

  // 6. Sort according to mode
  return [...list].sort((a, b) => {
    const timeA = timelineMode.value === 'updated' ? a.updatedAt : a.createdAt;
    const timeB = timelineMode.value === 'updated' ? b.updatedAt : b.createdAt;
    return timeB.localeCompare(timeA);
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

// Overall Statistics
const totalActiveNotes = computed(() => props.notes.filter((n) => !n.isDeleted).length);
const todayActiveCount = computed(() => {
  const todayStr = new Date().toISOString().slice(0, 10);
  return props.notes.filter(
    (n) => !n.isDeleted && (n.updatedAt?.startsWith(todayStr) || n.createdAt?.startsWith(todayStr))
  ).length;
});
const markdownCount = computed(() => props.notes.filter((n) => !n.isDeleted && n.format === 'markdown').length);
const mindmapCount = computed(() => props.notes.filter((n) => !n.isDeleted && n.format === 'mindmap').length);

function getFolderName(folderId: string): string {
  const f = props.folders.find((x) => x.id === folderId);
  return f ? f.name : '我的笔记';
}
</script>

<template>
  <div id="timeline-view-container" class="flex-1 flex flex-col bg-slate-50/50 overflow-hidden select-none">
    <!-- Top Header Bar -->
    <div id="timeline-header" class="bg-white px-6 py-4 border-b border-gray-100 shrink-0">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <!-- Title & Breadcrumb -->
        <div>
          <div class="flex items-center gap-2 text-sm">
            <button
              @click="emit('switchToTableView')"
              class="text-gray-500 hover:text-blue-600 hover:underline font-medium transition-colors cursor-pointer"
            >
              我的笔记
            </button>
            <ChevronRight class="w-3.5 h-3.5 text-gray-400" />
            <div class="flex items-center gap-1.5 font-bold text-gray-900">
              <Clock class="w-4 h-4 text-blue-600" />
              <span>文件动态时间线</span>
            </div>
            <span class="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium ml-1">
              {{ filteredTimelineNotes.length }} 篇
            </span>
          </div>
          <p class="text-xs text-gray-400 mt-1">
            以时光轴形式全景回溯最近创建与修改的 Markdown 笔记与思维导图
          </p>
        </div>

        <!-- Mode Switcher Tabs (最近修改 vs 最近创建) -->
        <div class="flex items-center gap-2">
          <div class="bg-gray-100 p-1 rounded-xl flex items-center shadow-inner text-xs font-medium">
            <button
              id="tab-mode-updated"
              @click="timelineMode = 'updated'"
              :class="[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer',
                timelineMode === 'updated'
                  ? 'bg-white text-blue-600 font-bold shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              ]"
            >
              <Activity class="w-3.5 h-3.5 text-blue-500" />
              <span>最近修改</span>
            </button>
            <button
              id="tab-mode-created"
              @click="timelineMode = 'created'"
              :class="[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer',
                timelineMode === 'created'
                  ? 'bg-white text-emerald-600 font-bold shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              ]"
            >
              <Sparkles class="w-3.5 h-3.5 text-emerald-500" />
              <span>最近创建</span>
            </button>
          </div>

          <!-- Density Toggle -->
          <div class="hidden sm:flex bg-gray-100 p-1 rounded-xl items-center text-xs">
            <button
              @click="viewDensity = 'card'"
              :class="[
                'p-1.5 rounded-lg transition-all cursor-pointer',
                viewDensity === 'card' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'
              ]"
              title="卡片时间轴视图"
            >
              <LayoutGrid class="w-3.5 h-3.5" />
            </button>
            <button
              @click="viewDensity = 'compact'"
              :class="[
                'p-1.5 rounded-lg transition-all cursor-pointer',
                viewDensity === 'compact' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'
              ]"
              title="紧凑列表视图"
            >
              <List class="w-3.5 h-3.5" />
            </button>
          </div>

          <!-- Back to Table View Button -->
          <button
            id="btn-switch-table-view"
            @click="emit('switchToTableView')"
            class="px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-medium border border-gray-200 flex items-center gap-1.5 transition-colors cursor-pointer"
            title="返回常规文件夹列表"
          >
            <Layers class="w-3.5 h-3.5 text-gray-500" />
            <span>表格视图</span>
          </button>
        </div>
      </div>

      <!-- Quick Statistics Banner -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 pt-3 border-t border-gray-100">
        <div class="bg-blue-50/60 border border-blue-100/80 rounded-xl px-3 py-2 flex items-center justify-between">
          <div>
            <div class="text-[11px] text-blue-600 font-medium">总活跃文件</div>
            <div class="text-base font-extrabold text-blue-900">{{ totalActiveNotes }} <span class="text-[11px] font-normal text-blue-500">篇</span></div>
          </div>
          <FileText class="w-5 h-5 text-blue-400" />
        </div>

        <div class="bg-amber-50/60 border border-amber-100/80 rounded-xl px-3 py-2 flex items-center justify-between">
          <div>
            <div class="text-[11px] text-amber-700 font-medium">今日动态</div>
            <div class="text-base font-extrabold text-amber-900">{{ todayActiveCount }} <span class="text-[11px] font-normal text-amber-600">篇变动</span></div>
          </div>
          <Flame class="w-5 h-5 text-amber-500" />
        </div>

        <div class="bg-orange-50/60 border border-orange-100/80 rounded-xl px-3 py-2 flex items-center justify-between">
          <div>
            <div class="text-[11px] text-orange-700 font-medium">Markdown 笔记</div>
            <div class="text-base font-extrabold text-orange-900">{{ markdownCount }} <span class="text-[11px] font-normal text-orange-500">篇</span></div>
          </div>
          <FileFormatIcon format="markdown" size="sm" />
        </div>

        <div class="bg-emerald-50/60 border border-emerald-100/80 rounded-xl px-3 py-2 flex items-center justify-between">
          <div>
            <div class="text-[11px] text-emerald-700 font-medium">思维导图</div>
            <div class="text-base font-extrabold text-emerald-900">{{ mindmapCount }} <span class="text-[11px] font-normal text-emerald-500">幅</span></div>
          </div>
          <MindmapIcon size="sm" />
        </div>
      </div>

      <!-- Filter Controls Strip -->
      <div class="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-gray-100 text-xs">
        <!-- Left: Format & Time Range & Folder selector -->
        <div class="flex flex-wrap items-center gap-2">
          <!-- Format Pills -->
          <div class="flex items-center bg-gray-100 p-0.5 rounded-lg">
            <button
              @click="selectedFormat = 'all'"
              :class="['px-2.5 py-1 rounded-md transition-colors cursor-pointer', selectedFormat === 'all' ? 'bg-white text-gray-800 font-medium shadow-xs' : 'text-gray-500 hover:text-gray-800']"
            >
              全部类型
            </button>
            <button
              @click="selectedFormat = 'markdown'"
              :class="['px-2.5 py-1 rounded-md flex items-center gap-1 transition-colors cursor-pointer', selectedFormat === 'markdown' ? 'bg-white text-orange-600 font-medium shadow-xs' : 'text-gray-500 hover:text-gray-800']"
            >
              <FileFormatIcon format="markdown" size="xs" />
              <span>Markdown</span>
            </button>
            <button
              @click="selectedFormat = 'mindmap'"
              :class="['px-2.5 py-1 rounded-md flex items-center gap-1 transition-colors cursor-pointer', selectedFormat === 'mindmap' ? 'bg-white text-emerald-600 font-medium shadow-xs' : 'text-gray-500 hover:text-gray-800']"
            >
              <MindmapIcon size="xs" />
              <span>导图</span>
            </button>
          </div>

          <!-- Time Range Dropdown -->
          <select
            v-model="selectedTimeRange"
            class="bg-white border border-gray-200 rounded-lg px-2.5 py-1 text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            <option value="all">🕒 全部时间范围</option>
            <option value="today">⚡ 今天</option>
            <option value="3days">📅 最近 3 天</option>
            <option value="7days">📅 最近 7 天</option>
            <option value="30days">🗓️ 最近 30 天</option>
          </select>

          <!-- Folder Dropdown -->
          <select
            v-model="selectedFolderId"
            class="bg-white border border-gray-200 rounded-lg px-2.5 py-1 text-gray-700 max-w-[150px] truncate focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            <option value="all">📁 全部文件夹</option>
            <option v-for="folder in folders" :key="folder.id" :value="folder.id">
              📁 {{ folder.name }}
            </option>
          </select>

          <!-- Star & Favorite quick filters -->
          <button
            @click="filterStarredOnly = !filterStarredOnly"
            :class="[
              'px-2.5 py-1 rounded-lg border flex items-center gap-1 transition-colors cursor-pointer',
              filterStarredOnly ? 'bg-amber-50 border-amber-200 text-amber-700 font-medium' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            ]"
          >
            <Star class="w-3.5 h-3.5" :class="filterStarredOnly ? 'fill-amber-400 text-amber-500' : 'text-gray-400'" />
            <span>标星</span>
          </button>

          <button
            @click="filterFavoriteOnly = !filterFavoriteOnly"
            :class="[
              'px-2.5 py-1 rounded-lg border flex items-center gap-1 transition-colors cursor-pointer',
              filterFavoriteOnly ? 'bg-blue-50 border-blue-200 text-blue-700 font-medium' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            ]"
          >
            <Box class="w-3.5 h-3.5 text-blue-500" />
            <span>收藏</span>
          </button>
        </div>

        <!-- Right: In-Timeline Search Box -->
        <div class="relative w-full sm:w-56">
          <Search class="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索时间线内容..."
            class="w-full bg-white border border-gray-200 rounded-lg pl-8 pr-7 py-1 text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
          />
          <button
            v-if="searchQuery"
            @click="searchQuery = ''"
            class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
          >
            <X class="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>

    <!-- Main Timeline Stream Container -->
    <div id="timeline-stream-scroll" class="flex-1 overflow-y-auto px-6 py-6 space-y-8">
      <!-- Empty State -->
      <div
        v-if="groupedTimeline.length === 0"
        class="flex flex-col items-center justify-center py-20 text-center"
      >
        <div class="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-500 mb-4 shadow-sm">
          <Clock class="w-8 h-8" />
        </div>
        <h3 class="text-base font-bold text-gray-800 mb-1">未找到符合条件的时间线记录</h3>
        <p class="text-xs text-gray-400 max-w-sm mb-6">
          请尝试调整上方筛选条件，或者点击下方按钮立即创建新的笔记或思维导图。
        </p>
        <div class="flex items-center gap-3">
          <button
            @click="emit('createNewNote')"
            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>新建笔记</span>
          </button>
          <button
            @click="emit('createNewMindMap')"
            class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
          >
            <MindmapIcon size="xs" />
            <span>新建导图</span>
          </button>
        </div>
      </div>

      <!-- Timeline Groups -->
      <div
        v-for="group in groupedTimeline"
        :key="group.key"
        class="relative"
      >
        <!-- Date Milestone Header -->
        <div class="sticky top-0 z-10 py-1.5 mb-4 flex items-center gap-3">
          <div class="inline-flex items-center gap-2 px-3 py-1 bg-white/95 backdrop-blur border border-gray-200/80 rounded-full shadow-xs text-xs font-bold text-gray-800">
            <span
              class="w-2 h-2 rounded-full"
              :class="group.isToday ? 'bg-emerald-500 animate-pulse' : 'bg-blue-500'"
            ></span>
            <span>{{ group.label }}</span>
            <span class="text-[11px] font-normal text-gray-400">({{ group.badge }})</span>
            <span class="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.2 rounded-full font-medium">
              {{ group.notes.length }} 篇
            </span>
          </div>
          <div class="flex-1 h-px bg-gradient-to-r from-gray-200 via-gray-100 to-transparent"></div>
        </div>

        <!-- Vertical Spine & Timeline Items -->
        <div class="relative pl-6 sm:pl-8 ml-3 sm:ml-4 border-l-2 border-dashed border-gray-200 space-y-4">
          <!-- Timeline Node Item -->
          <div
            v-for="note in group.notes"
            :key="note.id"
            class="relative group"
          >
            <!-- Timeline Dot on Spine -->
            <div
              class="absolute -left-[31px] sm:-left-[39px] top-4 w-5 h-5 rounded-full bg-white border-2 flex items-center justify-center transition-all group-hover:scale-110 shadow-xs"
              :class="[
                note.format === 'mindmap'
                  ? 'border-emerald-500 text-emerald-600 group-hover:bg-emerald-50'
                  : 'border-orange-500 text-orange-600 group-hover:bg-orange-50'
              ]"
            >
              <span class="w-1.5 h-1.5 rounded-full" :class="note.format === 'mindmap' ? 'bg-emerald-500' : 'bg-orange-500'"></span>
            </div>

            <!-- Card Layout Mode -->
            <div
              v-if="viewDensity === 'card'"
              @click="emit('openNote', note)"
              class="bg-white rounded-xl border border-gray-200/80 p-4 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer flex flex-col gap-2.5"
            >
              <!-- Card Top Row: Title, Format Badge, Relative Time, Quick Actions -->
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-2 min-w-0 flex-1">
                  <!-- Format Icon Badge -->
                  <div class="shrink-0">
                    <FileFormatIcon v-if="note.format === 'markdown'" format="markdown" size="sm" />
                    <MindmapIcon v-else size="sm" />
                  </div>

                  <!-- Note Title -->
                  <h4 class="font-bold text-sm text-gray-900 group-hover:text-blue-600 truncate transition-colors">
                    {{ note.title || '无标题文档' }}
                  </h4>

                  <!-- Star / Favorite Icons -->
                  <Star v-if="note.isStarred" class="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
                  <Box v-if="note.isFavorite" class="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <Share2 v-if="note.isShared" class="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                </div>

                <!-- Timestamp & Actions -->
                <div class="flex items-center gap-2 shrink-0">
                  <!-- Time Badge -->
                  <div class="text-right">
                    <div class="text-[11px] font-medium text-gray-500">
                      {{ formatRelativeTime(timelineMode === 'updated' ? note.updatedAt : note.createdAt) }}
                    </div>
                    <div class="text-[10px] text-gray-400 font-mono">
                      {{ (timelineMode === 'updated' ? note.updatedAt : note.createdAt).slice(11, 16) }}
                    </div>
                  </div>

                  <!-- Hover Action Buttons -->
                  <div
                    @click.stop
                    class="opacity-0 group-hover:opacity-100 flex items-center gap-1 bg-gray-50 p-1 rounded-lg border border-gray-100 transition-opacity"
                  >
                    <button
                      @click="emit('toggleStar', note.id)"
                      :title="note.isStarred ? '取消标星' : '添加标星'"
                      class="p-1 text-gray-400 hover:text-amber-500 hover:bg-white rounded transition-colors cursor-pointer"
                    >
                      <Star class="w-3.5 h-3.5" :class="note.isStarred ? 'fill-amber-500 text-amber-500' : ''" />
                    </button>
                    <button
                      @click="emit('toggleFavorite', note.id)"
                      :title="note.isFavorite ? '取消收藏' : '添加收藏'"
                      class="p-1 text-gray-400 hover:text-blue-600 hover:bg-white rounded transition-colors cursor-pointer"
                    >
                      <Box class="w-3.5 h-3.5" :class="note.isFavorite ? 'text-blue-600' : ''" />
                    </button>
                    <button
                      @click="emit('openShareModal', note)"
                      title="分享笔记"
                      class="p-1 text-gray-400 hover:text-indigo-600 hover:bg-white rounded transition-colors cursor-pointer"
                    >
                      <Share2 class="w-3.5 h-3.5" />
                    </button>
                    <button
                      @click="emit('openMoveModal', note)"
                      title="移动至文件夹"
                      class="p-1 text-gray-400 hover:text-blue-600 hover:bg-white rounded transition-colors cursor-pointer"
                    >
                      <FolderInput class="w-3.5 h-3.5" />
                    </button>
                    <button
                      @click="emit('moveToTrash', note.id)"
                      title="移入回收站"
                      class="p-1 text-gray-400 hover:text-red-600 hover:bg-white rounded transition-colors cursor-pointer"
                    >
                      <Trash2 class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              <!-- Content Preview Snippet -->
              <p class="text-xs text-gray-500 line-clamp-2 leading-relaxed font-sans bg-gray-50/70 p-2 rounded-lg border border-gray-100/60">
                {{ cleanTextPreview(note.content, note.format) }}
              </p>

              <!-- Card Bottom Row: Folder Tag, Tags, Word Count -->
              <div class="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-gray-400">
                <div class="flex items-center gap-2 flex-wrap">
                  <!-- Folder Path Tag -->
                  <button
                    @click.stop="emit('selectFolder', note.folderId)"
                    class="inline-flex items-center gap-1 text-gray-500 hover:text-blue-600 bg-gray-100/80 hover:bg-blue-50 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                    title="点击跳转至该文件夹"
                  >
                    <FolderIcon class="w-3 h-3 text-gray-400" />
                    <span>{{ getFolderName(note.folderId) }}</span>
                  </button>

                  <!-- Tags -->
                  <span
                    v-for="tag in note.tags"
                    :key="tag"
                    class="inline-flex items-center gap-0.5 bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded text-[10px]"
                  >
                    <Tag class="w-2.5 h-2.5" />
                    <span>{{ tag }}</span>
                  </span>
                </div>

                <!-- Word Count / Detail Timestamps -->
                <div class="flex items-center gap-2.5 text-[10px]">
                  <span>{{ getNoteWordCount(note.content, note.format) }} 字</span>
                  <span>·</span>
                  <span title="创建时间">建于: {{ note.createdAt.slice(0, 16) }}</span>
                  <span>·</span>
                  <span title="最后修改">改于: {{ note.updatedAt.slice(0, 16) }}</span>
                </div>
              </div>
            </div>

            <!-- Compact Layout Mode -->
            <div
              v-else
              @click="emit('openNote', note)"
              class="bg-white rounded-lg border border-gray-200/80 px-3.5 py-2.5 hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer flex items-center justify-between gap-3"
            >
              <div class="flex items-center gap-2.5 min-w-0 flex-1">
                <FileFormatIcon v-if="note.format === 'markdown'" format="markdown" size="xs" />
                <MindmapIcon v-else size="xs" />

                <span class="font-bold text-xs text-gray-900 group-hover:text-blue-600 truncate">
                  {{ note.title || '无标题文档' }}
                </span>

                <span class="text-[11px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0">
                  <FolderIcon class="w-2.5 h-2.5" />
                  <span>{{ getFolderName(note.folderId) }}</span>
                </span>

                <span v-if="note.tags.length" class="hidden sm:inline-flex text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded">
                  #{{ note.tags[0] }}
                </span>
              </div>

              <div class="flex items-center gap-3 shrink-0 text-xs">
                <span class="text-[11px] text-gray-400 font-mono">
                  {{ timelineMode === 'updated' ? note.updatedAt.slice(11, 16) : note.createdAt.slice(11, 16) }}
                </span>
                <span class="text-[11px] font-medium text-gray-600">
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
