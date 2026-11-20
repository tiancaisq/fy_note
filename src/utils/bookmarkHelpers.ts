/**
 * Safe URL normalization and domain badge utilities for website bookmarks.
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
    if (!parsed.hostname || !parsed.hostname.includes('.') && parsed.hostname !== 'localhost') {
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
