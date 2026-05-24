# Stage 2 — The ELI7 Read-Through

> Explain It Like I'm 7 — but a 7-year-old who reads MDN docs.

---

## What This App Does (The Big Picture)

The Pulse shows a feed of trending creators. The network is slow. The app must feel fast anyway.
The secret weapon is **React Query** — a library that sits between your components and your server, acting as a smart middleman that remembers things.

---

## The Query Client (`lib/queryClient.ts`)

```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: true,
      retry: 2,
    },
  },
})
```

**Line by line:**

- `staleTime: 30_000` — "Fresh for 30 seconds." If you fetch creators and return within 30 seconds, React Query serves the cached data *immediately* and skips the network. After 31 seconds, it serves cached data *and* fires a background re-fetch in parallel. This is stale-while-revalidate.
- `gcTime: 300_000` — "Keep data in memory for 5 minutes even if nothing is subscribed to it." After 5 minutes with zero subscribers, the entry is garbage-collected. Prevents unbounded memory growth.
- `refetchOnWindowFocus: true` — "When the user tabs back in, silently re-fetch." The feed stays current without the user ever pulling to refresh.
- `retry: 2` — Failed requests get two more attempts before React Query surfaces an error.

**The critical distinction between `staleTime` and `gcTime`:**
- `staleTime` = freshness. "Is this data still accurate enough to show without re-fetching?"
- `gcTime` = memory. "Should we evict this from the in-memory cache?"
- Data can be stale (needs refreshing) but still cached (available to render). This gap is where stale-while-revalidate lives.

---

## The API Route (`app/api/creators/route.ts`)

```ts
await new Promise(resolve => setTimeout(resolve, 1000))
return NextResponse.json({ creators: MOCK_CREATORS })
```

Deliberately sleeps one second before responding — simulating a slow African network. This artificial delay proves the caching story: first load is slow, every subsequent visit is instant.

The `[id]/route.ts` endpoint returns a single creator's detail — consumed by hover-prefetch.

---

## The Feed Query (`components/FeedClient.tsx`)

```ts
const { data, isLoading, isFetching, isStale } = useQuery({
  queryKey: ['creators'],
  queryFn: fetchCreators,
})
```

- `queryKey: ['creators']` — The cache address. Every component using this key shares the same cached data. This is the single source of truth for the feed.
- `queryFn: fetchCreators` — Called only when: (a) no cache exists, or (b) data is stale and a trigger fires.
- `isLoading` — True **only** on the very first fetch, when there is no cached data. This drives the skeleton UI.
- `isFetching` — True whenever a request is in-flight, including silent background re-fetches. Used for the "Updating…" indicator — visible proof of SWR without replacing the feed content.
- `isStale` — True when staleTime has elapsed and the data needs refreshing on next opportunity.

---

## The Follow Mutation (`components/CreatorCard.tsx`)

```ts
const followMutation = useMutation({
  mutationFn: (creatorId: string) => followCreator(creatorId),

  onMutate: async (creatorId) => {
    await queryClient.cancelQueries({ queryKey: ['creators'] })
    const previousCreators = queryClient.getQueryData(['creators'])
    queryClient.setQueryData(['creators'], (old) => ({
      creators: old.creators.map(c =>
        c.id === creatorId
          ? { ...c, isFollowing: true, followerCount: c.followerCount + 1 }
          : c
      )
    }))
    return { previousCreators }
  },

  onError: (_err, _creatorId, context) => {
    queryClient.setQueryData(['creators'], context.previousCreators)
  },

  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['creators'] })
  },
})
```

**Why `cancelQueries` first?**
If a background re-fetch is in-flight when the user clicks Follow, it could resolve *after* the optimistic update and overwrite it with stale server state (where the follow hasn't happened yet). Cancelling in-flight queries prevents this race.

**The rollback sequence:**
1. `onMutate` — snapshot current state, apply optimistic update immediately
2. `onError` — something failed, restore snapshot
3. `onSettled` — regardless of outcome, re-sync with server truth via invalidation

**The trust contract:**
React Query says "I'll show you what I expect to happen. If I'm wrong, I'll fix it quietly." The user sees an instant response. Failure reverts cleanly.

---

## The Refresh Button (`components/RefreshButton.tsx`)

```ts
queryClient.invalidateQueries({ queryKey: ['creators'] })
```

Marks the `['creators']` entry stale and triggers an immediate re-fetch. The current feed stays visible during the fetch. No blank screen. This is manual cache invalidation.

---

## Hover Prefetch (`components/CreatorCard.tsx`)

```ts
const handleMouseEnter = () => {
  queryClient.prefetchQuery({
    queryKey: ['creator', creator.id],
    queryFn: () => fetchCreatorDetail(creator.id),
    staleTime: 60 * 1000,
  })
}
```

On hover, the detail data is fetched and stored in cache silently. By the time the user clicks through, the data is already there. Zero-latency navigation. `staleTime: 60_000` prevents re-prefetching if the user hovers the same card twice within a minute.

---

## The Status Indicator

```ts
{isFetching && !isLoading && (
  <span className="animate-pulse">Updating feed...</span>
)}
```

This is the visible proof of SWR. Feed is rendered and interactive. The indicator shows a background fetch is happening. Content, not a spinner. Speed as a feature.

---

## Full Lifecycle Summary

| Event | React Query Behaviour | User Experience |
|---|---|---|
| First load | Fetches from API (1s delay) | Skeleton → Feed |
| Return < 30s | Serves cache instantly | Feed immediate |
| Return > 30s | Serves cache + background re-fetch | Feed immediate, quietly updates |
| Click Follow | Optimistic update before server responds | Button changes instantly |
| Follow fails | Rolls back to snapshot | Button reverts |
| Click Refresh | Invalidates + re-fetches | Feed stays visible, then updates |
| Tab back in | Background re-fetch fires | Feed stays visible |
| Hover card | Prefetches detail data | Detail page loads instantly |
