import { Bookmark, BookmarkCategory, CloudConfig, Folder, Note, SyncDiffResult } from '../types';

export interface CloudSyncResponse {
  code: number | string;
  message?: string;
  msg?: string;
  success?: boolean;
  data?: {
    serverTime?: number;
    notes?: Note[];
    folders?: Folder[];
    frequentFolderIds?: string[];
    bookmarks?: Bookmark[];
    bookmarkCategories?: BookmarkCategory[];
    deletedNotes?: Record<string, number>;
    deletedFolders?: Record<string, number>;
    deletedBookmarks?: Record<string, number>;
    deletedBookmarkCategories?: Record<string, number>;
  };
  notes?: Note[];
  folders?: Folder[];
  frequentFolderIds?: string[];
  bookmarks?: Bookmark[];
  bookmarkCategories?: BookmarkCategory[];
  deletedNotes?: Record<string, number>;
  deletedFolders?: Record<string, number>;
  deletedBookmarks?: Record<string, number>;
  deletedBookmarkCategories?: Record<string, number>;
  serverTime?: number;
}

export interface CloudTestResponse {
  code?: number | string;
  message?: string;
  msg?: string;
  success?: boolean;
  status?: string | number;
  data?: {
    serverTime?: number;
    user?: string;
    version?: string;
    noteCount?: number;
    folderCount?: number;
  };
}

// Clean and normalize API base URL
export function normalizeApiUrl(url: string): string {
  let trimmed = (url || '').trim();
  if (!trimmed) return '';

  // Handle relative URLs (e.g. "/api" or "/api/")
  if (trimmed.startsWith('/')) {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}${trimmed}`.replace(/\/+$/, '');
    }
    return trimmed.replace(/\/+$/, '');
  }

  // Handle protocol-relative URLs (e.g. "//localhost:3000/api")
  if (trimmed.startsWith('//')) {
    const protocol = typeof window !== 'undefined' ? window.location.protocol : 'https:';
    return `${protocol}${trimmed}`.replace(/\/+$/, '');
  }

  // Add protocol if missing
  if (!/^https?:\/\//i.test(trimmed)) {
    const defaultProto =
      typeof window !== 'undefined' &&
      window.location.protocol === 'https:' &&
      !trimmed.startsWith('localhost') &&
      !trimmed.startsWith('127.0.0.1')
        ? 'https://'
        : 'http://';
    trimmed = defaultProto + trimmed;
  }
  return trimmed.replace(/\/+$/, '');
}

function formatLocalDateTime(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Standardize note fields coming from server (e.g. folder_id -> folderId, is_starred -> isStarred, JSON tags)
 */
export function normalizeRemoteNote(raw: any): Note {
  if (!raw || typeof raw !== 'object') {
    const nowStr = formatLocalDateTime();
    return {
      id: 'note-' + Date.now(),
      title: '未命名笔记',
      content: '',
      folderId: '',
      createdAt: nowStr,
      updatedAt: nowStr,
      updatedAtMs: Date.now(),
      isStarred: false,
      isFavorite: false,
      isShared: false,
      isDeleted: false,
      tags: [],
      format: 'markdown',
    };
  }

  // Parse tags safely
  let tags: string[] = [];
  if (Array.isArray(raw.tags)) {
    tags = raw.tags.map((t: any) => String(t));
  } else if (typeof raw.tags === 'string' && raw.tags.trim()) {
    try {
      const parsed = JSON.parse(raw.tags);
      if (Array.isArray(parsed)) {
        tags = parsed.map((t: any) => String(t));
      } else {
        tags = [raw.tags];
      }
    } catch {
      tags = raw.tags
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean);
    }
  }

  const format =
    raw.format === 'mindmap' || raw.type === 'mindmap'
      ? 'mindmap'
      : raw.format === 'drawio' || raw.type === 'drawio'
      ? 'drawio'
      : raw.format || 'markdown';

  const fallbackNow = formatLocalDateTime();
  const createdAt = String(raw.createdAt || raw.created_at || fallbackNow);
  const updatedAt = String(raw.updatedAt || raw.updated_at || createdAt);
  const updatedAtMs =
    typeof raw.updatedAtMs === 'number' && !isNaN(raw.updatedAtMs)
      ? raw.updatedAtMs
      : typeof raw.updated_at_ms === 'number' && !isNaN(raw.updated_at_ms)
      ? raw.updated_at_ms
      : undefined;

  return {
    id: String(raw.id || raw.noteId || raw._id || 'note-' + Date.now()),
    title: String(raw.title !== undefined && raw.title !== null ? raw.title : '未命名笔记'),
    content: String(raw.content !== undefined && raw.content !== null ? raw.content : ''),
    folderId: String(raw.folderId ?? raw.folder_id ?? raw.folder ?? ''),
    createdAt,
    updatedAt,
    ...(updatedAtMs !== undefined ? { updatedAtMs } : {}),
    isStarred: Boolean(raw.isStarred || raw.is_starred || raw.starred),
    isFavorite: Boolean(raw.isFavorite || raw.is_favorite || raw.favorite),
    isShared: Boolean(raw.isShared || raw.is_shared || raw.shared),
    isDeleted: Boolean(raw.isDeleted || raw.is_deleted || raw.deleted),
    deletedAt: raw.deletedAt || raw.deleted_at || undefined,
    shareUrl: raw.shareUrl || raw.share_url || undefined,
    tags,
    format,
    type: format === 'mindmap' || format === 'drawio' ? format : 'markdown',
  };
}

/**
 * Standardize folder fields coming from server (e.g. parent_id -> parentId, is_collapsed -> isOpen)
 */
export function normalizeRemoteFolder(raw: any): Folder {
  if (!raw || typeof raw !== 'object') {
    const nowStr = formatLocalDateTime();
    return {
      id: 'folder-' + Date.now(),
      name: '新建文件夹',
      parentId: null,
      isOpen: true,
      order: 1,
      createdAt: nowStr,
      updatedAt: nowStr,
      updatedAtMs: Date.now(),
    };
  }

  const rawParent =
    raw.parentId !== undefined
      ? raw.parentId
      : raw.parent_id !== undefined
      ? raw.parent_id
      : null;
  const parentId =
    rawParent === '' || rawParent === '0' || rawParent === 0
      ? null
      : rawParent
      ? String(rawParent)
      : null;
  const isOpen =
    raw.isOpen !== undefined
      ? Boolean(raw.isOpen)
      : raw.is_collapsed !== undefined
      ? !raw.is_collapsed
      : true;

  const createdAt = raw.createdAt || raw.created_at || undefined;
  const updatedAt = raw.updatedAt || raw.updated_at || createdAt || undefined;
  const updatedAtMs =
    typeof raw.updatedAtMs === 'number' && !isNaN(raw.updatedAtMs)
      ? raw.updatedAtMs
      : typeof raw.updated_at_ms === 'number' && !isNaN(raw.updated_at_ms)
      ? raw.updated_at_ms
      : undefined;

  return {
    id: String(raw.id || raw.folderId || 'folder-' + Date.now()),
    name: String(raw.name || raw.folderName || '新建文件夹'),
    parentId,
    isOpen,
    order: Number(raw.order || raw.order_num || raw.sort || 0),
    ...(createdAt ? { createdAt: String(createdAt) } : {}),
    ...(updatedAt ? { updatedAt: String(updatedAt) } : {}),
    ...(updatedAtMs !== undefined ? { updatedAtMs } : {}),
  };
}

/**
 * Standardize bookmark category fields coming from server
 */
export function normalizeRemoteBookmarkCategory(raw: any): BookmarkCategory {
  const nowStr = formatLocalDateTime();
  if (!raw || typeof raw !== 'object') {
    return {
      id: 'bcat-' + Date.now(),
      name: '未命名目录',
      parentId: null,
      isOpen: true,
      order: 0,
      color: null,
      createdAt: nowStr,
      updatedAt: nowStr,
      updatedAtMs: Date.now(),
    };
  }
  const rawParent =
    raw.parentId !== undefined
      ? raw.parentId
      : raw.parent_id !== undefined
      ? raw.parent_id
      : null;
  const parentId =
    rawParent === '' || rawParent === '0' || rawParent === 0
      ? null
      : rawParent
      ? String(rawParent)
      : null;
  const isOpen =
    raw.isOpen !== undefined
      ? Boolean(raw.isOpen)
      : raw.is_collapsed !== undefined
      ? !raw.is_collapsed
      : true;

  const createdAt = raw.createdAt || raw.created_at || undefined;
  const updatedAt = raw.updatedAt || raw.updated_at || createdAt || undefined;
  const updatedAtMs =
    typeof raw.updatedAtMs === 'number' && !isNaN(raw.updatedAtMs)
      ? raw.updatedAtMs
      : typeof raw.updated_at_ms === 'number' && !isNaN(raw.updated_at_ms)
      ? raw.updated_at_ms
      : undefined;

  return {
    id: String(raw.id || raw.categoryId || 'bcat-' + Date.now()),
    name: String(raw.name || '未命名目录'),
    parentId,
    isOpen,
    order: Number(raw.order ?? raw.order_num ?? raw.sort ?? 0),
    color: raw.color ?? null,
    ...(createdAt ? { createdAt: String(createdAt) } : {}),
    ...(updatedAt ? { updatedAt: String(updatedAt) } : {}),
    ...(updatedAtMs !== undefined ? { updatedAtMs } : {}),
  };
}

/**
 * Standardize bookmark fields coming from server
 */
export function normalizeRemoteBookmark(raw: any): Bookmark {
  const fallbackNow = formatLocalDateTime();
  if (!raw || typeof raw !== 'object') {
    return {
      id: 'bm-' + Date.now(),
      title: '未命名书签',
      url: 'https://example.com',
      description: '',
      categoryId: '',
      tags: [],
      isPinned: false,
      createdAt: fallbackNow,
      updatedAt: fallbackNow,
      updatedAtMs: Date.now(),
    };
  }

  let tags: string[] = [];
  if (Array.isArray(raw.tags)) {
    tags = raw.tags.map((t: any) => String(t)).filter(Boolean);
  } else if (typeof raw.tags === 'string' && raw.tags.trim()) {
    try {
      const parsed = JSON.parse(raw.tags);
      if (Array.isArray(parsed)) {
        tags = parsed.map((t: any) => String(t)).filter(Boolean);
      } else {
        tags = [raw.tags];
      }
    } catch {
      tags = raw.tags
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean);
    }
  }

  const createdAt = String(raw.createdAt || raw.created_at || fallbackNow);
  const updatedAt = String(raw.updatedAt || raw.updated_at || createdAt);
  const updatedAtMs =
    typeof raw.updatedAtMs === 'number' && !isNaN(raw.updatedAtMs)
      ? raw.updatedAtMs
      : typeof raw.updated_at_ms === 'number' && !isNaN(raw.updated_at_ms)
      ? raw.updated_at_ms
      : undefined;

  const rawOrder = raw.order ?? raw.order_num;
  const parsedOrder =
    rawOrder !== undefined && rawOrder !== null && !isNaN(Number(rawOrder))
      ? Number(rawOrder)
      : undefined;

  return {
    id: String(raw.id || raw.bookmarkId || 'bm-' + Date.now()),
    title: String(raw.title !== undefined && raw.title !== null ? raw.title : '未命名书签'),
    url: String(raw.url || ''),
    description: String(raw.description ?? raw.desc ?? ''),
    categoryId: String(raw.categoryId ?? raw.category_id ?? ''),
    tags,
    isPinned: Boolean(raw.isPinned ?? raw.is_pinned ?? raw.pinned),
    ...(parsedOrder !== undefined ? { order: parsedOrder } : {}),
    ...(raw.iconUrl || raw.icon_url ? { iconUrl: String(raw.iconUrl || raw.icon_url) } : {}),
    createdAt,
    updatedAt,
    ...(updatedAtMs !== undefined ? { updatedAtMs } : {}),
  };
}

// Build standard request headers
function getHeaders(config: CloudConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/plain, */*',
  };
  if (config.apiToken && config.apiToken.trim()) {
    headers['Authorization'] = `Bearer ${config.apiToken.trim()}`;
    headers['X-Api-Key'] = config.apiToken.trim();
  }
  if (config.userId && config.userId.trim()) {
    headers['X-User-Id'] = config.userId.trim();
  }
  return headers;
}

// Fetch with timeout protection to prevent indefinite hang / sync lockup
async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15000
): Promise<Response> {
  if (init.signal) {
    return fetch(url, init);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// Per-baseUrl cache for detected backend working mode to eliminate probe queries and cross-URL pollution
type ApiFlavor = 'rest' | 'php' | 'query';
const FLAVORS_BY_URL_STORAGE_KEY = 'fengye_cloud_api_flavors_v2';
const ENDPOINTS_STORAGE_KEY = 'fengye_cloud_api_endpoints';

function loadCachedFlavorsByUrl(): Map<string, ApiFlavor> {
  const map = new Map<string, ApiFlavor>();
  try {
    const raw = localStorage.getItem(FLAVORS_BY_URL_STORAGE_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') {
        Object.entries(obj).forEach(([k, v]) => {
          if (v === 'rest' || v === 'php' || v === 'query') {
            map.set(k, v);
          }
        });
      }
    }
  } catch {}
  return map;
}

function loadCachedEndpoints(): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const raw = localStorage.getItem(ENDPOINTS_STORAGE_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') {
        Object.entries(obj).forEach(([k, v]) => {
          if (typeof v === 'string') map.set(k, v);
        });
      }
    }
  } catch {}
  return map;
}

const cachedFlavorMap = loadCachedFlavorsByUrl();
const cachedEndpointMap = loadCachedEndpoints();

function saveCachedEndpoints() {
  try {
    const obj: Record<string, string> = {};
    cachedEndpointMap.forEach((v, k) => {
      obj[k] = v;
    });
    localStorage.setItem(ENDPOINTS_STORAGE_KEY, JSON.stringify(obj));

    const flavorObj: Record<string, ApiFlavor> = {};
    cachedFlavorMap.forEach((v, k) => {
      flavorObj[k] = v;
    });
    localStorage.setItem(FLAVORS_BY_URL_STORAGE_KEY, JSON.stringify(flavorObj));
  } catch {}
}

/**
 * Clear cached API flavor and endpoints (all or for a specific baseUrl)
 */
export function clearApiEndpointCache(targetBaseUrl?: string) {
  if (targetBaseUrl) {
    const normalized = normalizeApiUrl(targetBaseUrl);
    cachedFlavorMap.delete(normalized);
    for (const key of Array.from(cachedEndpointMap.keys())) {
      if (key.startsWith(`${normalized}::`)) {
        cachedEndpointMap.delete(key);
      }
    }
    saveCachedEndpoints();
    return;
  }

  cachedFlavorMap.clear();
  cachedEndpointMap.clear();
  try {
    localStorage.removeItem(FLAVORS_BY_URL_STORAGE_KEY);
    localStorage.removeItem('fengye_cloud_api_flavor');
    localStorage.removeItem(ENDPOINTS_STORAGE_KEY);
  } catch {}
}

/**
 * Resolve target URL directly based on URL structure and detected server flavor.
 * Primary choice is calculated without trial-and-error.
 */
function resolveActionUrl(baseUrl: string, action: string, restPath?: string): string {
  const normalized = normalizeApiUrl(baseUrl);
  if (!normalized) return '';

  const cacheKey = `${normalized}::${action}`;
  if (cachedEndpointMap.has(cacheKey)) {
    return cachedEndpointMap.get(cacheKey)!;
  }

  const cachedFlavor = cachedFlavorMap.get(normalized) || null;
  const isPhp = normalized.includes('.php') || cachedFlavor === 'php';
  const endsWithApi = normalized.endsWith('/api') || cachedFlavor === 'rest';

  if (isPhp) {
    const sep = normalized.includes('?') ? '&' : '?';
    return `${normalized}${sep}action=${action}`;
  }

  if (endsWithApi) {
    if (restPath) {
      return `${normalized}${restPath}`;
    }
    // Default rest mappings
    if (action === 'pull' || action === 'data') return `${normalized}/data`;
    if (action === 'sync' || action === 'merge' || action === 'push_all' || action === 'pull_all') return `${normalized}/sync`;
    if (action === 'ping' || action === 'health') return `${normalized}/ping`;
    if (action === 'upsert_note' || action === 'delete_note') return `${normalized}/notes`;
    if (action === 'upsert_folder' || action === 'delete_folder') return `${normalized}/folders`;
    if (action === 'frequent_folders' || action === 'upsert_frequent_folders' || action === 'delete_frequent_folder') return `${normalized}/frequent-folders`;
    if (action === 'empty_trash') return `${normalized}/trash/empty`;
    if (action === 'upsert_bookmark' || action === 'delete_bookmark') return `${normalized}/bookmarks`;
    if (action === 'upsert_bookmark_category' || action === 'delete_bookmark_category') return `${normalized}/bookmark-categories`;
    return `${normalized}?action=${action}`;
  }

  // Bare domain or unknown path
  if (restPath) {
    return `${normalized}/api${restPath}`;
  }
  return `${normalized}/api/data`;
}

/**
 * Returns prioritized candidates in order of highest probability.
 * When endpoint is cached or flavor is identified for this URL, only the exact matched URL is returned.
 */
function getActionCandidateUrls(baseUrl: string, action: string, restPath?: string): string[] {
  const normalized = normalizeApiUrl(baseUrl);
  if (!normalized) return [];

  const cacheKey = `${normalized}::${action}`;
  // If endpoint is explicitly cached for this action, return only that endpoint
  if (cachedEndpointMap.has(cacheKey)) {
    return [cachedEndpointMap.get(cacheKey)!];
  }

  const primary = resolveActionUrl(baseUrl, action, restPath);
  const cachedFlavor = cachedFlavorMap.get(normalized) || null;

  // If server flavor has already been determined for this URL or URL explicitly indicates flavor, don't probe other variants
  if (cachedFlavor !== null || normalized.includes('.php') || normalized.endsWith('/api')) {
    return [primary];
  }

  const candidates: string[] = [primary];
  const seen = new Set<string>([primary]);

  const add = (u: string) => {
    if (u && !seen.has(u)) {
      seen.add(u);
      candidates.push(u);
    }
  };

  const isPhp = normalized.includes('.php');
  const endsWithApi = normalized.endsWith('/api');
  const baseWithoutApi = endsWithApi ? normalized.replace(/\/api$/, '') : normalized;

  if (isPhp) {
    const sep = normalized.includes('?') ? '&' : '?';
    add(`${normalized}${sep}action=${action}`);
    add(normalized);
  } else if (endsWithApi) {
    if (restPath) add(`${normalized}${restPath}`);
    add(`${normalized}?action=${action}`);
    add(`${baseWithoutApi}/api.php?action=${action}`);
  } else {
    if (restPath) add(`${normalized}/api${restPath}`);
    add(`${normalized}/api?action=${action}`);
    add(`${normalized}/api.php?action=${action}`);
    add(`${normalized}?action=${action}`);
  }

  return candidates;
}

// Record working endpoint in cache to prevent probe calls
function recordSuccessfulEndpoint(baseUrl: string, action: string, url: string) {
  const normalized = normalizeApiUrl(baseUrl);
  if (!normalized) return;

  const cacheKey = `${normalized}::${action}`;
  cachedEndpointMap.set(cacheKey, url);

  if (url.includes('.php') || url.includes('?action=') || url.includes('&action=')) {
    cachedFlavorMap.set(normalized, url.includes('.php') ? 'php' : 'query');
  } else if (
    url.includes('/api/') ||
    url.endsWith('/api') ||
    url.includes('/data') ||
    url.includes('/sync') ||
    url.includes('/ping') ||
    url.includes('/notes') ||
    url.includes('/folders') ||
    url.includes('/frequent-folders') ||
    url.includes('/trash') ||
    url.includes('/bookmarks') ||
    url.includes('/bookmark-categories')
  ) {
    cachedFlavorMap.set(normalized, 'rest');
  }

  saveCachedEndpoints();
}

// Helper to determine if code / status / success flag indicates success
function isResponseSuccessful(data: any, httpOk: boolean): boolean {
  if (!data) return httpOk;

  // 1. Check explicit 'success' boolean
  if (data.success !== undefined && data.success !== null) {
    return Boolean(data.success);
  }

  // 2. Check 'code' (200, "200", 0, "0" are common success codes)
  if (data.code !== undefined && data.code !== null) {
    const num = Number(data.code);
    if (!isNaN(num)) {
      return num === 200 || num === 0;
    }
    return data.code === '200' || data.code === '0';
  }

  // 3. Check 'status' (200, "success", "ok")
  if (data.status !== undefined && data.status !== null) {
    if (typeof data.status === 'number') {
      return data.status >= 200 && data.status < 300;
    }
    const str = String(data.status).toLowerCase();
    return str === 'success' || str === 'ok' || str === '200' || str === '0';
  }

  // 4. Default to HTTP status ok if no error field
  return httpOk && !data.error && !data.err;
}

// Extract human message from server response
function extractResponseMessage(data: any, fallback: string): string {
  if (!data) return fallback;
  return data.message || data.msg || data.info || data.error || fallback;
}

// 1. Test Server Connectivity
export async function testCloudApi(
  config: CloudConfig
): Promise<{ success: boolean; message: string; data?: any }> {
  const baseUrl = normalizeApiUrl(config.apiUrl);
  if (!baseUrl) {
    return { success: false, message: '请输入有效的云端 API 地址' };
  }

  try {
    // Clear stale endpoint cache for this URL before explicit connection test
    clearApiEndpointCache(baseUrl);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const candidates = getActionCandidateUrls(baseUrl, 'ping', '/ping');

    let lastError = '';
    let matchedRes: Response | null = null;
    let matchedUrl = '';
    const headers = getHeaders(config);

    for (const url of candidates) {
      try {
        let res = await fetch(url, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });

        if (res.status === 405) {
          res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ action: 'ping', timestamp: Date.now() }),
            signal: controller.signal,
          });
        }

        if (res.status === 401 || res.status === 403) {
          clearTimeout(timeoutId);
          return {
            success: false,
            message: '认证失败：API Token 无效或未授权，请检查凭据设置',
          };
        }

        if (res.ok) {
          matchedRes = res;
          matchedUrl = url;
          break;
        } else if (res.status !== 404 && res.status !== 405) {
          matchedRes = res;
          matchedUrl = url;
          break;
        }
      } catch (err: any) {
        lastError = err.message || '';
        if (err.name === 'AbortError') {
          clearTimeout(timeoutId);
          return { success: false, message: '连接超时（超过8秒），请检查服务端地址或网络连接' };
        }
      }
    }

    clearTimeout(timeoutId);

    if (!matchedRes) {
      return {
        success: false,
        message: lastError
          ? `无法连接到服务端 (${lastError})。请确保服务端已启动并开启 CORS 跨域支持。`
          : '无法连接到服务端，未找到有效的 API 测试接口，请确认 URL 地址。',
      };
    }

    const data = await matchedRes.json().catch(() => null);

    if (!matchedRes.ok) {
      return {
        success: false,
        message: extractResponseMessage(
          data,
          `服务端响应异常 (HTTP ${matchedRes.status}): ${matchedRes.statusText || '请求失败'}`
        ),
      };
    }

    const isSuccess = isResponseSuccessful(data, matchedRes.ok);
    if (!isSuccess) {
      return {
        success: false,
        message: extractResponseMessage(data, '服务端返回连接未就绪状态'),
      };
    }

    recordSuccessfulEndpoint(baseUrl, 'ping', matchedUrl);

    return {
      success: true,
      message: extractResponseMessage(data, '云端连接成功！服务正常运行'),
      data: data?.data || data,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `连接失败: ${err.message || '未知网络错误'}`,
    };
  }
}

function parseTombstoneMap(raw: any): Record<string, number> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const map: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const id = String(k || '').trim();
    if (!id) continue;
    const ms =
      typeof v === 'number'
        ? v
        : typeof v === 'object' && v !== null && typeof (v as any).ms === 'number'
        ? (v as any).ms
        : Number(v);
    if (!isNaN(ms) && ms > 0) {
      map[id] = ms;
    }
  }
  return map;
}

// 2. Fetch Remote Data from Cloud (Direct Single Request with Fallback)
export async function fetchRemoteData(
  config: CloudConfig
): Promise<{
  success: boolean;
  data?: {
    notes: Note[];
    folders: Folder[];
    frequentFolderIds?: string[];
    bookmarks?: Bookmark[];
    bookmarkCategories?: BookmarkCategory[];
    deletedNotes?: Record<string, number>;
    deletedFolders?: Record<string, number>;
    deletedBookmarks?: Record<string, number>;
    deletedBookmarkCategories?: Record<string, number>;
    serverTime: number;
  };
  message?: string;
}> {
  const baseUrl = normalizeApiUrl(config.apiUrl);
  if (!baseUrl) return { success: false, message: '未配置 API 地址' };

  try {
    const urlsToTry = getActionCandidateUrls(baseUrl, 'pull', '/data');
    let lastRes: Response | null = null;
    let matchedUrl = '';
    const headers = getHeaders(config);

    for (const url of urlsToTry) {
      try {
        const res = await fetchWithTimeout(url, { method: 'GET', headers }, 15000);
        if (res.ok || res.status === 401 || res.status === 403) {
          lastRes = res;
          matchedUrl = url;
          break;
        }
      } catch {}
    }

    if (!lastRes) {
      return { success: false, message: '无法连接到云端拉取数据接口，请确认服务端 API 地址' };
    }

    if (!lastRes.ok) {
      if (lastRes.status === 401 || lastRes.status === 403) {
        return { success: false, message: '认证失败：API Token 无效或已过期' };
      }
      return { success: false, message: `拉取数据失败 (HTTP ${lastRes.status})` };
    }

    const json = await lastRes.json().catch(() => null);
    if (!json) {
      return { success: false, message: '服务端返回的数据格式非有效 JSON' };
    }

    const isSuccess = isResponseSuccessful(json, lastRes.ok);
    const resData = json.data || json;

    const rawNotesList = Array.isArray(resData.notes)
      ? resData.notes
      : Array.isArray(json.notes)
      ? json.notes
      : Array.isArray(resData.mergedNotes)
      ? resData.mergedNotes
      : Array.isArray(json.mergedNotes)
      ? json.mergedNotes
      : Array.isArray(resData)
      ? resData
      : [];

    const rawFoldersList = Array.isArray(resData.folders)
      ? resData.folders
      : Array.isArray(json.folders)
      ? json.folders
      : Array.isArray(resData.mergedFolders)
      ? resData.mergedFolders
      : Array.isArray(json.mergedFolders)
      ? json.mergedFolders
      : [];

    const rawFrequentFolderIds: string[] | undefined = Array.isArray(resData.frequentFolderIds)
      ? resData.frequentFolderIds
      : Array.isArray(json.frequentFolderIds)
      ? json.frequentFolderIds
      : Array.isArray(resData.frequentFolders)
      ? resData.frequentFolders
      : Array.isArray(json.frequentFolders)
      ? json.frequentFolders
      : undefined;

    const rawBookmarksList: any[] | undefined = Array.isArray(resData.bookmarks)
      ? resData.bookmarks
      : Array.isArray(json.bookmarks)
      ? json.bookmarks
      : undefined;

    const rawBookmarkCategoriesList: any[] | undefined = Array.isArray(resData.bookmarkCategories)
      ? resData.bookmarkCategories
      : Array.isArray(json.bookmarkCategories)
      ? json.bookmarkCategories
      : undefined;

    if (!isSuccess && rawNotesList.length === 0 && rawFoldersList.length === 0 && !json.data) {
      return { success: false, message: extractResponseMessage(json, '服务端返回错误') };
    }

    recordSuccessfulEndpoint(baseUrl, 'pull', matchedUrl);

    const notes: Note[] = rawNotesList.map(normalizeRemoteNote);
    const folders: Folder[] = rawFoldersList.map(normalizeRemoteFolder);
    const bookmarks: Bookmark[] | undefined = rawBookmarksList
      ? rawBookmarksList.map(normalizeRemoteBookmark)
      : undefined;
    const bookmarkCategories: BookmarkCategory[] | undefined = rawBookmarkCategoriesList
      ? rawBookmarkCategoriesList.map(normalizeRemoteBookmarkCategory)
      : undefined;
    const deletedNotes = parseTombstoneMap(resData.deletedNotes || json.deletedNotes);
    const deletedFolders = parseTombstoneMap(resData.deletedFolders || json.deletedFolders);
    const deletedBookmarks = parseTombstoneMap(resData.deletedBookmarks || json.deletedBookmarks);
    const deletedBookmarkCategories = parseTombstoneMap(
      resData.deletedBookmarkCategories || json.deletedBookmarkCategories
    );

    return {
      success: true,
      data: {
        notes,
        folders,
        frequentFolderIds: rawFrequentFolderIds ? rawFrequentFolderIds.map(String) : undefined,
        ...(bookmarks !== undefined ? { bookmarks } : {}),
        ...(bookmarkCategories !== undefined ? { bookmarkCategories } : {}),
        ...(deletedNotes ? { deletedNotes } : {}),
        ...(deletedFolders ? { deletedFolders } : {}),
        ...(deletedBookmarks ? { deletedBookmarks } : {}),
        ...(deletedBookmarkCategories ? { deletedBookmarkCategories } : {}),
        serverTime: resData.serverTime || json.serverTime || Date.now(),
      },
    };
  } catch (err: any) {
    return { success: false, message: `网络拉取异常: ${err.message || '连接错误'}` };
  }
}

function parseSafeTime(timeStr?: string | number | null): number {
  if (!timeStr) return 0;
  if (typeof timeStr === 'number') return timeStr;
  const str = String(timeStr).trim();
  if (!str) return 0;
  if (/^\d{10,13}$/.test(str)) {
    const num = Number(str);
    return num < 1e11 ? num * 1000 : num;
  }
  const normalized = str.includes('T') ? str : str.replace(' ', 'T');
  const parsed = new Date(normalized).getTime();
  if (!isNaN(parsed) && parsed > 0) return parsed;
  const fallback = new Date(str).getTime();
  return isNaN(fallback) ? 0 : fallback;
}

function getEntityTimestampMs(entity?: { updatedAtMs?: number; updatedAt?: string; createdAt?: string }): number {
  if (!entity) return 0;
  if (typeof entity.updatedAtMs === 'number' && !isNaN(entity.updatedAtMs) && entity.updatedAtMs > 0) {
    return entity.updatedAtMs;
  }
  return parseSafeTime(entity.updatedAt || entity.createdAt);
}

function areTagsEqual(a?: string[], b?: string[]): boolean {
  const listA = Array.isArray(a) ? a.map(String) : [];
  const listB = Array.isArray(b) ? b.map(String) : [];
  if (listA.length !== listB.length) return false;
  return listA.every((tag, idx) => tag === listB[idx]);
}

// 3. Compare and compute differences between local and cloud
export function calculateSyncDiff(
  localNotes: Note[],
  localFolders: Folder[],
  remoteNotes: Note[],
  remoteFolders: Folder[],
  remoteDeletedNotes?: Record<string, number>,
  remoteDeletedFolders?: Record<string, number>,
  bookmarkSyncArgs?: {
    localBookmarks?: Bookmark[];
    localBookmarkCategories?: BookmarkCategory[];
    remoteBookmarks?: Bookmark[];
    remoteBookmarkCategories?: BookmarkCategory[];
    remoteDeletedBookmarks?: Record<string, number>;
    remoteDeletedBookmarkCategories?: Record<string, number>;
  }
): SyncDiffResult {
  const remoteNoteList = Array.isArray(remoteNotes) ? remoteNotes : [];
  const remoteFolderList = Array.isArray(remoteFolders) ? remoteFolders : [];
  const localNoteList = Array.isArray(localNotes) ? localNotes : [];
  const localFolderList = Array.isArray(localFolders) ? localFolders : [];

  const remoteNoteMap = new Map(remoteNoteList.map((n) => [String(n.id), n]));
  const remoteFolderMap = new Map(remoteFolderList.map((f) => [String(f.id), f]));
  const localNoteMap = new Map(localNoteList.map((n) => [String(n.id), n]));
  const localFolderMap = new Map(localFolderList.map((f) => [String(f.id), f]));

  let localOnlyNotes = 0;
  let localUpdatedNotes = 0;
  let localOnlyFolders = 0;
  let localUpdatedFolders = 0;
  let cloudOnlyNotes = 0;
  let cloudUpdatedNotes = 0;
  let cloudOnlyFolders = 0;
  let cloudUpdatedFolders = 0;
  let localOnlyBookmarks = 0;
  let localUpdatedBookmarks = 0;
  let cloudOnlyBookmarks = 0;
  let cloudUpdatedBookmarks = 0;
  let localOnlyBookmarkCategories = 0;
  let localUpdatedBookmarkCategories = 0;
  let cloudOnlyBookmarkCategories = 0;
  let cloudUpdatedBookmarkCategories = 0;

  // Compare local notes against remote
  for (const local of localNoteList) {
    const lid = String(local.id);
    const remote = remoteNoteMap.get(lid);
    if (!remote) {
      const tombMs = remoteDeletedNotes?.[lid];
      const localTime = getEntityTimestampMs(local);
      if (tombMs && (local.isDeleted || localTime === 0 || localTime <= tombMs)) {
        cloudUpdatedNotes++;
      } else {
        localOnlyNotes++;
      }
    } else {
      const localTime = getEntityTimestampMs(local);
      const remoteTime = getEntityTimestampMs(remote);

      const isContentDiff =
        (local.title || '') !== (remote.title || '') ||
        (local.content || '') !== (remote.content || '') ||
        (local.folderId || '') !== (remote.folderId || '') ||
        Boolean(local.isStarred) !== Boolean(remote.isStarred) ||
        Boolean(local.isFavorite) !== Boolean(remote.isFavorite) ||
        Boolean(local.isDeleted) !== Boolean(remote.isDeleted) ||
        (local.format || 'markdown') !== (remote.format || 'markdown') ||
        !areTagsEqual(local.tags, remote.tags);

      const timeThreshold =
        typeof local.updatedAtMs === 'number' && typeof remote.updatedAtMs === 'number' ? 0 : 1000;

      if (localTime - remoteTime > timeThreshold) {
        localUpdatedNotes++;
      } else if (remoteTime - localTime > timeThreshold) {
        // Will be counted in remote loop
      } else if (isContentDiff) {
        localUpdatedNotes++;
      }
    }
  }

  for (const remote of remoteNoteList) {
    const local = localNoteMap.get(String(remote.id));
    if (!local) {
      cloudOnlyNotes++;
    } else {
      const localTime = getEntityTimestampMs(local);
      const remoteTime = getEntityTimestampMs(remote);
      const timeThreshold =
        typeof local.updatedAtMs === 'number' && typeof remote.updatedAtMs === 'number' ? 0 : 1000;
      if (remoteTime - localTime > timeThreshold) {
        cloudUpdatedNotes++;
      }
    }
  }

  for (const localF of localFolderList) {
    const fid = String(localF.id);
    const remoteF = remoteFolderMap.get(fid);
    if (!remoteF) {
      const tombMs = remoteDeletedFolders?.[fid];
      const localTime = getEntityTimestampMs(localF);
      if (tombMs && (localTime === 0 || localTime <= tombMs)) {
        cloudUpdatedFolders++;
      } else {
        localOnlyFolders++;
      }
    } else {
      const isFolderDiff =
        (localF.name || '') !== (remoteF.name || '') ||
        (localF.parentId || null) !== (remoteF.parentId || null) ||
        Number(localF.order || 0) !== Number(remoteF.order || 0);
      if (isFolderDiff) {
        const localTime = getEntityTimestampMs(localF);
        const remoteTime = getEntityTimestampMs(remoteF);
        if (remoteTime > localTime + 1000) {
          cloudUpdatedFolders++;
        } else {
          localUpdatedFolders++;
        }
      }
    }
  }

  for (const remoteF of remoteFolderList) {
    if (!localFolderMap.has(String(remoteF.id))) {
      cloudOnlyFolders++;
    }
  }

  // Compare Bookmarks (only if remote server returned bookmark payload)
  if (bookmarkSyncArgs && Array.isArray(bookmarkSyncArgs.remoteBookmarks)) {
    const localBmList = Array.isArray(bookmarkSyncArgs.localBookmarks) ? bookmarkSyncArgs.localBookmarks : [];
    const remoteBmList = bookmarkSyncArgs.remoteBookmarks;
    const remoteBmMap = new Map(remoteBmList.map((b) => [String(b.id), b]));
    const localBmMap = new Map(localBmList.map((b) => [String(b.id), b]));

    for (const localB of localBmList) {
      const bid = String(localB.id);
      const remoteB = remoteBmMap.get(bid);
      if (!remoteB) {
        const tombMs = bookmarkSyncArgs.remoteDeletedBookmarks?.[bid];
        const localTime = getEntityTimestampMs(localB);
        if (tombMs && (localTime === 0 || localTime <= tombMs)) {
          cloudUpdatedBookmarks++;
        } else {
          localOnlyBookmarks++;
        }
      } else {
        const localTime = getEntityTimestampMs(localB);
        const remoteTime = getEntityTimestampMs(remoteB);
        const isDiff =
          (localB.title || '') !== (remoteB.title || '') ||
          (localB.url || '') !== (remoteB.url || '') ||
          (localB.description || '') !== (remoteB.description || '') ||
          (localB.categoryId || '') !== (remoteB.categoryId || '') ||
          Boolean(localB.isPinned) !== Boolean(remoteB.isPinned) ||
          (localB.order ?? 0) !== (remoteB.order ?? 0) ||
          (localB.iconUrl || '') !== (remoteB.iconUrl || '') ||
          !areTagsEqual(localB.tags, remoteB.tags);
        const threshold =
          typeof localB.updatedAtMs === 'number' && typeof remoteB.updatedAtMs === 'number' ? 0 : 1000;
        if (localTime - remoteTime > threshold) {
          localUpdatedBookmarks++;
        } else if (remoteTime - localTime > threshold) {
          // counted in remote loop
        } else if (isDiff) {
          localUpdatedBookmarks++;
        }
      }
    }

    for (const remoteB of remoteBmList) {
      const localB = localBmMap.get(String(remoteB.id));
      if (!localB) {
        cloudOnlyBookmarks++;
      } else {
        const localTime = getEntityTimestampMs(localB);
        const remoteTime = getEntityTimestampMs(remoteB);
        const threshold =
          typeof localB.updatedAtMs === 'number' && typeof remoteB.updatedAtMs === 'number' ? 0 : 1000;
        if (remoteTime - localTime > threshold) {
          cloudUpdatedBookmarks++;
        }
      }
    }
  }

  // Compare Bookmark Categories
  if (bookmarkSyncArgs && Array.isArray(bookmarkSyncArgs.remoteBookmarkCategories)) {
    const localCatList = Array.isArray(bookmarkSyncArgs.localBookmarkCategories)
      ? bookmarkSyncArgs.localBookmarkCategories
      : [];
    const remoteCatList = bookmarkSyncArgs.remoteBookmarkCategories;
    const remoteCatMap = new Map(remoteCatList.map((c) => [String(c.id), c]));
    const localCatMap = new Map(localCatList.map((c) => [String(c.id), c]));

    for (const localC of localCatList) {
      const cid = String(localC.id);
      const remoteC = remoteCatMap.get(cid);
      if (!remoteC) {
        const tombMs = bookmarkSyncArgs.remoteDeletedBookmarkCategories?.[cid];
        const localTime = getEntityTimestampMs(localC);
        if (tombMs && (localTime === 0 || localTime <= tombMs)) {
          cloudUpdatedBookmarkCategories++;
        } else {
          localOnlyBookmarkCategories++;
        }
      } else {
        const isDiff =
          (localC.name || '') !== (remoteC.name || '') ||
          (localC.parentId || null) !== (remoteC.parentId || null) ||
          Number(localC.order || 0) !== Number(remoteC.order || 0) ||
          (localC.color || null) !== (remoteC.color || null);
        if (isDiff) {
          const localTime = getEntityTimestampMs(localC);
          const remoteTime = getEntityTimestampMs(remoteC);
          if (remoteTime > localTime + 1000) {
            cloudUpdatedBookmarkCategories++;
          } else {
            localUpdatedBookmarkCategories++;
          }
        }
      }
    }

    for (const remoteC of remoteCatList) {
      if (!localCatMap.has(String(remoteC.id))) {
        cloudOnlyBookmarkCategories++;
      }
    }
  }

  const totalDiff =
    localOnlyNotes +
    localUpdatedNotes +
    cloudOnlyNotes +
    cloudUpdatedNotes +
    localOnlyFolders +
    cloudOnlyFolders +
    localUpdatedFolders +
    cloudUpdatedFolders +
    localOnlyBookmarks +
    localUpdatedBookmarks +
    cloudOnlyBookmarks +
    cloudUpdatedBookmarks +
    localOnlyBookmarkCategories +
    localUpdatedBookmarkCategories +
    cloudOnlyBookmarkCategories +
    cloudUpdatedBookmarkCategories;

  return {
    localOnlyNotes,
    localUpdatedNotes,
    cloudOnlyNotes,
    cloudUpdatedNotes,
    localOnlyFolders,
    cloudOnlyFolders,
    localUpdatedFolders,
    cloudUpdatedFolders,
    localOnlyBookmarks,
    localUpdatedBookmarks,
    cloudOnlyBookmarks,
    cloudUpdatedBookmarks,
    localOnlyBookmarkCategories,
    localUpdatedBookmarkCategories,
    cloudOnlyBookmarkCategories,
    cloudUpdatedBookmarkCategories,
    totalDiff,
  };
}

// 4. Perform Two-Way Smart Merge Sync or Full Upload / Pull
export async function pushSyncToCloud(
  config: CloudConfig,
  localNotes: Note[],
  localFolders: Folder[],
  mode: 'merge' | 'push_all' | 'pull_all' = 'merge',
  options?: {
    deletedNoteIds?: string[];
    deletedFolderIds?: string[];
    frequentFolderIds?: string[];
    bookmarks?: Bookmark[];
    bookmarkCategories?: BookmarkCategory[];
    deletedBookmarkIds?: string[];
    deletedBookmarkCategoryIds?: string[];
  }
): Promise<{
  success: boolean;
  message: string;
  mergedNotes?: Note[];
  mergedFolders?: Folder[];
  mergedFrequentFolderIds?: string[];
  mergedBookmarks?: Bookmark[];
  mergedBookmarkCategories?: BookmarkCategory[];
  deletedNotes?: Record<string, number>;
  deletedFolders?: Record<string, number>;
  deletedBookmarks?: Record<string, number>;
  deletedBookmarkCategories?: Record<string, number>;
  serverTime?: number;
}> {
  const baseUrl = normalizeApiUrl(config.apiUrl);
  if (!baseUrl) {
    return { success: false, message: '未配置云端 API 地址' };
  }

  // Special optimization for pull_all
  if (mode === 'pull_all') {
    const remoteRes = await fetchRemoteData(config);
    if (remoteRes.success && remoteRes.data) {
      return {
        success: true,
        message: '已成功从云端拉取全量最新数据，已覆盖本地！',
        mergedNotes: remoteRes.data.notes,
        mergedFolders: remoteRes.data.folders,
        mergedFrequentFolderIds: remoteRes.data.frequentFolderIds,
        ...(remoteRes.data.bookmarks !== undefined ? { mergedBookmarks: remoteRes.data.bookmarks } : {}),
        ...(remoteRes.data.bookmarkCategories !== undefined
          ? { mergedBookmarkCategories: remoteRes.data.bookmarkCategories }
          : {}),
        deletedNotes: remoteRes.data.deletedNotes,
        deletedFolders: remoteRes.data.deletedFolders,
        deletedBookmarks: remoteRes.data.deletedBookmarks,
        deletedBookmarkCategories: remoteRes.data.deletedBookmarkCategories,
        serverTime: remoteRes.data.serverTime,
      };
    }
  }

  try {
    const urlsToTry = getActionCandidateUrls(baseUrl, 'sync', '/sync');

    const payload = {
      action: mode,
      mode,
      lastSyncedAt: config.lastSyncedAt || 0,
      notes: localNotes,
      folders: localFolders,
      frequentFolderIds: options?.frequentFolderIds || [],
      bookmarks: options?.bookmarks || [],
      bookmarkCategories: options?.bookmarkCategories || [],
      deletedNoteIds: options?.deletedNoteIds || [],
      deletedFolderIds: options?.deletedFolderIds || [],
      deletedBookmarkIds: options?.deletedBookmarkIds || [],
      deletedBookmarkCategoryIds: options?.deletedBookmarkCategoryIds || [],
      timestamp: Date.now(),
      clientTimeStr: formatLocalDateTime(),
    };

    let lastRes: Response | null = null;
    let matchedUrl = '';
    const headers = getHeaders(config);

    for (const url of urlsToTry) {
      try {
        const res = await fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
          },
          30000
        );
        if (res.ok || res.status === 401 || res.status === 403) {
          lastRes = res;
          matchedUrl = url;
          break;
        }
      } catch {}
    }

    if (!lastRes) {
      return { success: false, message: '无法连接到云端同步接口，请检查服务端地址' };
    }

    if (!lastRes.ok) {
      if (lastRes.status === 401 || lastRes.status === 403) {
        return { success: false, message: '认证失败：API Token 无效，请重新配置' };
      }
      return { success: false, message: `同步失败 (HTTP ${lastRes.status})` };
    }

    const result = await lastRes.json().catch(() => null);
    if (!result) {
      return { success: false, message: '服务端返回非有效 JSON 数据' };
    }

    const isSuccess = isResponseSuccessful(result, lastRes.ok);
    if (!isSuccess && !result.data && !result.notes) {
      return { success: false, message: extractResponseMessage(result, '服务端返回同步失败') };
    }

    recordSuccessfulEndpoint(baseUrl, 'sync', matchedUrl);

    const data = result.data || result;

    const rawNotesList = Array.isArray(data.notes)
      ? data.notes
      : Array.isArray(result.notes)
      ? result.notes
      : Array.isArray(data.mergedNotes)
      ? data.mergedNotes
      : Array.isArray(result.mergedNotes)
      ? result.mergedNotes
      : null;

    const rawFoldersList = Array.isArray(data.folders)
      ? data.folders
      : Array.isArray(result.folders)
      ? result.folders
      : Array.isArray(data.mergedFolders)
      ? data.mergedFolders
      : Array.isArray(result.mergedFolders)
      ? result.mergedFolders
      : null;

    const rawFrequentFolderIds: string[] | undefined = Array.isArray(data.frequentFolderIds)
      ? data.frequentFolderIds
      : Array.isArray(result.frequentFolderIds)
      ? result.frequentFolderIds
      : Array.isArray(data.frequentFolders)
      ? data.frequentFolders
      : Array.isArray(result.frequentFolders)
      ? result.frequentFolders
      : undefined;

    const rawBookmarksList = Array.isArray(data.bookmarks)
      ? data.bookmarks
      : Array.isArray(result.bookmarks)
      ? result.bookmarks
      : null;

    const rawBookmarkCategoriesList = Array.isArray(data.bookmarkCategories)
      ? data.bookmarkCategories
      : Array.isArray(result.bookmarkCategories)
      ? result.bookmarkCategories
      : null;

    const mergedNotes: Note[] = rawNotesList ? rawNotesList.map(normalizeRemoteNote) : localNotes;
    const mergedFolders: Folder[] = rawFoldersList
      ? rawFoldersList.map(normalizeRemoteFolder)
      : localFolders;
    const mergedFrequentFolderIds: string[] | undefined = rawFrequentFolderIds
      ? rawFrequentFolderIds.map(String)
      : options?.frequentFolderIds;
    const mergedBookmarks: Bookmark[] | undefined = rawBookmarksList
      ? rawBookmarksList.map(normalizeRemoteBookmark)
      : undefined;
    const mergedBookmarkCategories: BookmarkCategory[] | undefined = rawBookmarkCategoriesList
      ? rawBookmarkCategoriesList.map(normalizeRemoteBookmarkCategory)
      : undefined;

    const successMessage =
      mode === 'push_all'
        ? '本地数据已完全强制覆盖上传至云端服务器！'
        : mode === 'pull_all'
        ? '已成功从云端拉取覆盖本地数据！'
        : extractResponseMessage(result, '云端双向智能同步成功！');

    const deletedNotes = parseTombstoneMap(data.deletedNotes || result.deletedNotes);
    const deletedFolders = parseTombstoneMap(data.deletedFolders || result.deletedFolders);
    const deletedBookmarks = parseTombstoneMap(data.deletedBookmarks || result.deletedBookmarks);
    const deletedBookmarkCategories = parseTombstoneMap(
      data.deletedBookmarkCategories || result.deletedBookmarkCategories
    );

    return {
      success: true,
      message: successMessage,
      mergedNotes,
      mergedFolders,
      mergedFrequentFolderIds,
      ...(mergedBookmarks !== undefined ? { mergedBookmarks } : {}),
      ...(mergedBookmarkCategories !== undefined ? { mergedBookmarkCategories } : {}),
      ...(deletedNotes ? { deletedNotes } : {}),
      ...(deletedFolders ? { deletedFolders } : {}),
      ...(deletedBookmarks ? { deletedBookmarks } : {}),
      ...(deletedBookmarkCategories ? { deletedBookmarkCategories } : {}),
      serverTime: data.serverTime || result.serverTime || Date.now(),
    };
  } catch (err: any) {
    return {
      success: false,
      message: `网络同步请求失败: ${err.message || '连接错误'}`,
    };
  }
}

// 5. Incremental Sync: Save / Update Single Note
export async function saveSingleNoteToCloud(
  config: CloudConfig,
  note: Note
): Promise<{ success: boolean; message?: string }> {
  const baseUrl = normalizeApiUrl(config.apiUrl);
  if (!baseUrl) return { success: false, message: '未配置 API 地址' };

  try {
    const urls = getActionCandidateUrls(baseUrl, 'upsert_note', '/notes');
    const headers = getHeaders(config);

    for (const url of urls) {
      try {
        const res = await fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ note, action: 'upsert_note' }),
          },
          12000
        );

        if (res.ok) {
          const data = await res.json().catch(() => null);
          recordSuccessfulEndpoint(baseUrl, 'upsert_note', url);
          return {
            success: isResponseSuccessful(data, true),
            message: extractResponseMessage(data, '已增量同步至云端'),
          };
        }
      } catch {}
    }

    return { success: false, message: '单篇笔记同步未成功' };
  } catch (err: any) {
    return { success: false, message: `增量同步失败: ${err.message}` };
  }
}

// 6. Incremental Sync: Delete Single Note
export async function deleteSingleNoteFromCloud(
  config: CloudConfig,
  noteId: string
): Promise<{ success: boolean; message?: string }> {
  const baseUrl = normalizeApiUrl(config.apiUrl);
  if (!baseUrl) return { success: false, message: '未配置 API 地址' };

  try {
    const urls = getActionCandidateUrls(
      baseUrl,
      'delete_note',
      `/notes/${encodeURIComponent(noteId)}`
    );
    const headers = getHeaders(config);

    for (const url of urls) {
      try {
        const isQueryMode = url.includes('?action=') || url.includes('&action=');
        const fullUrl = isQueryMode
          ? `${url}&id=${encodeURIComponent(noteId)}`
          : url;

        const res = await fetchWithTimeout(
          fullUrl,
          {
            method: 'DELETE',
            headers,
            body: JSON.stringify({
              id: noteId,
              action: 'delete_note',
              timestamp: Date.now(),
              deletedAt: formatLocalDateTime(),
            }),
          },
          12000
        );

        if (res.ok) {
          const data = await res.json().catch(() => null);
          recordSuccessfulEndpoint(baseUrl, 'delete_note', url);
          return {
            success: isResponseSuccessful(data, true),
            message: extractResponseMessage(data, '云端已删除'),
          };
        }
      } catch {}
    }

    return { success: false, message: '云端删除未成功' };
  } catch (err: any) {
    return { success: false, message: `删除同步失败: ${err.message}` };
  }
}

// 6.1. Empty Trash on Cloud
export async function emptyTrashOnCloud(
  config: CloudConfig,
  noteIds?: string[]
): Promise<{ success: boolean; message?: string; deletedCount?: number }> {
  const baseUrl = normalizeApiUrl(config.apiUrl);
  if (!baseUrl) return { success: false, message: '未配置 API 地址' };

  try {
    const urls = getActionCandidateUrls(baseUrl, 'empty_trash', '/trash/empty');
    const headers = getHeaders(config);
    const payload = {
      action: 'empty_trash',
      noteIds: noteIds || [],
      timestamp: Date.now(),
      deletedAt: formatLocalDateTime(),
    };

    for (const url of urls) {
      try {
        const res = await fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
          },
          15000
        );

        if (res.ok) {
          const data = await res.json().catch(() => null);
          recordSuccessfulEndpoint(baseUrl, 'empty_trash', url);
          return {
            success: isResponseSuccessful(data, true),
            message: extractResponseMessage(data, '云端回收站已清空'),
            deletedCount: data?.data?.deletedCount ?? noteIds?.length,
          };
        }
      } catch {}
    }

    // Fallback: delete notes individually
    if (noteIds && noteIds.length > 0) {
      let failCount = 0;
      await Promise.all(
        noteIds.map((id) =>
          deleteSingleNoteFromCloud(config, id)
            .then((r) => {
              if (!r.success) failCount++;
            })
            .catch(() => {
              failCount++;
            })
        )
      );
      if (failCount === 0) {
        return { success: true, message: '云端回收站已成功清空', deletedCount: noteIds.length };
      }
    }

    return { success: false, message: '清空云端回收站接口未响应' };
  } catch (err: any) {
    return { success: false, message: `清空云端回收站失败: ${err.message}` };
  }
}

// 7. Incremental Sync: Save / Update Single Folder
export async function saveSingleFolderToCloud(
  config: CloudConfig,
  folder: Folder
): Promise<{ success: boolean; message?: string }> {
  return saveFoldersToCloud(config, [folder]);
}

// 7.1. Batch / Group Sync: Save Multiple Folders to Cloud (Preserves all orders)
export async function saveFoldersToCloud(
  config: CloudConfig,
  folders: Folder[]
): Promise<{ success: boolean; message?: string }> {
  const baseUrl = normalizeApiUrl(config.apiUrl);
  if (!baseUrl) return { success: false, message: '未配置 API 地址' };
  if (!folders || folders.length === 0) return { success: true };

  try {
    const urls = getActionCandidateUrls(baseUrl, 'upsert_folder', '/folders');
    const headers = getHeaders(config);

    const payload = {
      folders,
      folder: folders[0],
      action: 'upsert_folder',
    };

    for (const url of urls) {
      try {
        const res = await fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
          },
          12000
        );

        if (res.ok) {
          const data = await res.json().catch(() => null);
          recordSuccessfulEndpoint(baseUrl, 'upsert_folder', url);
          return {
            success: isResponseSuccessful(data, true),
            message: extractResponseMessage(data, '文件夹排序及结构已同步至云端'),
          };
        }
      } catch {}
    }

    return { success: false, message: '文件夹同步未成功' };
  } catch (err: any) {
    return { success: false, message: `文件夹同步失败: ${err.message}` };
  }
}

// 8. Incremental Sync: Delete Single Folder
export async function deleteSingleFolderFromCloud(
  config: CloudConfig,
  folderId: string
): Promise<{ success: boolean; message?: string }> {
  const baseUrl = normalizeApiUrl(config.apiUrl);
  if (!baseUrl) return { success: false, message: '未配置 API 地址' };

  try {
    const urls = getActionCandidateUrls(
      baseUrl,
      'delete_folder',
      `/folders/${encodeURIComponent(folderId)}`
    );
    const headers = getHeaders(config);

    for (const url of urls) {
      try {
        const isQueryMode = url.includes('?action=') || url.includes('&action=');
        const fullUrl = isQueryMode
          ? `${url}&id=${encodeURIComponent(folderId)}`
          : url;

        const res = await fetchWithTimeout(
          fullUrl,
          {
            method: 'DELETE',
            headers,
            body: JSON.stringify({
              id: folderId,
              action: 'delete_folder',
              timestamp: Date.now(),
              deletedAt: formatLocalDateTime(),
            }),
          },
          12000
        );

        if (res.ok) {
          const data = await res.json().catch(() => null);
          recordSuccessfulEndpoint(baseUrl, 'delete_folder', url);
          return {
            success: isResponseSuccessful(data, true),
            message: extractResponseMessage(data, '云端文件夹已删除'),
          };
        }
      } catch {}
    }

    return { success: false, message: '云端文件夹删除未成功' };
  } catch (err: any) {
    return { success: false, message: `删除文件夹同步失败: ${err.message}` };
  }
}

// 9. Incremental / Batch Sync: Save Frequent Folders Order & List to Cloud
export async function saveFrequentFoldersToCloud(
  config: CloudConfig,
  frequentFolderIds: string[]
): Promise<{ success: boolean; message?: string; frequentFolderIds?: string[] }> {
  const baseUrl = normalizeApiUrl(config.apiUrl);
  if (!baseUrl) return { success: false, message: '未配置 API 地址' };

  try {
    const urls = getActionCandidateUrls(
      baseUrl,
      'upsert_frequent_folders',
      '/frequent-folders'
    );
    const headers = getHeaders(config);
    const payload = {
      frequentFolderIds,
      ids: frequentFolderIds,
      action: 'update_frequent_folders',
    };

    for (const url of urls) {
      try {
        const res = await fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
          },
          12000
        );

        if (res.ok) {
          const data = await res.json().catch(() => null);
          recordSuccessfulEndpoint(baseUrl, 'upsert_frequent_folders', url);
          return {
            success: isResponseSuccessful(data, true),
            message: extractResponseMessage(data, '常用目录排序与列表已同步至云端'),
            frequentFolderIds: data?.data?.frequentFolderIds || data?.frequentFolderIds,
          };
        }
      } catch {}
    }

    return { success: false, message: '常用目录同步未成功' };
  } catch (err: any) {
    return { success: false, message: `常用目录同步失败: ${err.message}` };
  }
}

// 9.1 Incremental: Remove a single frequent folder from Cloud
export async function deleteFrequentFolderFromCloud(
  config: CloudConfig,
  folderId: string
): Promise<{ success: boolean; message?: string }> {
  const baseUrl = normalizeApiUrl(config.apiUrl);
  if (!baseUrl) return { success: false, message: '未配置 API 地址' };

  try {
    const urls = getActionCandidateUrls(
      baseUrl,
      'delete_frequent_folder',
      `/frequent-folders/${encodeURIComponent(folderId)}`
    );
    const headers = getHeaders(config);

    for (const url of urls) {
      try {
        const isQueryMode = url.includes('?action=') || url.includes('&action=');
        const fullUrl = isQueryMode
          ? `${url}&id=${encodeURIComponent(folderId)}`
          : url;

        const res = await fetchWithTimeout(
          fullUrl,
          {
            method: 'DELETE',
            headers,
            body: JSON.stringify({ id: folderId, folderId, action: 'delete_frequent_folder' }),
          },
          12000
        );

        if (res.ok) {
          const data = await res.json().catch(() => null);
          recordSuccessfulEndpoint(baseUrl, 'delete_frequent_folder', url);
          return {
            success: isResponseSuccessful(data, true),
            message: extractResponseMessage(data, '常用目录已从云端移除'),
          };
        }
      } catch {}
    }

    return { success: false, message: '云端移除常用目录未成功' };
  } catch (err: any) {
    return { success: false, message: `移除常用目录同步失败: ${err.message}` };
  }
}

// 10. Incremental Sync: Save / Update Single or Batch Bookmarks
export async function saveBookmarksToCloud(
  config: CloudConfig,
  bookmarks: Bookmark[]
): Promise<{ success: boolean; message?: string }> {
  const baseUrl = normalizeApiUrl(config.apiUrl);
  if (!baseUrl) return { success: false, message: '未配置 API 地址' };
  if (!bookmarks || bookmarks.length === 0) return { success: true };

  try {
    const urls = getActionCandidateUrls(baseUrl, 'upsert_bookmark', '/bookmarks');
    const headers = getHeaders(config);
    const payload = {
      bookmarks,
      bookmark: bookmarks[0],
      action: 'upsert_bookmark',
    };

    for (const url of urls) {
      try {
        const res = await fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
          },
          12000
        );
        if (res.ok) {
          const data = await res.json().catch(() => null);
          recordSuccessfulEndpoint(baseUrl, 'upsert_bookmark', url);
          return {
            success: isResponseSuccessful(data, true),
            message: extractResponseMessage(data, '书签已同步至云端'),
          };
        }
      } catch {}
    }

    return { success: false, message: '书签同步未成功' };
  } catch (err: any) {
    return { success: false, message: `书签同步失败: ${err.message}` };
  }
}

// 11. Incremental Sync: Permanently Delete Single Bookmark (Direct delete + tombstone)
export async function deleteSingleBookmarkFromCloud(
  config: CloudConfig,
  bookmarkId: string
): Promise<{ success: boolean; message?: string }> {
  const baseUrl = normalizeApiUrl(config.apiUrl);
  if (!baseUrl) return { success: false, message: '未配置 API 地址' };

  try {
    const urls = getActionCandidateUrls(
      baseUrl,
      'delete_bookmark',
      `/bookmarks/${encodeURIComponent(bookmarkId)}`
    );
    const headers = getHeaders(config);

    for (const url of urls) {
      try {
        const isQueryMode = url.includes('?action=') || url.includes('&action=');
        const fullUrl = isQueryMode ? `${url}&id=${encodeURIComponent(bookmarkId)}` : url;

        const res = await fetchWithTimeout(
          fullUrl,
          {
            method: 'DELETE',
            headers,
            body: JSON.stringify({
              id: bookmarkId,
              action: 'delete_bookmark',
              timestamp: Date.now(),
              deletedAt: formatLocalDateTime(),
            }),
          },
          12000
        );

        if (res.ok) {
          const data = await res.json().catch(() => null);
          recordSuccessfulEndpoint(baseUrl, 'delete_bookmark', url);
          return {
            success: isResponseSuccessful(data, true),
            message: extractResponseMessage(data, '云端书签已删除'),
          };
        }
      } catch {}
    }

    return { success: false, message: '云端书签删除未成功' };
  } catch (err: any) {
    return { success: false, message: `删除书签同步失败: ${err.message}` };
  }
}

// 12. Incremental Sync: Save / Update Single or Batch Bookmark Categories
export async function saveBookmarkCategoriesToCloud(
  config: CloudConfig,
  categories: BookmarkCategory[]
): Promise<{ success: boolean; message?: string }> {
  const baseUrl = normalizeApiUrl(config.apiUrl);
  if (!baseUrl) return { success: false, message: '未配置 API 地址' };
  if (!categories || categories.length === 0) return { success: true };

  try {
    const urls = getActionCandidateUrls(baseUrl, 'upsert_bookmark_category', '/bookmark-categories');
    const headers = getHeaders(config);
    const payload = {
      categories,
      category: categories[0],
      action: 'upsert_bookmark_category',
    };

    for (const url of urls) {
      try {
        const res = await fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
          },
          12000
        );
        if (res.ok) {
          const data = await res.json().catch(() => null);
          recordSuccessfulEndpoint(baseUrl, 'upsert_bookmark_category', url);
          return {
            success: isResponseSuccessful(data, true),
            message: extractResponseMessage(data, '书签分类已同步至云端'),
          };
        }
      } catch {}
    }

    return { success: false, message: '书签分类同步未成功' };
  } catch (err: any) {
    return { success: false, message: `书签分类同步失败: ${err.message}` };
  }
}

// 13. Incremental Sync: Permanently Delete Single Bookmark Category
export async function deleteSingleBookmarkCategoryFromCloud(
  config: CloudConfig,
  categoryId: string
): Promise<{ success: boolean; message?: string }> {
  const baseUrl = normalizeApiUrl(config.apiUrl);
  if (!baseUrl) return { success: false, message: '未配置 API 地址' };

  try {
    const urls = getActionCandidateUrls(
      baseUrl,
      'delete_bookmark_category',
      `/bookmark-categories/${encodeURIComponent(categoryId)}`
    );
    const headers = getHeaders(config);

    for (const url of urls) {
      try {
        const isQueryMode = url.includes('?action=') || url.includes('&action=');
        const fullUrl = isQueryMode ? `${url}&id=${encodeURIComponent(categoryId)}` : url;

        const res = await fetchWithTimeout(
          fullUrl,
          {
            method: 'DELETE',
            headers,
            body: JSON.stringify({
              id: categoryId,
              action: 'delete_bookmark_category',
              timestamp: Date.now(),
              deletedAt: formatLocalDateTime(),
            }),
          },
          12000
        );

        if (res.ok) {
          const data = await res.json().catch(() => null);
          recordSuccessfulEndpoint(baseUrl, 'delete_bookmark_category', url);
          return {
            success: isResponseSuccessful(data, true),
            message: extractResponseMessage(data, '云端书签分类已删除'),
          };
        }
      } catch {}
    }

    return { success: false, message: '云端书签分类删除未成功' };
  } catch (err: any) {
    return { success: false, message: `删除书签分类同步失败: ${err.message}` };
  }
}


