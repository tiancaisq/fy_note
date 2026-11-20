<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Loader2 } from 'lucide-vue-next';
import { getBookmarkBadgeInfo, getBookmarkIconCandidates } from '../utils/bookmarkHelpers';

const props = withDefaults(
  defineProps<{
    url: string;
    title?: string;
    iconUrl?: string;
    size?: 'xs' | 'sm' | 'md';
    loading?: boolean;
  }>(),
  {
    size: 'sm',
    loading: false,
  }
);

const candidateIndex = ref(0);
const imageLoaded = ref(false);

const candidates = computed(() => getBookmarkIconCandidates(props.url, props.iconUrl));
const currentSrc = computed(() => candidates.value[candidateIndex.value] || '');
const badge = computed(() => getBookmarkBadgeInfo(props.url, props.title));

watch(
  [() => props.url, () => props.iconUrl],
  () => {
    candidateIndex.value = 0;
    imageLoaded.value = false;
  }
);

function tryNextCandidate() {
  imageLoaded.value = false;
  if (candidateIndex.value < candidates.value.length) {
    candidateIndex.value += 1;
  }
}

function handleLoad(e: Event) {
  const img = e.target as HTMLImageElement | null;
  // Reject 0x0 or 1x1 tracking/empty pixels and advance to next fallback candidate
  if (!img || img.naturalWidth <= 1 || img.naturalHeight <= 1) {
    tryNextCandidate();
    return;
  }
  imageLoaded.value = true;
}

const containerSizeClass = computed(() => {
  if (props.size === 'xs') return 'w-5 h-5 rounded text-[10px]';
  if (props.size === 'md') return 'w-7 h-7 rounded-lg text-xs';
  return 'w-6 h-6 rounded-md text-[11px]';
});

const imgSizeClass = computed(() => {
  if (props.size === 'xs') return 'w-3.5 h-3.5';
  if (props.size === 'md') return 'w-4.5 h-4.5';
  return 'w-4 h-4';
});
</script>

<template>
  <div
    class="border flex items-center justify-center font-semibold shrink-0 select-none overflow-hidden relative"
    :class="[
      containerSizeClass,
      imageLoaded && !loading
        ? 'bg-white border-gray-200/80'
        : [badge.bg, badge.text, badge.border],
    ]"
  >
    <Loader2 v-if="loading" class="w-3.5 h-3.5 animate-spin opacity-75" />

    <template v-else>
      <img
        v-if="currentSrc"
        :key="currentSrc"
        :src="currentSrc"
        alt=""
        referrerpolicy="no-referrer"
        decoding="async"
        loading="lazy"
        :class="[
          imgSizeClass,
          'object-contain transition-opacity duration-150',
          imageLoaded ? 'opacity-100' : 'opacity-0 absolute',
        ]"
        @load="handleLoad"
        @error="tryNextCandidate"
      />
      <span v-if="!imageLoaded">{{ badge.letter }}</span>
    </template>
  </div>
</template>
