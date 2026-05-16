# React TypeScript BEM Skeleton Template

## File skeleton example

```tsx
// QRCodeOrderPage.tsx
import './QRCodeOrderPage.css'
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
    <article
      className={cn('voucher-qr-card', `voucher-qr-card--${status}`)}
      aria-labelledby="voucher-qr-card-title"
    >
      <Header status={status} title={title} subtitle={subtitle} titleAs={titleAs} />
      <div className="voucher-qr-card__card">
        <CouponInfo coupon={coupon} />
        <hr className="voucher-qr-card__divider" />
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
    <header className="voucher-qr-card__header">
      <span className="voucher-qr-card__status-icon" role="img" aria-label={`订单状态：${statusLabel}`}>
        {/* status icon: clock | check | warning */}
      </span>
      <div>
        <Heading id="voucher-qr-card-title" className="voucher-qr-card__title">{title}</Heading>
        {subtitle && <p className="voucher-qr-card__subtitle">{subtitle}</p>}
      </div>
    </header>
  )
}
```

```tsx
// components/CouponInfo.tsx
import type { CouponInfoData } from '../types'

interface CouponInfoProps {
  coupon: CouponInfoData
}

export function CouponInfo({ coupon }: CouponInfoProps) {
  const amountText = `¥${coupon.amount.toFixed(2)}`

  return (
    <section className="coupon-info" aria-label="券信息">
      {coupon.iconSrc && (
        <img
          className="coupon-info__icon"
          src={coupon.iconSrc}
          alt={coupon.iconAlt ?? ''}
        />
      )}
      <div className="coupon-info__text">
        <p className="coupon-info__name">{coupon.name}</p>
        <p className="coupon-info__validity">{coupon.validity}</p>
        <p className="coupon-info__amount">{amountText}</p>
      </div>
    </section>
  )
}
```

```tsx
// components/QRCodeArea.tsx
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
      className={cn('voucher-qr-card__qr-area', inactive && 'voucher-qr-card__qr-area--inactive')}
      aria-label={inactive ? '二维码不可用' : '可使用二维码'}
    >
      <img className="voucher-qr-card__qr-image" src={qrCodeUrl} alt="订单二维码" />
      {inactive && (
        <span className="voucher-qr-card__stamp" aria-hidden="true">
          {status === 'used' ? '已核销' : '已过期'}
        </span>
      )}
    </section>
  )
}
```

```tsx
// components/Footer.tsx
import type { OrderStatus } from '../types'

interface FooterProps {
  status: OrderStatus
  timestamp?: string
  onRefresh?: () => void
}

export function Footer({ status, timestamp, onRefresh }: FooterProps) {
  return (
    <footer className="voucher-qr-card__footer">
      {status === 'pending' && (
        <p className="voucher-qr-card__hint">
          一分钟内有效，过期及异常请
          <button className="voucher-qr-card__refresh" type="button" onClick={onRefresh}>
            点击刷新
          </button>
        </p>
      )}
      {status !== 'pending' && timestamp && (
        <p className="voucher-qr-card__timestamp">
          {status === 'used' ? '核销时间' : '过期时间'}：{timestamp}
        </p>
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

## CSS skeleton

```css
/* QRCodeOrderPage.css */
.voucher-qr-card {
  --voucher-qr-card-accent: #f97316;
  --voucher-qr-card-text: #1f2937;
  --voucher-qr-card-muted: #6b7280;
  --voucher-qr-card-surface: #ffffff;
  --voucher-qr-card-stamp-opacity: 0.82;
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

## CSS rules

使用 BEM（Block-Element-Modifier）命名：
- **Block**：组件根节点，与组件名对应，kebab-case，如 `voucher-qr-card`
- **Element**：`block__element`，双下划线，如 `voucher-qr-card__header`、`voucher-qr-card__qr-area`
- **Modifier**：`block--modifier` 或 `block__element--modifier`，双连字符，如 `voucher-qr-card--expired`、`voucher-qr-card__qr-area--inactive`
- 禁止超过两层嵌套：`block__element__sub-element` ❌，改用 `block__sub-element` ✅

- 状态变化通过 Modifier 表达，不新建独立 class：`voucher-qr-card--pending` / `--used` / `--expired`
- 动态状态（loading、disabled、active）统一用 `is-` 前缀：`is-disabled`、`is-loading`
- 禁止用 `js-` 前缀的 class 做样式钩子
- 每个组件一个 `.css` 文件，与组件同名：`VoucherQrCard.css`
- 文件内按 Block → Elements → Modifiers 顺序排列
- 不使用全局样式（除 reset/token），所有样式限定在 Block 内
- CSS 自定义属性（变量）用于颜色和间距 token，命名格式：`--component-property`，如 `--voucher-qr-card-stamp-opacity`
- ❌ 禁止内联样式（`style={{}}`），状态样式通过 class 切换
- ❌ 禁止使用 `!important`
- ❌ 禁止 ID 选择器（`#id`）做样式
- ❌ 禁止以标签名作为选择器（如 `div.card`），用 BEM class 代替

## Resources, accessibility, and exports

- Prefer the project's existing icon system. If none exists, use inline SVG for tiny decorative/status icons or pass asset URLs through typed props.
- Decorative icons must use `aria-hidden="true"`; meaningful images need specific `alt` text.
- Do not replace icon placeholders with status text unless the screenshot shows text there.
- QR/code/product images must include `alt`; use `alt=""` only for decorative assets.
- Buttons must have an accessible name via visible text or `aria-label`; do not add `aria-label` when visible text already names the action.
- Do not hardcode heading levels in reusable components when the component may be embedded in a page. Accept an `as`/`titleAs` prop for the main heading when needed.
- Export components with named exports. Avoid default exports unless the existing project convention requires them.
- Add an `index.ts` barrel that re-exports the root component and public prop/status types.
