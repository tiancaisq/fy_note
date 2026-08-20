<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import {
  Cloud,
  CloudCheck,
  CloudOff,
  RefreshCw,
  Server,
  Key,
  User,
  Database,
  HardDrive,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  ArrowDownLeft,
  Layers,
  FileText,
  Folder as FolderIcon,
  Zap,
  Info,
  X,
  Eye,
  EyeOff,
  Link,
  ShieldCheck
} from 'lucide-vue-next';
import { CloudConfig, SyncDiffResult, SyncStatus, Note, Folder } from '../types';
import { testCloudApi } from '../utils/cloudApi';

const props = defineProps<{
  isOpen: boolean;
  cloudConfig: CloudConfig;
  syncStatus: SyncStatus;
  syncDiff: SyncDiffResult | null;
  isSyncing: boolean;
  notesCount: number;
  foldersCount: number;
  storageInfo?: {
    usage: number;
    quota: number;
    usageFormatted: string;
    quotaFormatted: string;
    percent: number;
  };
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'saveConfig', config: Partial<CloudConfig>): void;
  (e: 'clearConfig'): void;
  (e: 'checkDiff', config: CloudConfig): void;
  (e: 'performSync', mode: 'merge' | 'push_all' | 'pull_all', config?: CloudConfig): void;
}>();

// Form state
const apiUrl = ref('');
const apiToken = ref('');
const userId = ref('');
const autoSync = ref(true);
const showToken = ref(false);

// Test state
const isTesting = ref(false);
const testResult = ref<{ success: boolean; message: string; serverTime?: string } | null>(null);

// Diff check state
const isCheckingDiff = ref(false);
const activeTab = ref<'sync' | 'config' | 'api-doc'>('sync');

// Syncing operation state
const isPerformingSync = ref(false);

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      apiUrl.value = props.cloudConfig.apiUrl || '';
      apiToken.value = props.cloudConfig.apiToken || '';
      userId.value = props.cloudConfig.userId || '';
      autoSync.value = props.cloudConfig.autoSync ?? true;
      testResult.value = null;

      if (props.cloudConfig.apiUrl && props.cloudConfig.enabled) {
        handleCheckDiff();
      }
    }
  },
  { immediate: true }
);

function getFormConfig(): CloudConfig {
  return {
    enabled: !!apiUrl.value.trim(),
    apiUrl: apiUrl.value.trim(),
    apiToken: apiToken.value.trim(),
    userId: userId.value.trim(),
    autoSync: autoSync.value,
    lastSyncedAt: props.cloudConfig.lastSyncedAt || null,
  };
}

async function handleTestConnection() {
  const formCfg = getFormConfig();
  if (!formCfg.apiUrl.trim()) {
    testResult.value = { success: false, message: '请先输入云端 API 地址' };
    return;
  }

  isTesting.value = true;
  testResult.value = null;

  try {
    const res = await testCloudApi(formCfg);
    if (res && res.success) {
      testResult.value = {
        success: true,
        message: res.message || '连接成功！服务端响应正常',
      };
      // Auto save and activate config when connection succeeds
      emit('saveConfig', formCfg);
      // Automatically refresh diff
      handleCheckDiff();
    } else {
      testResult.value = {
        success: false,
        message: res?.message || '连接失败，请检查网络地址与凭据',
      };
    }
  } catch (err: any) {
    testResult.value = {
      success: false,
      message: err.message || '网络连接超时或跨域被拦截',
    };
  } finally {
    isTesting.value = false;
  }
}

async function handleCheckDiff() {
  const formCfg = getFormConfig();
  if (!formCfg.apiUrl.trim()) return;
  isCheckingDiff.value = true;
  try {
    emit('checkDiff', formCfg);
  } catch (e) {
    console.error(e);
  } finally {
    setTimeout(() => {
      isCheckingDiff.value = false;
    }, 400);
  }
}

async function handleSync(mode: 'merge' | 'push_all' | 'pull_all' = 'merge') {
  isPerformingSync.value = true;
  try {
    emit('performSync', mode, getFormConfig());
  } catch (e) {
    console.error(e);
  } finally {
    setTimeout(() => {
      isPerformingSync.value = false;
    }, 600);
  }
}

function handleSaveOnly() {
  emit('saveConfig', getFormConfig());
  emit('close');
}

function handleDisconnect() {
  if (confirm('确定要断开云端连接吗？断开后将仅在本地浏览器存储笔记，不会自动上传。')) {
    emit('clearConfig');
    emit('close');
  }
}

function formatSyncTime(timestamp?: number | null) {
  if (!timestamp) return '尚未同步过';
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150"
    @click.self="emit('close')"
  >
    <div
      id="cloud-sync-modal"
      class="bg-white rounded-xl shadow-2xl border border-slate-200/80 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-800"
    >
      <!-- Modal Header -->
      <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
        <div class="flex items-center gap-2.5">
          <div
            class="w-9 h-9 rounded-lg flex items-center justify-center"
            :class="[
              syncStatus === 'synced'
                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                : syncStatus === 'syncing'
                ? 'bg-blue-50 text-blue-600 border border-blue-200 animate-pulse'
                : syncStatus === 'error'
                ? 'bg-rose-50 text-rose-600 border border-rose-200'
                : 'bg-slate-100 text-slate-600 border border-slate-200'
            ]"
          >
            <Cloud class="w-5 h-5" />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-base font-semibold text-slate-900">云端同步服务配置</h2>
              <span
                class="text-xs px-2 py-0.5 rounded-full font-medium"
                :class="[
                  syncStatus === 'synced'
                    ? 'bg-emerald-100/70 text-emerald-700'
                    : syncStatus === 'syncing'
                    ? 'bg-blue-100/70 text-blue-700'
                    : syncStatus === 'unsynced'
                    ? 'bg-amber-100/70 text-amber-700'
                    : syncStatus === 'error'
                    ? 'bg-rose-100/70 text-rose-700'
                    : 'bg-slate-100 text-slate-600'
                ]"
              >
                {{
                  syncStatus === 'synced'
                    ? '云端已同步'
                    : syncStatus === 'syncing'
                    ? '正在同步...'
                    : syncStatus === 'unsynced'
                    ? '待同步'
                    : syncStatus === 'error'
                    ? '同步异常'
                    : '未配置 (纯本地模式)'
                }}
              </span>
            </div>
            <p class="text-xs text-slate-500 mt-0.5">
              配置个人云端服务器 API，实现多设备实时双向同步与数据云端备份
            </p>
          </div>
        </div>

        <button
          @click="emit('close')"
          class="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Navigation Tabs -->
      <div class="flex border-b border-slate-100 px-6 bg-white gap-6 text-sm">
        <button
          @click="activeTab = 'sync'"
          class="py-3 border-b-2 font-medium cursor-pointer transition-colors flex items-center gap-1.5"
          :class="activeTab === 'sync' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'"
        >
          <RefreshCw class="w-4 h-4" />
          <span>同步面板与差异检测</span>
        </button>
        <button
          @click="activeTab = 'config'"
          class="py-3 border-b-2 font-medium cursor-pointer transition-colors flex items-center gap-1.5"
          :class="activeTab === 'config' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'"
        >
          <Server class="w-4 h-4" />
          <span>服务器接口设置</span>
        </button>
        <button
          @click="activeTab = 'api-doc'"
          class="py-3 border-b-2 font-medium cursor-pointer transition-colors flex items-center gap-1.5"
          :class="activeTab === 'api-doc' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'"
        >
          <Info class="w-4 h-4" />
          <span>服务端部署指引</span>
        </button>
      </div>

      <!-- Modal Body -->
      <div class="p-6 overflow-y-auto space-y-5 flex-1 text-sm">
        <!-- TAB 1: SYNC DASHBOARD & DIFF DETECTION -->
        <div v-if="activeTab === 'sync'" class="space-y-4">
          <!-- Unconfigured State Notice -->
          <div
            v-if="!cloudConfig.apiUrl || !cloudConfig.enabled"
            class="space-y-3"
          >
            <div class="p-4 bg-amber-50/80 border border-amber-200/80 rounded-xl flex items-start gap-3">
              <AlertCircle class="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div class="space-y-1">
                <h4 class="text-sm font-semibold text-amber-900">当前处于本地存储模式 (IndexedDB)</h4>
                <p class="text-xs text-amber-700 leading-relaxed">
                  尚未连接云端 API 服务，所有笔记、导图及文件夹均安全保存在浏览器高性能 <strong>IndexedDB</strong> 数据库中，突破了 5MB 的容量限制。若需跨设备多端同步，请前往「服务器接口设置」配置云端 API。
                </p>
                <button
                  @click="activeTab = 'config'"
                  class="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700 underline flex items-center gap-1 cursor-pointer"
                >
                  立即配置云端 API <ArrowUpRight class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <!-- IndexedDB Local Storage Stats -->
            <div class="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2.5">
              <div class="flex items-center justify-between text-xs">
                <div class="flex items-center gap-2 text-slate-700 font-semibold">
                  <Database class="w-4 h-4 text-emerald-600" />
                  <span>本地 IndexedDB 存储引擎</span>
                  <span class="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-medium">大容量支持</span>
                </div>
                <span class="text-slate-500 font-mono text-[11px]">
                  {{ storageInfo?.usageFormatted || '0 B' }} / {{ storageInfo?.quotaFormatted || '可用空间充足' }}
                </span>
              </div>

              <!-- Storage Progress Bar -->
              <div class="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                <div
                  class="bg-emerald-500 h-full transition-all duration-300 rounded-full"
                  :style="{ width: `${Math.max(1, Math.min(100, storageInfo?.percent || 1))}%` }"
                ></div>
              </div>

              <div class="flex items-center justify-between text-[11px] text-slate-500">
                <span>本地数据量: {{ notesCount }} 篇笔记, {{ foldersCount }} 个文件夹</span>
                <span>占用配额: {{ storageInfo?.percent ? storageInfo.percent + '%' : '< 1%' }}</span>
              </div>
            </div>
          </div>

          <!-- Connected Status Overview -->
          <div v-else class="space-y-4">
            <!-- Sync Info Bar -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div class="p-3.5 bg-slate-50 border border-slate-100 rounded-xl">
                <div class="text-xs text-slate-400 font-medium">当前本地数据</div>
                <div class="text-base font-semibold text-slate-800 mt-1 flex items-baseline gap-2">
                  <span>{{ notesCount }} 篇笔记</span>
                  <span class="text-xs text-slate-500 font-normal">{{ foldersCount }} 个文件夹</span>
                </div>
              </div>

              <div class="p-3.5 bg-slate-50 border border-slate-100 rounded-xl">
                <div class="text-xs text-slate-400 font-medium">上次同步时间</div>
                <div class="text-xs font-medium text-slate-700 mt-2 truncate" :title="formatSyncTime(cloudConfig.lastSyncedAt)">
                  {{ formatSyncTime(cloudConfig.lastSyncedAt) }}
                </div>
              </div>

              <div class="p-3.5 bg-slate-50 border border-slate-100 rounded-xl flex flex-col justify-between">
                <div class="text-xs text-slate-400 font-medium">自动同步状态</div>
                <div class="flex items-center justify-between mt-1">
                  <span class="text-xs font-medium" :class="cloudConfig.autoSync ? 'text-emerald-600' : 'text-slate-500'">
                    {{ cloudConfig.autoSync ? '修改实时同步' : '手动同步模式' }}
                  </span>
                  <button
                    @click="handleCheckDiff"
                    :disabled="isCheckingDiff"
                    class="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw class="w-3 h-3" :class="{ 'animate-spin': isCheckingDiff }" />
                    <span>检测差异</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Diff Detection Results Card -->
            <div class="p-4 bg-white border border-slate-200 rounded-xl space-y-3 shadow-2xs">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Zap class="w-4 h-4 text-blue-600" />
                  <h3 class="text-sm font-semibold text-slate-900">云端与本地差异检测</h3>
                </div>
                <button
                  @click="handleCheckDiff"
                  :disabled="isCheckingDiff"
                  class="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isCheckingDiff }" />
                  <span>{{ isCheckingDiff ? '正在检测...' : '重新检测' }}</span>
                </button>
              </div>

              <!-- Diff counts -->
              <div v-if="syncDiff" class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                <div class="p-2.5 bg-blue-50/60 border border-blue-100 rounded-lg text-center">
                  <div class="text-lg font-bold text-blue-600">{{ syncDiff.localOnlyNotes + syncDiff.localOnlyFolders }}</div>
                  <div class="text-[11px] text-blue-700">本地待上传新增项</div>
                </div>
                <div class="p-2.5 bg-amber-50/60 border border-amber-100 rounded-lg text-center">
                  <div class="text-lg font-bold text-amber-600">{{ syncDiff.localUpdatedNotes }}</div>
                  <div class="text-[11px] text-amber-700">本地待更新笔记</div>
                </div>
                <div class="p-2.5 bg-emerald-50/60 border border-emerald-100 rounded-lg text-center">
                  <div class="text-lg font-bold text-emerald-600">{{ syncDiff.cloudOnlyNotes + syncDiff.cloudOnlyFolders }}</div>
                  <div class="text-[11px] text-emerald-700">云端待拉取新增项</div>
                </div>
                <div class="p-2.5 bg-purple-50/60 border border-purple-100 rounded-lg text-center">
                  <div class="text-lg font-bold text-purple-600">{{ syncDiff.cloudUpdatedNotes }}</div>
                  <div class="text-[11px] text-purple-700">云端最新修改项</div>
                </div>
              </div>

              <div v-else class="py-6 text-center text-xs text-slate-400 space-y-2">
                <RefreshCw class="w-6 h-6 text-slate-300 mx-auto animate-spin" v-if="isCheckingDiff" />
                <p v-if="isCheckingDiff">正在比对本地与云端数据时间戳与内容...</p>
                <p v-else>点击右上角「重新检测」可扫描两端变动项</p>
              </div>
            </div>

            <!-- Action Buttons for Sync -->
            <div class="space-y-2 pt-1">
              <div class="text-xs font-semibold text-slate-500">同步操作方式：</div>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  @click="handleSync('merge')"
                  :disabled="isPerformingSync || isSyncing"
                  class="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-left shadow-xs transition-all cursor-pointer flex flex-col justify-between group disabled:opacity-50"
                >
                  <div class="flex items-center justify-between">
                    <span class="font-medium text-xs flex items-center gap-1.5">
                      <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isPerformingSync }" />
                      智能双向合并
                    </span>
                    <span class="text-[10px] bg-blue-500 px-1.5 py-0.2 rounded text-white">推荐</span>
                  </div>
                  <p class="text-[11px] text-blue-100 mt-2 leading-tight">
                    智能比对两端更新时间戳，上传本地修改并下载云端更新
                  </p>
                </button>

                <button
                  @click="handleSync('push_all')"
                  :disabled="isPerformingSync || isSyncing"
                  class="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 rounded-xl text-left transition-all cursor-pointer flex flex-col justify-between disabled:opacity-50"
                >
                  <div class="font-medium text-xs flex items-center gap-1.5 text-slate-700">
                    <ArrowUpRight class="w-3.5 h-3.5 text-blue-600" />
                    完全上传至云端
                  </div>
                  <p class="text-[11px] text-slate-500 mt-2 leading-tight">
                    以当前本地数据为准，强制覆盖上传至云端服务器
                  </p>
                </button>

                <button
                  @click="handleSync('pull_all')"
                  :disabled="isPerformingSync || isSyncing"
                  class="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 rounded-xl text-left transition-all cursor-pointer flex flex-col justify-between disabled:opacity-50"
                >
                  <div class="font-medium text-xs flex items-center gap-1.5 text-slate-700">
                    <ArrowDownLeft class="w-3.5 h-3.5 text-emerald-600" />
                    从云端拉取覆盖
                  </div>
                  <p class="text-[11px] text-slate-500 mt-2 leading-tight">
                    从云端下载全部笔记，覆盖当前浏览器本地数据
                  </p>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB 2: SERVER API CONFIGURATION -->
        <div v-if="activeTab === 'config'" class="space-y-4">
          <!-- API URL Input -->
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <Server class="w-3.5 h-3.5 text-blue-600" />
              服务端 API 地址 (Base URL) <span class="text-red-500">*</span>
            </label>
            <div class="relative">
              <input
                v-model="apiUrl"
                type="text"
                placeholder="例如: https://notes.yourdomain.com/api 或 http://localhost:8000/api"
                class="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white font-mono transition-colors"
              />
            </div>
            <p class="text-[11px] text-slate-400">
              支持任何支持 JSON REST API 协议的服务端（如附带的 PHP 示例服务端）
            </p>
          </div>

          <!-- API Token Input -->
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <Key class="w-3.5 h-3.5 text-amber-500" />
              API 访问密钥 (Token / Secret Key)
            </label>
            <div class="relative flex items-center">
              <input
                v-model="apiToken"
                :type="showToken ? 'text' : 'password'"
                placeholder="若服务端开启认证，在此填入 API Token"
                class="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white font-mono transition-colors pr-10"
              />
              <button
                type="button"
                @click="showToken = !showToken"
                class="absolute right-3 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
              >
                <EyeOff v-if="showToken" class="w-4 h-4" />
                <Eye v-else class="w-4 h-4" />
              </button>
            </div>
            <p class="text-[11px] text-slate-400">
              将在请求头中附带 <code>Authorization: Bearer &lt;Token&gt;</code>
            </p>
          </div>

          <!-- User ID Identifier -->
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <User class="w-3.5 h-3.5 text-slate-500" />
              用户账号标识 (User ID / 租户标识)
            </label>
            <input
              v-model="userId"
              type="text"
              placeholder="默认: default_user (多用户隔离时使用)"
              class="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white font-mono transition-colors"
            />
          </div>

          <!-- Auto Sync Toggle Switch -->
          <div class="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <div class="space-y-0.5">
              <div class="text-xs font-semibold text-slate-800">编辑时自动同步</div>
              <div class="text-[11px] text-slate-500">
                开启后，每当新建、编辑或移动笔记，系统将在后台自动静默同步至云端
              </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" v-model="autoSync" class="sr-only peer" />
              <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <!-- Test Connection Button & Result -->
          <div class="space-y-2 pt-1">
            <div class="flex items-center gap-2">
              <button
                @click="handleTestConnection"
                :disabled="isTesting || !apiUrl.trim()"
                class="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isTesting }" />
                <span>{{ isTesting ? '正在测试连接...' : '测试连接并保存' }}</span>
              </button>

              <button
                v-if="cloudConfig.enabled"
                @click="handleDisconnect"
                class="px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-medium transition-colors cursor-pointer"
              >
                断开云端 (纯本地模式)
              </button>
            </div>

            <!-- Test Result Banner -->
            <div
              v-if="testResult"
              class="p-3 rounded-lg border text-xs flex items-start gap-2 animate-in fade-in duration-100"
              :class="testResult.success ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'"
            >
              <CheckCircle2 v-if="testResult.success" class="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <AlertCircle v-else class="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <div class="font-semibold">{{ testResult.success ? '连接成功' : '连接失败' }}</div>
                <div class="mt-0.5 leading-relaxed">{{ testResult.message }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB 3: SERVER DEPLOYMENT GUIDE -->
        <div v-if="activeTab === 'api-doc'" class="space-y-3 text-xs leading-relaxed text-slate-600">
          <div class="p-3.5 bg-blue-50/70 border border-blue-100 rounded-xl space-y-1.5">
            <h4 class="font-semibold text-blue-900 text-sm flex items-center gap-1.5">
              <ShieldCheck class="w-4 h-4 text-blue-600" />
              私有化云端服务支持
            </h4>
            <p class="text-blue-800">
              本项目已在 <code>/docs</code> 目录下为您生成了完整的服务端接口规范文档、MySQL 数据库初始化脚本以及开箱即用的 PHP 示例服务端代码！
            </p>
          </div>

          <div class="space-y-2 border border-slate-200 rounded-xl p-4 bg-slate-50/50">
            <div class="font-semibold text-slate-800 text-xs">🚀 极速部署 PHP 服务端（3 步即可运行）：</div>
            <ol class="list-decimal list-inside space-y-1 text-slate-600">
              <li>导入 <code>docs/init.sql</code> 到您的 MySQL 数据库；</li>
              <li>在 <code>docs/server-sample-php/config.php</code> 中配置数据库账号密码；</li>
              <li>使用 PHP 内置服务器启动：<code>php -S 0.0.0.0:8000 -t docs/server-sample-php/</code>；</li>
              <li>在上方输入 <code>http://localhost:8000/api</code> 即可连接！</li>
            </ol>
          </div>

          <div class="space-y-1.5">
            <div class="font-semibold text-slate-800">📖 相关文档列表：</div>
            <ul class="space-y-1 text-blue-600 font-mono text-[11px]">
              <li>• docs/API_SPECIFICATION.md （云端 API 接口协议文档）</li>
              <li>• docs/DATABASE_SCHEMA.md （服务端数据表结构设计文档）</li>
              <li>• docs/init.sql （MySQL 数据库建表与初始数据脚本）</li>
              <li>• docs/server-sample-php/api.php （PHP 服务端完整源码）</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="px-6 py-3.5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between">
        <div class="text-xs text-slate-400">
          {{ cloudConfig.enabled ? `已连接到: ${cloudConfig.apiUrl}` : '未连接云端，使用浏览器本地存储' }}
        </div>
        <div class="flex items-center gap-2">
          <button
            @click="emit('close')"
            class="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200/70 rounded-lg transition-colors cursor-pointer"
          >
            关闭
          </button>
          <button
            v-if="activeTab === 'config'"
            @click="handleSaveOnly"
            class="px-4 py-2 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-xs cursor-pointer"
          >
            保存并应用
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
