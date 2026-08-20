<script setup lang="ts">
import MindmapIcon from './MindmapIcon.vue';
import { NoteFormat } from '../../types';

withDefaults(
  defineProps<{
    format?: NoteFormat | string;
    size?: 'xs' | 'sm' | 'md' | 'lg';
    showLabel?: boolean;
  }>(),
  {
    format: 'markdown',
    size: 'sm',
    showLabel: false,
  }
);
</script>

<template>
  <div class="inline-flex items-center">
    <!-- Mindmap Format Icon -->
    <MindmapIcon
      v-if="format === 'mindmap'"
      :size="size"
      :show-label="showLabel"
    />

    <!-- Markdown Format Icon (Orange M↓) -->
    <div
      v-else
      class="inline-flex flex-col items-center justify-center shrink-0 select-none"
    >
      <div
        :class="[
          'relative flex items-center justify-center rounded transition-transform group-hover:scale-105 shadow-2xs text-white font-bold',
          size === 'xs' ? 'w-5 h-6 text-[9px]' : '',
          size === 'sm' ? 'w-6 h-7.5 text-[11px]' : '',
          size === 'md' ? 'w-8 h-10 text-xs' : '',
          size === 'lg' ? 'w-10 h-12.5 text-sm' : '',
        ]"
        style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);"
      >
        <!-- Top-right Folded Corner -->
        <div
          class="absolute top-0 right-0 w-2 h-2 bg-orange-200/80 rounded-bl-xs pointer-events-none"
          style="clip-path: polygon(100% 0, 0 100%, 0 0);"
        ></div>
        <span class="tracking-tighter">M↓</span>
      </div>
      <span
        v-if="showLabel"
        class="text-[10px] text-gray-500 font-medium mt-1 leading-tight tracking-tight"
      >
        笔记
      </span>
    </div>
  </div>
</template>
