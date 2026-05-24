# Stage 3 — Principles Spotting

> Map the code to the four caching principles. Definition first, then the exact lines.

---

## Principle 1: Cache Invalidation as a Hard Problem

### Definition
Phil Karlton's famous quote — "There are only two hard things in computer science: cache invalidation and naming things" — exists because invalidation requires answering: *when is my cached data no longer true?*

The hard part is not fetching new data. It's knowing *when* to fetch. Too early: wasted bandwidth, server load. Too late: users see stale data and make decisions based on lies.

Cache invalidation is hard because the cache doesn't know what happened on the server. A follow action on the client, a new post published elsewhere, an admin ban — all of these change server truth without the cache knowing. You must explicitly tell the cache its version of reality is no longer valid.

### Where It Appears in the Code

**Automatic invalidation via `staleTime`** — `lib/queryClient.ts`
```ts
staleTime: 30 * 1000,
```
After 30 seconds, React Query treats the cached data as potentially wrong and will re-fetch on the next trigger. This is time-based invalidation: "assume data older than 30 seconds may be stale."

**Manual invalidation via `invalidateQueries`** — `components/RefreshButton.tsx`
```ts
queryClient.invalidateQueries({ queryKey: ['creators'] })
```
The user explicitly says "I know the cache is stale, fetch now." This is event-based invalidation.

**Post-mutation invalidation** — `components/CreatorCard.tsx`, `onSettled`
```ts
onSettled: () => {
  queryClient.invalidateQueries({ queryKey: ['creators'] })
}
```
After a mutation (Follow), we invalidate regardless of success/failure to re-sync with server truth. This is mutation-based invalidation: "I changed something, so my read cache is now suspect."

**The tension:** If `staleTime` is too long, users see outdated follower counts. Too short, and you re-fetch constantly, burning bandwidth on Nigerian MTN data plans.

---

## Principle 2: Single Source of Truth for Server State

### Definition
Server state has one authoritative version: the server. On the client, you should have one place that mirrors that state — not multiple local copies that can drift apart and contradict each other.

Before React Query, it was common to store API data in multiple `useState` hooks across different components. When one component updated it, others wouldn't know. React Query enforces a single cache per `QueryClient` instance. Every component that queries `['creators']` shares the same data, gets the same updates, and re-renders together when the cache changes.

### Where It Appears in the Code

**The QueryClient instance** — `lib/queryClient.ts`
```ts
const queryClient = new QueryClient({ ... })
```
One instance, shared across the entire app via `QueryClientProvider`. All cache entries live here.

**The query key as cache address** — `components/FeedClient.tsx`
```ts
queryKey: ['creators']
```
This string array is the key under which all creator feed data is stored. Any component in the tree that calls `useQuery({ queryKey: ['creators'] })` receives data from this single cache entry — not their own copy.

**Cache write in `onMutate`** — `components/CreatorCard.tsx`
```ts
queryClient.setQueryData(['creators'], (old) => ({
  creators: old.creators.map(c => ...)
}))
```
The optimistic update writes directly to the shared cache. Every subscribed component re-renders immediately with the new value. There is no "local button state" that gets out of sync with the "feed state." One truth, many subscribers.

**Cache read in `onMutate` for snapshot** — `components/CreatorCard.tsx`
```ts
const previousCreators = queryClient.getQueryData(['creators'])
```
We read directly from the single cache rather than maintaining a parallel copy. If we kept a local `useState` snapshot, it could differ from what's actually in cache. Reading from cache guarantees the snapshot matches reality.

---

## Principle 3: Optimistic UI as a Trust Contract

### Definition
Optimistic UI means: update the interface immediately as if the operation already succeeded, then reconcile with server reality when the response arrives.

It's called a "trust contract" because you're making a promise to the user: "I'm showing you the result you expect. If the server disagrees, I'll correct it." Violating this contract (showing a corrected UI state without explanation) damages trust. Honouring it (silent rollback with a clear visual indicator) maintains it.

The contract has three clauses:
1. **Optimistic assumption**: Show the expected outcome immediately.
2. **Confirmation**: If the server agrees, do nothing — the UI is already correct.
3. **Correction**: If the server disagrees, revert cleanly.

### Where It Appears in the Code

**The assumption (immediate UI update)** — `components/CreatorCard.tsx`, `onMutate`
```ts
queryClient.setQueryData(['creators'], (old) => ({
  creators: old.creators.map(c =>
    c.id === creatorId
      ? { ...c, isFollowing: true, followerCount: c.followerCount + 1 }
      : c
  )
}))
```
Before the server responds, the button flips to "Following" and the follower count increments. On a 1-second API delay, this means the UI responds in ~0ms.

**The race prevention** — `components/CreatorCard.tsx`, `onMutate`
```ts
await queryClient.cancelQueries({ queryKey: ['creators'] })
```
An in-flight re-fetch could overwrite our optimistic state with old server data. Cancelling it protects the contract.

**The correction (rollback)** — `components/CreatorCard.tsx`, `onError`
```ts
queryClient.setQueryData(['creators'], context.previousCreators)
```
Server said no. Restore the snapshot. The button reverts. The follower count returns to its previous value.

**The re-sync** — `components/CreatorCard.tsx`, `onSettled`
```ts
queryClient.invalidateQueries({ queryKey: ['creators'] })
```
On success or failure, fetch fresh server state. This reconciles the optimistic update (or rolled-back state) with the true server value — handling edge cases like the follow succeeding but the follower count differing due to concurrent follows from other users.

**The loading state guard** — `components/CreatorCard.tsx`
```ts
disabled={followMutation.isPending}
```
While the mutation is in flight, the Follow button is disabled. This prevents double-follow race conditions where clicking twice would queue two mutations.

---

## Principle 4: Stale-While-Revalidate as a Strategy

### Definition
Stale-while-revalidate (SWR) is an HTTP cache control strategy formalised in RFC 5861. The algorithm is:

1. A request arrives for a resource.
2. If a fresh cached version exists: return it.
3. If a stale cached version exists: return the stale version *immediately*, and trigger a background re-fetch to get a fresher version.
4. If no cached version exists: fetch and wait.

The insight is that **slightly stale data shown instantly is usually better than fresh data shown after a delay.** A follower count that's 30 seconds old is still useful. A blank screen while you wait for accurate data is not.

### Where It Appears in the Code

**The freshness window** — `lib/queryClient.ts`
```ts
staleTime: 30 * 1000,
```
Data is "fresh" for 30 seconds. During this window, React Query returns cached data and does not re-fetch — even if a background trigger fires.

**The retention window** — `lib/queryClient.ts`
```ts
gcTime: 5 * 60 * 1000,
```
Data stays in cache for 5 minutes after its last subscriber unmounts. During this period, re-mounting the component gets instant data (potentially stale) while a background fetch runs.

**The visible SWR indicator** — `components/FeedClient.tsx`
```ts
{isFetching && !isLoading && (
  <span>Updating feed...</span>
)}
```
`isFetching` is true during background re-fetches. `isLoading` is false because cached data exists. This condition is **only true during an SWR re-fetch** — the exact moment stale data is shown while fresh data loads. The indicator makes this invisible process visible.

**Window focus trigger** — `lib/queryClient.ts`
```ts
refetchOnWindowFocus: true,
```
Tabbing back into the browser is a revalidation trigger. If data is stale, a background re-fetch fires immediately on focus, and the cached feed is shown while it resolves.

**The compound effect on a slow network:**
On Slow 3G, the first load takes ~3-4 seconds (1s artificial delay + network overhead). Every subsequent load is instant. With `gcTime` of 5 minutes, a user who leaves and returns within that window never sees a loading state again — the feed appears before the page even finishes painting.
