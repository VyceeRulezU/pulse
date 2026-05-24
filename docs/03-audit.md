# Stage 4 — The Audit

> Five real vulnerabilities in the caching implementation, assessed honestly.

---

## Vulnerability 1: Double-Click Race Condition

### The Problem

The Follow button has `disabled={followMutation.isPending}`, which prevents the user from clicking again while a mutation is in flight. However, this guard only works per-mutation-instance on a single card. If the user manages to trigger two mutations for the same creator (e.g., through a keyboard shortcut, programmatic dispatch, or rapid click before React re-renders with `isPending: true`), the following sequence occurs:

1. Click 1 → `onMutate` fires, snapshots cache, applies optimistic update, mutation starts
2. Click 2 → `onMutate` fires again, but the snapshot now captures the **already-optimistically-updated** state
3. Click 1 succeeds → `onSettled` invalidates, cache re-syncs with server
4. Click 2 fails → `onError` rolls back to snapshot 2, which is the **optimistically-updated** state, not the original

**Impact:** The rollback restores the wrong state. The cache could end up showing a followed user as unfollowed or vice versa.

### Mitigation

The `onSettled` invalidation acts as a self-healing mechanism. After every mutation (success or failure), `invalidateQueries` is called, which triggers a re-fetch from the server. The next background fetch overwrites any inconsistent state with the authoritative server value.

```ts
onSettled: () => {
  queryClient.invalidateQueries({ queryKey: ['creators'] })
}
```

This makes the race condition a **temporary visual glitch** rather than a persistent data corruption issue. The glitch lasts until the background re-fetch completes (~1s on a good network, potentially longer on Slow 3G).

### Severity: Low-Medium
- Exploitation requires fast double-triggering that bypasses the `disabled` guard
- Self-healing via `onSettled` means the window of inconsistency is bounded
- No data is permanently lost — the server is always the source of truth

---

## Vulnerability 2: Stale Data After Logout

### The Problem

The app does not implement authentication, but if it were to do so, the current caching strategy has a vulnerability: `gcTime: 5 * 60 * 1000` means cache entries survive for 5 minutes after the last subscriber unmounts. If a user logs out and a different user logs in within those 5 minutes, the *new* user would see the *previous* user's cached feed until:

1. A background re-fetch completes (if `staleTime` has elapsed), or
2. The user manually clicks Refresh, or
3. The 5-minute `gcTime` expires and the cache is evicted

### Impact

For a brief window (30 seconds of `staleTime` + however long the re-fetch takes), User B sees User A's feed. This is a data leakage issue in multi-user environments like shared computers or kiosks.

### Recommended Mitigations

- Clear the query cache on logout:
  ```ts
  queryClient.clear()
  ```
- Set a shorter `gcTime` (e.g., 60 seconds) if the app is used in shared-device contexts
- Implement a session-based query key prefix (e.g., `['creators', sessionId]`)

### Severity: Medium (context-dependent)
- Requires shared device with multiple users within 5 minutes
- Not applicable if the app is single-user or server-side renders with per-session data
- Easy to fix with `queryClient.clear()` on logout

---

## Vulnerability 3: Memory Leaks from Unbounded Prefetch Growth

### The Problem

The hover prefetch in `CreatorCard.tsx` adds entries to the cache under unique keys:

```ts
queryClient.prefetchQuery({
  queryKey: ['creator', creator.id],
  queryFn: () => fetchCreatorDetail(creator.id),
  staleTime: 60 * 1000,
})
```

Each hovered card generates a new cache entry. If the user rapidly hovers over many cards (e.g., scrolling through a feed of 50+ creators), each prefetched detail object is cached with `gcTime: 5 * 60 * 1000` (inherited from the default configuration). The prefetch does not override `gcTime`, so each entry lives for 5 minutes.

With 50 card hovers in a session:
- 50 detail objects in cache × ~1KB each = ~50KB
- After 5 minutes, all are evicted

**This is not a serious memory leak for typical usage.** The cache growth is bounded by the number of unique `creator.id` values in the feed, and the `gcTime` of 5 minutes ensures automatic eviction.

### Where It Actually Becomes a Problem

If the feed implements infinite scroll or pagination, the number of unique prefetch keys grows unboundedly as the user scrolls through thousands of creators. After 10 minutes of scrolling through 500 creators, the cache holds 500 detail entries.

- 500 entries × ~1KB = ~500KB — still negligible on modern devices
- However, if detail data includes images (base64 or URLs with metadata), each entry could be 10-50KB, pushing the cache toward 5-25MB

### Mitigation

Override `gcTime` in the prefetch query to a shorter duration:

```ts
queryClient.prefetchQuery({
  queryKey: ['creator', creator.id],
  queryFn: () => fetchCreatorDetail(creator.id),
  staleTime: 60 * 1000,
  gcTime: 2 * 60 * 1000,  // Evict after 2 minutes instead of 5
})
```

### Severity: Low
- Cache sizes remain small for typical usage patterns
- Automatic eviction via `gcTime` prevents unbounded growth
- Only becomes a concern with image-heavy detail data or extreme scroll depth

---

## Vulnerability 4: Over-Fetching on Remount

### The Problem

When a component using `useQuery({ queryKey: ['creators'] })` unmounts and remounts, React Query's behaviour depends on timing:

**If remount happens within `gcTime` (5 minutes):**
- Cache entry exists (may be stale or fresh depending on `staleTime`)
- If stale: triggers a background re-fetch (one request)
- If fresh: serves from cache, no request

**If remount happens after `gcTime` (5+ minutes):**
- Cache entry has been garbage-collected
- Full re-fetch required
- This is indistinguishable from a first load

### The Actual Risk

The risk is not remounting — it's **redundant re-fetches** caused by misconfigured query keys. If the feed component uses a volatile key like `['creators', Date.now()]` or includes a random value, every remount generates a new cache entry and triggers a fetch, defeating caching entirely.

The current code uses a static key `['creators']`, which is correct. There is no over-fetching problem with the current implementation.

### Hidden Concern: Navigation Within Single-Page App

If the app uses client-side navigation and the feed component is part of a layout that remounts on route changes, the query persists in cache (since `QueryClientProvider` wraps the entire app). No re-fetch occurs unless the data is stale.

However, if the feed is scoped inside a route segment that gets unmounted on every navigation, the `gcTime` timer starts on unmount. Navigating back within 5 minutes is instant. After 5 minutes, a full re-fetch is needed.

**Verdict:** No vulnerability in current code. The static query key and long `gcTime` handle remounts correctly.

### Severity: None (current implementation)
- Static query keys prevent cache fragmentation
- `gcTime` of 5 minutes handles typical navigation patterns
- Over-fetching on remount is a theoretical concern, not a real one with this setup

---

## Vulnerability 5: What Users See When the Network Dies Mid-Mutation

### The Problem

The Follow mutation sends a POST request to the server. If the network dies while the request is in flight:

1. `mutationFn` throws a fetch error (TypeError: Failed to fetch)
2. React Query catches the error and calls `onError`
3. `onError` restores the previous cache snapshot
4. `onSettled` fires, which calls `invalidateQueries`
5. The invalidation triggers a re-fetch, which also fails
6. After `retry: 2` attempts, the re-fetch gives up

### What the User Sees

- **Immediate effect:** Button flips to "Following" (optimistic update)
- **After ~8 seconds** (retry backoff): Button reverts to "Follow" (rollback)
- **No error message, no toast, no visual feedback** explaining why the follow failed

### The Real Gap

The mutation's `onError` silently restores the cache without any user-facing communication. The user is left wondering:
- Did the follow happen?
- Did it fail? Why?
- Should they try again?

The feed re-fetch also fails silently. If the user was viewing the feed when the network died, the feed remains visible (cached data stays in place), but the "Updating feed..." indicator appears and eventually disappears with no error explanation.

### The Offline First-Load Gap

If the user loads the app for the first time while offline:

1. `useQuery` fires `fetchCreators`
2. The fetch fails immediately (no cached data to serve)
3. `isLoading` becomes `false`, `isError` becomes `true`
4. Currently there is **no error state UI** — the component renders nothing meaningful
5. The user sees an empty feed with no explanation

### Recommended Mitigations

```ts
// In CreatorCard.tsx
onError: (_err, _creatorId, context) => {
  if (context?.previousCreators) {
    queryClient.setQueryData(['creators'], context.previousCreators)
  }
  toast.error('Follow failed — check your connection and try again')
}

// In FeedClient.tsx
if (isError) {
  return (
    <div className="text-center py-16">
      <p>Could not load the feed.</p>
      <button onClick={() => refetch()}>Try again</button>
    </div>
  )
}
```

### Severity: Medium-High
- No error UI means users are unaware of failures
- Particularly painful on slow or unreliable networks (the exact environment this app targets)
- Easy to fix with a toast system and error state components
- The missing error UI on first load is the most significant gap in the current implementation

---

## Audit Summary

| # | Vulnerability | Severity | Current Status | Fix Priority |
|---|---|---|---|---|
| 1 | Double-click race condition | Low-Medium | Self-healing via `onSettled` | Low |
| 2 | Stale data post-logout | Medium | Not implemented (no auth system) | Medium (if auth added) |
| 3 | Memory leaks from prefetch growth | Low | Bounded by feed size + `gcTime` | Low |
| 4 | Over-fetching on remount | None | Static query keys prevent this | None |
| 5 | No error UI on network failure | Medium-High | Missing entirely | **High** |
