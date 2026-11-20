export interface Folder {
  id: string;
  name: string;
  parentId?: string | null;
  isOpen?: boolean;
  order: number;
  createdAt?: string;
  updatedAt?: string;
  updatedAtMs?: number;
}

export type NoteFormat = 'markdown' | 'mindmap' | 'drawio' | 'text';

export interface Note {
  id: string;
  title: string;
  content: string; // Markdown text, KityMinder JSON string, OR Draw.io XML
  folderId: string;
  createdAt: string; // e.g. '2025-12-30 10:06:00'
  updatedAt: string;
  updatedAtMs?: number;
  isStarred: boolean;
  isFavorite?: boolean;
  isShared?: boolean;
  shareUrl?: string;
  isDeleted: boolean;
  deletedAt?: string;
  tags: string[];
  format: NoteFormat;
  type?: 'markdown' | 'mindmap' | 'drawio';
  previewSvg?: string; // Optional cached SVG preview for fast thumbnail display
}

export interface BookmarkCategory {
  id: string;
  name: string;
  parentId?: string | null;
  isOpen?: boolean;
  order: number;
  color?: string | null;
  createdAt?: string;
  updatedAt?: string;
  updatedAtMs?: number;
}

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  description: string;
  categoryId: string; // Empty string means uncategorized
  tags: string[];
  isPinned: boolean;
  iconUrl?: string;
  createdAt: string;
  updatedAt: string;
  updatedAtMs?: number;
}

export type ViewType = 'folder' | 'starred' | 'trash' | 'search' | 'timeline' | 'bookmarks';

export type SortField = 'createdAt' | 'updatedAt' | 'title';
export type SortOrder = 'desc' | 'asc';

export interface FilterOptions {
  starredOnly: boolean;
  format: 'all' | 'markdown' | 'mindmap' | 'drawio' | 'text';
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

export interface BookmarkSearchResultItem {
  bookmark: Bookmark;
  categoryName: string;
  host: string;
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
  localUpdatedFolders?: number;
  cloudUpdatedFolders?: number;
  localOnlyBookmarks?: number;
  localUpdatedBookmarks?: number;
  cloudOnlyBookmarks?: number;
  cloudUpdatedBookmarks?: number;
  localOnlyBookmarkCategories?: number;
  localUpdatedBookmarkCategories?: number;
  cloudOnlyBookmarkCategories?: number;
  cloudUpdatedBookmarkCategories?: number;
  totalDiff: number;
}
