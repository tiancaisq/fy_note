import JSZip from 'jszip';

export interface KityMinderNode {
  data: {
    id?: string;
    text: string;
    note?: string;
    hyperlink?: string;
    hyperlinkTitle?: string;
    priority?: number;
    progress?: number;
    expandState?: 'expand' | 'collapse';
  };
  children: KityMinderNode[];
}

export interface KityMinderData {
  root: KityMinderNode;
  template?: string;
  theme?: string;
}

// XMind Progress Marker ID mapping
const KM_TO_XMIND_PROGRESS: Record<number, string> = {
  1: 'task-oct',
  2: 'task-quarter',
  3: 'task-3oct',
  4: 'task-half',
  5: 'task-5oct',
  6: 'task-3quat',
  7: 'task-7oct',
  8: 'task-done',
};

const XMIND_TO_KM_PROGRESS: Record<string, number> = {
  'task-start': 1,
  'task-oct': 1,
  'task-quarter': 2,
  'task-3oct': 3,
  'task-half': 4,
  'task-5oct': 5,
  'task-3quat': 6,
  'task-7oct': 7,
  'task-done': 8,
};

function generateId(): string {
  return 'id_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

/**
 * Convert KityMinder Tree Node into XMind Topic JSON Object
 */
function kmNodeToXMindTopic(node: KityMinderNode, isRoot: boolean = false): any {
  const data = node.data || { text: '未命名主题' };
  const topic: any = {
    id: data.id || generateId(),
    title: data.text || '未命名主题',
  };

  if (isRoot) {
    topic.structureClass = 'org.xmind.ui.map.unbalanced';
  }

  // Note
  if (data.note) {
    topic.notes = {
      plain: {
        content: data.note,
      },
    };
  }

  // Hyperlink
  if (data.hyperlink) {
    topic.href = data.hyperlink;
  }

  // Markers: Priority & Progress
  const markers: { markerId: string }[] = [];
  if (data.priority && data.priority >= 1 && data.priority <= 9) {
    markers.push({ markerId: `priority-${data.priority}` });
  }
  if (data.progress && KM_TO_XMIND_PROGRESS[data.progress]) {
    markers.push({ markerId: KM_TO_XMIND_PROGRESS[data.progress] });
  }
  if (markers.length > 0) {
    topic.markers = markers;
  }

  // Children
  if (node.children && node.children.length > 0) {
    topic.children = {
      attached: node.children.map((child) => kmNodeToXMindTopic(child, false)),
    };
  }

  return topic;
}

/**
 * Export KityMinder data to .xmind file (ZIP archive containing content.json & manifest.json)
 */
export async function exportToXMind(mindData: KityMinderData | { root: any }, fileName: string = '思维导图'): Promise<void> {
  if (!mindData || !mindData.root) {
    throw new Error('导图数据为空，无法导出');
  }

  const rootTopic = kmNodeToXMindTopic(mindData.root, true);
  const sheetTitle = (mindData.root?.data?.text || '画布 1').substring(0, 30);

  const xmindContent = [
    {
      id: generateId(),
      class: 'sheet',
      title: sheetTitle,
      rootTopic,
      theme: {
        id: 'theme_' + generateId(),
      },
    },
  ];

  const manifest = {
    'file-entries': {
      'content.json': {},
      'metadata.json': {},
    },
  };

  const metadata = {
    creator: {
      name: 'AI MindMap Editor',
      version: '1.0.0',
    },
  };

  const zip = new JSZip();
  zip.file('content.json', JSON.stringify(xmindContent, null, 2));
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('metadata.json', JSON.stringify(metadata, null, 2));

  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.xmind.workbook',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  // Trigger browser download
  const cleanFileName = fileName.endsWith('.xmind') ? fileName : `${fileName}.xmind`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = cleanFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Convert XMind Topic JSON Object into KityMinder Tree Node
 */
function xmindTopicToKmNode(topic: any): KityMinderNode {
  if (!topic) {
    return {
      data: { text: '中心主题', id: generateId() },
      children: [],
    };
  }

  const data: KityMinderNode['data'] = {
    id: topic.id || generateId(),
    text: topic.title || '分支主题',
  };

  // Note extraction (plain or realHTML or notes string)
  if (topic.notes) {
    if (typeof topic.notes === 'string') {
      data.note = topic.notes;
    } else if (topic.notes.plain?.content) {
      data.note = topic.notes.plain.content;
    } else if (topic.notes.realHTML?.content) {
      data.note = topic.notes.realHTML.content.replace(/<[^>]+>/g, '').trim();
    }
  }

  // Hyperlink
  if (topic.href) {
    data.hyperlink = topic.href;
  }

  // Markers (Priority, Progress)
  if (Array.isArray(topic.markers)) {
    for (const m of topic.markers) {
      const markerId = (m.markerId || m.id || '').toString();
      // Priority (priority-1 to priority-9)
      const pMatch = markerId.match(/priority-(\d)/i);
      if (pMatch) {
        data.priority = parseInt(pMatch[1], 10);
      }
      // Progress
      if (XMIND_TO_KM_PROGRESS[markerId]) {
        data.progress = XMIND_TO_KM_PROGRESS[markerId];
      }
    }
  }

  // Children: attached / detached
  const children: KityMinderNode[] = [];
  const attached = topic.children?.attached || topic.children?.topics || topic.children;
  if (Array.isArray(attached)) {
    for (const child of attached) {
      children.push(xmindTopicToKmNode(child));
    }
  }

  return {
    data,
    children,
  };
}

/**
 * Parse legacy XMind XML format (content.xml)
 */
function parseXMindXml(xmlString: string): KityMinderData {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');
  const rootTopicEl = doc.querySelector('sheet > topic, root-topic, topic');

  function parseTopicEl(el: Element): KityMinderNode {
    const titleEl = el.querySelector(':scope > title');
    const text = titleEl?.textContent || el.getAttribute('title') || '分支主题';
    const id = el.getAttribute('id') || generateId();

    const data: KityMinderNode['data'] = {
      id,
      text,
    };

    // Note
    const noteEl = el.querySelector(':scope > notes > plain, :scope > notes');
    if (noteEl?.textContent) {
      data.note = noteEl.textContent.trim();
    }

    // Hyperlink
    const href = el.getAttribute('xlink:href') || el.getAttribute('href');
    if (href) {
      data.hyperlink = href;
    }

    // Markers
    const markerEls = el.querySelectorAll(':scope > marker-refs > marker-ref, :scope > marker-ref');
    markerEls.forEach((m) => {
      const mid = m.getAttribute('marker-id') || '';
      const pMatch = mid.match(/priority-(\d)/i);
      if (pMatch) {
        data.priority = parseInt(pMatch[1], 10);
      }
      if (XMIND_TO_KM_PROGRESS[mid]) {
        data.progress = XMIND_TO_KM_PROGRESS[mid];
      }
    });

    // Children
    const children: KityMinderNode[] = [];
    const childTopicEls = el.querySelectorAll(':scope > children > topics > topic, :scope > children > topic');
    childTopicEls.forEach((childEl) => {
      children.push(parseTopicEl(childEl));
    });

    return { data, children };
  }

  if (rootTopicEl) {
    return {
      root: parseTopicEl(rootTopicEl),
      template: 'default',
      theme: 'fresh-green',
    };
  }

  return {
    root: {
      data: { text: '中心主题', id: generateId() },
      children: [],
    },
  };
}

/**
 * Import and parse .xmind file (ZIP archive with content.json or content.xml)
 */
export async function importFromXMind(file: File | Blob): Promise<KityMinderData> {
  const zip = await JSZip.loadAsync(file);

  // 1. Try modern XMind content.json
  const contentJsonFile = zip.file('content.json');
  if (contentJsonFile) {
    const text = await contentJsonFile.async('text');
    const json = JSON.parse(text);
    const sheet = Array.isArray(json) ? json[0] : json;
    const rootTopic = sheet?.rootTopic || sheet?.topic || sheet;
    const rootNode = xmindTopicToKmNode(rootTopic);
    return {
      root: rootNode,
      template: 'default',
      theme: 'fresh-green',
    };
  }

  // 2. Try legacy XMind 8 content.xml
  const contentXmlFile = zip.file('content.xml');
  if (contentXmlFile) {
    const xmlText = await contentXmlFile.async('text');
    return parseXMindXml(xmlText);
  }

  throw new Error('未在 XMind 文件中找到有效的 content.json 或 content.xml 结构');
}
