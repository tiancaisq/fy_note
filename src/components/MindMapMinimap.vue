<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { Map as MapIcon } from 'lucide-vue-next';

const props = withDefaults(
  defineProps<{
    minder: any;
    isOpen: boolean;
  }>(),
  {
    isOpen: true
  }
);

const emit = defineEmits<{
  (e: 'update:isOpen', val: boolean): void;
  (e: 'close'): void;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);

// Minimap Dimensions
const CANVAS_WIDTH = 230;
const CANVAS_HEIGHT = 150;

// Transform metrics cached for interactions
let currentScale = 1;
let currentOffsetX = 0;
let currentOffsetY = 0;
let currentViewBox: { x: number; y: number; width: number; height: number } | null = null;
let currentViewportRectOnCanvas = { x: 0, y: 0, width: 0, height: 0 };

// Interaction State
let isDraggingViewport = false;
let isInteracting = false;
let lastPointerPos = { x: 0, y: 0 };
const isHoveringViewport = ref(false);

// World to Minimap Canvas coordinate transformation
function worldToMini(wx: number, wy: number) {
  return {
    x: wx * currentScale + currentOffsetX,
    y: wy * currentScale + currentOffsetY
  };
}

// Minimap Canvas to World coordinate transformation
function miniToWorld(mx: number, my: number) {
  return {
    x: (mx - currentOffsetX) / currentScale,
    y: (my - currentOffsetY) / currentScale
  };
}

// Render the minimap content onto canvas
function renderMinimap() {
  const canvas = canvasRef.value;
  if (!canvas || !props.minder || !props.isOpen) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const minder = props.minder;
  const root = minder.getRoot ? minder.getRoot() : null;
  if (!root) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  // Handle HiDPI displays for ultra-crisp lines
  const dpr = window.devicePixelRatio || 1;
  const targetWidth = CANVAS_WIDTH;
  const targetHeight = CANVAS_HEIGHT;

  if (canvas.width !== targetWidth * dpr || canvas.height !== targetHeight * dpr) {
    canvas.width = targetWidth * dpr;
    canvas.height = targetHeight * dpr;
  }

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, targetWidth, targetHeight);

  // 1. Gather all visible nodes and their layout bounding boxes
  const visibleNodes: Array<{
    node: any;
    box: { x: number; y: number; width: number; height: number; cx: number; cy: number };
    parentBox?: { cx: number; cy: number };
    level: number;
    isSelected: boolean;
  }> = [];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function traverseNode(node: any, level = 0, parentBox?: { cx: number; cy: number }) {
    if (!node) return;

    let box = node.getLayoutBox ? node.getLayoutBox() : null;
    if (!box || typeof box.x !== 'number' || isNaN(box.x) || box.width <= 0) {
      const renderContainer = node.getRenderContainer ? node.getRenderContainer() : null;
      if (renderContainer && renderContainer.getRenderBox) {
        box = renderContainer.getRenderBox();
      }
    }

    let nodeBoxFormatted: any = null;
    if (box && typeof box.x === 'number' && !isNaN(box.x)) {
      const cx = typeof box.cx === 'number' ? box.cx : box.x + box.width / 2;
      const cy = typeof box.cy === 'number' ? box.cy : box.y + box.height / 2;
      nodeBoxFormatted = {
        x: box.x,
        y: box.y,
        width: box.width || 40,
        height: box.height || 20,
        cx,
        cy
      };

      visibleNodes.push({
        node,
        box: nodeBoxFormatted,
        parentBox,
        level,
        isSelected: typeof node.isSelected === 'function' ? node.isSelected() : false
      });

      minX = Math.min(minX, box.x);
      minY = Math.min(minY, box.y);
      maxX = Math.max(maxX, box.x + (box.width || 40));
      maxY = Math.max(maxY, box.y + (box.height || 20));
    }

    // Traverse visible children if expanded
    const isCollapsed = (typeof node.isCollapsed === 'function' && node.isCollapsed()) || node.getData('expandState') === 'collapse';
    if (!isCollapsed) {
      const children = node.getChildren ? node.getChildren() : [];
      const currentCenter = nodeBoxFormatted ? { cx: nodeBoxFormatted.cx, cy: nodeBoxFormatted.cy } : parentBox;
      for (const child of children) {
        traverseNode(child, level + 1, currentCenter);
      }
    }
  }

  traverseNode(root, 0);

  // 2. Obtain current visible viewport in world space
  const dragger = minder.getViewDragger ? minder.getViewDragger() : minder._viewDragger;
  let viewBox: any = null;
  if (dragger && typeof dragger.getView === 'function') {
    try {
      viewBox = dragger.getView();
    } catch {}
  }

  // Fallback viewport calculation if dragger.getView() is unavailable
  if (!viewBox || typeof viewBox.width !== 'number' || isNaN(viewBox.width)) {
    const paper = minder.getPaper ? minder.getPaper() : null;
    const viewPort = paper && typeof paper.getViewPort === 'function' ? paper.getViewPort() : null;
    const zoom = (viewPort && viewPort.zoom) || (minder.getZoomValue ? minder.getZoomValue() / 100 : 1) || 1;
    const movement = dragger && typeof dragger.getMovement === 'function' ? dragger.getMovement() : { x: 0, y: 0 };
    const clientTarget = minder.getRenderTarget ? minder.getRenderTarget() : null;
    const clientWidth = clientTarget ? clientTarget.clientWidth : 800;
    const clientHeight = clientTarget ? clientTarget.clientHeight : 600;

    viewBox = {
      x: -movement.x / zoom,
      y: -movement.y / zoom,
      width: clientWidth / zoom,
      height: clientHeight / zoom
    };
  }

  currentViewBox = viewBox;

  // Include viewport in global bounding box with padding
  if (viewBox && typeof viewBox.x === 'number') {
    minX = Math.min(minX, viewBox.x);
    minY = Math.min(minY, viewBox.y);
    maxX = Math.max(maxX, viewBox.x + viewBox.width);
    maxY = Math.max(maxY, viewBox.y + viewBox.height);
  }

  if (minX === Infinity || maxX === -Infinity) {
    minX = -400; maxX = 400;
    minY = -300; maxY = 300;
  }

  // Add surrounding padding to world bounding box
  const paddingX = Math.max(60, (maxX - minX) * 0.08);
  const paddingY = Math.max(40, (maxY - minY) * 0.08);
  minX -= paddingX;
  maxX += paddingX;
  minY -= paddingY;
  maxY += paddingY;

  const worldWidth = Math.max(10, maxX - minX);
  const worldHeight = Math.max(10, maxY - minY);

  // Compute uniform scaling to fit neatly into minimap canvas
  currentScale = Math.min(targetWidth / worldWidth, targetHeight / worldHeight);
  currentOffsetX = (targetWidth - worldWidth * currentScale) / 2 - minX * currentScale;
  currentOffsetY = (targetHeight - worldHeight * currentScale) / 2 - minY * currentScale;

  // 3. Draw Background Grid / Tone
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  // Subtle dot grid background
  ctx.fillStyle = '#e2e8f0';
  const gridStep = 18;
  for (let x = 9; x < targetWidth; x += gridStep) {
    for (let y = 9; y < targetHeight; y += gridStep) {
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // 4. Draw Branches / Connecting Lines
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const item of visibleNodes) {
    if (item.parentBox) {
      const p = worldToMini(item.parentBox.cx, item.parentBox.cy);
      const c = worldToMini(item.box.cx, item.box.cy);

      ctx.beginPath();
      ctx.moveTo(p.x, p.y);

      // Smooth cubic bezier connection
      const midX = (p.x + c.x) / 2;
      ctx.bezierCurveTo(midX, p.y, midX, c.y, c.x, c.y);

      ctx.strokeStyle = item.level <= 1 ? '#60a5fa' : '#94a3b8';
      ctx.stroke();
    }
  }

  // 5. Draw Node Rectangles / Capsules
  for (const item of visibleNodes) {
    const pos = worldToMini(item.box.x, item.box.y);
    const w = Math.max(item.box.width * currentScale, item.level === 0 ? 14 : 7);
    const h = Math.max(item.box.height * currentScale, item.level === 0 ? 8 : 4);
    const radius = Math.min(h / 2, 4);

    // Style by hierarchy level
    ctx.beginPath();
    roundRect(ctx, pos.x, pos.y, w, h, radius);

    if (item.level === 0) {
      // Root Node (Blue / Indigo prominent capsule)
      ctx.fillStyle = '#3b82f6';
      ctx.fill();
    } else if (item.level === 1) {
      // Main Branch Nodes
      ctx.fillStyle = '#64748b';
      ctx.fill();
    } else {
      // Sub-leaf nodes
      ctx.fillStyle = '#94a3b8';
      ctx.fill();
    }

    // Selected Node Highlight Ring
    if (item.isSelected) {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // 6. Draw Viewport Indicator (Red Rectangle from user screenshot)
  if (viewBox) {
    const vp = worldToMini(viewBox.x, viewBox.y);
    const vpw = Math.max(viewBox.width * currentScale, 6);
    const vph = Math.max(viewBox.height * currentScale, 6);

    currentViewportRectOnCanvas = {
      x: vp.x,
      y: vp.y,
      width: vpw,
      height: vph
    };

    // Viewport fill tint
    ctx.fillStyle = 'rgba(239, 68, 68, 0.08)';
    ctx.fillRect(vp.x, vp.y, vpw, vph);

    // Viewport crisp red border (like image reference)
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.8;
    ctx.strokeRect(vp.x, vp.y, vpw, vph);

    // Viewport center crosshair / corner accents
    ctx.fillStyle = '#ef4444';
    const cornerSize = 3;
    ctx.fillRect(vp.x - 1, vp.y - 1, cornerSize, cornerSize);
    ctx.fillRect(vp.x + vpw - cornerSize + 1, vp.y - 1, cornerSize, cornerSize);
    ctx.fillRect(vp.x - 1, vp.y + vph - cornerSize + 1, cornerSize, cornerSize);
    ctx.fillRect(vp.x + vpw - cornerSize + 1, vp.y + vph - cornerSize + 1, cornerSize, cornerSize);
  }

  ctx.restore();
}

// Utility to draw rounded rectangles on HTML5 Canvas
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Check if pointer is currently inside the red viewport rectangle
function isInsideViewportRect(mx: number, my: number) {
  const vp = currentViewportRectOnCanvas;
  return (
    mx >= vp.x - 3 &&
    mx <= vp.x + vp.width + 3 &&
    my >= vp.y - 3 &&
    my <= vp.y + vp.height + 3
  );
}

// Mouse & Pointer Interactions
function handleMouseDown(e: MouseEvent) {
  const canvas = canvasRef.value;
  if (!canvas || !props.minder) return;

  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  lastPointerPos = { x: e.clientX, y: e.clientY };
  isInteracting = true;

  if (isInsideViewportRect(mx, my)) {
    isDraggingViewport = true;
  } else {
    // Clicked outside viewport -> Fast roam / center viewport to clicked location
    isDraggingViewport = true;
    const targetWorld = miniToWorld(mx, my);
    panCanvasToWorldLocation(targetWorld.x, targetWorld.y, 180);
  }

  window.addEventListener('mousemove', handleWindowMouseMove);
  window.addEventListener('mouseup', handleWindowMouseUp);
}

function handleMouseMove(e: MouseEvent) {
  if (!canvasRef.value) return;
  const rect = canvasRef.value.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  isHoveringViewport.value = isInsideViewportRect(mx, my);
}

function handleWindowMouseMove(e: MouseEvent) {
  if (!isInteracting || !props.minder) return;

  const deltaScreenX = e.clientX - lastPointerPos.x;
  const deltaScreenY = e.clientY - lastPointerPos.y;
  lastPointerPos = { x: e.clientX, y: e.clientY };

  if (isDraggingViewport && currentScale > 0) {
    const minder = props.minder;
    const dragger = minder.getViewDragger ? minder.getViewDragger() : minder._viewDragger;
    const paper = minder.getPaper ? minder.getPaper() : null;
    const viewPort = paper && typeof paper.getViewPort === 'function' ? paper.getViewPort() : null;
    const zoom = (viewPort && viewPort.zoom) || (minder.getZoomValue ? minder.getZoomValue() / 100 : 1) || 1;
    const kity = (window as any).kity;

    if (dragger && kity && kity.Point) {
      // Calculate delta world movement
      const deltaWorldX = deltaScreenX / currentScale;
      const deltaWorldY = deltaScreenY / currentScale;

      // Inverse translation for dragger
      const moveDeltaX = -deltaWorldX * zoom;
      const moveDeltaY = -deltaWorldY * zoom;

      dragger.move(new kity.Point(moveDeltaX, moveDeltaY), 0);
      renderMinimap();
    }
  }
}

function handleWindowMouseUp() {
  isInteracting = false;
  isDraggingViewport = false;
  window.removeEventListener('mousemove', handleWindowMouseMove);
  window.removeEventListener('mouseup', handleWindowMouseUp);
  renderMinimap();
}

// High-performance interruptible smooth pan controller
let minimapPanRaf: number | null = null;

function panCanvasToWorldLocation(worldX: number, worldY: number, duration = 200) {
  const minder = props.minder;
  if (!minder) return;

  const dragger = minder.getViewDragger ? minder.getViewDragger() : minder._viewDragger;
  if (!dragger) return;

  if (minimapPanRaf !== null) {
    cancelAnimationFrame(minimapPanRaf);
    minimapPanRaf = null;
  }

  try {
    const rc = minder.getRenderContainer ? minder.getRenderContainer() : null;
    if (rc) {
      if (typeof rc.stop === 'function') rc.stop();
      if (rc._KityAnimateQueue && Array.isArray(rc._KityAnimateQueue)) {
        rc._KityAnimateQueue.length = 0;
      }
    }
    if (dragger._moveTimeline) {
      try {
        dragger._moveTimeline.stop();
      } catch {}
      dragger._moveTimeline = null;
    }
  } catch {}

  const clientTarget = minder.getRenderTarget ? minder.getRenderTarget() : null;
  const clientWidth = clientTarget ? clientTarget.clientWidth : 800;
  const clientHeight = clientTarget ? clientTarget.clientHeight : 600;
  const kity = (window as any).kity;

  if (kity && kity.Point) {
    const targetMoveX = Math.round(clientWidth / 2 - worldX);
    const targetMoveY = Math.round(clientHeight / 2 - worldY);

    const currentMovement = typeof dragger.getMovement === 'function' ? dragger.getMovement() : null;
    const startX = currentMovement && typeof currentMovement.x === 'number' && !isNaN(currentMovement.x) ? currentMovement.x : targetMoveX;
    const startY = currentMovement && typeof currentMovement.y === 'number' && !isNaN(currentMovement.y) ? currentMovement.y : targetMoveY;

    const diffX = targetMoveX - startX;
    const diffY = targetMoveY - startY;

    if (duration <= 0 || (Math.abs(diffX) < 1 && Math.abs(diffY) < 1)) {
      dragger.moveTo(new kity.Point(targetMoveX, targetMoveY));
      renderMinimap();
      return;
    }

    const startTime = performance.now();

    function easeOutCubic(t: number): number {
      return 1 - Math.pow(1 - t, 3);
    }

    function step(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);

      const curX = Math.round(startX + diffX * eased);
      const curY = Math.round(startY + diffY * eased);

      dragger.moveTo(new kity.Point(curX, curY));
      renderMinimap();

      if (progress < 1) {
        minimapPanRaf = requestAnimationFrame(step);
      } else {
        minimapPanRaf = null;
      }
    }

    minimapPanRaf = requestAnimationFrame(step);
  }
}

// Reset canvas view to root node
function resetToCenter() {
  if (!props.minder) return;
  panCanvasToWorldLocation(0, 0, 250);
}

// Bind KityMinder events for automatic real-time sync
let unbindEvents: (() => void) | null = null;
let animationFrameId: number | null = null;

function requestMinimapUpdate() {
  if (animationFrameId) return;
  animationFrameId = requestAnimationFrame(() => {
    animationFrameId = null;
    renderMinimap();
  });
}

function attachMinderListeners() {
  if (!props.minder) return;
  const minder = props.minder;

  const eventNames = [
    'viewchange',
    'layoutallfinish',
    'selectionchange',
    'contentchange',
    'noderender',
    'import',
    'nodeattach',
    'nodedetach',
    'expandStateChange'
  ];

  const handler = () => requestMinimapUpdate();

  eventNames.forEach(evt => {
    try { minder.on(evt, handler); } catch {}
  });

  unbindEvents = () => {
    eventNames.forEach(evt => {
      try { minder.off(evt, handler); } catch {}
    });
  };

  requestMinimapUpdate();
}

watch(
  () => props.minder,
  newMinder => {
    if (unbindEvents) {
      unbindEvents();
      unbindEvents = null;
    }
    if (newMinder) {
      nextTick(attachMinderListeners);
    }
  },
  { immediate: true }
);

watch(
  () => props.isOpen,
  open => {
    if (open) {
      nextTick(() => {
        renderMinimap();
      });
    }
  }
);

onMounted(() => {
  if (props.minder) {
    attachMinderListeners();
  }
  window.addEventListener('resize', requestMinimapUpdate);
});

onUnmounted(() => {
  if (unbindEvents) unbindEvents();
  window.removeEventListener('resize', requestMinimapUpdate);
  window.removeEventListener('mousemove', handleWindowMouseMove);
  window.removeEventListener('mouseup', handleWindowMouseUp);
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
});

defineExpose({
  render: renderMinimap
});
</script>

<template>
  <transition
    enter-active-class="transition-all duration-200 ease-out"
    enter-from-class="opacity-0 scale-95 translate-y-2"
    enter-to-class="opacity-100 scale-100 translate-y-0"
    leave-active-class="transition-all duration-150 ease-in"
    leave-from-class="opacity-100 scale-100 translate-y-0"
    leave-to-class="opacity-0 scale-95 translate-y-2"
  >
    <div
      v-if="isOpen"
      ref="containerRef"
      id="mindmap-minimap-widget"
      class="bg-white/95 backdrop-blur-md rounded-xl shadow-xl border border-gray-200/90 overflow-hidden select-none z-20 flex flex-col transition-all duration-200"
      :style="{ width: `${CANVAS_WIDTH}px` }"
    >
      <!-- Header -->
      <div class="px-2.5 py-1.5 bg-slate-50/90 border-b border-gray-100 flex items-center justify-between cursor-default">
        <div class="flex items-center gap-1.5 text-gray-700 font-semibold text-xs">
          <MapIcon class="w-3.5 h-3.5 text-emerald-600" />
          <span>小地图</span>
          <span class="text-[10px] text-gray-400 font-mono font-normal">导航器</span>
        </div>
      </div>

      <!-- Minimap Canvas Body -->
      <div
        class="relative w-full bg-slate-50/50 flex items-center justify-center overflow-hidden"
        :style="{ height: `${CANVAS_HEIGHT}px` }"
      >
        <canvas
          ref="canvasRef"
          :style="{
            width: `${CANVAS_WIDTH}px`,
            height: `${CANVAS_HEIGHT}px`,
            cursor: isHoveringViewport ? 'grab' : 'crosshair'
          }"
          class="block active:cursor-grabbing"
          @mousedown="handleMouseDown"
          @mousemove="handleMouseMove"
        ></canvas>

        <!-- Drag Tip on Hover -->
        <div class="absolute bottom-1 right-1.5 pointer-events-none text-[9px] text-gray-400/80 bg-white/70 backdrop-blur-xs px-1 rounded font-mono">
          拖拽红框或点击漫游
        </div>
      </div>
    </div>
  </transition>
</template>
