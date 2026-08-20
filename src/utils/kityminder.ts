// Helper to load and initialize kity and kityminder-core in browser environment
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if script already exists in document
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = (e) => reject(e);
    document.head.appendChild(script);
  });
}

export async function loadKityMinder() {
  if (typeof window === 'undefined') return null;

  // Polyfill prototype properties so assigning __KityMethodClass / __KityMethodName to primitives never throws in strict mode
  try {
    const defineSafeProps = (proto: any) => {
      if (!proto) return;
      try {
        Object.defineProperty(proto, '__KityMethodClass', {
          get() {
            return undefined;
          },
          set(_val) {
            // No-op for primitive types
          },
          configurable: true,
          enumerable: false,
        });
        Object.defineProperty(proto, '__KityMethodName', {
          get() {
            return undefined;
          },
          set(_val) {
            // No-op for primitive types
          },
          configurable: true,
          enumerable: false,
        });
      } catch {}
    };

    defineSafeProps(Boolean.prototype);
    defineSafeProps(Number.prototype);
    defineSafeProps(String.prototype);
  } catch (e) {
    console.warn('Prototype safe define failed', e);
  }

  // If already loaded on window, return it directly
  if ((window as any).kityminder) {
    return (window as any).kityminder;
  }

  try {
    // 1. Ensure kity is loaded
    if (!(window as any).kity) {
      await loadScript('/libs/kity.min.js');
    }

    // 2. Ensure kityminder is loaded
    if (!(window as any).kityminder) {
      await loadScript('/libs/kityminder.core.min.js');
    }

    return (window as any).kityminder || null;
  } catch (err) {
    console.error('Failed to load kity/kityminder-core script', err);
    return (window as any).kityminder || null;
  }
}



