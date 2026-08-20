<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: 'xs' | 'sm' | 'md' | 'lg';
    showLabel?: boolean;
  }>(),
  {
    size: 'sm',
    showLabel: false,
  }
);
</script>

<template>
  <div class="inline-flex flex-col items-center justify-center shrink-0 select-none">
    <!-- Emerald Green Mind Map Document Icon matching uploaded image -->
    <div
      :class="[
        'relative flex items-center justify-center rounded transition-transform group-hover:scale-105 shadow-2xs',
        size === 'xs' ? 'w-5 h-6' : '',
        size === 'sm' ? 'w-6 h-7.5' : '',
        size === 'md' ? 'w-8 h-10' : '',
        size === 'lg' ? 'w-10 h-12.5' : '',
      ]"
      style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);"
    >
      <!-- Top-right Folded Corner Effect -->
      <div
        class="absolute top-0 right-0 w-2 h-2 bg-emerald-200/80 rounded-bl-xs pointer-events-none"
        style="clip-path: polygon(100% 0, 0 100%, 0 0);"
      ></div>

      <!-- Mind Map Node Tree Glyphs inside -->
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        :class="[
          'text-white stroke-white stroke-[2.2]',
          size === 'xs' ? 'w-3 h-3' : '',
          size === 'sm' ? 'w-3.5 h-3.5' : '',
          size === 'md' ? 'w-5 h-5' : '',
          size === 'lg' ? 'w-6 h-6' : '',
        ]"
      >
        <!-- Branch Lines from center node -->
        <line x1="12" y1="12" x2="12" y2="5" stroke-linecap="round" />
        <line x1="12" y1="12" x2="6" y2="18" stroke-linecap="round" />
        <line x1="12" y1="12" x2="18" y2="18" stroke-linecap="round" />
        
        <!-- Central Node -->
        <circle cx="12" cy="12" r="2.5" fill="white" />
        <!-- Top Node -->
        <circle cx="12" cy="5" r="1.8" fill="white" />
        <!-- Bottom Left Node -->
        <circle cx="6" cy="18" r="1.8" fill="white" />
        <!-- Bottom Right Node -->
        <circle cx="18" cy="18" r="1.8" fill="white" />
      </svg>
    </div>

    <!-- Optional Label -->
    <span
      v-if="showLabel"
      class="text-[10px] text-gray-500 font-medium mt-1 leading-tight tracking-tight"
    >
      思维导图
    </span>
  </div>
</template>
