# Vue 2 SFC BEM Skeleton Template

Use this template when Step 1 selects Vue 2 + plain CSS + BEM. It supports both TypeScript and JavaScript output.

## Language Rules

- TypeScript output uses Options API, `<script lang="ts">`, `Vue.extend`, `PropType`, `types.ts`, and `index.ts`.
- JavaScript output uses Options API, plain `<script>`, `index.js`, and no `types.ts`.
- For JavaScript, remove `PropType` casts and replace type imports with root-level JSDoc typedefs.
- BEM styles live in `QRCodeOrderPage.css`, imported once by the root SFC.

## File Skeleton Example

```vue
<!-- QRCodeOrderPage.vue -->
<script lang="ts">
import Vue, { PropType } from 'vue'
import './QRCodeOrderPage.css'
import Header from './components/Header.vue'
import CouponInfo from './components/CouponInfo.vue'
import QRCodeArea from './components/QRCodeArea.vue'
import Footer from './components/Footer.vue'
import type { CouponInfoData, OrderStatus } from './types'

export default Vue.extend({
  name: 'QRCodeOrderPage',
  components: {
    Header,
    CouponInfo,
    QRCodeArea,
    Footer,
  },
  props: {
    status: {
      type: String as PropType<OrderStatus>,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    subtitle: {
      type: String,
      default: undefined,
    },
    titleAs: {
      type: String as PropType<'h1' | 'h2' | 'h3'>,
      default: 'h1',
    },
    qrCodeUrl: {
      type: String,
      required: true,
    },
    timestamp: {
      type: String,
      default: undefined,
    },
    coupon: {
      type: Object as PropType<CouponInfoData>,
      required: true,
    },
  },
  computed: {
    rootClass(): string[] {
      return ['voucher-qr-card', `voucher-qr-card--${this.status}`]
    },
  },
  methods: {
    handleRefresh() {
      this.$emit('refresh')
    },
  },
})
</script>

<template>
  <article :class="rootClass" aria-labelledby="voucher-qr-card-title">
    <Header
      :status="status"
      :title="title"
      :subtitle="subtitle"
      :title-as="titleAs"
    />
    <div class="voucher-qr-card__card">
      <CouponInfo :coupon="coupon" />
      <hr class="voucher-qr-card__divider">
      <QRCodeArea :status="status" :qr-code-url="qrCodeUrl" />
    </div>
    <Footer
      :status="status"
      :timestamp="timestamp"
      @refresh="handleRefresh"
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
<script lang="ts">
import Vue, { PropType } from 'vue'
import type { OrderStatus } from '../types'

export default Vue.extend({
  name: 'Header',
  props: {
    status: {
      type: String as PropType<OrderStatus>,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    subtitle: {
      type: String,
      default: undefined,
    },
    titleAs: {
      type: String as PropType<'h1' | 'h2' | 'h3'>,
      default: 'h1',
    },
  },
  computed: {
    statusLabel(): string {
      return this.status === 'pending' ? '待使用' : this.status === 'used' ? '已核销' : '已过期'
    },
  },
})
</script>

<template>
  <header class="voucher-qr-card__header">
    <span class="voucher-qr-card__status-icon" role="img" :aria-label="`订单状态：${statusLabel}`">
      <!-- status icon: clock | check | warning -->
    </span>
    <div>
      <component :is="titleAs" id="voucher-qr-card-title" class="voucher-qr-card__title">
        {{ title }}
      </component>
      <p v-if="subtitle" class="voucher-qr-card__subtitle">
        {{ subtitle }}
      </p>
    </div>
  </header>
</template>
```

```vue
<!-- components/CouponInfo.vue -->
<script lang="ts">
import Vue, { PropType } from 'vue'
import type { CouponInfoData } from '../types'

export default Vue.extend({
  name: 'CouponInfo',
  props: {
    coupon: {
      type: Object as PropType<CouponInfoData>,
      required: true,
    },
  },
  computed: {
    amountText(): string {
      return `¥${this.coupon.amount.toFixed(2)}`
    },
  },
})
</script>

<template>
  <section class="coupon-info" aria-label="券信息">
    <img
      v-if="coupon.iconSrc"
      class="coupon-info__icon"
      :src="coupon.iconSrc"
      :alt="coupon.iconAlt || ''"
    >
    <div class="coupon-info__text">
      <p class="coupon-info__name">{{ coupon.name }}</p>
      <p class="coupon-info__validity">{{ coupon.validity }}</p>
      <p class="coupon-info__amount">{{ amountText }}</p>
    </div>
  </section>
</template>
```

```vue
<!-- components/QRCodeArea.vue -->
<script lang="ts">
import Vue, { PropType } from 'vue'
import type { OrderStatus } from '../types'

export default Vue.extend({
  name: 'QRCodeArea',
  props: {
    status: {
      type: String as PropType<OrderStatus>,
      required: true,
    },
    qrCodeUrl: {
      type: String,
      required: true,
    },
  },
  computed: {
    inactive(): boolean {
      return this.status !== 'pending'
    },
  },
})
</script>

<template>
  <section
    :class="['voucher-qr-card__qr-area', inactive && 'voucher-qr-card__qr-area--inactive']"
    :aria-label="inactive ? '二维码不可用' : '可使用二维码'"
  >
    <img class="voucher-qr-card__qr-image" :src="qrCodeUrl" alt="订单二维码">
    <span v-if="inactive" class="voucher-qr-card__stamp" aria-hidden="true">
      {{ status === 'used' ? '已核销' : '已过期' }}
    </span>
  </section>
</template>
```

```vue
<!-- components/Footer.vue -->
<script lang="ts">
import Vue, { PropType } from 'vue'
import type { OrderStatus } from '../types'

export default Vue.extend({
  name: 'Footer',
  props: {
    status: {
      type: String as PropType<OrderStatus>,
      required: true,
    },
    timestamp: {
      type: String,
      default: undefined,
    },
  },
  methods: {
    refresh() {
      this.$emit('refresh')
    },
  },
})
</script>

<template>
  <footer class="voucher-qr-card__footer">
    <p v-if="status === 'pending'" class="voucher-qr-card__hint">
      一分钟内有效，过期及异常请
      <button class="voucher-qr-card__refresh" type="button" @click="refresh">点击刷新</button>
    </p>
    <p v-else-if="timestamp" class="voucher-qr-card__timestamp">
      {{ status === 'used' ? '核销时间' : '过期时间' }}：{{ timestamp }}
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

- Remove `lang="ts"` from every `<script>`.
- Remove `import type`, `types.ts`, and every `as PropType<...>` cast.
- Use plain runtime prop declarations, e.g. `status: { type: String, required: true }`.
- Add root-level JSDoc typedefs if the output needs documented prop shapes.
- Use `index.js` and export only the component.

