<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import {
  Search,
  User,
  Cloud,
  CloudOff,
  RefreshCw,
  Check,
  AlertCircle,
  Download,
  Upload,
  Folder as FolderIcon,
  Clock,
  Sparkles,
  X,
  Keyboard,
  Server
} from 'lucide-vue-next';
import { SearchResultItem, SyncStatus } from '../types';
import FileFormatIcon from './icons/FileFormatIcon.vue';

const props = defineProps<{
  searchQuery: string;
  notesCount: number;
  searchResults: {
    currentFolderMatches: SearchResultItem[];
    otherMatches: SearchResultItem[];
    totalCount: number;
  };
  activeFolderName?: string;
  syncStatus?: SyncStatus;
  lastSyncedAt?: number | null;
}>();

const emit = defineEmits<{
  (e: 'update:searchQuery', val: string): void;
  (e: 'openImport'): void;
  (e: 'exportAll'): void;
  (e: 'emptyTrash'): void;
  (e: 'selectSearchResult', item: SearchResultItem): void;
  (e: 'openShortcuts'): void;
  (e: 'openCloudSync'): void;
}>();

const isMac = computed(() => {
  return typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
});

const isUserMenuOpen = ref(false);
const isSearchDropdownOpen = ref(false);
const searchContainerRef = ref<HTMLElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);
const userMenuContainerRef = ref<HTMLElement | null>(null);

function handleSearchInput(e: Event) {
  const target = e.target as HTMLInputElement;
  emit('update:searchQuery', target.value);
  isSearchDropdownOpen.value = !!target.value.trim();
}

function handleSearchFocus() {
  if (props.searchQuery.trim()) {
    isSearchDropdownOpen.value = true;
  }
}

function clearSearch() {
  emit('update:searchQuery', '');
  isSearchDropdownOpen.value = false;
  searchInputRef.value?.focus();
}

function selectResult(item: SearchResultItem) {
  emit('selectSearchResult', item);
  isSearchDropdownOpen.value = false;
}

function focusSearch() {
  searchInputRef.value?.focus();
  searchInputRef.value?.select();
}

defineExpose({
  focusSearch,
});

// Click outside detection for search dropdown & user menu
function handleClickOutside(e: MouseEvent) {
  const target = e.target as Node;
  if (searchContainerRef.value && !searchContainerRef.value.contains(target)) {
    isSearchDropdownOpen.value = false;
  }
  if (userMenuContainerRef.value && !userMenuContainerRef.value.contains(target)) {
    isUserMenuOpen.value = false;
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    isSearchDropdownOpen.value = false;
    isUserMenuOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  document.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  document.removeEventListener('keydown', handleKeyDown);
});

// Helper to highlight matching text in title/snippets safely
function highlightMatch(text: string, query: string): string {
  if (!query || !text) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  return text.replace(regex, '<mark class="bg-amber-200 text-amber-900 px-0.5 rounded font-semibold">$1</mark>');
}
</script>

<template>
  <header id="app-header" class="h-14 bg-white border-b border-gray-100 px-4 flex items-center justify-between shrink-0 select-none z-30 relative">
    <!-- Brand Logo and Title -->
    <div id="brand-logo-container" class="flex items-center gap-2.5 w-60 shrink-0">
      <div class="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-sm text-white">
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C11.5 4.5 9 6.5 6.5 7C7 9.5 5 12 2 12C4.5 12.5 6.5 15 7 17.5C9.5 17 12 19 12 22C12.5 19.5 15 17.5 17.5 17C17 14.5 19 12 22 12C19.5 11.5 17.5 9 17 6.5C14.5 7 12 5 12 2Z" />
        </svg>
      </div>
      <h1 class="text-base font-bold text-gray-900 tracking-tight flex items-center gap-1.5">
        枫叶云笔记
        <span class="text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">v3.0</span>
      </h1>
    </div>

    <!-- Center Global Search Bar with Shortcut Badge and Grouped Dropdown Preview -->
    <div id="search-bar-container" ref="searchContainerRef" class="flex-1 max-w-xl mx-4 relative">
      <div class="relative flex items-center">
        <Search class="w-4 h-4 text-gray-400 absolute left-3.5 pointer-events-none" />
        <input
          id="global-search-input"
          ref="searchInputRef"
          type="text"
          :value="searchQuery"
          @input="handleSearchInput"
          @focus="handleSearchFocus"
          placeholder="全局搜索笔记标题、内容或标签..."
          class="w-full h-8.5 pl-9 pr-16 bg-[#f5f6f8] text-sm text-gray-800 placeholder-gray-400 rounded-lg border border-transparent focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all outline-none"
        />

        <!-- Right Shortcut badge or Clear button -->
        <div class="absolute right-2.5 flex items-center gap-1.5">
          <button
            v-if="searchQuery"
            @click="clearSearch"
            id="clear-search-btn"
            class="text-xs text-gray-400 hover:text-gray-600 bg-gray-200 hover:bg-gray-300 rounded-full w-4 h-4 flex items-center justify-center cursor-pointer"
            title="清空搜索"
          >
            <X class="w-3 h-3" />
          </button>
          <kbd
            v-else
            @click="focusSearch"
            class="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-gray-400 bg-white border border-gray-200 rounded shadow-2xs cursor-pointer hover:border-gray-300"
            title="按下 Ctrl/Cmd + F 快速搜索"
          >
            {{ isMac ? '⌘F' : 'Ctrl+F' }}
          </kbd>
        </div>
      </div>

      <!-- Global Search Results Dropdown (Grouped & Prioritized) -->
      <div
        v-if="isSearchDropdownOpen && searchQuery.trim()"
        id="search-dropdown-menu"
        class="absolute left-0 right-0 top-11 bg-white rounded-xl shadow-2xl border border-gray-200 max-h-[70vh] overflow-y-auto z-50 animate-in fade-in duration-100 divide-y divide-gray-100"
      >
        <!-- Search Stats Header -->
        <div class="px-4 py-2 bg-gray-50/80 flex items-center justify-between text-xs text-gray-500">
          <span>共找到 <strong class="text-blue-600 font-semibold">{{ searchResults.totalCount }}</strong> 篇匹配笔记</span>
          <span class="text-[11px] text-gray-400">优先展示当前目录</span>
        </div>

        <!-- Empty Results -->
        <div v-if="searchResults.totalCount === 0" class="py-10 text-center text-gray-400 text-xs">
          <p>未找到包含「{{ searchQuery }}」的相关笔记</p>
          <p class="mt-1 text-[11px] text-gray-400">试试搜索其它关键词或标签</p>
        </div>

        <!-- Group 1: Current Folder Matches (Prioritized) -->
        <div v-if="searchResults.currentFolderMatches.length > 0" class="py-2">
          <div class="px-4 py-1 flex items-center justify-between text-xs font-semibold text-blue-600 bg-blue-50/50">
            <span class="flex items-center gap-1.5">
              <FolderIcon class="w-3.5 h-3.5 text-blue-600" />
              当前文件夹匹配 ({{ activeFolderName || '当前目录' }})
            </span>
            <span class="text-[11px] bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded font-normal">
              {{ searchResults.currentFolderMatches.length }} 篇
            </span>
          </div>

          <div class="divide-y divide-gray-50">
            <div
              v-for="item in searchResults.currentFolderMatches"
              :key="'curr-' + item.note.id"
              @click="selectResult(item)"
              class="px-4 py-2.5 hover:bg-blue-50/40 cursor-pointer transition-colors group"
            >
              <!-- Top Row: Icon, Title & Tags -->
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 truncate">
                  <FileFormatIcon :format="item.note.format || item.note.type" size="xs" />
                  <span
                    class="text-sm font-medium text-gray-800 group-hover:text-blue-600 truncate"
                    v-html="highlightMatch(item.note.title, searchQuery)"
                  ></span>
                </div>
                <div class="flex items-center gap-1 shrink-0 text-xs text-gray-400">
                  <Clock class="w-3 h-3 text-gray-400" />
                  <span>{{ item.note.updatedAt || item.note.createdAt }}</span>
                </div>
              </div>

              <!-- Middle: Content Snippet preview with highlight -->
              <p
                v-if="item.matchedContentSnippet"
                class="text-xs text-gray-500 line-clamp-1 mt-1 pl-7 font-mono"
                v-html="highlightMatch(item.matchedContentSnippet, searchQuery)"
              ></p>

              <!-- Bottom: Full Folder Path badge -->
              <div class="mt-1.5 pl-7 flex items-center gap-1.5 text-[11px] text-gray-400">
                <FolderIcon class="w-3 h-3 text-amber-500" />
                <span class="text-gray-600 font-medium truncate">{{ item.folderPath }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Group 2: Other Folders Matches -->
        <div v-if="searchResults.otherMatches.length > 0" class="py-2">
          <div class="px-4 py-1 flex items-center justify-between text-xs font-semibold text-gray-600 bg-gray-50/70">
            <span class="flex items-center gap-1.5">
              <Sparkles class="w-3.5 h-3.5 text-gray-500" />
              其他文件夹匹配 (知识库全域)
            </span>
            <span class="text-[11px] bg-gray-200 text-gray-600 px-1.5 py-0.2 rounded font-normal">
              {{ searchResults.otherMatches.length }} 篇
            </span>
          </div>

          <div class="divide-y divide-gray-50">
            <div
              v-for="item in searchResults.otherMatches"
              :key="'other-' + item.note.id"
              @click="selectResult(item)"
              class="px-4 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors group"
            >
              <!-- Top Row: Icon, Title & Tags -->
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 truncate">
                  <FileFormatIcon :format="item.note.format || item.note.type" size="xs" />
                  <span
                    class="text-sm font-medium text-gray-800 group-hover:text-blue-600 truncate"
                    v-html="highlightMatch(item.note.title, searchQuery)"
                  ></span>
                </div>
                <div class="flex items-center gap-1 shrink-0 text-xs text-gray-400">
                  <Clock class="w-3 h-3 text-gray-400" />
                  <span>{{ item.note.updatedAt || item.note.createdAt }}</span>
                </div>
              </div>

              <!-- Middle: Content Snippet -->
              <p
                v-if="item.matchedContentSnippet"
                class="text-xs text-gray-500 line-clamp-1 mt-1 pl-7 font-mono"
                v-html="highlightMatch(item.matchedContentSnippet, searchQuery)"
              ></p>

              <!-- Bottom: Full Folder Path badge -->
              <div class="mt-1.5 pl-7 flex items-center gap-1.5 text-[11px] text-gray-400">
                <FolderIcon class="w-3 h-3 text-amber-500" />
                <span class="text-gray-600 font-medium truncate">{{ item.folderPath }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Right Profile, Shortcuts & Quick Actions -->
    <div id="header-right-actions" class="flex items-center gap-2 sm:gap-3 shrink-0 relative">
      <!-- Shortcuts cheat sheet button -->
      <button
        id="btn-shortcuts-guide"
        @click="emit('openShortcuts')"
        class="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-md transition-colors cursor-pointer"
        title="键盘快捷键 (按 ? 查看)"
      >
        <Keyboard class="w-3.5 h-3.5" />
        <span class="hidden md:inline">快捷键</span>
      </button>

      <!-- Dynamic Cloud Sync Status Badge Button -->
      <button
        id="btn-cloud-sync-status"
        @click="emit('openCloudSync')"
        class="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all cursor-pointer select-none group"
        :class="[
          syncStatus === 'synced'
            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-700 hover:bg-emerald-100/80'
            : syncStatus === 'syncing'
            ? 'bg-blue-50/80 border-blue-200 text-blue-700 hover:bg-blue-100/80'
            : syncStatus === 'unsynced'
            ? 'bg-amber-50/80 border-amber-200 text-amber-700 hover:bg-amber-100/80'
            : syncStatus === 'error'
            ? 'bg-rose-50/80 border-rose-200 text-rose-700 hover:bg-rose-100/80'
            : 'bg-slate-100/80 border-slate-200 text-slate-600 hover:bg-slate-200/80 hover:text-slate-800'
        ]"
        :title="
          syncStatus === 'synced'
            ? '云端已同步 (点击打开同步配置与差异面板)'
            : syncStatus === 'syncing'
            ? '正在与云端同步中...'
            : syncStatus === 'unsynced'
            ? '有待同步的内容 (点击立即同步)'
            : syncStatus === 'error'
            ? '同步异常 (点击查看错误并重试)'
            : '未配置云端 (当前为纯本地存储模式，点击配置云端API)'
        "
      >
        <!-- Icons according to sync status -->
        <template v-if="syncStatus === 'synced'">
          <Cloud class="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span class="font-medium">云端已同步</span>
        </template>
        <template v-else-if="syncStatus === 'syncing'">
          <RefreshCw class="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0" />
          <span class="font-medium">正在同步...</span>
        </template>
        <template v-else-if="syncStatus === 'unsynced'">
          <Cloud class="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span class="font-medium">待同步</span>
        </template>
        <template v-else-if="syncStatus === 'error'">
          <AlertCircle class="w-3.5 h-3.5 text-rose-500 shrink-0" />
          <span class="font-medium">同步失败</span>
        </template>
        <template v-else>
          <CloudOff class="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span class="text-slate-600">未同步</span>
        </template>
      </button>

      <!-- User Avatar Profile Dropdown -->
      <div ref="userMenuContainerRef" class="relative">
        <button
          id="user-profile-menu-btn"
          @click="isUserMenuOpen = !isUserMenuOpen"
          class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors border border-slate-200 cursor-pointer"
          title="用户中心"
        >
          <User class="w-4 h-4 text-slate-500" />
        </button>

        <!-- Dropdown Menu -->
        <div
          v-if="isUserMenuOpen"
          id="user-profile-dropdown"
          class="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-50 animate-in fade-in zoom-in-95 duration-100"
          @click.stop
        >
          <div class="px-4 py-2.5 border-b border-gray-100">
            <p class="text-xs text-gray-400">当前存储模式</p>
            <div class="flex items-center gap-1.5 mt-0.5">
              <span class="text-sm font-semibold text-gray-800">
                {{ syncStatus === 'synced' ? '云端已连接' : syncStatus === 'unconfigured' ? '本地存储模式' : '云端同步中' }}
              </span>
              <span
                class="text-[10px] px-1.5 py-0.2 rounded-full font-medium"
                :class="syncStatus === 'synced' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'"
              >
                {{ syncStatus === 'synced' ? 'Online' : 'Local' }}
              </span>
            </div>
            <div class="mt-2 flex items-center justify-between text-xs text-gray-500">
              <span>本地笔记</span>
              <span class="font-medium text-blue-600">{{ notesCount }} 篇</span>
            </div>
          </div>

          <div class="py-1 text-sm text-gray-700">
            <button
              @click="emit('openCloudSync'); isUserMenuOpen = false;"
              class="w-full px-4 py-2 text-left hover:bg-blue-50 text-blue-600 flex items-center justify-between cursor-pointer font-medium"
            >
              <div class="flex items-center gap-2.5">
                <Server class="w-4 h-4 text-blue-500" />
                <span>云端同步设置</span>
              </div>
              <span class="text-xs text-blue-500">配置</span>
            </button>
            <button
              @click="emit('openShortcuts'); isUserMenuOpen = false;"
              class="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center justify-between cursor-pointer"
            >
              <div class="flex items-center gap-2.5">
                <Keyboard class="w-4 h-4 text-gray-400" />
                <span>键盘快捷键</span>
              </div>
              <kbd class="text-[10px] font-mono text-gray-400">{{ isMac ? '⌘/' : 'Ctrl+/' }}</kbd>
            </button>
            <button
              @click="emit('openImport'); isUserMenuOpen = false;"
              id="user-menu-import-btn"
              class="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center justify-between cursor-pointer"
            >
              <div class="flex items-center gap-2.5">
                <Upload class="w-4 h-4 text-gray-400" />
                <span>导入 Markdown 文件</span>
              </div>
              <kbd class="text-[10px] font-mono text-gray-400">{{ isMac ? '⌘⇧I' : 'Ctrl+⇧+I' }}</kbd>
            </button>
            <button
              @click="emit('exportAll'); isUserMenuOpen = false;"
              id="user-menu-export-btn"
              class="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center justify-between cursor-pointer"
            >
              <div class="flex items-center gap-2.5">
                <Download class="w-4 h-4 text-gray-400" />
                <span>导出全量笔记备份</span>
              </div>
              <kbd class="text-[10px] font-mono text-gray-400">{{ isMac ? '⌘⇧E' : 'Ctrl+⇧+E' }}</kbd>
            </button>
          </div>

          <div class="border-t border-gray-100 pt-1 text-xs text-gray-400 px-4 py-1.5 flex items-center justify-between">
            <span>枫叶云笔记 Web</span>
            <span class="flex items-center gap-1 text-emerald-600"><Check class="w-3 h-3" /> 服务正常</span>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>
