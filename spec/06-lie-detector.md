# Stage 7 — The Lie Detector

> Five statements about how caching works in this app. Four are true. One is a lie. Find it.

---

## The Statements

---

**Statement A**
> "When a user clicks the Follow button, the UI updates before the server receives the request. If the server returns an error, the UI rolls back to the previous state using a snapshot captured in `onMutate`."

---

**Statement B**
> "The `staleTime: 30_000` configuration means React Query will not make a network request for the creator feed if it was last fetched less than 30 seconds ago, even when the window regains focus."

---

**Statement C**
> "When the Refresh Feed button is clicked, `invalidateQueries` marks the cache as stale and triggers a re-fetch. During the re-fetch, the existing creator cards disappear and skeleton loaders are shown to indicate data is loading."

---

**Statement D**
> "Hovering over a creator card triggers `queryClient.prefetchQuery` which fetches and caches the creator's detail data. If the user clicks through to the detail view within the `staleTime` window, the detail page renders without any loading state."

---

**Statement E**
> "Setting `gcTime: 5 * 60 * 1000` means that if a user navigates away from the feed and returns within 5 minutes, React Query can serve the cached creator data instantly — even if that data has become stale in the meantime."

---

## Working Through Each Statement

**Statement A** — Let's verify the claim. `onMutate` fires before the `mutationFn` sends the request. It snapshots via `getQueryData`, applies the optimistic update via `setQueryData`, and returns the snapshot as context. `onError` receives `context.previousCreators` and restores it via `setQueryData`. This is exactly what the code does. **TRUE.**

**Statement B** — Within `staleTime`, React Query considers data "fresh" and skips re-fetching even when triggers like window focus fire. The `refetchOnWindowFocus: true` setting only triggers a re-fetch when data is *stale*. If data is still fresh (< 30 seconds old), the window focus trigger does nothing. **TRUE.**

**Statement C** — This statement claims the cards *disappear* and skeletons appear. Let's think carefully. `isLoading` is true only when there is **no cached data** and a fetch is in progress. When `invalidateQueries` triggers a re-fetch, cached data *still exists* — it's just been marked stale. The fetch uses `isFetching: true`, not `isLoading: true`. The skeleton UI is driven by `isLoading`. During a Refresh re-fetch, `isLoading` is false. The cards stay visible. Only the subtle "Updating feed..." indicator appears. **THIS IS THE LIE.**

**Statement D** — `prefetchQuery` stores data under `['creator', creator.id]`. A detail page querying the same key with a `staleTime` >= the time elapsed since prefetch will read from cache and render immediately. This is the whole point of hover prefetch — eliminating perceived latency on navigation. **TRUE.**

**Statement E** — `gcTime` controls how long inactive cache entries survive in memory. After the last subscriber unmounts, the 5-minute timer starts. If the user returns within 5 minutes, the cache entry still exists and React Query can return it immediately. Whether it triggers a background re-fetch depends on `staleTime` — but the data is *available* regardless of staleness. **TRUE.**

---

## The Lie

**Statement C is false.**

> "During the re-fetch, the existing creator cards disappear and skeleton loaders are shown."

This is wrong because:

`invalidateQueries` does not evict data from the cache. It marks the cache entry as stale and triggers a re-fetch. During that re-fetch:

- `isLoading` → `false` (cached data exists)
- `isFetching` → `true` (a request is in flight)
- `data` → the cached (stale) creator array (still available, still rendered)

The skeleton UI is conditionally rendered on `isLoading`, which is only `true` when there is *no cached data whatsoever*. Since the cache still holds the previous feed, `isLoading` stays false, and the cards remain on screen.

The only visual indication of the re-fetch is the `isFetching && !isLoading` condition that shows the "Updating feed..." badge.

**This distinction is critical.** A common React Query mistake is using `isLoading` and `isFetching` interchangeably — showing skeletons on every re-fetch, which causes jarring content flashes that defeat the entire purpose of caching. The correct pattern is:
- Show skeletons on `isLoading` (no data exists)
- Show a subtle indicator on `isFetching && !isLoading` (data exists, background re-fetch in progress)

---

## Answer Key

| Statement | Verdict |
|---|---|
| A — Optimistic update + rollback from snapshot | ✅ True |
| B — staleTime suppresses window focus re-fetch | ✅ True |
| C — Cards disappear and skeletons appear on Refresh | ❌ **THE LIE** |
| D — Hover prefetch enables instant detail navigation | ✅ True |
| E — gcTime enables instant return visits within 5 minutes | ✅ True |
