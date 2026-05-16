# React JavaScript CSS Modules Skeleton Template

Use this template when Step 1 selects React + JavaScript + CSS Modules.

> JavaScript notes:
> - No `interface` / `type` / `as` / generic syntax. If you catch yourself writing TS, stop and convert.
> - PropTypes is deprecated in React 19. Use a JSDoc `@typedef` block at the top of the root file to document the prop shape; do NOT add a `propTypes` runtime block.
> - Status values stay as plain string literals (`'pending'`, `'used'`, `'expired'`).
> - React 17+ automatic JSX runtime: do NOT `import React from 'react'` in any file unless you actually use a `React.*` API.

> Module layout: use **one module per independently styled component**. The root owns `QRCodeOrderPage.module.css`; child blocks own co-located files such as `Header.module.css` and `CouponInfo.module.css`.

## File skeleton example

```jsx
// QRCodeOrderPage.jsx
import styles from './QRCodeOrderPage.module.css'
import { cn } from './utils/cn'
import { Header } from './components/Header'
import { CouponInfo } from './components/CouponInfo'
import { QRCodeArea } from './components/QRCodeArea'
import { Footer } from './components/Footer'

// Shared types live in ./types.js — referenced via JSDoc `import('./types').XYZ`.

/**
 * @typedef {Object} QRCodeOrderPageProps
 * @property {import('./types').OrderStatus} status
 * @property {string} title
 * @property {string} [subtitle]
 * @property {'h1' | 'h2' | 'h3'} [titleAs]
 * @property {string} qrCodeUrl
 * @property {string} [timestamp]
 * @property {() => void} [onRefresh]
 * @property {import('./types').CouponInfoData} coupon
 */

const STATUS_CLASS = {
  pending: styles.pending,
  used: styles.used,
  expired: styles.expired,
}

/** @param {QRCodeOrderPageProps} props */
export function QRCodeOrderPage({
  status,
  title,
  subtitle,
  titleAs = 'h1',
  qrCodeUrl,
  timestamp,
  onRefresh,
  coupon,
}) {
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

```js
// types.js
// Shared JSDoc typedefs used across the component and all subcomponents.
// Keep this file free of imports from any component file to avoid reverse dependencies.

/**
 * @typedef {'pending' | 'used' | 'expired'} OrderStatus
 */

/**
 * @typedef {Object} CouponInfoData
 * @property {string} name
 * @property {string} validity
 * @property {number} amount
 * @property {string} [iconSrc]
 * @property {string} [iconAlt]
 */

export {}
```

```js
// utils/cn.js
export function cn(...classes) {
  return classes.filter(Boolean).join(' ')
}
```

```jsx
// components/Header.jsx
import styles from './Header.module.css'

/**
 * @typedef {import('../types').OrderStatus} OrderStatus
 *
 * @typedef {Object} HeaderProps
 * @property {OrderStatus} status
 * @property {string} title
 * @property {string} [subtitle]
 * @property {'h1' | 'h2' | 'h3'} [titleAs]
 */

/** @param {HeaderProps} props */
export function Header({ status, title, subtitle, titleAs: Heading = 'h1' }) {
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

```jsx
// components/CouponInfo.jsx
import styles from './CouponInfo.module.css'

/**
 * @typedef {import('../types').CouponInfoData} CouponInfoData
 *
 * @typedef {Object} CouponInfoProps
 * @property {CouponInfoData} coupon
 */

/** @param {CouponInfoProps} props */
export function CouponInfo({ coupon }) {
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

```jsx
// components/QRCodeArea.jsx
import styles from './QRCodeArea.module.css'
import { cn } from '../utils/cn'

/**
 * @typedef {import('../types').OrderStatus} OrderStatus
 *
 * @typedef {Object} QRCodeAreaProps
 * @property {OrderStatus} status
 * @property {string} qrCodeUrl
 */

/** @param {QRCodeAreaProps} props */
export function QRCodeArea({ status, qrCodeUrl }) {
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

```jsx
// components/Footer.jsx
import styles from './Footer.module.css'

/**
 * @typedef {import('../types').OrderStatus} OrderStatus
 *
 * @typedef {Object} FooterProps
 * @property {OrderStatus} status
 * @property {string} [timestamp]
 * @property {() => void} [onRefresh]
 */

/** @param {FooterProps} props */
export function Footer({ status, timestamp, onRefresh }) {
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

```js
// index.js
export { QRCodeOrderPage } from './QRCodeOrderPage'
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
- For status-driven classes, use an explicit lookup map (e.g. `STATUS_CLASS[status]`) rather than dynamic `styles[status]` indexing — the map narrows valid keys and survives module renaming better.
- Reuse the shared `utils/cn.js` helper for conditional module classes.
- Export components with named exports. The `index.js` barrel re-exports the root component only (no type re-exports in JS).
