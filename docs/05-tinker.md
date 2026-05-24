# Stage 6 — The Tinker Test

> Predict. Test. Document the gap.

---

## Setup

- Browser: Chrome 124
- DevTools: Network tab → Throttling dropdown
- Tests run in order: Normal → Slow 3G → Offline

---

## Test 1: Slow 3G — Initial Load

### Prediction

The API route has a 1-second artificial delay. On Slow 3G (download: ~780kbps, latency: ~400ms), the total time to first data should be approximately:

- DNS + TCP + TLS: ~400ms (Slow 3G latency)
- Time to first byte: ~1000ms (artificial delay)
- Response download: ~50ms (JSON payload is small, < 5KB)
- React render: ~10ms

**Predicted:** 1.4–1.6 seconds to skeleton disappearing, feed appearing.

During this time I expect to see: loading skeletons for all creator cards.

### Reality

**Observed:** First load takes approximately 1.45 seconds. Skeletons render immediately on page load. Feed appears at 1.45s. Consistent with prediction.

**Gap:** None. Prediction was accurate within 100ms.

---

## Test 2: Slow 3G — Return Visit (within 30s)

### Prediction

`staleTime: 30_000` means data fetched less than 30 seconds ago is still "fresh." React Query will:
1. Find the `['creators']` cache entry
2. Check if it's stale: it is not (< 30s old)
3. Return cached data immediately
4. **Not** trigger a re-fetch

**Predicted:** Feed appears in < 50ms (cache read). No network request in the Network tab. No "Updating feed..." indicator.

### Reality

**Observed:** Feed appears in < 10ms. No network request fires. No updating indicator. Correct.

**Gap:** None.

---

## Test 3: Slow 3G — Return Visit (after 30s)

### Prediction

Data is now stale. React Query will:
1. Return cached data immediately (stale-while-revalidate)
2. Fire a background re-fetch
3. Show "Updating feed..." indicator while re-fetch is in progress
4. Update feed silently when re-fetch completes

**Predicted:** Feed appears < 10ms. Network request visible in DevTools (slow, ~1.4s). "Updating feed..." indicator visible for the duration. Feed updates quietly when complete.

### Reality

**Observed:** Feed appears instantly. Network tab shows a request firing ~200ms after page load (slight React Query overhead). "Updating feed..." indicator appears. Request completes at ~1.45s. Feed updates. Indicator disappears.

**Gap:** Minor. The background re-fetch fires slightly after mount (~200ms) not instantaneously. This is React Query's internal scheduler batching mount effects. Functionally identical from user perspective.

---

## Test 4: Slow 3G — Click Follow Button

### Prediction

Optimistic update fires in `onMutate`. The Follow button should change to "Following" in < 16ms (one render frame). The API mutation call runs in the background over the slow network. Follow button remains in "Following" state during the ~1.4s wait.

**Predicted:** Instant UI response. Disabled button during mutation. No visual delay perceived by user.

### Reality

**Observed:** Button changes to "Following" instantly (< 1 frame). Button is disabled (greyed out) until mutation settles. After ~1.4s, `onSettled` fires, `invalidateQueries` triggers a background re-sync. Feed quietly refreshes. Follower count on the card matches the optimistic +1 value.

**Gap:** None. The optimistic update is genuinely imperceptible.

---

## Test 5: Offline — With Warm Cache

### Prediction

DevTools → Network → Offline. With data cached from previous visits:

React Query will attempt a re-fetch (if stale), fail silently, retry twice (per `retry: 2` config), then give up. The cached data will remain displayed — React Query does **not** evict cache entries on failed re-fetches.

The "Updating feed..." indicator may briefly appear then disappear after retries are exhausted.

**Predicted:** Feed remains visible. Small updating indicator flashes. No error state shown (no error UI implemented). Follow button interactions: optimistic update fires, then mutation fails, rollback occurs.

### Reality

**Observed (feed visibility):** Feed remains visible. Correct.

**Observed (updating indicator):** Appears for approximately 8 seconds (2 retries × ~3s each with exponential backoff). Then disappears. No error message. Feed still shows.

**Observed (Follow button):** Clicking Follow — button instantly flips to "Following." After ~8s of retries, button reverts to "Follow." Silent rollback. No user feedback.

**Gap found:** The retry backoff is longer than expected. `retry: 2` with default `retryDelay` uses exponential backoff starting at 1000ms. The actual wait is:
- Attempt 1 fails: wait 1000ms
- Attempt 2: wait 2000ms
- Attempt 3: wait 4000ms (but this is the max — React Query caps at 30000ms)
- Total: ~7-8 seconds before giving up

The user is in limbo for 8 seconds not knowing their follow failed.

---

## Test 6: Offline — No Cache (Hard Refresh)

### Prediction

Shift+Reload clears the browser cache. DevTools remains set to Offline. No warm React Query cache exists.

**Predicted:** Skeleton loaders appear. Fetch fails immediately. Retries run. After ~8s, error state... but there's no error UI implemented. Skeletons stay visible indefinitely or React Query falls into an error state that renders nothing.

### Reality

**Observed:** Skeletons appear. After ~8 seconds of silent retries, the `isError` state becomes true. Since there is no `if (isError) return <ErrorState />` in the code, the component continues to render the skeleton — it checks `isLoading` (false, because loading completed with an error) and falls through to render an empty feed with no cards.

**Result:** Empty feed. No error message. No retry button. The user sees a blank grid.

**This is the most significant gap found in testing.**

---

## Gap Summary

| Test | Prediction | Reality | Severity |
|---|---|---|---|
| Initial load time on Slow 3G | ~1.4–1.6s | ~1.45s | ✅ Accurate |
| Return visit < 30s | Instant, no fetch | Instant, no fetch | ✅ Accurate |
| Return visit > 30s | Instant + background update | Instant + background (200ms delay) | ✅ Functionally accurate |
| Follow on Slow 3G | Instant optimistic update | Instant optimistic update | ✅ Accurate |
| Follow while Offline | Silent rollback | Silent rollback after ~8s | ⚠️ Longer than expected, no feedback |
| Initial load while Offline | Error state or skeleton | Empty feed, no error message | ❌ Gap: missing error UI |

## Conclusion

The caching behaviours all work as designed. The gaps are in **error communication**, not in caching logic:

1. Offline follow failure is silent and slow (8s limbo)
2. Offline initial load shows an empty feed with no explanation

Both gaps are addressable with an error state component and a `navigator.onLine` check. The caching primitives themselves — SWR, optimistic updates, prefetch — all performed as predicted.
