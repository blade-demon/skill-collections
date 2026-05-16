# Vue 3 SFC BEM Skeleton Template

Use this template when Step 1 selects Vue 3 + plain CSS + BEM. It supports both TypeScript and JavaScript output.

## Language Rules

- TypeScript output uses `<script setup lang="ts">`, `types.ts`, and `index.ts`.
- JavaScript output uses `<script setup>`, `index.js`, and no `types.ts`.
- For JavaScript, replace generic `defineProps<T>()` / `defineEmits<T>()` with runtime prop declarations and JSDoc typedefs in the root SFC.
- BEM styles live in `QRCodeOrderPage.css`, imported once by the root SFC.

## File Skeleton Example

```vue
<!-- QRCodeOrderPage.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import './QRCodeOrderPage.css'
import Header from './components/Header.vue'
import CouponInfo from './components/CouponInfo.vue'
import QRCodeArea from './components/QRCodeArea.vue'
import Footer from './components/Footer.vue'
import type { CouponInfoData, OrderStatus } from './types'

const props = withDefaults(defineProps<{
  status: OrderStatus
  title: string
  subtitle?: string
  titleAs?: 'h1' | 'h2' | 'h3'
  qrCodeUrl: string
  timestamp?: string
  coupon: CouponInfoData
}>(), {
  titleAs: 'h1',
})

const emit = defineEmits<{
  (event: 'refresh'): void
}>()

const rootClass = computed(() => ['voucher-qr-card', `voucher-qr-card--${props.status}`])
</script>

<template>
  <article :class="rootClass" aria-labelledby="voucher-qr-card-title">
    <Header
      :status="props.status"
      :title="props.title"
      :subtitle="props.subtitle"
      :title-as="props.titleAs"
    />
    <div class="voucher-qr-card__card">
      <CouponInfo :coupon="props.coupon" />
      <hr class="voucher-qr-card__divider">
      <QRCodeArea :status="props.status" :qr-code-url="props.qrCodeUrl" />
    </div>
    <Footer
      :status="props.status"
      :timestamp="props.timestamp"
      @refresh="emit('refresh')"
    />
  </article>
</template>
```

```ts
// types.ts
export type OrderStatus = 'pending' | 'used' | 'expired'

export interface CouponInfoData {
  name: string
  validity: string
  amount: number
  iconSrc?: string
  iconAlt?: string
}
```

```vue
<!-- components/Header.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import type { OrderStatus } from '../types'

const props = withDefaults(defineProps<{
  status: OrderStatus
  title: string
  subtitle?: string
  titleAs?: 'h1' | 'h2' | 'h3'
}>(), {
  titleAs: 'h1',
})

const statusLabel = computed(() => props.status === 'pending' ? '待使用' : props.status === 'used' ? '已核销' : '已过期')
</script>

<template>
  <header class="voucher-qr-card__header">
    <span class="voucher-qr-card__status-icon" role="img" :aria-label="`订单状态：${statusLabel}`">
      <!-- status icon: clock | check | warning -->
    </span>
    <div>
      <component :is="props.titleAs" id="voucher-qr-card-title" class="voucher-qr-card__title">
        {{ props.title }}
      </component>
      <p v-if="props.subtitle" class="voucher-qr-card__subtitle">
        {{ props.subtitle }}
      </p>
    </div>
  </header>
</template>
```

```vue
<!-- components/CouponInfo.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import type { CouponInfoData } from '../types'

const props = defineProps<{
  coupon: CouponInfoData
}>()

const amountText = computed(() => `¥${props.coupon.amount.toFixed(2)}`)
</script>

<template>
  <section class="coupon-info" aria-label="券信息">
    <img
      v-if="props.coupon.iconSrc"
      class="coupon-info__icon"
      :src="props.coupon.iconSrc"
      :alt="props.coupon.iconAlt ?? ''"
    >
    <div class="coupon-info__text">
      <p class="coupon-info__name">{{ props.coupon.name }}</p>
      <p class="coupon-info__validity">{{ props.coupon.validity }}</p>
      <p class="coupon-info__amount">{{ amountText }}</p>
    </div>
  </section>
</template>
```

```vue
<!-- components/QRCodeArea.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import type { OrderStatus } from '../types'

const props = defineProps<{
  status: OrderStatus
  qrCodeUrl: string
}>()

const inactive = computed(() => props.status !== 'pending')
</script>

<template>
  <section
    :class="['voucher-qr-card__qr-area', inactive && 'voucher-qr-card__qr-area--inactive']"
    :aria-label="inactive ? '二维码不可用' : '可使用二维码'"
  >
    <img class="voucher-qr-card__qr-image" :src="props.qrCodeUrl" alt="订单二维码">
    <span v-if="inactive" class="voucher-qr-card__stamp" aria-hidden="true">
      {{ props.status === 'used' ? '已核销' : '已过期' }}
    </span>
  </section>
</template>
```

```vue
<!-- components/Footer.vue -->
<script setup lang="ts">
import type { OrderStatus } from '../types'

const props = defineProps<{
  status: OrderStatus
  timestamp?: string
}>()

const emit = defineEmits<{
  (event: 'refresh'): void
}>()
</script>

<template>
  <footer class="voucher-qr-card__footer">
    <p v-if="props.status === 'pending'" class="voucher-qr-card__hint">
      一分钟内有效，过期及异常请
      <button class="voucher-qr-card__refresh" type="button" @click="emit('refresh')">点击刷新</button>
    </p>
    <p v-else-if="props.timestamp" class="voucher-qr-card__timestamp">
      {{ props.status === 'used' ? '核销时间' : '过期时间' }}：{{ props.timestamp }}
    </p>
  </footer>
</template>
```

```css
/* QRCodeOrderPage.css */
.voucher-qr-card {
  --voucher-qr-card-accent: #f97316;
  --voucher-qr-card-text: #1f2937;
  --voucher-qr-card-muted: #6b7280;
  color: var(--voucher-qr-card-text);
}

.voucher-qr-card__header {}
.voucher-qr-card__status-icon {}
.voucher-qr-card__title {}
.voucher-qr-card__subtitle {}
.voucher-qr-card__card {}
.voucher-qr-card__divider {}
.voucher-qr-card__qr-area {}
.voucher-qr-card__qr-area--inactive {}
.voucher-qr-card__qr-image {}
.voucher-qr-card__stamp {}
.voucher-qr-card__footer {}
.voucher-qr-card__hint {}
.voucher-qr-card__refresh {}
.voucher-qr-card__timestamp {}
.voucher-qr-card--pending {}
.voucher-qr-card--used {}
.voucher-qr-card--expired {}

.coupon-info {}
.coupon-info__icon {}
.coupon-info__text {}
.coupon-info__name {}
.coupon-info__validity {}
.coupon-info__amount {}
```

```ts
// index.ts
export { default as QRCodeOrderPage } from './QRCodeOrderPage.vue'
export type { CouponInfoData, OrderStatus } from './types'
```

## JavaScript Conversion Rules

- Remove `lang="ts"` from every `<script setup>`.
- Replace `import type` and `types.ts` with root-level JSDoc typedefs.
- Replace typed `defineProps<...>()` with runtime prop objects, including defaults such as `titleAs: { type: String, default: 'h1' }`.
- Replace typed `defineEmits<...>()` with `defineEmits(['refresh'])`.
- Use `index.js` and export only the component.
