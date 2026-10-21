# UI/UX Design Brief: My Patient

| | |
|---|---|
| **Product** | My Patient (patient statement portal) |
| **Company** | US24 Solutions |
| **Version** | v1 |
| **Document status** | Draft for review |
| **Date** | October 21, 2026 |
| **Inputs** | 00-app-brief.md, 01-prd.md, 02-trd.md, 03-app-flow.md (approved) |

### How to read this document
- **Screen IDs** (A1, C1, S1, P2…) match 03-app-flow.md. **Issue IDs** (I-xx) refer to that document's Section 5.
- **Design flags** in this document are numbered **DF-xx** and collected in Section 15.
- Colour values are exact. Every text and control colour below was checked against WCAG 2.1 contrast formulas (results in Section 12.2).
- Token names (for example `--color-primary`) are suggested names for CSS custom properties and the Tailwind theme (TRD 3.1).

---

## 1. Experience Goal

### 1.1 One sentence
**A clinic user should feel that their patients' statements are in a safe, orderly place, and find what they need without thinking about the software.**

### 1.2 Who we are designing for

| User | Context | What the design must do |
|---|---|---|
| **Clinic User** (front desk, office manager, provider) | Busy, interrupted, often on a shared computer or a phone; uses the portal a few times a month; not trained | Make the one working path (Patient Statement) obvious. Make search forgiving. Never show other clinics' data. Keep reading effort low. |
| **Specialist** (US24 billing staff) | Daily, long sessions; high volume; works across several clinics | Make the target clinic impossible to miss before publishing. Make imports and errors fast to scan. Surface unanswered remarks. |
| **Admin** (US24 owner or manager) | Occasional, high-consequence actions | Make access changes deliberate and clearly confirmed. Make the audit log readable. |

### 1.3 Design principles
1. **The statement is the hero.** Every screen exists to get a person to a statement or to act on one. Chrome stays quiet.
2. **Say where you are, and for whom.** The clinic name is always visible on staff screens, and it dominates any screen that publishes data.
3. **Exact over friendly.** Numbers line up, dates are unambiguous, and status words are literal ("Withdrawn", not "Archived").
4. **Calm by default, loud only on risk.** One accent colour for action. Red and amber appear only when something is wrong or irreversible.
5. **Private on a shared screen.** Nothing patient-related leaks into page titles, tab names or notifications (DF-06).

---

## 2. Visual Direction: "Clinical Ledger"

### 2.1 Concept
The portal borrows from the quiet, trustworthy look of a **well-kept paper ledger and a printed statement**, not from consumer apps or marketing sites:
- a warm **paper** background with white **sheets** (cards, tables, forms) laid on it;
- dark **ink** text and fine **ruled lines** instead of heavy boxes and shadows;
- **tabular numbers** that line up in columns, like a statement;
- a single deep **teal** accent for actions, chosen because it reads as clinical and calm without being the default "app blue";
- a yellow **highlighter mark** used for exactly two things: the **New** badge and search-match highlighting.

### 2.2 What makes it distinctive
| Signature element | Where | Why it fits |
|---|---|---|
| **Destination plate**: a large, bordered block that reads "Publishing to" with the clinic name in the page-title size | S3, S5, D1 | Directly reduces the biggest risk in the PRD: publishing to the wrong clinic (US-13). |
| **Ruled remarks ledger**: each remark is a ruled row with a coloured left rule and a text label for its type (Clinic, Specialist, Insurance) | P2 | Reads as a history log, not a chat. Supports the "never edited" rule (FR-11.6). |
| **Highlighter "New" tag** | P1, C1 | Feels like a marked-up paper statement and is far more visible than a small dot. |
| **Serif page titles** over a sans-serif interface | All screens | Gives a document-like, trustworthy tone without hurting readability of data. |

### 2.3 What we deliberately avoid
- Gradients, glassmorphism, blurred backgrounds, neon accents and decorative illustrations.
- A grid of identical, heavily rounded, shadowed cards. Only C1 uses cards as navigation; everywhere else uses ruled lists and tables.
- Decorative motion, parallax, animated counters and confetti.
- Dashboards full of charts. The PRD has no analytics in v1 (PRD 9.2).

### 2.4 Brand alignment
- The **US24 Solutions logo** appears top-right on every screen (N3, FR-1.1). The palette is neutral enough to sit beside the existing logo without clashing.
- **The logo's exact colours have not been verified** (DF-11). If the logo's main colour clashes with the teal accent, keep the teal and use a single-colour (ink) version of the logo in the header.
- The reference site (myclinicreports.com) was unavailable for review, and no specific likes were given, so nothing here copies it (DF-12).

---

## 3. Colour

### 3.1 Semantic palette (light theme, v1)

#### Surfaces and lines
| Token | Value | Role |
|---|---|---|
| `--color-bg` | `#F7F6F2` | Page background ("paper") |
| `--color-surface` | `#FFFFFF` | Sheets: tables, forms, cards, dialogs, remarks |
| `--color-surface-sunken` | `#EFEDE6` | Filter bars, table header row, read-only fields, secondary-button hover |
| `--color-border` | `#DDD9CF` | Decorative rules and sheet edges only. **Never** the only boundary of a control. |
| `--color-border-control` | `#7C776B` | Borders of inputs, selects, checkboxes, radios, file zones (≥ 3:1 against every surface) |

#### Text
| Token | Value | Role |
|---|---|---|
| `--color-text` | `#1C2430` | Body text, headings, table data |
| `--color-text-muted` | `#465163` | Secondary text, labels, column headers |
| `--color-text-subtle` | `#5E6878` | Captions, timestamps, hints, "Coming soon" labels. Minimum for any readable text. |
| `--color-text-on-primary` | `#FFFFFF` | Text on primary and danger buttons |

#### Action
| Token | Value | Role |
|---|---|---|
| `--color-primary` | `#0D5C63` | Primary buttons, links, active card rule, selected state, Specialist remark rule |
| `--color-primary-hover` | `#09474D` | Hover and pressed state of primary |
| `--color-primary-subtle` | `#E1EFEF` | Selected table row, active filter, info banner background |
| `--color-focus` | `#1F5BD6` | Keyboard focus ring only |

#### Status
| Token | Text / icon | Background | Role |
|---|---|---|---|
| Success | `#1D6B3B` | `#E5F1E8` | Published, saved, "Remark added" |
| Warning | `#7E4D00` | `#FAEFD9` | Possible duplicates, partially imported, session warning, withdrawn banner |
| Danger | `#A3201C` | `#FBE8E6` | Errors, failed imports, destructive buttons, deactivated status |
| Info | `#1C2430` text, `#0D5C63` icon | `#E1EFEF` | Neutral notices |
| Highlight | `#1C2430` text | `#FFE27A` | **New** badge and search-match highlight only |

#### Remark types (F11)
| Type | Rule and label colour | Label text |
|---|---|---|
| Clinic | `#7A3B69` (plum) | "Clinic" |
| Specialist | `#0D5C63` (teal) | "US24 Specialist" (wording depends on PRD Q2) |
| Insurance | `#2E4C8C` (blue) | "Insurance · [Company name]" |

### 3.2 Colour usage rules
- **One accent.** Teal is the only colour for "you can act here". Status colours never appear on buttons except the destructive button.
- **Colour never carries meaning alone.** Every status, badge and remark type also has a text label, and errors also have an icon (WCAG 1.4.1).
- **Red is reserved** for errors, failures and irreversible actions. A negative balance (a credit) is shown with a minus sign and the word "credit", not in red.
- **Yellow highlighter is reserved** for New and search matches. It is never used for warnings.
- **Status backgrounds** (`#E5F1E8`, `#FAEFD9`, `#FBE8E6`, `#E1EFEF`) are used for banners and badges only, never for large page areas.

### 3.3 Dark mode and high contrast
- **v1 ships a light theme only** (DF-10). The palette is defined as tokens so a dark theme can be added later without changing components.
- **Windows High Contrast / forced-colors mode must work**: no meaning carried by background images, all borders drawn as real borders, focus ring uses `outline` (which forced-colors keeps).

---

## 4. Typography

### 4.1 Families
| Use | Family | Fallback stack | Why |
|---|---|---|---|
| Interface and body | **IBM Plex Sans** (400, 500, 600) | `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` | Highly legible at small sizes, has true tabular figures, slightly technical tone suits billing |
| Page titles only | **Source Serif 4** (600) | `Georgia, "Times New Roman", serif` | Document-like, trustworthy; used sparingly so it stays distinctive |
| Identifiers | **IBM Plex Mono** (400, 500) | `ui-monospace, "SF Mono", Consolas, monospace` | Account numbers, clinic IDs, import row numbers, audit targets: easy to read and compare character by character |

- All three are open-source (SIL Open Font License).
- **Fonts are self-hosted** as WOFF2 files served by the app (TRD 3.5, whitenoise). No third-party font service is called, which keeps the Content Security Policy simple and avoids sending clinic users' IP addresses to another company.
- Use `font-display: swap` so text is never invisible while fonts load.

### 4.2 Type scale (desktop; mobile changes in brackets)
| Token | Family | Size / line height | Weight | Use |
|---|---|---|---|---|
| `title-page` | Source Serif 4 | 28 / 36 px (24 / 32) | 600 | One per page: "Patient Statements", "Import preview", destination plate clinic name |
| `title-section` | Plex Sans | 20 / 28 px (18 / 26) | 600 | Section headings: "Remarks", "My clinics", "Possible duplicates" |
| `title-card` | Plex Sans | 17 / 24 px | 600 | Card and dialog titles, patient name on P2 summary |
| `body` | Plex Sans | 16 / 24 px | 400 | Default text, form inputs, remark text |
| `body-strong` | Plex Sans | 16 / 24 px | 600 | Emphasis, table row primary column (patient name) |
| `label` | Plex Sans | 14 / 20 px | 500 | Form labels, column headers, button text (small) |
| `small` | Plex Sans | 14 / 20 px | 400 | Secondary data, table cells on dense staff tables |
| `caption` | Plex Sans | 13 / 18 px | 400 | Timestamps, hints, character counter, "Coming soon" |
| `mono` | Plex Mono | 15 / 22 px | 400 | Account numbers, clinic IDs, row numbers |
| `amount` | Plex Sans, `font-variant-numeric: tabular-nums` | 16 / 24 px | 500 | All money values |
| `amount-hero` | Plex Sans, tabular | 28 / 36 px (24 / 32) | 600 | Balance due on P2 summary |

### 4.3 Typography rules
- **Minimum text size is 13 px**, and 13 px is for captions only. Form inputs are **16 px** everywhere, which also stops iOS from zooming on focus.
- **Line length** for reading text (remarks, notices): 50–75 characters, maximum container 720 px.
- **No all-caps** for anything longer than a two-word badge. Badges may use small caps with 0.04 em letter spacing.
- **Money is right-aligned** in tables and always uses tabular figures, so decimal points line up.
- **Headings are real headings** (one `h1` per page, then `h2`, `h3` in order). Visual size never replaces semantic level.

---

## 5. Spacing, Grid and Layout

### 5.1 Spacing scale (4 px base)
| Token | Value | Typical use |
|---|---|---|
| `space-1` | 4 px | Icon-to-text gap, badge padding |
| `space-2` | 8 px | Between label and input, inside compact rows |
| `space-3` | 12 px | Input padding (vertical), between related fields' helper text |
| `space-4` | 16 px | Default gap between form fields; mobile page gutter |
| `space-5` | 24 px | Between groups; desktop gutter; card padding |
| `space-6` | 32 px | Between page sections |
| `space-7` | 48 px | Above page title; around C1 card group |
| `space-8` | 64 px | Large vertical rhythm on auth screens (desktop) |

Use only these values. Spacing communicates grouping: related items closer together than unrelated ones.

### 5.2 Breakpoints (aligned with Tailwind defaults, TRD 3.1)
| Name | Min width | Layout behaviour |
|---|---|---|
| base | 0 | Single column; **must work from 320 px** (DF-04) |
| `sm` | 640 px | Single column, roomier spacing |
| `md` | 768 px | Two-column forms; tables may start to show |
| `lg` | 1024 px | Full tables, side-by-side detail layout on P2 |
| `xl` | 1280 px | Content stays capped; extra width becomes margin |

### 5.3 Containers
| Container | Max width | Used on |
|---|---|---|
| `narrow` | 440 px | Auth screens (A1–A6), dialogs |
| `reading` | 720 px | Forms (S2, S4, M4, M6), confirm screens (S3), G2/G3 |
| `standard` | 1200 px | Lists, tables, dashboards, P2, admin screens |
| `print` | Page width (Letter, 0.6 in margins) | P3 |

- **Gutters:** 16 px below `md`, 24 px from `md`, 32 px from `lg`.
- **Grid:** a 12-column grid inside `standard` from `lg`; 4 columns below. Use it for page-level layout only, not to force every element onto columns.

### 5.4 Layout patterns
| Pattern | Structure | Screens |
|---|---|---|
| **Auth** | Header bar with logo right; centered `narrow` sheet; nothing else | A1–A6 |
| **Hub** | Header; centered group of items in the visual middle of the viewport | C1, M1 |
| **List** | Header; back link; page title row with primary action on the right; filter bar; table; pagination | P1, M2, M5, M8 |
| **Detail** | Header; back link or breadcrumb; page title; two columns from `lg` (main content 8 cols, side panel 4 cols); stacked below `lg` | P2, M3, M7, S6 |
| **Form** | Header; back link; page title; `reading`-width sheet; actions at the bottom, primary on the left | S2, S4, M4, M6 |
| **Confirm** | Header; destination plate; summary; actions | S3, S5 |

---

## 6. Shape, Borders and Elevation

| Property | Value | Rule |
|---|---|---|
| Radius: controls | 4 px | Inputs, buttons, selects, file zone |
| Radius: sheets | 6 px | Cards, tables, banners, dialogs |
| Radius: badges | 999 px (pill) | Status badges and the New tag only |
| Border: sheet | 1 px `--color-border` | Every sheet has an edge, so structure survives forced-colors mode |
| Border: control | 1 px `--color-border-control` (2 px on error, in danger colour) | |
| Shadow: none | — | Default for everything on the page |
| Shadow: overlay | `0 8px 24px rgba(28,36,48,.18)` | Dialogs and the session warning only |
| Header separation | 1 px bottom border | No shadow on the header |

Depth comes from the paper/sheet contrast and borders, not from shadows.

---

## 7. Components

### 7.1 Header (N2, N3, FR-3.1)
- **Height:** 64 px desktop, 56 px below `md`. White surface, 1 px bottom border. Not sticky on mobile (saves screen space); sticky from `lg` on long pages.
- **Left:** user's full name in `body-strong`. On narrow screens, truncate with an ellipsis; the full name is available as the element's accessible name.
- **Right:** US24 Solutions logo (max height 32 px desktop, 28 px mobile), which links to the role's home screen, followed by a **Sign out** text button.
- The logo link's accessible name is "US24 Solutions — go to home".
- On auth screens the header shows only the logo (no user name or Sign out).
- **No other items** in the header (FR-3.1). Navigation lives in the page (Section 7.3, DF-01).

### 7.2 Buttons
| Variant | Look | Use |
|---|---|---|
| **Primary** | Teal fill `#0D5C63`, white text, 600 weight | One per view: Sign in, Verify, Continue, Confirm and publish, Publish valid rows, Post remark, Send invitation, Save |
| **Secondary** | White fill, 1 px `--color-border-control`, ink text | Cancel, Back to edit, Download PDF, Print, Download template, Export |
| **Tertiary (text)** | No fill or border, teal text, underline on hover | Low-emphasis actions: Resend code, Clear filters, Forgot password? |
| **Destructive** | Danger fill `#A3201C`, white text | Only the final confirm in D1 (Withdraw) and D2 (Deactivate, Unassign, Reset 2-step) |

- **Sizes:** default 44 px tall (16 px text, 16 px horizontal padding); compact 36 px (staff tables only, desktop only, never below `md`).
- **Minimum touch target** is 44 × 44 px on touch screens, even for compact buttons (extend the hit area with padding).
- **Label rules:** verb first, specific ("Publish 482 statements", not "Submit"). Destructive confirm buttons repeat the action ("Withdraw statement", "Deactivate user").
- **Order:** primary action first (left) in forms; in dialogs, primary on the right of Cancel on desktop, stacked full width with primary on top on mobile.
- **Busy state:** the button keeps its width, shows a 16 px spinner before the label and changes the label ("Publishing…"); it is disabled while busy to prevent double submission (03-app-flow 4.1).

### 7.3 Navigation in the page
| Component | Behaviour |
|---|---|
| **Back link** | Directly above the page title: "← Back to statements". Text link, `label` size. Every screen below a landing screen has one (I-05). |
| **Breadcrumb (staff only)** | On P1, P2 and S6 for specialists and admins: "Dashboard › Lakeside Family Clinic › Statement". The clinic name in the breadcrumb is the main "where am I" cue for staff. Collapses to the back link below `md`. |
| **Pagination** | "Previous", page numbers (current page marked with `aria-current="page"` and a teal underline), "Next". Shows "Showing 26–50 of 312". Below `md`: Previous / "Page 2 of 13" / Next only. |
| **Skip link** | "Skip to main content" is the first focusable element on every page; visible on focus. |

### 7.4 Form inputs
| Element | Specification |
|---|---|
| **Text input** | 44 px tall, 16 px text, 12 px horizontal padding, 1 px control border. Label always visible above (never a placeholder used as a label). Hint text below the label, before the input. |
| **Password** | Text input plus a "Show" / "Hide" text toggle inside the right edge (a real button with `aria-pressed`). Rules shown as a short list under the field before typing, not only after an error. |
| **Verification code** (A2) | **One** input, not six boxes, so pasting and screen readers work. `inputmode="numeric"`, `autocomplete="one-time-code"`, letter spacing 0.3 em, 24 px Plex Mono, width fits 6 digits. |
| **Select** | Native `<select>` styled to match the text input. Used for clinic pickers, role, sort. |
| **Date** | Native date input for date ranges and statement date, with the hint "Month, day, year" above. Displayed dates elsewhere always use the month name (Section 13, DF-13). |
| **Textarea** (remarks, withdrawal reason) | Minimum 4 lines, grows to 12. Character counter below right: "1,240 / 2,000"; turns warning colour at 1,800 and danger colour over 2,000, and the counter is announced politely only at those two thresholds. |
| **Radio group** | Remark type (Specialist / Insurance), duplicate decision (Skip / Publish as new version). Real `fieldset` and `legend`. 20 px controls, full row clickable. |
| **Checkbox** | "Include remarks" for print. 20 px control, full label clickable. |
| **File input** (S2, S4) | A bordered drop zone with a real "Choose file" button inside. Drag and drop is an enhancement only. Shows accepted types and limits: "PDF only, up to 10 MB". After selection: file name, size and a "Remove" text button. |
| **Search** | Text input with a leading search icon and a visible label "Search by patient name or account number". Results update after typing pauses (400 ms) and on Enter. |

**Error pattern (all forms):**
1. On submit, a **summary banner** at the top lists each problem as a link to its field, and receives focus.
2. Each field with a problem gets a 2 px danger border, a danger icon and a message directly under it, connected with `aria-describedby`.
3. Messages say what to do: "Enter the statement date", not "Invalid input".
4. The user's input is never cleared because of an error (except password fields).

### 7.5 Tables
- White sheet, 1 px border, header row on `--color-surface-sunken` in `label` style (muted text).
- **Rows:** 52 px tall (clinic users), 44 px (staff compact). Horizontal rules only, no vertical lines, no zebra striping.
- **Whole row is clickable** for navigation, but the patient name is also a real link so keyboard and screen-reader users get a normal link.
- Money right-aligned, tabular figures. Account numbers in Plex Mono.
- **Sortable columns** use a real button in the header with an arrow icon and `aria-sort`.
- Every table has a `caption` (visible or visually hidden), for example "Patient statements for Lakeside Family Clinic, page 2 of 13".
- **Below `md`** a table becomes a **stacked list of statement rows** (Section 10.3). Horizontal scrolling of tables is not allowed for clinic-facing tables; it is allowed only for the admin audit log, inside a labelled, focusable scroll region.

### 7.6 Cards
Cards are used **only** where the content is genuinely a set of separate destinations.

| Card | Spec |
|---|---|
| **Home card** (C1) | 280 × 200 px desktop. White sheet, 1 px border, 4 px **top rule** in teal for the active card. Content: a simple line icon (32 px), the card title in `title-card`, one line of description in `small` muted, and for Patient Statement a New count ("3 new") using the highlighter tag. The whole card is one link. |
| **Disabled home card** | Same size, `--color-surface-sunken` background, dashed 1 px control border, no top rule, icon and title in `--color-text-subtle`, "Coming soon" tag. Not a link, not focusable, `aria-disabled="true"`; its text stays readable at 4.8:1 (DF-02, DF-08). |
| **Hub card** (M1) | Same pattern as the home card, all three active. |

Dashboard clinic lists (S1) and admin lists are **ruled lists**, not card grids.

### 7.7 Badges and tags
| Badge | Look |
|---|---|
| **New** | Highlighter yellow `#FFE27A` background, ink text, 600 weight, pill. Text "New". Never a coloured dot alone. |
| **Status** | Pill with status background and status text colour, plus a 12 px icon: Published (success, check), Partially imported (warning, half-circle), Failed (danger, cross), Cancelled (neutral sunken, dash), Withdrawn (warning, archive), Invited (info, envelope), Active (success, check), Deactivated / Inactive (neutral sunken, slash). |
| **Remark type** | Text label in the remark type colour (Section 3.1) with a 3 px left rule on the remark entry. |
| **Coming soon** | Neutral sunken pill, `--color-text-subtle` text. |

### 7.8 Feedback
| Component | Spec |
|---|---|
| **Banner** (page-level) | Full width of its container, status background, 4 px left rule in the status colour, icon, one-line title and optional body. Success and info banners use `role="status"`; error banners use `role="alert"`. **Banners persist** until the user dismisses them or leaves the page. |
| **Inline message** | Small text with icon under the element it concerns (field errors, "Remark added"). |
| **Toasts** | **Not used.** Auto-dismissing messages are easy to miss and fail users who need more time (DF-09). |
| **Empty state** | Centered in the content area: a 40 px line icon, a one-sentence explanation in `body`, and at most one action. Uses the exact copy in 03-app-flow (e.g. "No statements have been shared with your clinic yet."). |
| **Loading (short, < 1 s)** | Nothing shown for the first 300 ms; then a busy indicator on the affected area only, with `aria-busy="true"`. |
| **Loading (page)** | Skeleton rows matching the final layout (grey `--color-surface-sunken` bars). No shimmer animation. |
| **Long task (import check, up to 2 min, NFR-14)** | An indeterminate progress bar plus text: "Checking your file… this can take up to 2 minutes." After 20 seconds, add the elapsed time: "Still checking (0:45)". Never a fake percentage. |

### 7.9 Dialogs
- Centered `narrow` sheet with overlay shadow on a `rgba(28,36,48,.48)` backdrop. Full-screen sheet below `sm`.
- Native `<dialog>` element (or equivalent): focus moves to the dialog title on open, is trapped inside, and returns to the triggering button on close. **Escape** closes (except G1, where Escape means "Stay signed in").
- Title states the consequence ("Withdraw this statement from Lakeside Family Clinic?"); body says what happens; buttons name the action.
- Backdrop click does **not** close destructive dialogs (prevents accidental dismissal mid-decision).

### 7.10 Destination plate (signature component)
Used on **S3** (single upload), **S5** (import preview) and **D1** (withdraw).
- A white sheet with a 2 px teal border and 24 px padding, placed directly under the page title.
- Line 1: `label` text "Publishing to" (S3, S5) or "Withdrawing from" (D1).
- Line 2: the **clinic name in `title-page` (Source Serif 4, 28 px)**, followed by the clinic ID in Plex Mono.
- Line 3 (S5 only): "482 statements will be published" in `body-strong`.
- The plate is the first thing announced on the page by screen readers after the page title.

### 7.11 Remarks ledger (P2)
- A ruled list in chronological order, oldest at the top (FR-11.1).
- **Each entry:** 3 px left rule in the remark type colour → first line: type label · author name · role · date and time (caption, muted) → remark text in `body`, preserving line breaks.
- **Insurance entries** add a second meta line: "Insurance company: Aetna · Reference: 88213-A" (reference in Plex Mono).
- No edit, delete or reaction controls on any entry (FR-11.6).
- **Add-remark form** sits directly **below** the last entry, so the history reads top to bottom and the next entry goes where the eye already is. A caption above the form: "Remarks can't be edited or deleted after posting."
- After posting, the new entry appears at the bottom, focus moves to it, and "Remark added" is announced. No flash or slide animation.
- When opened from an unanswered remark on S1, the page scrolls to that remark and gives it a 2 s `--color-primary-subtle` background that then fades (instant under reduced motion).

### 7.12 PDF area (P2)
- From `lg`: an embedded viewer in the main column, at least 640 px tall, with a visible caption "Original statement (PDF)" and a **Download PDF** button above it (see I-14 for the technical decision on embedding).
- Below `lg`: no embedded viewer; a bordered block with the file name, size and **View PDF** / **Download PDF** buttons (03-app-flow P2).
- The structured statement fields are **always** shown in HTML above the PDF, because uploaded PDFs are often not accessible (DF-05).

---

## 8. Interaction States

Every interactive component must define all states that apply to it. Hover-only behaviour is never the only way to discover or trigger something.

| State | Visual treatment | Applies to |
|---|---|---|
| **Default** | As specified in Section 7 | All |
| **Hover** (pointer only) | Primary: `#09474D` fill. Secondary: `--color-surface-sunken` fill. Text button and links: underline. Table row: `--color-surface-sunken` background. Home card: border becomes control colour. | Buttons, links, rows, active cards |
| **Focus-visible** | 2 px `#1F5BD6` outline with 2 px offset (a white gap), always visible, never removed. Same ring on every component. | Everything focusable |
| **Active / pressed** | Primary: `#09474D`. Secondary: 1 px inset. No scale or bounce. | Buttons |
| **Selected** | `--color-primary-subtle` background plus a 2 px teal left rule or a check icon; `aria-selected` / `aria-checked` / `aria-current` as appropriate | Sort column, current page, radio/checkbox, chosen duplicate action |
| **Disabled** | `--color-surface-sunken` fill, `--color-text-subtle` text, no pointer cursor, `disabled` attribute (or `aria-disabled` when it must stay readable). Explain why nearby when the reason isn't obvious ("Choose an action for each duplicate to publish"). | Buttons, inputs, C1 cards |
| **Busy / loading** | Spinner plus changed label on buttons; `aria-busy` on regions | Buttons, lists, preview |
| **Error** | 2 px danger border, danger icon, message below, `aria-invalid="true"` | Inputs, file zone, textarea |
| **Read-only** | `--color-surface-sunken` background, no border change, text stays full contrast; `readonly` attribute | Fields on confirm screens, withdrawn statements |
| **Visited** | Not styled differently (the portal is an application, not a document set) | Links |
| **Empty** | Section 7.8 empty state | Lists, tables, logs |

---

## 9. Screen Composition

Copy and behaviour come from 03-app-flow.md; this section defines layout and hierarchy only.

### 9.1 Authentication (A1–A6)
- **Layout:** Auth pattern. Paper background; header bar with logo top-right only; a white `narrow` sheet with its top edge at 15 vh on desktop and 32 px on mobile.
- **Inside the sheet:** "My Patient" in `title-page`, then a one-line purpose in `small` muted ("Secure statement portal for US24 Solutions clients"), then the form.
- **A1:** Email, Password, **Sign in** (full width), then "Forgot password?" text button. Message banners (timeout, signed out, password changed) appear **above** the form inside the sheet.
- **A2:** Title "Check your email"; masked address; the single code input; **Verify**; then "Resend code" and "Use authenticator app instead" as text buttons on one line (stacked on mobile); "Cancel and return to sign in" at the bottom.
- **A3–A5:** One purpose each; success states replace the form with a banner and a single "Back to sign in" button.
- **A6:** QR code (200 px) with the manual key below it in Plex Mono, grouped in fours; then the confirm code input.

### 9.2 C1 – Clinic Home
- **Layout:** Hub pattern. Only the header and the three cards (FR-3.2). No welcome text, no title visible (a visually hidden `h1` "Home" for screen readers).
- **Placement:** the card group is centered horizontally and vertically in the space below the header; gap 24 px.
- **Order:** see DF-02. Recommended: **Patient Statement first** (left), then AR Report, then Clinic Collection, in the same order on every screen size.
- **Below `md`:** cards stack full width at 120 px tall, icon left and text right.

### 9.3 S1 – Specialist Dashboard
- **Layout:** `standard` container. Page title "Dashboard" with **Upload Statement** (secondary) and **Import Statements** (primary) on the right of the title row; they move under the title on mobile.
- **From `lg`, two columns:**
  - **Left (8 cols): "Unanswered clinic remarks"** first, because it is the item that needs action. Ruled list; each row shows clinic, patient name, account number (mono), a two-line excerpt of the remark, and the time. A count in the heading: "Unanswered clinic remarks (7)".
  - **Below it: "Recent uploads and imports"** as a compact table with status badges.
  - **Right (4 cols): "My clinics"**, a ruled list: clinic name, clinic ID (mono), statement count right-aligned. Each row links to P1.
- **Below `lg`:** order is Unanswered remarks → My clinics → Recent uploads.

### 9.4 S2 – Upload statement: details and PDF
- **Layout:** Form pattern, `reading` width.
- **Groups (each with an `h2`):**
  1. "Clinic": the clinic picker alone.
  2. "Statement": required fields first (patient name, account number, statement date, balance due), two columns from `md`.
  3. "More details (optional)": optional fields, collapsed into a disclosure by default to keep the form short.
  4. "Statement file": the file input.
- **Actions:** **Continue** (primary), **Cancel** (secondary).

### 9.5 S3 – Upload statement: confirm
- **Layout:** Confirm pattern. Page title "Confirm and publish".
- **Order:** destination plate → a two-column summary list (patient name, account number, statement date, balance due, file name) → the notice "Once published, Lakeside Family Clinic's users can see this statement immediately." → **Confirm and publish** (primary) and **Back to edit** (secondary).
- The clinic name appears **only** in the plate and the notice, so it stands out.

### 9.6 S4 – Import: choose clinic and file
- **Layout:** Form pattern. Clinic picker → file input with limits → a "Download template" secondary button with the caption "Use the template so your columns match." → **Check file** (primary), **Cancel**.
- While checking, the form fields become read-only and the long-task indicator (Section 7.8) appears under the actions.

### 9.7 S5 – Import preview
- **Layout:** `standard` container. Page title "Import preview" → destination plate (with file name and the count of statements to publish).
- **Summary strip:** four figures in a ruled row: Total rows · Valid · Invalid · Possible duplicates. Each figure has a text label and uses status colour only on its icon.
- **Sections in this order:**
  1. **Possible duplicates** (if any), with a warning banner: "These rows match statements already published. Choose what to do with each one." A compact table with a radio pair per row, plus "Skip all" / "Publish all as new versions" text buttons above it.
  2. **Rows that can't be published** (if any): table of row number (mono), field, reason; **Download error report** button.
  3. **Rows ready to publish**: collapsed disclosure showing the first 25 rows, so the screen doesn't become a 5,000-row page.
- **Action bar:** sticky at the bottom of the viewport: "Publish 482 statements to Lakeside Family Clinic" (primary, with the count and clinic name in the label) and **Cancel**. The primary button stays disabled with an explanation until every duplicate has a decision.

### 9.8 S6 – Import result
- **Layout:** Detail pattern, single column. A success or warning banner at the top ("482 statements published to Lakeside Family Clinic"); a ruled summary list of counts; actions: **View clinic statements** (primary), **Import another file**, **Back to dashboard**; **Download error report** only when there are failed rows.

### 9.9 P1 – Statement list
- **Layout:** List pattern. Breadcrumb (staff) or back link to Home (clinic user). Page title "Patient Statements"; for staff the clinic name sits directly under the title in `title-section`.
- **Filter bar** (sunken background): search (widest), statement date from / to, sort select, **Clear filters** text button. Below `md` the date range and sort collapse into a "Filters" disclosure; search always stays visible.
- **Result count** above the table: "312 statements" or "4 statements match 'garcia'".
- **Table columns:** Patient name (with New tag) · Account number · Statement date · Balance due (right) · Last remark.
- **Search matches** are highlighted with the highlighter colour inside patient name and account number.
- **Staff-only status filter** (Active / Withdrawn) appears in the filter bar if I-08 is approved.

### 9.10 P2 – Statement detail
- **Layout:** Detail pattern.
- **Top:** back link or breadcrumb → page title "Statement" (never the patient's name in the `title` element, DF-06) → a summary band:
  - patient name in `title-card`, account number in mono, statement date;
  - **balance due in `amount-hero`**, right-aligned on desktop;
  - "Published Oct 18, 2026 by US24 Specialist" in caption;
  - actions: **Download PDF**, **Print** (secondary), and for specialists **Withdraw statement** as a tertiary text button styled in danger colour, placed apart from the other buttons.
- **From `lg`, two columns:**
  - **Main (8 cols):** statement fields (definition list in two columns) → PDF area or standard statement layout.
  - **Side (4 cols):** "Other statements for this patient" (ruled list of dates and balances) → **Remarks** ledger and add-remark form.
- **Below `lg`:** summary → actions → Remarks → statement fields → PDF block → other statements.
  Remarks move up on mobile because adding or reading a remark is the most common task after opening a statement.
- **Withdrawn (staff view):** warning banner directly under the title with date, person and reason; the add-remark form is replaced by a read-only note (if I-09 is approved).

### 9.11 P3 – Print view
- **Layout:** Letter-size print stylesheet. No header bar or buttons in print. Top: US24 Solutions logo (single-colour) and "Patient statement" title; clinic name; then the summary, fields and (optionally) remarks as a plain ruled list.
- **Footer on each page:** "Printed by [name] on [date and time] · Page X of Y" and "Contains protected health information".
- **On screen** (before printing): a slim toolbar with **Print again** and **Close**, hidden in print.
- **Colour:** printable in black and white; remark types rely on their text labels.

### 9.12 D1 – Withdraw dialog
- Destination plate variant ("Withdrawing from") at the top of the dialog → patient name and account number → required "Reason" textarea → **Withdraw statement** (destructive) and **Cancel**.

### 9.13 Admin screens (M1–M8, D2)
- **M1:** Hub pattern with three active cards: Clinics, Users, Audit log.
- **M2, M5:** List pattern; primary action ("Add clinic", "Invite user") in the title row; status badges in tables.
- **M3, M7:** Detail pattern.
  - Main column: details as a definition list, then related lists (clinic users, assigned specialists or assigned clinics).
  - Side column: actions grouped by risk. Everyday actions (Edit, Invite user, Assign specialist, Resend invitation, View statements) come first; risky actions (Deactivate, Reset 2-step) are separated by a rule under a "Manage access" heading.
- **M4, M6:** Form pattern. On M6 the Clinic field appears only when "Clinic User" is chosen, and focus is not moved when it appears.
- **M8:** List pattern with a dense table (compact rows). Timestamps in Plex Mono with time zone label. Target IDs in mono. The table may scroll horizontally on small screens inside a labelled region (Section 7.5).
- **D2:** Standard dialog; destructive styling for Deactivate and Unassign; Reset 2-step uses destructive styling too, because it removes a security factor.

### 9.14 Global screens (G1–G3)
- **G1:** Dialog with a warning icon, title "Are you still there?", the countdown in `amount-hero` style (tabular digits, e.g. "1:42"), **Stay signed in** (primary, focused on open) and **Sign out** (secondary).
- **G2, G3:** `reading` container, centered: line icon, `title-page` message, one sentence, **Go to home** (primary); G3 adds **Try again** and a reference code in mono.

---

## 10. Mobile-Specific Behaviour

### 10.1 General
- Design and test at **320, 375 and 414 px** widths; nothing may scroll horizontally except the audit-log table region (DF-04).
- All tap targets at least 44 × 44 px with at least 8 px between adjacent targets.
- Inputs at 16 px text (prevents iOS zoom); correct keyboards: `type="email"` on email, `inputmode="numeric"` on codes and account numbers if numeric-only (to be confirmed by PRD Q1), `inputmode="decimal"` on amounts.
- Respect safe areas (`env(safe-area-inset-*)`) for any sticky bottom bar.
- No hover-dependent content. No swipe-only gestures.

### 10.2 Header and navigation
- Header 56 px; user name truncates first, the logo and Sign out never truncate.
- Breadcrumbs collapse to the back link.

### 10.3 Lists become stacked rows
Each statement row on mobile shows, in this order:
1. Patient name (body-strong) and the New tag;
2. Account number (mono) · statement date (caption);
3. Balance due on the right of line 1, last remark date as caption on line 3.

The whole row is one link; rows are separated by rules (not individual floating cards).

### 10.4 Action bars
- On S3 and S5, the primary action sits in a sticky bottom bar (white, top border) with the clinic name in its label, so the destination stays visible as the user scrolls.
- Elsewhere, actions stay in the page flow.

### 10.5 PDF and files
- PDFs open in the device's own viewer (View PDF), which handles zoom and accessibility better than an embedded frame on phones.
- File inputs open the native picker; drag-and-drop is not offered on touch devices.

### 10.6 Session warning
- G1 appears as a full-width bottom sheet below `sm`, with buttons stacked full width.

---

## 11. Motion and Reduced Motion

### 11.1 Rules
Motion is **functional only**: it explains a change of state and is never decorative.

| Use | Duration | Easing |
|---|---|---|
| Colour/border state changes (hover, focus) | 120 ms | `ease-out` |
| Disclosure open/close, dialog fade-in | 200 ms | `cubic-bezier(0.2, 0, 0, 1)` |
| Dialog close | 150 ms | `ease-in` |
| Highlight of a targeted remark (S1 → P2) | 2 s hold, 400 ms fade | `ease-out` |
| Busy spinner | 900 ms per rotation | linear |

- No motion over 300 ms except the remark highlight fade and the spinner.
- No sliding page transitions, parallax, animated numbers, skeleton shimmer, auto-advancing content or bouncing.
- Nothing flashes more than three times per second (WCAG 2.3.1).

### 11.2 `prefers-reduced-motion: reduce`
- All transitions become instant (0 ms), except opacity fades, which are capped at 100 ms.
- The spinner is replaced by a static busy icon; the busy text ("Publishing…") carries the meaning.
- Scrolling to a remark is instant, and the highlight is a static background that clears when the user moves focus.
- The indeterminate progress bar becomes a static striped bar with the elapsed-time text.

---

## 12. Accessibility Requirements (WCAG 2.1 AA, NFR-12)

### 12.1 Requirements
| Area | Requirement |
|---|---|
| **Structure** | Landmarks on every page: `header`, `main`, `nav` (breadcrumb, pagination). One `h1` per page. Headings in order. `lang="en-US"` on `html`. |
| **Page titles** | Unique and descriptive **without patient data**: "Statement detail – My Patient", "Import preview – Lakeside Family Clinic – My Patient" (clinic names are acceptable in titles; patient names are not, DF-06). |
| **Keyboard** | Everything works with keyboard alone; logical focus order that matches visual order (DF-02); no keyboard traps except the intentional dialog trap; visible focus ring on every focusable element. |
| **Contrast** | Text ≥ 4.5:1; large text (≥ 24 px, or ≥ 19 px bold) ≥ 3:1; control borders, focus ring and meaningful icons ≥ 3:1. Verified values in 12.2. |
| **Colour independence** | Status, remark type, New, errors and selection are always shown with text and/or icon in addition to colour. |
| **Forms** | Visible labels; hints linked with `aria-describedby`; required fields marked with the word "(required)" rather than only an asterisk; error summary plus inline errors; `autocomplete` attributes on email, password, one-time code. |
| **Live regions** | Remark added, filters applied ("4 statements match"), import status and form errors announced with `role="status"` or `role="alert"`. |
| **Time limits** | G1 warns at 13 minutes and lets the user extend with one action (WCAG 2.2.1). The countdown is announced when the dialog opens and again at 60 s and 30 s, not every second. |
| **Reflow and zoom** | No loss of content or function at 320 CSS px width and at 200% zoom; text-spacing overrides (WCAG 1.4.12) must not break layouts. |
| **Tables** | `caption`, `th` with `scope`, sortable headers with `aria-sort`. Stacked mobile rows keep a label for each value (visually hidden where obvious). |
| **Disabled content** | Disabled controls explain why when it isn't obvious; disabled "Coming soon" cards stay readable (≥ 4.5:1) even though WCAG exempts them. |
| **Documents** | HTML fields are the accessible version of each statement; the PDF is supplementary (DF-05). Generated PDFs (standard layout, FR-7.8) must be tagged PDFs with reading order and alt text for the logo. |
| **Images and icons** | Decorative icons `aria-hidden="true"`; meaningful icons have text equivalents. Logo alt text: "US24 Solutions". QR code on A6 has the manual key as its text alternative. |
| **Motion** | Section 11; honour `prefers-reduced-motion`. |
| **Forced colors** | Usable in Windows High Contrast mode; tested once before launch. |
| **Testing** | Automated axe scan on every page (TRD 7); manual keyboard pass; NVDA + Firefox/Chrome and VoiceOver + Safari (macOS and iOS) on the core journey; 200% zoom and 320 px checks. |

### 12.2 Verified contrast ratios
| Foreground | Background | Ratio | Passes |
|---|---|---|---|
| Text `#1C2430` | Surface `#FFFFFF` / Paper `#F7F6F2` / Sunken `#EFEDE6` | 15.6 / 14.4 / 13.3 | AA text |
| Muted `#465163` | White / Paper / Sunken | 8.0 / 7.4 / 6.9 | AA text |
| Subtle `#5E6878` | White / Paper / Sunken | 5.6 / 5.2 / 4.8 | AA text |
| Control border `#7C776B` | White / Paper / Sunken | 4.5 / 4.1 / 3.8 | AA non-text (≥ 3:1) |
| Decorative rule `#DDD9CF` | White | 1.4 | Decorative only; never a control boundary |
| Primary `#0D5C63` (links, rules) | White / Paper | 7.7 / 7.1 | AA text |
| White on Primary `#0D5C63` | — | 7.7 | AA text |
| White on Primary hover `#09474D` | — | 10.4 | AA text |
| White on Danger `#A3201C` | — | 7.6 | AA text |
| Focus `#1F5BD6` | White / Paper / Sunken | 6.0 / 5.5 / 5.1 | AA non-text |
| Success `#1D6B3B` on `#E5F1E8` | — | 5.6 | AA text |
| Warning `#7E4D00` on `#FAEFD9` | — | 6.2 | AA text |
| Danger `#A3201C` on `#FBE8E6` | — | 6.4 | AA text |
| Primary `#0D5C63` on `#E1EFEF` | — | 6.5 | AA text |
| Text on Highlight `#FFE27A` | — | 12.2 | AA text |
| Clinic `#7A3B69` / Specialist `#0D5C63` / Insurance `#2E4C8C` | White | 7.9 / 7.7 / 8.3 | AA text |

Notes:
- The focus ring (`#1F5BD6`) has only 1.3:1 against the teal primary button, so it **must** be drawn with a 2 px offset; the ring then contrasts with the page background behind the gap.
- Do not place `--color-text-subtle` on any background darker than `--color-surface-sunken`.

---

## 13. Content and Data Formatting

| Item | Format | Example |
|---|---|---|
| Dates (display) | Month name, day, four-digit year | Oct 21, 2026 |
| Date and time | Date, time with time zone label (TRD Q8) | Oct 21, 2026, 9:41 AM MST |
| Money | US dollars, two decimals, thousands separator | $1,284.50 |
| Credit / negative balance | Minus sign and the word "credit" | −$42.00 credit |
| Account numbers, clinic IDs | Plex Mono, exactly as stored, never truncated | ACC-0048213 |
| Counts | Thousands separator | 4,812 rows |
| Empty optional field | Hidden on P2; "—" in tables with `aria-label="Not provided"` | — |

**Voice:** plain, calm and specific (NFR-10). Use "statement", "remark", "clinic"; avoid billing jargon in clinic-facing copy unless it appears in the statement data itself. Sentence case for all headings and buttons.

---

## 14. Always-Use and Never-Use Rules

### Always
1. Show the **clinic name** on every staff screen that shows statements, and in the **destination plate** before anything is published or withdrawn.
2. Pair every colour signal with **text or an icon**.
3. Use **one primary button** per view, labelled with a specific verb (and the count and clinic name on publish buttons).
4. Use **tabular figures** and right alignment for money.
5. Keep a **visible label** on every input, and keep the user's input after an error.
6. Show a **visible focus ring** (2 px, offset) on every interactive element.
7. Keep **the same order** visually, in the DOM and in the tab sequence.
8. Use **real elements**: `button`, `a`, `table`, `fieldset`, `dialog`, `label`.
9. Make every list, table and log define its **empty, loading and error states**.
10. Keep **page titles, tab names and notifications free of patient data**.

### Never
1. Never use gradients, glassmorphism, blurred backdrops (except the plain dialog overlay), decorative illustrations or decorative motion.
2. Never use auto-dismissing toasts for any message.
3. Never use placeholders as labels, or six separate boxes for the verification code.
4. Never show a patient name, account number or amount in a page `title`, browser notification, email (NFR-3) or URL.
5. Never use red for anything other than errors, failures and destructive actions; never use yellow for warnings.
6. Never place a destructive action next to a primary action without separation.
7. Never use hover-only reveals, tooltips as the only source of information, or swipe-only gestures.
8. Never scroll clinic-facing tables horizontally.
9. Never add header items beyond user name, logo and Sign out (FR-3.1).
10. Never add content to C1 beyond the three cards (FR-3.2).

---

## 15. Design Flags (conflicts with the journey or accessibility)

| ID | Conflict | Source | Impact | Recommendation | Decision needed? |
|---|---|---|---|---|---|
| **DF-01** | The brief puts the **logo top-right**. Users expect the top-left logo to mean "home"; the top-left spot holds the user name instead. | Brief, N2/N3 | The logo-as-home link is less discoverable, which hurts the journey back to C1 / S1 / M1. | Keep the brief's layout, but don't rely on the logo for navigation: every inner screen has a Back link, and staff screens have breadcrumbs (Section 7.3). | No (mitigated) |
| **DF-02** | The brief lists the cards as AR Report, Clinic Collection, **Patient Statement** – the only working card is **last**. The App Flow also proposed moving it first **on phones only**. | Brief, N1; 03-app-flow C1 | Last position slows the primary journey (NFR-9). Reordering on mobile only would make visual order differ from DOM and focus order (WCAG 1.3.2, 2.4.3). | Put **Patient Statement first on all screen sizes**, with the same order in the DOM. | **Yes** – confirm the card order |
| **DF-03** | Two of three home cards are disabled. | N1, FR-3.4, PRD Q8 | Dead ends on the very first screen; disabled items are not focusable, so some keyboard users may not discover them. | Style them clearly as inactive (Section 7.6), keep their text readable, and expose "Coming soon" in the reading order. Revisit hiding them (PRD Q8 / I-24). | Open (PRD Q8) |
| **DF-04** | PRD F14 tests at **375 px**, but WCAG 2.1 reflow (1.4.10) requires **320 CSS px**. | PRD F14 | Designing only to 375 px would fail AA on small phones and at 400% zoom. | Design and test from **320 px**. | **Yes** – update PRD F14 acceptance criterion to 320 px |
| **DF-05** | **Uploaded PDFs** are produced by billing systems or scanners and are often untagged images. | F7, FR-10.1 | Screen-reader users can't read them; this can't be fixed by the portal. | Always show the structured fields in HTML above the PDF; generated PDFs (FR-7.8) must be tagged. Consider asking specialists to upload text-based PDFs when possible. | No (mitigated) |
| **DF-06** | Accessibility best practice favours descriptive page titles (e.g. the patient's name), but titles appear in **browser tabs, history and shared screens**. | WCAG 2.4.2 vs NFR-4 | A patient name in the tab would expose PHI on shared clinic computers. | Titles name the screen and, for staff, the clinic, but **never patient data** (Section 12.1). | No (decided here) |
| **DF-07** | The **15-minute timeout** with a 2-minute warning. | FR-1.9 | Meets WCAG 2.2.1 only if the warning is usable by keyboard and screen readers; a per-second announcement would be unusable. | G1 as specified in Sections 9.14 and 12.1. | No |
| **DF-08** | Disabled controls are exempt from contrast rules, but low-contrast "Coming soon" text would be unreadable for low-vision users. | WCAG 1.4.3 exemption | Users can't tell what the cards are. | Keep disabled text at ≥ 4.5:1 (`#5E6878` on `#EFEDE6` = 4.8:1). | No |
| **DF-09** | Common UI patterns use **auto-dismissing toasts** for "Saved" messages. | — | Fails users who need more time; easy to miss for everyone. | No toasts; persistent banners and inline messages (Section 7.8). | No |
| **DF-10** | **No dark mode** in v1. | Scope | Some users prefer dark themes; not a WCAG requirement. | Light theme only in v1; tokens prepared for a later dark theme; forced-colors mode supported. | No |
| **DF-11** | The **US24 logo colours** could not be verified. | N3 | The logo could clash with the teal accent. | Supply the logo as SVG (full-colour and single-colour). If it clashes, use the single-colour version in the header. | **Yes** – provide logo files |
| **DF-12** | The reference site (myclinicreports.com) was **down for maintenance** on both review attempts, and no "what I like" notes were given. | Brief references | No reference influence on this brief. | If there is something specific you like about it, share screenshots and notes; the system can absorb it without structural changes. | Optional |
| **DF-13** | US24 specialists may work with **DD/MM** date habits while US clinics use **MM/DD**. | Brief, PRD Q1 | Numeric dates like 04/05/2026 are ambiguous on screen and in imports. | Display dates with month names (Section 13). The import template must state one date format explicitly (PRD Q1). | **Yes** – confirm import date format |
| **DF-14** | App Flow I-14 (embedding PDFs vs `X-Frame-Options: DENY`) is still open. | 03-app-flow I-14, TRD 5.3 | The P2 desktop layout assumes an embedded viewer. | If embedding is not approved, replace the viewer with the mobile "View PDF / Download PDF" block at all sizes; the layout still works. | Depends on I-14 |

---

## 16. Hand-off Checklist for Design and Build
- [ ] Tokens from Sections 3–6 set up as CSS custom properties and in the Tailwind theme.
- [ ] Fonts self-hosted (WOFF2) with `font-display: swap`.
- [ ] Component library built for Section 7, each with every state in Section 8.
- [ ] Screens composed per Section 9; mobile per Section 10.
- [ ] Reduced-motion and forced-colors styles in place.
- [ ] Accessibility checks in Section 12 passed on the core journey.
- [ ] Decisions taken on DF-02, DF-04, DF-11 and DF-13.
- [ ] Short usability test with 3–5 clinic users to confirm NFR-9 (find a statement in under 2 minutes).
