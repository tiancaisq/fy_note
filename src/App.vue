<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useNotes } from './composables/useNotes';
import Header from './components/Header.vue';
import Sidebar from './components/Sidebar.vue';
import NoteList from './components/NoteList.vue';
import NoteEditor from './components/NoteEditor.vue';
import MindMapEditor from './components/MindMapEditor.vue';
import DrawioEditor from './components/DrawioEditor.vue';
import ImportModal from './components/ImportModal.vue';
import ShareModal from './components/ShareModal.vue';
import MoveModal from './components/MoveModal.vue';
import NewFolderModal from './components/NewFolderModal.vue';
import RenameNoteModal from './components/RenameNoteModal.vue';
import ShortcutsModal from './components/ShortcutsModal.vue';
import CloudSyncModal from './components/CloudSyncModal.vue';
import ConfirmModal from './components/ConfirmModal.vue';
import TimelineView from './components/TimelineView.vue';
import { Folder, Note } from './types';

const {
  folders,
  notes,
  currentView,
  activeFolderId,
  activeFolder,
  activeNoteId,
  activeNote,
  searchQuery,
  isEditorOpen,
  editorMode,
  sortField,
  sortOrder,
  filterOptions,
  displayedNotes,
  breadcrumbItems,
  globalSearchResults,
  isImportModalOpen,
  isNewFolderModalOpen,
  targetParentFolderForNew,
  isShareModalOpen,
  sharingNote,
  isMoveModalOpen,
  noteToMove,
  notesToMove,
  isRenameNoteModalOpen,
  noteToRename,
  toastMessage,
  // Cloud Sync State & Operations
  cloudConfig,
  isCloudSyncModalOpen,
  syncStatus,
  syncDiff,
  isSyncing,
  storageInfo,
  openCloudSyncModal,
  testCloudConnection,
  checkCloudDiff,
  performCloudSync,
  saveCloudConfig,
  clearCloudConfig,
  // helpers & counts
  frequentFolders,
  isFolderFrequent,
  toggleFrequentFolder,
  addFrequentFolder,
  removeFrequentFolder,
  reorderFrequentFolders,
  getFolderFullPath,
  getFolderAncestors,
  getSubFolders,
  getAllDescendantFolderIds,
  getFolderNoteCount,
  getDirectFolderNoteCount,
  sharedNotesCount,
  starredNotesCount,
  favoriteNotesCount,
  deletedNotesCount,
  // methods
  showToast,
  selectFolder,
  selectView,
  handleBreadcrumbClick,
  createNewNote,
  createNewMindMap,
  createNewDrawioDiagram,
  openNoteEditor,
  openNoteInNewTab,
  closeEditor,
  updateNote,
  toggleStar,
  toggleFavorite,
  moveToTrash,
  restoreFromTrash,
  permanentlyDeleteNote,
  emptyTrash,
  createFolder,
  deleteFolder,
  renameFolder,
  moveFolder,
  toggleFolderCollapse,
  openShareModal,
  openMoveModal,
  openBatchMoveModal,
  moveNoteToFolder,
  batchMoveNotesToFolder,
  batchToggleStar,
  batchToggleFavorite,
  batchMoveToTrash,
  batchRestoreFromTrash,
  batchPermanentlyDelete,
  batchExportNotes,
  duplicateNote,
  exportNoteAsMarkdown,
  importMarkdownFile,
  importMindMapFile,
  importDrawioFile,
  navigateToNoteFromSearch,
} = useNotes();

// Confirmation Modal State for Secondary Confirmations
interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  subMessage?: string;
  confirmText?: string;
  cancelText?: string;
  dangerLevel?: 'danger' | 'warning' | 'info';
  itemType?: 'note' | 'folder' | 'trash';
  itemName?: string;
  itemFormat?: 'markdown' | 'mindmap' | string;
  noteCount?: number;
  subFolderCount?: number;
  onConfirm: () => void;
}

const confirmDialog = ref<ConfirmDialogState>({
  isOpen: false,
  title: '',
  message: '',
  onConfirm: () => {},
});

function handlePromptMoveToTrash(noteId: string) {
  const note = notes.value.find((n) => n.id === noteId);
  if (!note) return;
  confirmDialog.value = {
    isOpen: true,
    title: '移入回收站',
    message: `确定要将笔记《${note.title || '无标题笔记'}》移入回收站吗？`,
    subMessage: '移入回收站后，文件将不再出现在当前列表中，但您可以随时在“我的回收站”中查看或还原。',
    confirmText: '移入回收站',
    cancelText: '取消',
    dangerLevel: 'warning',
    itemType: 'note',
    itemName: note.title || '无标题笔记',
    itemFormat: note.format || note.type || 'markdown',
    onConfirm: () => {
      moveToTrash(noteId);
      confirmDialog.value.isOpen = false;
    },
  };
}

function handlePromptPermanentlyDelete(noteId: string) {
  const note = notes.value.find((n) => n.id === noteId);
  if (!note) return;
  confirmDialog.value = {
    isOpen: true,
    title: '彻底删除笔记',
    message: `确定要彻底删除笔记《${note.title || '无标题笔记'}》吗？`,
    subMessage: '⚠️ 此操作不可撤销，该笔记及其所有内容将被永久清除且无法找回。',
    confirmText: '彻底删除',
    cancelText: '取消',
    dangerLevel: 'danger',
    itemType: 'note',
    itemName: note.title || '无标题笔记',
    itemFormat: note.format || note.type || 'markdown',
    onConfirm: () => {
      permanentlyDeleteNote(noteId);
      confirmDialog.value.isOpen = false;
    },
  };
}

function handlePromptBatchMoveToTrash(noteIds: string[]) {
  if (!noteIds.length) return;
  confirmDialog.value = {
    isOpen: true,
    title: '批量移入回收站',
    message: `确定要将选中的 ${noteIds.length} 篇笔记移入回收站吗？`,
    subMessage: '移入回收站后，文件将不再出现在当前列表中，但您可以随时在“我的回收站”中查看或还原。',
    confirmText: '移入回收站',
    cancelText: '取消',
    dangerLevel: 'warning',
    itemType: 'note',
    noteCount: noteIds.length,
    onConfirm: () => {
      batchMoveToTrash(noteIds);
      confirmDialog.value.isOpen = false;
    },
  };
}

function handlePromptBatchPermanentlyDelete(noteIds: string[]) {
  if (!noteIds.length) return;
  confirmDialog.value = {
    isOpen: true,
    title: '批量彻底删除',
    message: `确定要彻底删除选中的 ${noteIds.length} 篇笔记吗？`,
    subMessage: '⚠️ 此操作不可撤销，选中的所有笔记及其内容将被永久清除且无法找回。',
    confirmText: '彻底删除',
    cancelText: '取消',
    dangerLevel: 'danger',
    itemType: 'note',
    noteCount: noteIds.length,
    onConfirm: () => {
      batchPermanentlyDelete(noteIds);
      confirmDialog.value.isOpen = false;
    },
  };
}

function handlePromptDeleteFolder(folderId: string) {
  const folder = folders.value.find((f) => f.id === folderId);
  if (!folder) return;

  const allDescendants = getAllDescendantFolderIds(folderId);
  const totalNotes = getFolderNoteCount(folderId);

  confirmDialog.value = {
    isOpen: true,
    title: '删除文件夹',
    message: `确定要删除文件夹「${folder.name}」吗？`,
    subMessage: `该操作会将此文件夹${allDescendants.length > 0 ? `及其 ${allDescendants.length} 个子文件夹` : ''}中的所有笔记（共 ${totalNotes} 篇）全部移入回收站。`,
    confirmText: '确认删除',
    cancelText: '取消',
    dangerLevel: 'danger',
    itemType: 'folder',
    itemName: folder.name,
    noteCount: totalNotes,
    subFolderCount: allDescendants.length,
    onConfirm: () => {
      deleteFolder(folderId);
      confirmDialog.value.isOpen = false;
    },
  };
}

function handlePromptEmptyTrash() {
  const trashNotes = notes.value.filter((n) => n.isDeleted);
  if (trashNotes.length === 0) {
    showToast('回收站为空');
    return;
  }

  confirmDialog.value = {
    isOpen: true,
    title: '清空回收站',
    message: '确定要清空回收站中的所有内容吗？',
    subMessage: `⚠️ 回收站内的全部 ${trashNotes.length} 篇笔记将被彻底删除，此操作不可撤销且无法恢复。`,
    confirmText: '清空回收站',
    cancelText: '取消',
    dangerLevel: 'danger',
    itemType: 'trash',
    noteCount: trashNotes.length,
    onConfirm: () => {
      emptyTrash();
      confirmDialog.value.isOpen = false;
    },
  };
}

// Header reference for focusing search
const headerRef = ref<InstanceType<typeof Header> | null>(null);

// Folder edit / new modal state
const editingFolder = ref<Folder | null>(null);
const isShortcutsModalOpen = ref(false);

function handleOpenNewFolder(parentFolder?: Folder) {
  editingFolder.value = null;
  targetParentFolderForNew.value = parentFolder || null;
  isNewFolderModalOpen.value = true;
}

function handleOpenRenameFolder(folder: Folder) {
  editingFolder.value = folder;
  targetParentFolderForNew.value = null;
  isNewFolderModalOpen.value = true;
}

function handleFolderSubmit(name: string, parentId?: string | null) {
  if (editingFolder.value) {
    renameFolder(editingFolder.value.id, name);
  } else {
    createFolder(name, parentId);
  }
}

function handleRenameNote(note: Note) {
  noteToRename.value = note;
  isRenameNoteModalOpen.value = true;
}

function handleRenameNoteSubmit(noteId: string, newTitle: string) {
  updateNote(noteId, { title: newTitle });
  showToast('笔记名称已更新');
}

function handleBatchImport(files: { name: string; content: string; folderId: string; format?: string }[]) {
  files.forEach((f) => {
    if (f.format === 'drawio' || f.name.match(/\.(drawio|drawio\.xml|drawio\.svg|drawio\.png)$/i)) {
      importDrawioFile(f.name, f.content, f.folderId);
    } else if (f.format === 'mindmap' || f.name.match(/\.(xmind|km|mm)$/i)) {
      importMindMapFile(f.name, f.content, f.folderId);
    } else {
      importMarkdownFile(f.name, f.content, f.folderId);
    }
  });
  showToast(`成功导入 ${files.length} 个文件`);
}

function exportAllNotesBackup() {
  const data = {
    folders: folders.value,
    notes: notes.value,
    exportedAt: new Date().toISOString(),
    version: '3.0',
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `枫叶云笔记_全量备份_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('全量笔记备份文件已导出');
}

// Global Keyboard Shortcuts Handler
function handleGlobalKeyDown(e: KeyboardEvent) {
  const isMod = e.metaKey || e.ctrlKey;
  const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
  const isTyping = targetTag === 'input' || targetTag === 'textarea' || (e.target as HTMLElement)?.isContentEditable;

  // 1. Ctrl/Cmd + N: Create New Note
  if (isMod && e.key.toLowerCase() === 'n' && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    createNewNote();
    return;
  }

  // 1.1 Ctrl/Cmd + M: Create New Mindmap
  if (isMod && e.key.toLowerCase() === 'm' && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    createNewMindMap();
    return;
  }

  // 1.2 Ctrl/Cmd + D: Create New Drawio Diagram
  if (isMod && e.key.toLowerCase() === 'd' && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    createNewDrawioDiagram();
    return;
  }

  // 2. Ctrl/Cmd + F: Open & Focus Global Search
  if (isMod && e.key.toLowerCase() === 'f') {
    // When editing note, do not intercept Ctrl+F so in-editor search functions properly
    if (editingNote.value) {
      return;
    }
    e.preventDefault();
    headerRef.value?.focusSearch();
    return;
  }

  // 3. "/" Quick Search shortcut when not typing
  if (e.key === '/' && !isTyping && !isMod) {
    e.preventDefault();
    headerRef.value?.focusSearch();
    return;
  }

  // 4. Ctrl/Cmd + Shift + N: New Folder
  if (isMod && e.shiftKey && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    handleOpenNewFolder();
    return;
  }

  // 5. Ctrl/Cmd + Shift + I: Import Notes
  if (isMod && e.shiftKey && e.key.toLowerCase() === 'i') {
    e.preventDefault();
    isImportModalOpen.value = true;
    return;
  }

  // 6. Ctrl/Cmd + Shift + E: Export Backup
  if (isMod && e.shiftKey && e.key.toLowerCase() === 'e') {
    e.preventDefault();
    exportAllNotesBackup();
    return;
  }

  // 7. Ctrl/Cmd + / or "?" : Open Shortcuts Guide
  if ((isMod && e.key === '/') || (e.key === '?' && !isTyping)) {
    e.preventDefault();
    isShortcutsModalOpen.value = !isShortcutsModalOpen.value;
    return;
  }

  // 8. Alt + 1-5: Switch views
  if (e.altKey && !isMod && !e.shiftKey) {
    if (e.key === '1') {
      e.preventDefault();
      selectView('folder');
      return;
    }
    if (e.key === '2') {
      e.preventDefault();
      selectView('shared');
      return;
    }
    if (e.key === '3') {
      e.preventDefault();
      selectView('starred');
      return;
    }
    if (e.key === '4') {
      e.preventDefault();
      selectView('favorite');
      return;
    }
    if (e.key === '5') {
      e.preventDefault();
      selectView('trash');
      return;
    }
    if (e.key === '6') {
      e.preventDefault();
      selectView('timeline');
      return;
    }
  }

  // 9. Escape: Close modals
  if (e.key === 'Escape') {
    if (isShortcutsModalOpen.value) {
      isShortcutsModalOpen.value = false;
    } else if (isImportModalOpen.value) {
      isImportModalOpen.value = false;
    } else if (isShareModalOpen.value) {
      isShareModalOpen.value = false;
    } else if (isMoveModalOpen.value) {
      isMoveModalOpen.value = false;
    } else if (isNewFolderModalOpen.value) {
      isNewFolderModalOpen.value = false;
    } else if (isRenameNoteModalOpen.value) {
      isRenameNoteModalOpen.value = false;
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeyDown);
});
</script>

<template>
  <div id="fengye-notes-app" class="h-screen w-screen flex flex-col bg-white overflow-hidden text-slate-800 font-sans antialiased">
    <!-- Top Header (Global Search with grouped priority results & shortcut indicator) -->
    <Header
      ref="headerRef"
      v-model:searchQuery="searchQuery"
      :notes-count="displayedNotes.length"
      :search-results="globalSearchResults"
      :active-folder-name="activeFolder?.name"
      :sync-status="syncStatus"
      :last-synced-at="cloudConfig.lastSyncedAt"
      @select-search-result="navigateToNoteFromSearch"
      @open-import="isImportModalOpen = true"
      @export-all="exportAllNotesBackup"
      @empty-trash="handlePromptEmptyTrash"
      @open-shortcuts="isShortcutsModalOpen = true"
      @open-cloud-sync="openCloudSyncModal"
    />

    <!-- Main Workspace: Sidebar + Note Table -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Left Sidebar (Folder hierarchy with drag & drop move, subfolders, actions) -->
      <Sidebar
        :folders="folders"
        :frequent-folders="frequentFolders"
        :is-folder-frequent="isFolderFrequent"
        :get-folder-full-path="getFolderFullPath"
        :get-folder-ancestors="getFolderAncestors"
        :current-view="currentView"
        :active-folder-id="activeFolderId"
        :get-folder-note-count="getFolderNoteCount"
        :shared-count="sharedNotesCount"
        :starred-count="starredNotesCount"
        :favorite-count="favoriteNotesCount"
        :trash-count="deletedNotesCount"
        @select-folder="selectFolder"
        @select-view="selectView"
        @create-new-note="createNewNote()"
        @create-new-mind-map="createNewMindMap()"
        @create-new-drawio="createNewDrawioDiagram()"
        @open-import="isImportModalOpen = true"
        @open-new-folder="handleOpenNewFolder"
        @rename-folder="handleOpenRenameFolder"
        @delete-folder="handlePromptDeleteFolder"
        @toggle-collapse="toggleFolderCollapse"
        @toggle-frequent-folder="toggleFrequentFolder"
        @add-frequent-folder="addFrequentFolder"
        @remove-frequent-folder="removeFrequentFolder"
        @reorder-frequent-folders="reorderFrequentFolders"
        @move-folder="moveFolder"
        @move-note="moveNoteToFolder"
      />

      <!-- Right Main Content Area: Timeline View OR Note Table -->
      <TimelineView
        v-if="currentView === 'timeline'"
        :notes="notes"
        :folders="folders"
        :current-view="currentView"
        :breadcrumb-items="breadcrumbItems"
        :get-folder-full-path="getFolderFullPath"
        @open-note="(n) => openNoteInNewTab(n)"
        @select-folder="selectFolder"
        @switch-to-table-view="selectView('folder')"
      />

      <NoteList
        v-else
        :notes="displayedNotes"
        :breadcrumb-items="breadcrumbItems"
        :current-view="currentView"
        v-model:sort-field="sortField"
        v-model:sort-order="sortOrder"
        v-model:filter-options="filterOptions"
        @breadcrumb-click="handleBreadcrumbClick"
        @open-note="(n) => openNoteInNewTab(n)"
        @open-note-in-current-window="(n) => openNoteEditor(n, 'split')"
        @open-note-in-new-tab="(n) => openNoteInNewTab(n)"
        @create-new-note="createNewNote()"
        @create-new-mind-map="createNewMindMap()"
        @create-new-drawio="createNewDrawioDiagram()"
        @toggle-star="toggleStar"
        @toggle-favorite="toggleFavorite"
        @move-to-trash="handlePromptMoveToTrash"
        @restore-from-trash="restoreFromTrash"
        @permanently-delete="handlePromptPermanentlyDelete"
        @empty-trash="handlePromptEmptyTrash"
        @open-share-modal="openShareModal"
        @open-move-modal="openMoveModal"
        @duplicate-note="duplicateNote"
        @export-note="exportNoteAsMarkdown"
        @rename-note="handleRenameNote"
        @switch-to-timeline="selectView('timeline')"
        @batch-move="(selectedNotes) => openBatchMoveModal(selectedNotes)"
        @batch-toggle-star="(ids) => batchToggleStar(ids)"
        @batch-toggle-favorite="(ids) => batchToggleFavorite(ids)"
        @batch-move-to-trash="handlePromptBatchMoveToTrash"
        @batch-restore-from-trash="batchRestoreFromTrash"
        @batch-permanently-delete="handlePromptBatchPermanentlyDelete"
        @batch-export="batchExportNotes"
      />
    </div>

    <!-- Draw.io Diagram Editor Modal (For Draw.io Notes) -->
    <DrawioEditor
      v-if="isEditorOpen && activeNote && (activeNote.format === 'drawio' || activeNote.type === 'drawio')"
      :note="activeNote"
      :folders="folders"
      @close="closeEditor"
      @update-note="updateNote"
      @toggle-star="toggleStar"
      @toggle-favorite="toggleFavorite"
      @open-share="openShareModal"
    />

    <!-- Mind Map Editor Modal (For Mindmap Notes) -->
    <MindMapEditor
      v-else-if="isEditorOpen && activeNote && (activeNote.format === 'mindmap' || activeNote.type === 'mindmap')"
      :note="activeNote"
      :folders="folders"
      @close="closeEditor"
      @update-note="updateNote"
      @toggle-star="toggleStar"
      @toggle-favorite="toggleFavorite"
      @open-share="openShareModal"
    />

    <!-- Note Editor & Markdown Viewer Modal (For Standard Markdown Notes) -->
    <NoteEditor
      v-else-if="isEditorOpen && activeNote"
      :note="activeNote"
      :folders="folders"
      :mode="editorMode"
      @close="closeEditor"
      @update-note="updateNote"
      @toggle-star="toggleStar"
      @toggle-favorite="toggleFavorite"
      @open-share="openShareModal"
      @export-note="exportNoteAsMarkdown"
    />

    <!-- Import Files Modal -->
    <ImportModal
      v-if="isImportModalOpen"
      :folders="folders"
      :active-folder-id="activeFolderId"
      @close="isImportModalOpen = false"
      @import-files="handleBatchImport"
    />

    <!-- Share Note Modal -->
    <ShareModal
      v-if="isShareModalOpen && sharingNote"
      :note="sharingNote"
      @close="isShareModalOpen = false"
    />

    <!-- Move Note Modal (Supports both single note and batch move) -->
    <MoveModal
      v-if="isMoveModalOpen && (noteToMove || (notesToMove && notesToMove.length > 0))"
      :note="noteToMove"
      :notes="notesToMove"
      :folders="folders"
      @close="isMoveModalOpen = false"
      @move="moveNoteToFolder"
      @batch-move="batchMoveNotesToFolder"
      @create-folder="createFolder"
    />

    <!-- New / Rename Folder Modal (Supports creating subfolder under parent) -->
    <NewFolderModal
      v-if="isNewFolderModalOpen"
      :parent-folder="targetParentFolderForNew"
      :initial-name="editingFolder?.name"
      :is-edit="!!editingFolder"
      @close="isNewFolderModalOpen = false"
      @submit="handleFolderSubmit"
    />

    <!-- Rename Note Modal -->
    <RenameNoteModal
      v-if="isRenameNoteModalOpen && noteToRename"
      :note="noteToRename"
      @close="isRenameNoteModalOpen = false"
      @submit="handleRenameNoteSubmit"
    />

    <!-- Secondary Confirmation Dialog (For File Deletion, Directory Deletion, and Empty Trash) -->
    <ConfirmModal
      v-if="confirmDialog.isOpen"
      :title="confirmDialog.title"
      :message="confirmDialog.message"
      :sub-message="confirmDialog.subMessage"
      :confirm-text="confirmDialog.confirmText"
      :cancel-text="confirmDialog.cancelText"
      :danger-level="confirmDialog.dangerLevel"
      :item-type="confirmDialog.itemType"
      :item-name="confirmDialog.itemName"
      :item-format="confirmDialog.itemFormat"
      :note-count="confirmDialog.noteCount"
      :sub-folder-count="confirmDialog.subFolderCount"
      @close="confirmDialog.isOpen = false"
      @confirm="confirmDialog.onConfirm()"
    />

    <!-- Keyboard Shortcuts Guide Modal -->
    <ShortcutsModal
      v-if="isShortcutsModalOpen"
      @close="isShortcutsModalOpen = false"
    />

    <!-- Cloud Sync Configuration & Diff Modal -->
    <CloudSyncModal
      :is-open="isCloudSyncModalOpen"
      :cloud-config="cloudConfig"
      :sync-status="syncStatus"
      :sync-diff="syncDiff"
      :is-syncing="isSyncing"
      :notes-count="notes.length"
      :folders-count="folders.length"
      :storage-info="storageInfo"
      @close="isCloudSyncModalOpen = false"
      @save-config="saveCloudConfig"
      @clear-config="clearCloudConfig"
      @test-connection="testCloudConnection"
      @check-diff="checkCloudDiff"
      @perform-sync="performCloudSync"
    />

    <!-- Toast Notification Message -->
    <div
      v-if="toastMessage"
      id="global-toast"
      class="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2 rounded-lg shadow-xl text-xs font-medium flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150"
    >
      <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
      <span>{{ toastMessage }}</span>
    </div>
  </div>
</template>
