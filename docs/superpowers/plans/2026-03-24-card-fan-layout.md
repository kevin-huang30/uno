# Card Fan Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the horizontal scrolling card hand with a fan/semicircle layout where cards arc outward from a common bottom-center origin, the center card sits highest, edges dip down, and hovering a card lifts it along its own rotation axis.

**Architecture:** Two isolated edits — CSS restructures the `.hand` container from flex/scroll to absolute positioning, and JS in `renderHand()` computes each card's arc angle and position before appending it. The CSS custom property `--rot` bridges them: JS sets it per-card so CSS hover can use it without knowing the angle.

**Tech Stack:** Vanilla JS, CSS, no build step — edit files directly. Server: `bun run start` (runs `server.js`).

---

## File Map

| File | Lines | Change |
|------|-------|--------|
| `public/css/style.css` | 412–435, 655–663 | Rewrite `.hand`, `.hand .card`, `.hand .card:hover/active`; add responsive height override |
| `public/js/screens/game.js` | 284–309 | Rewrite `renderHand()` to add arc positioning |

---

## Task 1: Update `.hand` CSS

**Files:**
- Modify: `public/css/style.css:412-435`

### Background

The current `.hand` rule uses `display: flex; overflow-x: auto` for a scrollable row. We're replacing it with `position: relative` so child cards can be absolutely positioned. The adjacent `.hand .card` and `.hand .card:hover` rules also need rewriting.

The `.hand::-webkit-scrollbar`, `scrollbar-width: none`, and `-webkit-overflow-scrolling: touch` declarations all become dead code once `overflow-x: auto` is removed.

- [ ] **Step 1: Replace the `.hand` rule (lines 412–424)**

Open `public/css/style.css`. Find this block (lines 412–424):

```css
.hand {
  display: flex;
  overflow-x: auto;
  padding: 8px 4px 12px;
  gap: 4px;
  flex-shrink: 0;
  justify-content: center;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.hand::-webkit-scrollbar {
  display: none;
}
```

Replace **only these two rules** (`.hand {}` and `.hand::-webkit-scrollbar {}`) with:

```css
.hand {
  position: relative;
  height: 170px;
  overflow: visible;
  flex-shrink: 0;
}
```

(`flex-shrink: 0` is kept because `.hand` is a flex child of `.game-container` and must not shrink.)

**Important:** Stop the replacement here. The `.hand .card` rule on line 425 is handled separately in Step 2 — do not delete it.

- [ ] **Step 2: Replace the `.hand .card` rule (lines 425–428)**

Find:
```css
.hand .card {
  cursor: pointer;
  min-width: 60px;
}
```

Replace with:
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

- [ ] **Step 3: Replace the `.hand .card:hover, .hand .card:active` rule (lines 429–432)**

Find:
```css
.hand .card:hover, .hand .card:active {
  transform: translateY(-8px);
  box-shadow: 0 6px 16px rgba(0,0,0,0.4);
}
```

Replace with:
```css
.hand .card:hover,
.hand .card:active {
  transform: var(--rot) translateY(-30px) !important;
  box-shadow: 0 18px 36px rgba(0, 0, 0, 0.5);
  z-index: 20 !important;
}
```

**Why `!important`:** The base rotation is set as a JS inline style (`card.style.transform = 'rotate(Xdeg)'`). Inline styles win over class rules by default, so without `!important` the hover `translateY` would be ignored — the card would not lift.

**Why `:active`:** On mobile, `:hover` does not fire on tap. `:active` is what fires on touch, so it must get the same treatment.

- [ ] **Step 4: Add responsive height override for the ≥600px breakpoint**

At `≥600px`, `--card-height` becomes 115px. The max required height is `arcHeight(30) + hoverLift(30) + cardHeight(115) = 175px` — which would overflow the 170px container. Find the existing `@media (min-width: 600px)` block (~line 655) and add `.hand { height: 185px; }` inside it:

Find:
```css
@media (min-width: 600px) {
  :root {
    --card-width: 80px;
    --card-height: 115px;
  }
  .card .card-value {
    font-size: 28px;
  }
}
```

Replace with:
```css
@media (min-width: 600px) {
  :root {
    --card-width: 80px;
    --card-height: 115px;
  }
  .card .card-value {
    font-size: 28px;
  }
  .hand {
    height: 185px;
  }
}
```

- [ ] **Step 5: Verify CSS visually**

Start the server:
```bash
bun run start
```

Open `http://localhost:3000` in a browser. Log in, start a game. The hand area should now show a fan of cards. Even before the JS changes, the cards will be stacked at center (since they're all positioned at `left: 50%` with no JS offset yet). That's expected — CSS is done, JS is next.

- [ ] **Step 6: Commit**

```bash
git add public/css/style.css
git commit -m "style: replace hand flex layout with absolute positioning for fan layout"
```

---

## Task 2: Update `renderHand()` JS

**Files:**
- Modify: `public/js/screens/game.js:284-309`

### Background

`renderHand()` currently appends card elements directly with no positioning. We need to compute each card's arc angle and x/y offset, then set them as inline styles before appending.

The card width is a responsive CSS variable (`--card-width`: 70px default, 80px at ≥600px, 56px at ≤380px). We read it at runtime from `getComputedStyle` so the centering offset is always correct for the current screen size.

The `--rot` CSS custom property is set per card so the `:hover` rule can read it without needing to know each card's angle.

- [ ] **Step 1: Rewrite `renderHand()` with arc positioning (lines 284–309)**

Open `public/js/screens/game.js`. Find the current `renderHand()` function (lines 284–309):

```js
function renderHand() {
  const container = document.getElementById('player-hand');
  container.innerHTML = '';

  const isMyTurn = gameState.currentPlayerId === myId;
  const hand = gameState.hand || [];

  // Sort hand: by color, then by value
  const sorted = [...hand].sort((a, b) => {
    const colorOrder = { red: 0, green: 1, blue: 2, yellow: 3 };
    const ca = a.color ? colorOrder[a.color] : 5;
    const cb = b.color ? colorOrder[b.color] : 5;
    if (ca !== cb) return ca - cb;
    return (a.value || '').localeCompare(b.value || '');
  });

  for (const card of sorted) {
    const playable = isMyTurn && canPlayLocally(card);
    const cardEl = createCardElement(card, {
      playable,
      dimmed: isMyTurn && !playable,
      onClick: playable ? () => playCardFromHand(card) : null,
    });
    container.appendChild(cardEl);
  }
}
```

Replace it entirely with:

```js
function renderHand() {
  const container = document.getElementById('player-hand');
  container.innerHTML = '';

  const isMyTurn = gameState.currentPlayerId === myId;
  const hand = gameState.hand || [];

  // Sort hand: by color, then by value
  const sorted = [...hand].sort((a, b) => {
    const colorOrder = { red: 0, green: 1, blue: 2, yellow: 3 };
    const ca = a.color ? colorOrder[a.color] : 5;
    const cb = b.color ? colorOrder[b.color] : 5;
    if (ca !== cb) return ca - cb;
    return (a.value || '').localeCompare(b.value || '');
  });

  const n = sorted.length;

  // Read responsive card width from CSS variable so centering is correct at all breakpoints
  const cardWidth = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--card-width')
  ) || 70;
  const halfCardWidth = cardWidth / 2;

  // Arc parameters
  const degreesPerCard = 7;
  const totalArc = (n - 1) * degreesPerCard;
  const startDeg = -totalArc / 2;
  const arcHeight = 30; // px — center card this much higher than edges
  const R = 600;        // radius of imaginary circle cards sit on

  sorted.forEach((card, i) => {
    const playable = isMyTurn && canPlayLocally(card);
    const cardEl = createCardElement(card, {
      playable,
      dimmed: isMyTurn && !playable,
      onClick: playable ? () => playCardFromHand(card) : null,
    });

    // Position card along the arc
    const angleDeg = startDeg + i * degreesPerCard;
    const angleRad = angleDeg * Math.PI / 180;
    const xOffset = R * Math.sin(angleRad);
    const yOffset = n > 1 ? arcHeight * Math.cos(angleRad) : 0;

    cardEl.style.left = `calc(50% + ${xOffset}px - ${halfCardWidth}px)`;
    cardEl.style.bottom = `${yOffset}px`;
    cardEl.style.transform = `rotate(${angleDeg}deg)`;
    cardEl.style.setProperty('--rot', `rotate(${angleDeg}deg)`);
    cardEl.style.zIndex = String(i + 1);

    container.appendChild(cardEl);
  });
}
```

- [ ] **Step 2: Verify visually in the browser**

With the server still running (`bun run start`), hard-refresh `http://localhost:3000`. Start a game and check:

1. **Fan shape**: Cards spread into a fan — left cards tilt left, right cards tilt right, center card is upright
2. **Arch curve**: Center card sits highest, cards dip down toward the edges (rainbow/arch shape, not smile shape)
3. **Hover lift**: Hovering (desktop) or tapping (mobile) a card lifts it along its own tilted axis — it slides upward in the direction it's pointing, not straight up
4. **Playable glow**: Cards you can play have a green bottom border
5. **Single card**: If you play down to 1 card, it sits flat at the bottom with no arch offset
6. **Large hand**: If you somehow have 10+ cards, they fan out further — no cards are clipped or hidden

- [ ] **Step 3: Commit**

```bash
git add public/js/screens/game.js
git commit -m "feat: fan layout for card hand — arc positioning with hover lift"
```
