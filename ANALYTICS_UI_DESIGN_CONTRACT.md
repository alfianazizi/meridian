# Meridian Analytics UI/UX Design Contract

Status: approved pre-implementation design direction

Reference: Coinbase-inspired institutional crypto design language supplied by the operator. This is an adaptation, not an official Coinbase implementation. Coinbase's licensed fonts and assets must not be copied.

## 1. Design read

Meridian Analytics is an authenticated institutional crypto analytics product for one technical operator. It should feel calm, financially credible, exact, and quietly confident. It is a data product, not a marketing landing page.

Design dials:

- `DESIGN_VARIANCE = 5`: restrained asymmetry; no template-like equal-card wall.
- `MOTION_INTENSITY = 3`: state feedback and short reveals only; charts prioritize legibility.
- `VISUAL_DENSITY = 6`: denser than Coinbase marketing, less dense than a trading cockpit.

Core adaptation rule:

> Preserve the Coinbase-inspired color, typography, radius, restraint, and institutional tone while adapting spacing and component density to an operational analytics dashboard.

## 2. Theme decision

V1 uses one locked light theme.

Reason:

- The supplied reference is fundamentally white-canvas and institutional.
- Meridian's charts, reconciliation tables, and data-quality warnings require predictable contrast.
- A complete dark theme would expand V1 scope and must not be partially implemented.

A single dark near-black surface is allowed only as the Overview signature band. It is a deliberate one-time theme block, not per-section theme switching. All product pages and tables remain light.

Future dark mode must be implemented as a complete token-level mode and verified independently. Do not auto-enable an incomplete `prefers-color-scheme` variant.

## 3. Design tokens

Use semantic CSS variables. Components must not inline hex values.

### Color

```css
:root {
  --color-primary: #0052ff;
  --color-primary-active: #003ecc;
  --color-primary-disabled: #a8b8cc;

  --color-ink: #0a0b0d;
  --color-body: #5b616e;
  --color-muted: #7c828a;
  --color-muted-soft: #a8acb3;

  --color-canvas: #ffffff;
  --color-surface-soft: #f7f7f7;
  --color-surface-strong: #eef0f3;
  --color-surface-dark: #0a0b0d;
  --color-surface-dark-elevated: #16181c;

  --color-hairline: #dee1e6;
  --color-hairline-soft: #eef0f3;

  --color-on-primary: #ffffff;
  --color-on-dark: #ffffff;
  --color-on-dark-soft: #a8acb3;

  --color-up: #05b169;
  --color-down: #cf202f;
  --color-warning: #f4b000;
}
```

Rules:

- Coinbase Blue is the only action/accent color.
- Green and red are semantic text/stroke colors only, never button or large panel backgrounds.
- Yellow is reserved for data-quality warnings and incomplete/unverified status.
- Do not add purple, cyan, gradients, glows, or a second brand accent.
- White, soft gray, and near-black provide hierarchy.

### Typography

Use licensed-safe substitutes:

- Display/body: self-hosted **Inter** in weights 400, 500, 600, and 700.
- Numeric/tabular: self-hosted **JetBrains Mono** in weight 500.
- `font-display: swap`.
- Never fetch production fonts through a third-party `<link>`.

Inter is intentional here because the supplied neutral institutional reference explicitly recommends it as the licensed-font substitute.

Typography scale:

| Token | Desktop | Mobile | Weight | Use |
|---|---:|---:|---:|---|
| `display-page` | 44px/1.05 | 34px/1.1 | 400 | Overview title only |
| `title-page` | 36px/1.1 | 30px/1.15 | 400 | Inner page titles |
| `title-section` | 28px/1.2 | 24px/1.25 | 400 | Major section title |
| `title-card` | 18px/1.33 | 18px | 600 | Card/chart title |
| `body` | 16px/1.5 | 16px | 400 | Explanatory copy |
| `body-small` | 14px/1.5 | 14px | 400 | Tables and metadata |
| `caption` | 12px/1.5 | 12px | 500/600 | Badges and labels |
| `number-kpi` | 30px/1.15 | 26px | 500 mono | Primary KPIs |
| `number-data` | 14px/1.45 | 14px | 500 mono | Tables/charts |

Rules:

- Page and section display weight remains 400.
- Every financial value, percentage, duration, count, address fragment, and chart tooltip number uses JetBrains Mono with `font-variant-numeric: tabular-nums`.
- Dashboard titles must never use 64–80px marketing scales.
- No serif, decorative type, italic display emphasis, or gradient text.

### Radius

Documented mixed system:

- Buttons, filter chips, badges, search: `100px` pill.
- Standard inputs/select triggers: `12px`.
- Compact rows/popovers: `8px`.
- Cards, drawers, chart containers: `24px`.
- Asset/status icons: full circle.

Do not introduce arbitrary intermediate radii.

### Spacing

Base unit: 4px.

- 4, 8, 12, 16, 20, 24, 32, 48.
- Desktop page horizontal padding: 32px.
- Tablet: 24px.
- Mobile: 16px.
- Page section gap: 48px desktop, 32px mobile.
- Card padding: 24px desktop, 20px tablet, 16px mobile.
- Grid gap: 24px desktop, 16px mobile.

The reference's 96px editorial rhythm is reserved for marketing surfaces. Operational dashboard pages use 48px rhythm to keep related data visible without becoming a cockpit.

### Elevation

- Default surfaces are flat.
- Use a 1px hairline for most cards and table boundaries.
- Only hoverable floating surfaces may use `0 4px 12px rgba(10, 11, 13, 0.04)`.
- Popovers/drawers may use one stronger functional shadow.
- No decorative stacked shadows or glow.

## 4. Application shell

### Desktop

- Sticky top navigation, 64px tall, white canvas, bottom hairline.
- Maximum content width: 1440px; analytics content may use the full width within page padding.
- Left: Meridian wordmark/product name and a small live/read-only state indicator.
- Center: Overview, Performance, Reliability, Strategy & Signals, Positions & Decisions, Data Quality.
- Right: freshness, auto-refresh control, export/action overflow.
- Navigation must remain one line. Collapse lower-priority controls before wrapping.

### Tablet and mobile

- Below 1024px, page navigation moves into a left sheet triggered by a 44px icon button.
- Product name, freshness status, and menu trigger remain visible.
- The global filter row becomes a compact summary plus “Filters” pill.
- Filters open in a full-height bottom sheet on mobile.
- Minimum interactive target: 44x44px.

Use Phosphor icons only, stroke weight 1.5. No emoji and no hand-drawn SVG icons.

## 5. Overview composition

The Overview is the only page with a signature dark band.

### Dark overview band

- Near-black full-width band inside the application content area.
- Maximum 520px tall on desktop; it must fit comfortably in the first viewport with navigation and global filters.
- Left: one eyebrow maximum (`READ-ONLY ANALYTICS`), a two-line maximum title, short data-honesty description.
- Right: a real live KPI composition built from actual dashboard components, not a fake screenshot.
- Use one primary blue action at most, normally “Export CSV”; most controls remain dark-secondary pills.
- Layer up to two real KPI/chart cards for depth. On mobile collapse to one card.

The dark band communicates “portfolio and agent state at a glance.” Motion, if present, communicates data refresh or hierarchy only.

### KPI hierarchy

Avoid a generic row of equal cards.

Desktop structure:

- One 2-column primary PnL card spanning two rows.
- Two supporting cards for fees and win/breakeven/loss.
- One reliability card visually separated from trading cards.
- One data-coverage strip beneath the KPI composition.

KPI cards must show:

- Value.
- Exact label.
- Sample size/coverage.
- Comparison only when a legitimate previous period exists.
- Tooltip explaining formula and exclusions.
- Semantic colors on the number or delta only.

## 6. Page patterns

### Performance

- Page title stacked above a short data-scope statement; no split header.
- Primary full-width cumulative realized-PnL chart.
- Secondary asymmetric 2:1 row: realized-close drawdown and return distribution.
- Daily/weekly breakdown uses a chart plus a compact ranked table, not multiple equal cards.
- Explicit warning band: “Closed-trade PnL, not account equity or after-cost profit.”

### Agent Reliability

- Reliability uses neutral ink/blue as the base; failures use red text/strokes sparingly.
- Top section: cycle/outcome classification when supported, plus action execution health.
- Tool latency appears as horizontal distributions or dot/range plots; do not use gauges.
- Error taxonomy uses grouped rows with counts, sample size, and last seen.
- Keep trading PnL entirely off this page except for navigation links.

### Strategy & Signals

- Start with a coverage statement: `304/460 signal snapshots` or current filtered equivalent.
- Use a sortable cohort table and one selected-cohort detail panel.
- Associations show sample count beside every result.
- Low-sample results use yellow warning text/icon, never a yellow panel flood.
- Copy must say “observed association,” never “predicts” or “causes.”
- Signal weight history is visually separate from outcome cohorts.

### Positions & Decisions

- Two top-level tabs: Positions and Decisions.
- Positions table is the densest V1 surface; use 14px body and mono values, 48px row height, sticky header.
- Row click opens a right drawer with lifecycle, performance decomposition, signal snapshot, source links, and quality status.
- Decisions use a compact timeline/list, not cards per decision.
- Address copy actions require explicit icon buttons and accessible labels.
- Failed retries remain visible as separate events in drilldown.

### Data Quality

- Use status rows grouped by Source freshness, Reconciliation, Coverage, and Contract limitations.
- No decorative dashboard “health score.” Show facts and counts.
- Warning color is text/icon only where possible.
- Each issue links to the filtered affected records.
- Permanently show known unavailable analytics: account equity, after-cost net profit, exact historical per-model PnL, and all-history cycle conversion.

## 7. Global filters and controls

Global filters:

- Time range.
- Pool.
- Model where verified/available.
- Role.
- Strategy.
- Outcome/quality.

Behavior:

- Filters are URL-backed.
- Desktop uses one horizontal filter bar with pill triggers.
- Active filters use blue text/border or a subtle blue-tinted surface; do not fill every chip solid blue.
- “Clear all” is a tertiary blue text action.
- Cross-filtering from charts updates URL/query state and shows a removable active-filter pill.
- Date range presets: 24h, 7d, 30d, 90d, All, Custom.
- Auto-refresh: Off, 15s, 30s, 60s. Default 30s.
- Refresh activity uses subtle inline status, not a perpetual spinner.

Button labels must remain one line and use one label per intent across the app.

## 8. Charts

ECharts theme must be defined from semantic tokens.

Rules:

- White or soft-gray plot backgrounds; no gradient plot fills.
- Primary series: blue.
- Positive/negative: green/red strokes or marks only when direction is meaningful.
- Grid lines: hairline soft.
- Axes: muted body text.
- Tooltip: white card, 12px radius, hairline, functional shadow, mono values.
- Zero line is visually stronger than normal grid lines.
- Do not smooth discrete trade-series lines in ways that imply continuous observations.
- Missing periods remain gaps unless aggregation genuinely yields zero.
- Brush/zoom and linked selection must have visible reset controls.
- Legends are interactive and keyboard-accessible where possible.
- Every chart has a table-equivalent or export path.
- Never use pie/donut charts for more than three exclusive outcome categories.
- No 3D, gauges, radial progress, neon, glowing lines, or decorative animation.

Motion:

- Initial chart transition <= 300ms.
- Disable or reduce transitions under `prefers-reduced-motion`.
- Live refresh must not animate the entire chart from zero; preserve context.

## 9. Tables

- Server-side sorting, filtering, and pagination.
- Header remains visible while scrolling.
- Numeric columns right-aligned and mono.
- Text labels left-aligned.
- Default page size 25; options 25, 50, 100.
- Column visibility control on desktop.
- Search uses a 44px pill input with a visible label for screen readers.
- Sorting must be indicated by icon and `aria-sort`.
- Empty cells display an em-free plain label such as `Not available`, or a muted `—` only where screen-reader text provides context.
- Long addresses truncate visually but preserve copy/full-value access.

Mobile:

- Do not force every table into cards.
- Positions use a prioritized compact row with expandable details.
- Reliability tool table allows horizontal scroll with sticky first column.
- Low-priority columns move into row details.
- Pagination controls remain 44px targets.

## 10. States

Every query surface requires:

### Loading

- Skeleton matching final geometry.
- Chart skeleton reserves final aspect ratio.
- Do not use full-page circular spinners.

### Empty

- State exact filter scope and why no records matched.
- Offer one action: clear filters or change range.
- Do not invent motivational copy.

### Error

- Contextual inline error within the affected region.
- State whether cached data remains visible.
- Provide one “Retry” action.
- Data ingestion/source errors link to Data Quality.

### Stale

- Show last successful ingestion and source freshness.
- Stale data remains visible with a warning; do not blank the page.

### Partial coverage

- Show the metric when valid, plus sample/eligible counts.
- Never silently treat missing data as zero.

## 11. Accessibility

- WCAG 2.2 AA minimum; AAA target for body text where achievable.
- Keyboard access for navigation, filters, tabs, tables, drawers, pagination, chart reset, and export.
- Visible 2px blue focus ring with offset.
- Semantic green/red never act as the sole cue; pair with icon, sign, or label.
- All buttons have accessible names.
- Drawer traps focus, supports Escape, restores trigger focus.
- Respect reduced motion.
- Preserve minimum 44px touch targets.
- Validate color contrast for body, muted text, placeholders, buttons, focus, errors, and dark-band copy.
- Charts require text summaries and data-table/export alternatives.

## 12. Responsive contract

Breakpoints:

- Mobile: `<640px`.
- Tablet: `640–1023px`.
- Desktop: `1024–1279px`.
- Wide: `>=1280px`.

Explicit collapse:

- App navigation becomes sheet below 1024px.
- Filter bar becomes bottom sheet below 768px.
- KPI asymmetric grid becomes single column below 768px.
- Dark Overview composition becomes one primary card below 768px.
- 2:1 chart grids stack below 900px.
- Drawers become full-screen sheets below 640px.
- Tables prioritize columns and expose remaining fields in expansion.
- Page padding steps 32 -> 24 -> 16px.

No horizontal page overflow at 320px width. Only intentionally scrollable table/chart regions may scroll horizontally.

## 13. Motion contract

Motion communicates only:

- Hierarchy when a drawer/filter sheet opens.
- Feedback when a control is pressed.
- State transition when filters or data update.
- Relationship when a chart selection cross-filters another view.

Implementation:

- CSS transitions for buttons and simple disclosure.
- Motion library only if required for drawer/layout transitions; verify dependency first.
- Animate transform and opacity only.
- Active button feedback: scale to 0.98 or translate 1px.
- No scroll hijacking, parallax, marquee, magnetic buttons, perpetual floating, or decorative entry choreography.
- Reduced motion collapses transitions to near-instant.

## 14. Content and terminology

Use one functional, institutional register.

Approved labels:

- Realized DLMM position PnL.
- Cumulative realized closed-trade PnL.
- Realized-close drawdown.
- Observed fees.
- Action success rate.
- Recent decision mix.
- Observed association.
- Verified modern / Legacy performance only / Unreconciled.

Forbidden or unsupported labels:

- Account net profit.
- Portfolio equity.
- Account drawdown.
- Model win rate, unless future cycle instrumentation makes it exact.
- Predictive signal.
- AI score or health score without a defined formula.

No emoji, hype, fake precision, cute metaphors, or marketing claims. Every displayed number comes from the analytics API and carries coverage metadata.

## 15. Component inventory

Build owned components, not default library styling:

- `AppShell`
- `TopNavigation`
- `MobileNavigationSheet`
- `GlobalFilterBar`
- `MobileFilterSheet`
- `FreshnessIndicator`
- `AutoRefreshControl`
- `PageHeader`
- `OverviewBand`
- `MetricCard`
- `CoverageStrip`
- `QualityBadge`
- `ChartPanel`
- `ChartTooltip`
- `DataTable`
- `TableToolbar`
- `Pagination`
- `DetailDrawer`
- `EmptyState`
- `ErrorState`
- `StaleState`
- `Skeleton`
- `FormulaTooltip`
- `ExportButton`

Use Radix primitives selectively for accessible dialog, sheet, popover, tooltip, select, and tabs if installed. Do not import Radix Themes or another full design system; Meridian owns the visual system.

## 16. Pre-flight verification

Before declaring UI complete:

1. Verify every visible string against the analytics source contract.
2. Verify no fees are double-counted.
3. Verify no account-equity language appears.
4. Verify all numbers use mono/tabular formatting.
5. Verify blue remains scarce and green/red remain semantic-only.
6. Verify display headings use weight 400.
7. Verify all buttons are pills and all cards follow the 24px rule.
8. Verify every page has loading, empty, error, stale, and partial-coverage behavior.
9. Verify desktop at 1024, 1280, and 1440 widths.
10. Verify mobile at 320, 375, and 430 widths.
11. Verify keyboard navigation and focus restoration.
12. Verify reduced motion.
13. Run Playwright desktop/mobile suites.
14. Run axe critical checks.
15. Run Lighthouse and target LCP <2.5s, INP <200ms, CLS <0.1.
16. Verify browser console has no errors or warnings attributable to the app.
17. Clean up browser automation processes after QA.

## 17. Source-of-truth relationship

- `ANALYTICS_SOURCE_CONTRACT.md` governs data meaning and what may be claimed.
- `ANALYTICS_UI_DESIGN_CONTRACT.md` governs presentation, interaction, responsive behavior, and copy.
- When they conflict, the source contract wins for data semantics and honesty.
- Any departure from this design contract must be documented in the implementation PR with a user-facing rationale.
