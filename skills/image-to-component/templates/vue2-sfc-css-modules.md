# Vue 2 SFC CSS Modules Skeleton Template

Use this template when Step 1 selects Vue 2 + CSS Modules. It supports both TypeScript and JavaScript output.

## Language Rules

- TypeScript output uses Options API, `<script lang="ts">`, `Vue.extend`, `PropType`, `types.ts`, and `index.ts`.
- JavaScript output uses Options API, plain `<script>`, `index.js`, and no `types.ts`.
- For JavaScript, remove `PropType` casts and replace type imports with root-level JSDoc typedefs.
- Keep one `<style module>` block per independently styled SFC. Do not import a root module from child components.

## File Skeleton Example

```vue
<!-- QRCodeOrderPage.vue -->
<script lang="ts">
import Vue, { PropType } from 'vue'
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
  methods: {
    handleRefresh() {
      this.$emit('refresh')
    },
  },
})
</script>

<template>
  <article :class="[$style.root, $style[status]]" aria-labelledby="voucher-qr-card-title">
    <Header
      :status="status"
      :title="title"
      :subtitle="subtitle"
      :title-as="titleAs"
    />
    <div :class="$style.card">
      <CouponInfo :coupon="coupon" />
      <hr :class="$style.divider">
      <QRCodeArea :status="status" :qr-code-url="qrCodeUrl" />
    </div>
    <Footer
      :status="status"
      :timestamp="timestamp"
      @refresh="handleRefresh"
    />
  </article>
</template>

<style module>
.root {}
.pending {}
.used {}
.expired {}
.card {}
.divider {}
</style>
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
  <header :class="$style.header">
    <span :class="$style.statusIcon" role="img" :aria-label="`订单状态：${statusLabel}`">
      <!-- status icon: clock | check | warning -->
    </span>
    <div>
      <component :is="titleAs" id="voucher-qr-card-title" :class="$style.title">
        {{ title }}
      </component>
      <p v-if="subtitle" :class="$style.subtitle">
        {{ subtitle }}
      </p>
    </div>
  </header>
</template>

<style module>
.header {}
.statusIcon {}
.title {}
.subtitle {}
</style>
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
  <section :class="$style.couponInfo" aria-label="券信息">
    <img
      v-if="coupon.iconSrc"
      :class="$style.couponIcon"
      :src="coupon.iconSrc"
      :alt="coupon.iconAlt || ''"
    >
    <div :class="$style.couponText">
      <p :class="$style.couponName">{{ coupon.name }}</p>
      <p :class="$style.couponValidity">{{ coupon.validity }}</p>
      <p :class="$style.couponAmount">{{ amountText }}</p>
    </div>
  </section>
</template>

<style module>
.couponInfo {}
.couponIcon {}
.couponText {}
.couponName {}
.couponValidity {}
.couponAmount {}
</style>
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
    :class="[$style.qrArea, inactive && $style.qrAreaInactive]"
    :aria-label="inactive ? '二维码不可用' : '可使用二维码'"
  >
    <img :class="$style.qrImage" :src="qrCodeUrl" alt="订单二维码">
    <span v-if="inactive" :class="$style.stamp" aria-hidden="true">
      {{ status === 'used' ? '已核销' : '已过期' }}
    </span>
  </section>
</template>

<style module>
.qrArea {}
.qrAreaInactive {}
.qrImage {}
.stamp {}
</style>
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
  <footer :class="$style.footer">
    <p v-if="status === 'pending'" :class="$style.hint">
      一分钟内有效，过期及异常请
      <button :class="$style.refresh" type="button" @click="refresh">点击刷新</button>
    </p>
    <p v-else-if="timestamp" :class="$style.timestamp">
      {{ status === 'used' ? '核销时间' : '过期时间' }}：{{ timestamp }}
    </p>
  </footer>
</template>

<style module>
.footer {}
.hint {}
.refresh {}
.timestamp {}
</style>
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

