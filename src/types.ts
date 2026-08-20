export interface Folder {
  id: string;
  name: string;
  parentId?: string | null;
  isOpen?: boolean;
  order: number;
}

export type NoteFormat = 'markdown' | 'mindmap' | 'text';

export interface Note {
  id: string;
  title: string;
  content: string; // Markdown text OR KityMinder JSON string
  folderId: string;
  createdAt: string; // e.g. '2025-12-30 10:06'
  updatedAt: string;
  isStarred: boolean;
  isFavorite: boolean;
  isShared: boolean;
  shareUrl?: string;
  isDeleted: boolean;
  deletedAt?: string;
  tags: string[];
  format: NoteFormat;
  type?: 'markdown' | 'mindmap';
}

export type ViewType = 'folder' | 'shared' | 'starred' | 'favorite' | 'trash' | 'search' | 'timeline';

export type SortField = 'createdAt' | 'updatedAt' | 'title';
export type SortOrder = 'desc' | 'asc';

export interface FilterOptions {
  starredOnly: boolean;
  favoriteOnly: boolean;
  format: 'all' | 'markdown' | 'mindmap' | 'text';
  tag?: string;
}

export interface BreadcrumbItem {
  id: string;
  label: string;
  folderId?: string;
  view?: ViewType;
  clickable: boolean;
}

export interface SearchResultItem {
  note: Note;
  folderPath: string;
  isCurrentFolder: boolean;
  matchedTitleSnippet?: string;
  matchedContentSnippet?: string;
}

export type SyncStatus = 'unconfigured' | 'synced' | 'syncing' | 'unsynced' | 'error';

export interface CloudConfig {
  enabled: boolean;
  apiUrl: string;
  apiToken: string;
  userId?: string;
  autoSync: boolean;
  lastSyncedAt?: number | null;
}

export interface SyncDiffResult {
  localOnlyNotes: number;
  localUpdatedNotes: number;
  cloudOnlyNotes: number;
  cloudUpdatedNotes: number;
  localOnlyFolders: number;
  cloudOnlyFolders: number;
  totalDiff: number;
}
