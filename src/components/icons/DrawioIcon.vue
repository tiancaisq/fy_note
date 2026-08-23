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
    <!-- Amber / Tangerine Draw.io Document Icon with consistent folded corner style -->
    <div
      :class="[
        'relative flex items-center justify-center rounded transition-transform group-hover:scale-105 shadow-2xs',
        size === 'xs' ? 'w-5 h-6' : '',
        size === 'sm' ? 'w-6 h-7.5' : '',
        size === 'md' ? 'w-8 h-10' : '',
        size === 'lg' ? 'w-10 h-12.5' : '',
      ]"
      style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);"
    >
      <!-- Top-right Folded Corner Effect -->
      <div
        class="absolute top-0 right-0 w-2 h-2 bg-amber-200/80 rounded-bl-xs pointer-events-none"
        style="clip-path: polygon(100% 0, 0 100%, 0 0);"
      ></div>

      <!-- Draw.io Node Diagram Tree Glyphs (matching official Draw.io hierarchy symbol) -->
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        :class="[
          'text-white stroke-white',
          size === 'xs' ? 'w-3 h-3' : '',
          size === 'sm' ? 'w-3.5 h-3.5' : '',
          size === 'md' ? 'w-5 h-5' : '',
          size === 'lg' ? 'w-6 h-6' : '',
        ]"
      >
        <!-- Connector Inverted-Y Branch (matching uploaded Draw.io structure) -->
        <path
          d="M12 10.5V12L7 14M12 12L17 14"
          stroke="white"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />

        <!-- Top Parent Node Box -->
        <rect
          x="8.5"
          y="4.5"
          width="7"
          height="6"
          rx="1.5"
          fill="white"
        />

        <!-- Bottom Left Child Node Box -->
        <rect
          x="3.5"
          y="14"
          width="7"
          height="6"
          rx="1.5"
          fill="white"
        />

        <!-- Bottom Right Child Node Box -->
        <rect
          x="13.5"
          y="14"
          width="7"
          height="6"
          rx="1.5"
          fill="white"
        />
      </svg>
    </div>

    <!-- Optional Label -->
    <span
      v-if="showLabel"
      class="text-[10px] text-gray-500 font-medium mt-1 leading-tight tracking-tight"
    >
      Draw.io
    </span>
  </div>
</template>


