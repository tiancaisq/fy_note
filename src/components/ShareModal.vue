<script setup lang="ts">
import { ref } from 'vue';
import { X, Share2, Copy, Check, QrCode, Globe, ShieldCheck } from 'lucide-vue-next';
import { Note } from '../types';

const props = defineProps<{
  note: Note;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const isCopied = ref(false);
const shareExpiry = ref('never');
const sharePermission = ref('readonly');
const showQr = ref(false);

const shareLink = ref(props.note.shareUrl || `https://maple-note.cloud/s/${Math.random().toString(36).substring(2, 10)}`);

function copyLink() {
  navigator.clipboard.writeText(shareLink.value);
  isCopied.value = true;
  setTimeout(() => {
    isCopied.value = false;
  }, 2000);
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
    id="share-modal-overlay"
    class="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
    @mousedown="handleBackdropMouseDown"
    @click="handleBackdropClick"
  >
    <div class="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 class="text-base font-bold text-gray-900 flex items-center gap-2">
          <Share2 class="w-5 h-5 text-blue-600" />
          <span>分享笔记</span>
        </h3>
        <button @click="emit('close')" class="text-gray-400 hover:text-gray-600 p-1 rounded-md">
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Body -->
      <div class="p-6 space-y-4">
        <div>
          <p class="text-xs text-gray-400">正在分享</p>
          <p class="text-sm font-semibold text-gray-800 truncate mt-0.5">{{ note.title }}</p>
        </div>

        <!-- Share Link Box -->
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1.5">公开分享链接</label>
          <div class="flex items-center gap-2 bg-gray-50 border border-gray-200 p-1.5 rounded-lg">
            <Globe class="w-4 h-4 text-gray-400 ml-1.5 shrink-0" />
            <input
              type="text"
              readonly
              :value="shareLink"
              class="w-full bg-transparent text-xs text-gray-700 outline-none select-all truncate"
            />
            <button
              @click="copyLink"
              class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-medium flex items-center gap-1 shrink-0 transition-colors shadow-xs"
            >
              <Check v-if="isCopied" class="w-3.5 h-3.5" />
              <Copy v-else class="w-3.5 h-3.5" />
              <span>{{ isCopied ? '已复制' : '复制链接' }}</span>
            </button>
          </div>
        </div>

        <!-- Settings: Expiration & Permissions -->
        <div class="grid grid-cols-2 gap-3 pt-1">
          <div>
            <label class="block text-xs text-gray-500 mb-1">有效期设置</label>
            <select
              v-model="shareExpiry"
              class="w-full h-8 px-2.5 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-700 outline-none"
            >
              <option value="never">永久有效</option>
              <option value="7days">7 天后失效</option>
              <option value="1day">24 小时后失效</option>
            </select>
          </div>

          <div>
            <label class="block text-xs text-gray-500 mb-1">访问权限</label>
            <select
              v-model="sharePermission"
              class="w-full h-8 px-2.5 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-700 outline-none"
            >
              <option value="readonly">仅查看 (推荐)</option>
              <option value="comment">允许评论互动</option>
            </select>
          </div>
        </div>

        <!-- QR Code Toggle -->
        <div class="pt-2 border-t border-gray-100 flex flex-col items-center">
          <button
            @click="showQr = !showQr"
            class="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium"
          >
            <QrCode class="w-3.5 h-3.5" />
            <span>{{ showQr ? '收起二维码' : '查看分享二维码' }}</span>
          </button>

          <div v-if="showQr" class="mt-3 p-4 bg-gray-50 border border-gray-200 rounded-xl flex flex-col items-center">
            <!-- Simulated QR Code -->
            <div class="w-32 h-32 bg-white p-2 border border-gray-200 rounded-lg flex items-center justify-center">
              <svg viewBox="0 0 100 100" class="w-full h-full text-gray-800 fill-current">
                <path d="M0,0 h30 v30 h-30 z M10,10 h10 v10 h-10 z" />
                <path d="M70,0 h30 v30 h-30 z M80,10 h10 v10 h-10 z" />
                <path d="M0,70 h30 v30 h-30 z M10,80 h10 v10 h-10 z" />
                <path d="M40,10 h20 v10 h-20 z M40,30 h10 v10 h-10 z M60,30 h10 v10 h-10 z" />
                <path d="M40,50 h10 v20 h-10 z M60,50 h20 v10 h-20 z M80,70 h20 v20 h-20 z M50,80 h20 v10 h-20 z" />
              </svg>
            </div>
            <span class="text-[11px] text-gray-400 mt-2">手机扫码即可快速查看</span>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
        <span class="flex items-center gap-1 text-emerald-600">
          <ShieldCheck class="w-3.5 h-3.5" /> 加密云端分享
        </span>
        <button
          @click="emit('close')"
          class="px-4 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors"
        >
          完成
        </button>
      </div>
    </div>
  </div>
</template>
