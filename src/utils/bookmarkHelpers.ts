/**
 * Safe URL normalization, automatic favicon resolution, and domain badge utilities for website bookmarks.
 */

export function normalizeBookmarkUrl(raw: string): { valid: boolean; url: string; error?: string } {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    return { valid: false, url: '', error: '请输入有效的网站链接' };
  }

  // Block dangerous schemes explicitly before prepending https://
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) {
    return { valid: false, url: '', error: '仅支持 http:// 或 https:// 协议的安全网址' };
  }

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, url: '', error: '仅支持 http:// 或 https:// 协议的网址' };
    }
    if (!parsed.hostname || (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost')) {
      return { valid: false, url: '', error: '网址域名格式不正确，例如 https://example.com' };
    }
    return { valid: true, url: parsed.toString() };
  } catch {
    return { valid: false, url: '', error: '网址格式无效，请检查后重试' };
  }
}

export function extractBookmarkHost(url: string): string {
  try {
    const parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return (url || '').replace(/^https?:\/\//i, '').split('/')[0] || '';
  }
}

export function deriveTitleFromUrl(url: string): string {
  const host = extractBookmarkHost(url);
  if (!host) return '未命名书签';
  const parts = host.split('.');
  const core = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  if (!core) return host;
  return core.charAt(0).toUpperCase() + core.slice(1);
}

export function isPrivateOrLocalHostname(hostname: string): boolean {
  const lower = (hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (
    !lower ||
    lower === 'localhost' ||
    lower === '::1' ||
    lower === '0.0.0.0' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal') ||
    lower.endsWith('.localhost')
  ) {
    return true;
  }
  if (/^127\./.test(lower) || /^10\./.test(lower) || /^192\.168\./.test(lower) || /^169\.254\./.test(lower)) {
    return true;
  }
  const m172 = lower.match(/^172\.(\d+)\./);
  if (m172) {
    const second = Number(m172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

/**
 * Returns the standard target-site favicon URL (e.g. https://example.com/favicon.ico).
 */
export function getDefaultFaviconUrl(url: string): string {
  const check = normalizeBookmarkUrl(url);
  if (!check.valid) return '';
  try {
    const parsed = new URL(check.url);
    return `${parsed.origin}/favicon.ico`;
  } catch {
    return '';
  }
}

/**
 * Builds an ordered, deduplicated list of favicon URLs to try for a bookmark,
 * falling back gracefully before switching to the local letter badge.
 */
export function getBookmarkIconCandidates(url: string, primaryIconUrl?: string): string[] {
  const candidates: string[] = [];
  const pushUnique = (u: string) => {
    const trimmed = (u || '').trim();
    if (!trimmed) return;
    if (!/^https?:\/\//i.test(trimmed)) return;
    if (!candidates.includes(trimmed)) {
      candidates.push(trimmed);
    }
  };

  if (primaryIconUrl) {
    const checkPrimary = normalizeBookmarkUrl(primaryIconUrl);
    if (checkPrimary.valid) {
      pushUnique(checkPrimary.url);
    }
  }

  const checkUrl = normalizeBookmarkUrl(url);
  if (checkUrl.valid) {
    try {
      const parsed = new URL(checkUrl.url);
      pushUnique(`${parsed.origin}/favicon.ico`);
      if (!isPrivateOrLocalHostname(parsed.hostname)) {
        pushUnique(
          `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=64`
        );
        pushUnique(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(parsed.hostname)}.ico`);
      }
    } catch {
      // ignore invalid URL
    }
  }

  return candidates;
}

/**
 * Queries the backend metadata endpoint to parse the target page's <link rel="icon"> and <title>,
 * gracefully falling back to `${origin}/favicon.ico` when unavailable.
 */
export async function fetchTargetSiteMetadata(
  rawUrl: string,
  signal?: AbortSignal
): Promise<{ iconUrl: string; title?: string; resolvedFromHtml: boolean }> {
  const normalized = normalizeBookmarkUrl(rawUrl);
  if (!normalized.valid) {
    return { iconUrl: '', resolvedFromHtml: false };
  }

  const defaultIcon = getDefaultFaviconUrl(normalized.url);
  try {
    const parsed = new URL(normalized.url);
    if (isPrivateOrLocalHostname(parsed.hostname)) {
      return { iconUrl: defaultIcon, resolvedFromHtml: false };
    }
  } catch {
    return { iconUrl: defaultIcon, resolvedFromHtml: false };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4500);

  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeoutId);
      return { iconUrl: defaultIcon, resolvedFromHtml: false };
    }
    signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    const resp = await fetch(
      `/api/bookmark-favicon?url=${encodeURIComponent(normalized.url)}`,
      {
        method: 'GET',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      }
    );
    if (!resp.ok) {
      return { iconUrl: defaultIcon, resolvedFromHtml: false };
    }
    const json = await resp.json();
    const resolvedIcon =
      typeof json?.data?.iconUrl === 'string' && json.data.iconUrl.trim()
        ? json.data.iconUrl.trim()
        : defaultIcon;
    const resolvedTitle =
      typeof json?.data?.title === 'string' && json.data.title.trim()
        ? json.data.title.trim()
        : undefined;
    return {
      iconUrl: resolvedIcon,
      title: resolvedTitle,
      resolvedFromHtml: Boolean(json?.data?.resolvedFromHtml),
    };
  } catch {
    return { iconUrl: defaultIcon, resolvedFromHtml: false };
  } finally {
    clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener('abort', onExternalAbort);
    }
  }
}

const BADGE_PALETTES = [
  { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-100' },
  { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-100' },
  { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100' },
  { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-100' },
  { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-100' },
  { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
  { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-100' },
  { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-100' },
];

export function getBookmarkBadgeInfo(url: string, title?: string): {
  letter: string;
  bg: string;
  text: string;
  border: string;
} {
  const host = extractBookmarkHost(url);
  const seed = (host || title || 'B').toLowerCase();
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const palette = BADGE_PALETTES[hash % BADGE_PALETTES.length];
  const rawChar = (host || title || 'W').trim().charAt(0).toUpperCase();
  return {
    letter: rawChar || 'W',
    ...palette,
  };
}

export const BOOKMARK_CATEGORY_COLORS = [
  '#2563eb',
  '#0d9488',
  '#d97706',
  '#4f46e5',
  '#059669',
  '#e11d48',
  '#475569',
];
