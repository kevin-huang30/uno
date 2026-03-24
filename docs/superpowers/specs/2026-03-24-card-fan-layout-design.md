# Card Fan Layout Design Spec

## Overview

Replace the current horizontal scrolling card hand with a fan (semicircle) layout. Cards are positioned along an arc, rotated to point outward from a common origin, with the center card highest and edge cards dipping down (arch/rainbow curve). Hovering a card lifts it along its own axis.

## Visual Design

**Fan shape:**
- Cards are placed along a large imaginary circle (radius R=600px)
- Each card is rotated `angleDeg` degrees from vertical, where angles spread symmetrically around 0° (center card upright)
- Angular step: 7° per card — gives clear separation without excessive spread
- Total arc: `(n - 1) × 7°` — scales with hand size

**Arch curve (center highest):**
- Center card sits at the top of the arch; edge cards dip down
- `yOffset = arcHeight × cos(angleDeg)` where `arcHeight = 30px`
- Center: `cos(0°) = 1` → `bottom: 30px`; edges: `cos(±max°) < 1` → lower `bottom` value
- Single-card edge case: use `yOffset = 0` (card sits at container floor)

**Hover lift:**
- Hovering a card lifts it 30px along its own rotation axis: `transform: var(--rot) translateY(-30px) !important`
- `!important` is load-bearing — the base rotation is set as an inline style which has higher specificity; without `!important` the hover translateY has no effect
- The `--rot` CSS custom property stores the base rotation so hover preserves the fan angle

**Playable card indicator:**
- `border-bottom: 4px solid #2ecc71` — existing value, no change needed

## Layout Dimensions

Container sizing must accommodate: `arcHeight (30px) + hoverLift (30px) + cardHeight` for a fully hovered center card:
- Default (`--card-height: 100px`): 30 + 30 + 100 = 160px → use `height: 170px`
- ≥600px breakpoint (`--card-height: 115px`): 30 + 30 + 115 = 175px → use `height: 185px`
- ≤380px breakpoint (`--card-height: 84px`): 30 + 30 + 84 = 144px → `height: 170px` is fine

- Container `.hand`: `position: relative; height: 170px; overflow: visible`
- Add responsive override at `≥600px`: `.hand { height: 185px; }`
- Remove: `display: flex; overflow-x: auto; padding: 8px 4px 12px`
- Remove dead scroll rules: `scrollbar-width: none`, `-webkit-overflow-scrolling: touch`, `.hand::-webkit-scrollbar { display: none; }`
- Cards use `position: absolute; bottom: 0; left: 50%` with a JS-computed left offset
- `transform-origin: bottom center` — rotation pivots at card bottom
- z-index increases left to right so right cards sit on top

**Parent overflow:** `.game-container` has `overflow: hidden`. With the correct height overrides above, cards at maximum hover height stay within the `.hand` container. No parent CSS changes needed.

## Arc Positioning Math

Card width is responsive (`--card-width`: 70px default, 80px at ≥600px, 56px at ≤380px). Read it from the computed style in JS to center cards correctly.

```js
function renderHand() {
  const container = document.getElementById('player-hand');
  container.innerHTML = '';

  // ... existing sort and state setup ...
  const sorted = [...hand].sort(...);
  const n = sorted.length;

  // Read responsive card width from CSS variable
  const cardWidth = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--card-width')
  ) || 70;
  const halfCardWidth = cardWidth / 2;

  const degreesPerCard = 7;
  const totalArc = (n - 1) * degreesPerCard;
  const startDeg = -totalArc / 2;
  const arcHeight = 30;
  const R = 600;

  sorted.forEach((card, i) => {
    const angleDeg = startDeg + i * degreesPerCard;
    const angleRad = angleDeg * Math.PI / 180;
    const xOffset = R * Math.sin(angleRad);
    const yOffset = n > 1 ? arcHeight * Math.cos(angleRad) : 0;

    const cardEl = createCardElement(card, { playable, dimmed, onClick });

    cardEl.style.left = `calc(50% + ${xOffset}px - ${halfCardWidth}px)`;
    cardEl.style.bottom = `${yOffset}px`;
    cardEl.style.transform = `rotate(${angleDeg}deg)`;
    cardEl.style.setProperty('--rot', `rotate(${angleDeg}deg)`);
    cardEl.style.zIndex = String(i + 1);

    container.appendChild(cardEl);
  });
}
```

## CSS Changes

### `.hand` (in `style.css`, ~line 412)

Replace the existing `.hand` rule with:
```css
.hand {
  position: relative;
  height: 170px;
  overflow: visible;
}
```

Remove the adjacent dead scroll rules:
```css
/* DELETE ALL OF THESE: */
-webkit-overflow-scrolling: touch;   /* inside .hand rule */
scrollbar-width: none;               /* inside .hand rule */
.hand::-webkit-scrollbar { display: none; }
```

Add a responsive height override inside the existing `@media (min-width: 600px)` block:
```css
@media (min-width: 600px) {
  .hand { height: 185px; }
}
```

### `.hand .card` (in `style.css`, ~line 425)

Add absolute positioning and fan-specific overrides. The base `.card` rule sets `position: relative` and `transition: transform 0.15s, box-shadow 0.15s` — the `.hand .card` rule overrides both:

```css
.hand .card {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform-origin: bottom center;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  cursor: pointer;
  min-width: unset;
}
```

Note: `flex-shrink: 0` on the base `.card` becomes harmless dead code in absolute layout — no need to remove it.

### `.hand .card:hover, .hand .card:active` (in `style.css`, ~line 429)

The existing rule combines `:hover` and `:active`. **Replace both** with the fan-aware version — `:active` is the primary touch interaction state on mobile and must also use `--rot` to preserve the fan angle:

```css
.hand .card:hover,
.hand .card:active {
  transform: var(--rot) translateY(-30px) !important;
  box-shadow: 0 18px 36px rgba(0, 0, 0, 0.5);
  z-index: 20 !important;
}
```

The `!important` on `transform` is required because the base rotation is set as an inline style (higher specificity than class rules). Without it, hovering or tapping snaps the card to rotate-only and loses the lift.

### `.hand .card.playable` (in `style.css`, ~line 433)

No change needed — existing rule `border-bottom: 4px solid #2ecc71` works correctly with the fan layout.

## Files Changed

| File | Change |
|------|--------|
| `public/css/style.css` | Update `.hand`, `.hand .card`, `.hand .card:hover`; remove orphaned scrollbar rule |
| `public/js/screens/game.js` | Update `renderHand()` to read card width from CSS var and apply arc positioning |

## Out of Scope

- No changes to card creation (`createCardElement`)
- No changes to sort order
- No changes to playable detection (`canPlayLocally`)
- No mobile-specific breakpoints beyond using `--card-width` CSS variable already defined
- No scrolling fallback for very large hands (14 cards at 7°/card = 91° total arc, fits well)
- No changes to `.game-container` layout
