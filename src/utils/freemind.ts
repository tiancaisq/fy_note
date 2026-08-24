import { KityMinderData, KityMinderNode } from './xmind';

function generateId(): string {
  return 'id_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function extractRichContentText(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  clone.querySelectorAll('p').forEach((p) => {
    p.prepend(document.createTextNode('\n'));
  });
  return (clone.textContent || '').replace(/^\n+/, '').replace(/\n+$/, '').trim();
}

/**
 * Pre-process and sanitize FreeMind XML string to handle unescaped characters like unescaped '&', control characters, etc.
 */
function sanitizeXml(xml: string): string {
  if (!xml) return '';
  // 1. Remove BOM and trim
  let clean = xml.replace(/^\uFEFF/, '').trim();

  // 2. Remove illegal XML control characters (0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F)
  clean = clean.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  // 3. Fix unescaped ampersands: replace '&' that are NOT part of valid XML entities
  clean = clean.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');

  return clean;
}

/**
 * Fallback parser using lenient DOM or regex if standard XML parser fails
 */
function parseFreeMindFallback(xmlString: string): KityMinderData {
  const sanitized = sanitizeXml(xmlString);
  
  // Try DOMParser with text/html which is extremely fault-tolerant
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(sanitized, 'text/html');
    const rootNodeEl = doc.querySelector('node');
    if (rootNodeEl) {
      return parseFromDomElement(rootNodeEl);
    }
  } catch (e) {
    console.warn('HTML parser fallback failed, trying regex fallback', e);
  }

  // Regex-based tag scanner fallback
  return parseFreeMindByRegex(sanitized);
}

function parseFromDomElement(rootNodeEl: Element): KityMinderData {
  function parseNode(nodeEl: Element): KityMinderNode {
    let text = nodeEl.getAttribute('TEXT') || nodeEl.getAttribute('text') || '';

    if (!text) {
      const richNode = nodeEl.querySelector(
        ':scope > richcontent[TYPE="NODE"], :scope > richcontent[type="NODE"], :scope > richcontent[type="node"]'
      );
      if (richNode) {
        text = extractRichContentText(richNode);
      }
    }
    if (!text) {
      text = '分支主题';
    }

    const id = nodeEl.getAttribute('ID') || nodeEl.getAttribute('id') || generateId();
    const data: KityMinderNode['data'] = {
      id,
      text,
    };

    const folded = nodeEl.getAttribute('FOLDED') || nodeEl.getAttribute('folded');
    if (folded === 'true') {
      data.expandState = 'collapse';
    } else if (folded === 'false') {
      data.expandState = 'expand';
    }

    const link = nodeEl.getAttribute('LINK') || nodeEl.getAttribute('link') || nodeEl.getAttribute('href');
    if (link) {
      data.hyperlink = link;
    }

    const richNote = nodeEl.querySelector(
      ':scope > richcontent[TYPE="NOTE"], :scope > richcontent[type="NOTE"], :scope > richcontent[type="note"]'
    );
    if (richNote) {
      const noteText = extractRichContentText(richNote);
      if (noteText) data.note = noteText;
    }

    const icons = nodeEl.querySelectorAll(':scope > icon');
    icons.forEach((iconEl) => {
      const builtin = (iconEl.getAttribute('BUILTIN') || iconEl.getAttribute('builtin') || '').toLowerCase();
      const pMatch = builtin.match(/(?:full-|priority-|number-|^)(\d)$/);
      if (pMatch) {
        const val = parseInt(pMatch[1], 10);
        if (val >= 1 && val <= 9) data.priority = val;
      }
      if (builtin === '0%' || builtin === 'task-0') data.progress = 1;
      else if (builtin === '25%' || builtin === 'task-25') data.progress = 3;
      else if (builtin === '50%' || builtin === 'task-50') data.progress = 5;
      else if (builtin === '75%' || builtin === 'task-75') data.progress = 7;
      else if (builtin === '100%' || builtin === 'button_ok' || builtin === 'checked' || builtin === 'yes') {
        data.progress = 9;
      }
    });

    const children: KityMinderNode[] = [];
    const childNodeEls = nodeEl.querySelectorAll(':scope > node');
    childNodeEls.forEach((childEl) => {
      children.push(parseNode(childEl));
    });

    return { data, children };
  }

  const root = parseNode(rootNodeEl);
  if (!root.data.text || root.data.text === '分支主题') {
    root.data.text = '中心主题';
  }

  return {
    root,
    template: 'default',
    theme: 'fresh-green',
  };
}

/**
 * Regex-based parser for FreeMind node hierarchy when DOM parsing completely fails
 */
function parseFreeMindByRegex(xml: string): KityMinderData {
  interface RawNode {
    id: string;
    text: string;
    folded?: boolean;
    link?: string;
    children: RawNode[];
  }

  const rootNode: RawNode = {
    id: generateId(),
    text: '中心主题',
    children: [],
  };

  const stack: RawNode[] = [];
  const tagRegex = /<(\/)?(node|map)\b([^>]*)(\/?)>/gi;
  let match;

  while ((match = tagRegex.exec(xml)) !== null) {
    const isClosing = match[1] === '/';
    const tagName = match[2].toLowerCase();
    const attrsStr = match[3];
    const isSelfClosing = match[4] === '/';

    if (tagName === 'map') continue;

    if (isClosing) {
      if (stack.length > 1) {
        stack.pop();
      }
    } else {
      const textMatch = attrsStr.match(/TEXT\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
      const idMatch = attrsStr.match(/ID\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
      const foldedMatch = attrsStr.match(/FOLDED\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
      const linkMatch = attrsStr.match(/LINK\s*=\s*(?:"([^"]*)"|'([^']*)')/i);

      let text = textMatch ? (textMatch[1] || textMatch[2] || '') : '分支主题';
      // Decode basic entities
      text = text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");

      const currNode: RawNode = {
        id: (idMatch ? (idMatch[1] || idMatch[2]) : generateId()) || generateId(),
        text: text || '分支主题',
        folded: foldedMatch ? (foldedMatch[1] || foldedMatch[2]) === 'true' : false,
        link: linkMatch ? (linkMatch[1] || linkMatch[2]) : undefined,
        children: [],
      };

      if (stack.length === 0) {
        rootNode.id = currNode.id;
        rootNode.text = currNode.text;
        rootNode.folded = currNode.folded;
        rootNode.link = currNode.link;
        if (!isSelfClosing) {
          stack.push(rootNode);
        }
      } else {
        const parent = stack[stack.length - 1];
        parent.children.push(currNode);
        if (!isSelfClosing) {
          stack.push(currNode);
        }
      }
    }
  }

  function convertRawToKityMinder(raw: RawNode): KityMinderNode {
    const data: KityMinderNode['data'] = {
      id: raw.id,
      text: raw.text,
      expandState: raw.folded ? 'collapse' : undefined,
      hyperlink: raw.link,
    };
    return {
      data,
      children: raw.children.map(convertRawToKityMinder),
    };
  }

  return {
    root: convertRawToKityMinder(rootNode),
    template: 'default',
    theme: 'fresh-green',
  };
}

/**
 * Parse FreeMind (.mm) XML string to KityMinder Data Structure
 */
export function parseFreeMindXml(xmlString: string): KityMinderData {
  if (!xmlString || typeof xmlString !== 'string') {
    throw new Error('FreeMind 内容为空，无法解析');
  }

  const sanitized = sanitizeXml(xmlString);

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(sanitized, 'text/xml');

    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      return parseFreeMindFallback(xmlString);
    }

    const mapEl = doc.querySelector('map');
    const rootNodeEl = mapEl ? mapEl.querySelector(':scope > node') : doc.querySelector('node');

    if (!rootNodeEl) {
      return parseFreeMindFallback(xmlString);
    }

    return parseFromDomElement(rootNodeEl);
  } catch (err) {
    console.warn('XML DOMParser failed, using fallback parser', err);
    return parseFreeMindFallback(xmlString);
  }
}

/**
 * Import and parse FreeMind (.mm) file or string
 */
export async function importFromFreeMind(input: File | Blob | string): Promise<KityMinderData> {
  let xmlString = '';
  if (typeof input === 'string') {
    xmlString = input;
  } else {
    xmlString = await input.text();
  }
  return parseFreeMindXml(xmlString);
}

function nodeToFreeMindXml(node: KityMinderNode, isRoot: boolean = false, position?: string): string {
  const data = node.data || { text: '主题' };
  const id = escapeXml(data.id || generateId());
  const text = escapeXml(data.text || '主题');
  const folded = data.expandState === 'collapse' ? ' FOLDED="true"' : '';
  const link = data.hyperlink ? ` LINK="${escapeXml(data.hyperlink)}"` : '';
  const pos = position ? ` POSITION="${position}"` : '';

  let xml = `<node ID="${id}" TEXT="${text}"${pos}${folded}${link}>\n`;

  // Priority icon
  if (data.priority && data.priority >= 1 && data.priority <= 9) {
    xml += `  <icon BUILTIN="full-${data.priority}"/>\n`;
  }

  // Progress icon
  if (data.progress) {
    if (data.progress <= 1) xml += `  <icon BUILTIN="0%"/>\n`;
    else if (data.progress <= 3) xml += `  <icon BUILTIN="25%"/>\n`;
    else if (data.progress <= 5) xml += `  <icon BUILTIN="50%"/>\n`;
    else if (data.progress <= 7) xml += `  <icon BUILTIN="75%"/>\n`;
    else xml += `  <icon BUILTIN="button_ok"/>\n`;
  }

  // Note
  if (data.note) {
    const escapedNote = escapeXml(data.note).replace(/\n/g, '<br/>');
    xml += `  <richcontent TYPE="NOTE"><html><head/><body><p>${escapedNote}</p></body></html></richcontent>\n`;
  }

  // Children
  if (node.children && node.children.length > 0) {
    node.children.forEach((child, index) => {
      const childPos = isRoot ? (index % 2 === 0 ? 'right' : 'left') : undefined;
      xml += nodeToFreeMindXml(child, false, childPos);
    });
  }

  xml += `</node>\n`;
  return xml;
}

/**
 * Export KityMinder data as FreeMind (.mm) XML file
 */
export function exportToFreeMind(mindData: KityMinderData | { root: any }, fileName: string = '思维导图'): void {
  if (!mindData || !mindData.root) {
    throw new Error('导图数据为空，无法导出');
  }

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<map version="1.0.1">\n`;
  xml += `<!-- To view this file, download free mind mapping software FreeMind from http://freemind.sourceforge.net -->\n`;
  xml += nodeToFreeMindXml(mindData.root, true);
  xml += `</map>`;

  const blob = new Blob([xml], { type: 'application/x-freemind;charset=utf-8' });
  const cleanFileName = fileName.endsWith('.mm') ? fileName : `${fileName}.mm`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = cleanFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
