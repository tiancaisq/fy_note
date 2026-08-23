<script setup lang="ts">
import { ref, computed } from 'vue';
import { X, UploadCloud, FileText, Check, AlertCircle } from 'lucide-vue-next';
import { Folder } from '../types';
import { importFromXMind } from '../utils/xmind';
import { compareFolders } from '../utils/folderSort';
import { extractDrawioXml } from '../utils/drawioTemplates';
import DrawioIcon from './icons/DrawioIcon.vue';

const props = defineProps<{
  folders: Folder[];
  activeFolderId: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'importFiles', files: { name: string; content: string; folderId: string; format?: string }[]): void;
}>();

// Hierarchical folders formatted with level indentation
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

const selectedFolderId = ref(props.activeFolderId || props.folders[0]?.id || '');
const isDragging = ref(false);
const fileList = ref<{ name: string; content: string; size: string; format?: string }[]>([]);
const errorMessage = ref<string | null>(null);

function handleFileSelect(e: Event) {
  const target = e.target as HTMLInputElement;
  if (target.files) {
    processFiles(target.files);
  }
}

function handleDrop(e: DragEvent) {
  isDragging.value = false;
  if (e.dataTransfer?.files) {
    processFiles(e.dataTransfer.files);
  }
}

async function processFiles(files: FileList) {
  errorMessage.value = null;
  for (const file of Array.from(files)) {
    const isDrawio = file.name.match(/\.(drawio|xml|drawio\.xml|drawio\.svg|drawio\.png)$/i);
    const isMindmap = file.name.match(/\.(xmind|km)$/i);
    const isMarkdown = file.name.match(/\.(md|txt|markdown)$/i);
    const isJson = file.name.match(/\.json$/i);

    if (!isDrawio && !isMindmap && !isMarkdown && !isJson) {
      errorMessage.value = '请上传 .drawio, .xml, .xmind, .km, .json, .md 或 .txt 格式的文件';
      continue;
    }

    const sizeStr = (file.size / 1024).toFixed(1) + ' KB';

    if (file.name.toLowerCase().endsWith('.xmind')) {
      try {
        const xmindData = await importFromXMind(file);
        fileList.value.push({
          name: file.name,
          content: JSON.stringify(xmindData, null, 2),
          size: sizeStr,
          format: 'mindmap',
        });
      } catch (err: any) {
        errorMessage.value = `解析 XMind 文件失败: ${err.message || '格式不兼容'}`;
      }
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const rawContent = (event.target?.result as string) || '';
        let detectedFormat: 'drawio' | 'mindmap' | 'markdown' = 'markdown';

        if (isDrawio || rawContent.includes('<mxGraphModel') || rawContent.includes('<mxfile') || rawContent.includes('diagrams.net')) {
          detectedFormat = 'drawio';
        } else if (file.name.endsWith('.km') || (file.name.endsWith('.json') && rawContent.includes('"root"'))) {
          detectedFormat = 'mindmap';
        } else {
          detectedFormat = 'markdown';
        }

        const finalContent = detectedFormat === 'drawio' ? extractDrawioXml(rawContent) : rawContent;

        fileList.value.push({
          name: file.name,
          content: finalContent,
          size: sizeStr,
          format: detectedFormat,
        });
      };
      reader.readAsText(file);
    }
  }
}

function removeFile(index: number) {
  fileList.value.splice(index, 1);
}

function submitImport() {
  if (fileList.value.length === 0) return;
  const payload = fileList.value.map((f) => ({
    name: f.name,
    content: f.content,
    folderId: selectedFolderId.value,
    format: f.format,
  }));
  emit('importFiles', payload);
  emit('close');
}
</script>

<template>
  <div
    id="import-modal-overlay"
    class="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
    @click.self="emit('close')"
  >
    <div class="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col">
      <!-- Modal Header -->
      <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 class="text-base font-bold text-gray-900 flex items-center gap-2">
          <UploadCloud class="w-5 h-5 text-blue-600" />
          <span>导入笔记 / 思维导图 / Draw.io 图表</span>
        </h3>
        <button @click="emit('close')" class="text-gray-400 hover:text-gray-600 p-1 rounded-md">
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Modal Body -->
      <div class="p-6 space-y-4">
        <!-- Target Folder Selector -->
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1.5">导入至目标文件夹</label>
          <select
            v-model="selectedFolderId"
            class="w-full h-9 px-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-800 outline-none focus:ring-1.5 focus:ring-blue-500 cursor-pointer"
          >
            <option v-for="f in hierarchicalFolders" :key="f.id" :value="f.id">
              {{ f.prefix }}📁 {{ f.name }}
            </option>
          </select>
        </div>

        <!-- Drag & Drop Area -->
        <div
          @dragover.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @drop.prevent="handleDrop"
          :class="[
            'border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer relative',
            isDragging ? 'border-amber-500 bg-amber-50/40' : 'border-gray-200 hover:border-amber-400 bg-gray-50/50'
          ]"
        >
          <input
            type="file"
            multiple
            accept=".drawio,.xml,.drawio.xml,.drawio.svg,.drawio.png,.xmind,.km,.json,.md,.txt,.markdown"
            @change="handleFileSelect"
            class="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
          <div class="flex flex-col items-center justify-center">
            <UploadCloud class="w-10 h-10 text-amber-500 mb-2" />
            <p class="text-sm font-semibold text-gray-800">拖拽文件到此处，或点击上传</p>
            <p class="text-xs text-gray-400 mt-1">支持 Draw.io (.drawio, .xml)、XMind (.xmind)、脑图 (.km)、Markdown (.md)</p>
          </div>
        </div>

        <div v-if="errorMessage" class="text-xs text-red-500 flex items-center gap-1">
          <AlertCircle class="w-3.5 h-3.5" />
          <span>{{ errorMessage }}</span>
        </div>

        <!-- Selected Files Preview List -->
        <div v-if="fileList.length > 0" class="max-h-40 overflow-y-auto space-y-1.5">
          <div class="text-xs font-medium text-gray-500">待导入文件 ({{ fileList.length }})：</div>
          <div
            v-for="(f, i) in fileList"
            :key="i"
            class="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-xs text-gray-700 border border-gray-100"
          >
            <div class="flex items-center gap-2 truncate">
              <DrawioIcon v-if="f.format === 'drawio'" size="xs" />
              <FileText v-else class="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span class="truncate">{{ f.name }}</span>
              <span class="text-[10px] text-gray-400">({{ f.size }})</span>
              <span v-if="f.format === 'drawio'" class="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">Draw.io 图表</span>
              <span v-else-if="f.format === 'mindmap'" class="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">思维导图</span>
              <span v-else class="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">Markdown</span>
            </div>
            <button @click="removeFile(i)" class="text-gray-400 hover:text-red-500 text-xs px-1 cursor-pointer">×</button>
          </div>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2">
        <button
          @click="emit('close')"
          class="px-4 py-2 text-xs font-medium text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors"
        >
          取消
        </button>
        <button
          @click="submitImport"
          :disabled="fileList.length === 0"
          class="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors cursor-pointer"
        >
          确认导入 ({{ fileList.length }})
        </button>
      </div>
    </div>
  </div>
</template>
