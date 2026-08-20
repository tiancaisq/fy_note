// Global polyfill for kity legacy class system in strict mode
try {
  const patchProto = (proto: any) => {
    if (!proto) return;
    try {
      Object.defineProperty(proto, '__KityMethodClass', {
        get() {
          return undefined;
        },
        set(_val) {
          // No-op: primitives do not store instance class metadata
        },
        configurable: true,
        enumerable: false,
      });
      Object.defineProperty(proto, '__KityMethodName', {
        get() {
          return undefined;
        },
        set(_val) {
          // No-op: primitives do not store method metadata
        },
        configurable: true,
        enumerable: false,
      });
    } catch {}
  };

  patchProto(Boolean.prototype);
  patchProto(Number.prototype);
  patchProto(String.prototype);
} catch (e) {
  console.warn('Prototype safe define failed in main', e);
}

import { createApp } from 'vue';
import App from './App.vue';
import 'kityminder-core/dist/kityminder.core.css';
import './index.css';

createApp(App).mount('#root');


