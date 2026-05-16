# React TypeScript CSS Modules Skeleton Template

Use this template when Step 1 selects React + TypeScript + CSS Modules.

> React 17+ automatic JSX runtime: do NOT `import React from 'react'` in any file unless you actually use a `React.*` API.
> Module layout: use **one module per independently styled component**. The root owns `QRCodeOrderPage.module.css`; child blocks own co-located files such as `Header.module.css` and `CouponInfo.module.css`.

## File skeleton example

```tsx
// QRCodeOrderPage.tsx
import styles from './QRCodeOrderPage.module.css'
import { cn } from './utils/cn'
import type { CouponInfoData, OrderStatus } from './types'
import { Header } from './components/Header'
import { CouponInfo } from './components/CouponInfo'
import { QRCodeArea } from './components/QRCodeArea'
import { Footer } from './components/Footer'

export interface QRCodeOrderPageProps {
  status: OrderStatus
  title: string
  subtitle?: string
  titleAs?: 'h1' | 'h2' | 'h3'
  qrCodeUrl: string
  timestamp?: string
  onRefresh?: () => void
  coupon: CouponInfoData
}

const STATUS_CLASS: Record<OrderStatus, string> = {
  pending: styles.pending,
  used: styles.used,
  expired: styles.expired,
}

export function QRCodeOrderPage({
  status,
  title,
  subtitle,
  titleAs = 'h1',
  qrCodeUrl,
  timestamp,
  onRefresh,
  coupon,
}: QRCodeOrderPageProps) {
  return (
    <article className={cn(styles.root, STATUS_CLASS[status])} aria-labelledby="voucher-qr-card-title">
      <Header status={status} title={title} subtitle={subtitle} titleAs={titleAs} />
      <div className={styles.card}>
        <CouponInfo coupon={coupon} />
        <hr className={styles.divider} />
        <QRCodeArea status={status} qrCodeUrl={qrCodeUrl} />
      </div>
      <Footer status={status} timestamp={timestamp} onRefresh={onRefresh} />
    </article>
  )
}
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

```ts
// utils/cn.ts
export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}
```

```tsx
// components/Header.tsx
import styles from './Header.module.css'
import type { OrderStatus } from '../types'

interface HeaderProps {
  status: OrderStatus
  title: string
  subtitle?: string
  titleAs?: 'h1' | 'h2' | 'h3'
}

export function Header({ status, title, subtitle, titleAs: Heading = 'h1' }: HeaderProps) {
  const statusLabel = status === 'pending' ? '待使用' : status === 'used' ? '已核销' : '已过期'

  return (
    <header className={styles.header}>
      <span className={styles.statusIcon} role="img" aria-label={`订单状态：${statusLabel}`}>
        {/* status icon: clock | check | warning */}
      </span>
      <div>
        <Heading id="voucher-qr-card-title" className={styles.title}>{title}</Heading>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
    </header>
  )
}
```

```tsx
// components/CouponInfo.tsx
import styles from './CouponInfo.module.css'
import type { CouponInfoData } from '../types'

interface CouponInfoProps {
  coupon: CouponInfoData
}

export function CouponInfo({ coupon }: CouponInfoProps) {
  const amountText = `¥${coupon.amount.toFixed(2)}`

  return (
    <section className={styles.couponInfo} aria-label="券信息">
      {coupon.iconSrc && <img className={styles.couponIcon} src={coupon.iconSrc} alt={coupon.iconAlt ?? ''} />}
      <div className={styles.couponText}>
        <p className={styles.couponName}>{coupon.name}</p>
        <p className={styles.couponValidity}>{coupon.validity}</p>
        <p className={styles.couponAmount}>{amountText}</p>
      </div>
    </section>
  )
}
```

```tsx
// components/QRCodeArea.tsx
import styles from './QRCodeArea.module.css'
import { cn } from '../utils/cn'
import type { OrderStatus } from '../types'

interface QRCodeAreaProps {
  status: OrderStatus
  qrCodeUrl: string
}

export function QRCodeArea({ status, qrCodeUrl }: QRCodeAreaProps) {
  const inactive = status !== 'pending'

  return (
    <section
      className={cn(styles.qrArea, inactive && styles.qrAreaInactive)}
      aria-label={inactive ? '二维码不可用' : '可使用二维码'}
    >
      <img className={styles.qrImage} src={qrCodeUrl} alt="订单二维码" />
      {inactive && <span className={styles.stamp} aria-hidden="true">{status === 'used' ? '已核销' : '已过期'}</span>}
    </section>
  )
}
```

```tsx
// components/Footer.tsx
import styles from './Footer.module.css'
import type { OrderStatus } from '../types'

interface FooterProps {
  status: OrderStatus
  timestamp?: string
  onRefresh?: () => void
}

export function Footer({ status, timestamp, onRefresh }: FooterProps) {
  return (
    <footer className={styles.footer}>
      {status === 'pending' && (
        <p className={styles.hint}>
          一分钟内有效，过期及异常请
          <button className={styles.refresh} type="button" onClick={onRefresh}>点击刷新</button>
        </p>
      )}
      {status !== 'pending' && timestamp && (
        <p className={styles.timestamp}>{status === 'used' ? '核销时间' : '过期时间'}：{timestamp}</p>
      )}
    </footer>
  )
}
```

```ts
// index.ts
export { QRCodeOrderPage } from './QRCodeOrderPage'
export type { QRCodeOrderPageProps } from './QRCodeOrderPage'
export type { CouponInfoData, OrderStatus } from './types'
```

> **Design tokens integration**: If the project has a tokens file (e.g. `src/styles/tokens.css`, `theme.css`, or a theme token file), reference its custom properties (`var(--brand-accent)`, `var(--space-md)`) instead of hardcoding hex/px values. Only fall back to placeholder values when no token file exists; flag this in a code comment so the human reviewer can wire them up later.

## CSS Modules skeleton

```css
/* QRCodeOrderPage.module.css */
.root {}
.pending {}
.used {}
.expired {}
.card {}
.divider {}
```

```css
/* components/Header.module.css */
.header {}
.statusIcon {}
.title {}
.subtitle {}
```

```css
/* components/CouponInfo.module.css */
.couponInfo {}
.couponIcon {}
.couponText {}
.couponName {}
.couponValidity {}
.couponAmount {}
```

```css
/* components/QRCodeArea.module.css */
.qrArea {}
.qrAreaInactive {}
.qrImage {}
.stamp {}
```

```css
/* components/Footer.module.css */
.footer {}
.hint {}
.refresh {}
.timestamp {}
```

## CSS Modules rules

- Use camelCase class names because CSS Modules expose them as properties.
- Prefer one module file per independently styled component. Do not import the root module from every child unless the existing project already uses centralized modules.
- Avoid global selectors. Use `:global(...)` only for project-approved reset/token hooks.
- Keep state classes explicit: `pending`, `used`, `expired`, `qrAreaInactive`.
- For status-driven classes, use an explicit lookup map such as `STATUS_CLASS[status]`; do not use dynamic `styles[status]` indexing in TypeScript.
- Reuse the shared `utils/cn.ts` helper for conditional module classes.
- Export components with named exports and re-export public types from `index.ts`.
