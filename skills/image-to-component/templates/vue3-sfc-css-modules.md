# Vue 3 SFC CSS Modules Skeleton Template

Use this template when Step 1 selects Vue 3 + CSS Modules. It supports both TypeScript and JavaScript output.

## Language Rules

- TypeScript output uses `<script setup lang="ts">`, `types.ts`, and `index.ts`.
- JavaScript output uses `<script setup>`, `index.js`, and no `types.ts`.
- For JavaScript, replace generic `defineProps<T>()` / `defineEmits<T>()` with runtime prop declarations and JSDoc typedefs in the root SFC.
- Keep one `<style module>` block per independently styled SFC. Do not import a root module from child components.

## File Skeleton Example

```vue
<!-- QRCodeOrderPage.vue -->
<script setup lang="ts">
import { computed, useCssModule } from 'vue'
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

const styles = useCssModule()
const statusClass = computed(() => ({
  pending: styles.pending,
  used: styles.used,
  expired: styles.expired,
})[props.status])
</script>

<template>
  <article :class="[styles.root, statusClass]" aria-labelledby="voucher-qr-card-title">
    <Header
      :status="props.status"
      :title="props.title"
      :subtitle="props.subtitle"
      :title-as="props.titleAs"
    />
    <div :class="styles.card">
      <CouponInfo :coupon="props.coupon" />
      <hr :class="styles.divider">
      <QRCodeArea :status="props.status" :qr-code-url="props.qrCodeUrl" />
    </div>
    <Footer
      :status="props.status"
      :timestamp="props.timestamp"
      @refresh="emit('refresh')"
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
<script setup lang="ts">
import { computed, useCssModule } from 'vue'
import type { OrderStatus } from '../types'

const props = withDefaults(defineProps<{
  status: OrderStatus
  title: string
  subtitle?: string
  titleAs?: 'h1' | 'h2' | 'h3'
}>(), {
  titleAs: 'h1',
})

const styles = useCssModule()
const statusLabel = computed(() => props.status === 'pending' ? '待使用' : props.status === 'used' ? '已核销' : '已过期')
</script>

<template>
  <header :class="styles.header">
    <span :class="styles.statusIcon" role="img" :aria-label="`订单状态：${statusLabel}`">
      <!-- status icon: clock | check | warning -->
    </span>
    <div>
      <component :is="props.titleAs" id="voucher-qr-card-title" :class="styles.title">
        {{ props.title }}
      </component>
      <p v-if="props.subtitle" :class="styles.subtitle">
        {{ props.subtitle }}
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
<script setup lang="ts">
import { computed, useCssModule } from 'vue'
import type { CouponInfoData } from '../types'

const props = defineProps<{
  coupon: CouponInfoData
}>()

const styles = useCssModule()
const amountText = computed(() => `¥${props.coupon.amount.toFixed(2)}`)
</script>

<template>
  <section :class="styles.couponInfo" aria-label="券信息">
    <img
      v-if="props.coupon.iconSrc"
      :class="styles.couponIcon"
      :src="props.coupon.iconSrc"
      :alt="props.coupon.iconAlt ?? ''"
    >
    <div :class="styles.couponText">
      <p :class="styles.couponName">{{ props.coupon.name }}</p>
      <p :class="styles.couponValidity">{{ props.coupon.validity }}</p>
      <p :class="styles.couponAmount">{{ amountText }}</p>
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
<script setup lang="ts">
import { computed, useCssModule } from 'vue'
import type { OrderStatus } from '../types'

const props = defineProps<{
  status: OrderStatus
  qrCodeUrl: string
}>()

const styles = useCssModule()
const inactive = computed(() => props.status !== 'pending')
</script>

<template>
  <section
    :class="[styles.qrArea, inactive && styles.qrAreaInactive]"
    :aria-label="inactive ? '二维码不可用' : '可使用二维码'"
  >
    <img :class="styles.qrImage" :src="props.qrCodeUrl" alt="订单二维码">
    <span v-if="inactive" :class="styles.stamp" aria-hidden="true">
      {{ props.status === 'used' ? '已核销' : '已过期' }}
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
<script setup lang="ts">
import { useCssModule } from 'vue'
import type { OrderStatus } from '../types'

const props = defineProps<{
  status: OrderStatus
  timestamp?: string
}>()

const emit = defineEmits<{
  (event: 'refresh'): void
}>()

const styles = useCssModule()
</script>

<template>
  <footer :class="styles.footer">
    <p v-if="props.status === 'pending'" :class="styles.hint">
      一分钟内有效，过期及异常请
      <button :class="styles.refresh" type="button" @click="emit('refresh')">点击刷新</button>
    </p>
    <p v-else-if="props.timestamp" :class="styles.timestamp">
      {{ props.status === 'used' ? '核销时间' : '过期时间' }}：{{ props.timestamp }}
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

- Remove `lang="ts"` from every `<script setup>`.
- Replace `import type` and `types.ts` with root-level JSDoc typedefs.
- Replace typed `defineProps<...>()` with runtime prop objects, including defaults such as `titleAs: { type: String, default: 'h1' }`.
- Replace typed `defineEmits<...>()` with `defineEmits(['refresh'])`.
- Use `index.js` and export only the component.
