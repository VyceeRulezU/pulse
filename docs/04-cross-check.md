# Stage 5 — Cross-Model Verification

> The race conditions and rollback edge cases, stress-tested with a second perspective.

---

## Method

The optimistic update and rollback implementation was submitted to an independent model (GPT-4o) with the following prompt:

> "Here is a React Query optimistic update implementation for a Follow button. Please audit specifically: (1) race conditions when clicking Follow multiple times quickly, (2) rollback edge cases when the mutation fails, (3) any scenarios where the cache could end up in an incorrect state. Be critical."

The code submitted:

```ts
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
```

---

## Findings from Cross-Model Review

### Agreement: The `disabled` guard is necessary but not sufficient

The second model agreed that `disabled={followMutation.isPending}` prevents *single-card* double-click races. However, it flagged a scenario our audit also identified:

**If the user can somehow trigger two mutations for the same creator** (e.g., via a keyboard shortcut or programmatic trigger), each `onMutate` captures a snapshot of the cache at that moment in time. The second snapshot captures the *already-optimistically-updated* state. If the first mutation fails:

- Mutation 1 rolls back to snapshot 1 (original state ✓)
- Mutation 2's `onSettled` then fires `invalidateQueries`, which re-fetches

In this scenario the `invalidateQueries` in `onSettled` actually saves you — it re-fetches from the server, overwriting any inconsistent optimistic state with the authoritative server value.

**Verdict:** The `onSettled` invalidation acts as a self-healing mechanism for stale snapshots.

---

### New Finding: The `context` Null Check

The second model identified a gap not flagged in our audit:

```ts
onError: (_err, _creatorId, context) => {
  queryClient.setQueryData(['creators'], context.previousCreators)
}
```

If `onMutate` throws an error before returning the context object (e.g., `cancelQueries` itself throws, or the `getQueryData` returns `undefined` because the cache was cleared by logout between the click and the `onMutate` execution), `context` will be `undefined`.

Calling `context.previousCreators` on `undefined` throws a TypeError, which React Query catches and surfaces as an unhandled error. The cache is left in whatever state the partial `onMutate` left it — potentially the optimistically-updated state with no rollback possible.

**Recommended fix:**
```ts
onError: (_err, _creatorId, context) => {
  if (context?.previousCreators) {
    queryClient.setQueryData(['creators'], context.previousCreators)
  } else {
    // Context lost — fall back to full invalidation
    queryClient.invalidateQueries({ queryKey: ['creators'] })
  }
}
```

---

### New Finding: `cancelQueries` Cancels XHR but Not All Fetches

The second model flagged that `queryClient.cancelQueries` works by aborting the `AbortController` signal passed to the query function. **This only works if the query function passes the signal to the fetch call:**

```ts
// This CAN be cancelled
queryFn: ({ signal }) => fetch('/api/creators', { signal })

// This CANNOT be cancelled
queryFn: () => fetch('/api/creators')
```

If the `queryFn` doesn't consume the `signal`, `cancelQueries` marks the query as cancelled in React Query's internal state but the actual HTTP request continues to completion. The response will be ignored when it arrives, but network bandwidth is still consumed — and on Slow 3G, that in-flight response arriving 3 seconds later still consumes the user's limited bandwidth.

**Recommended fix:** Always destructure and pass `signal` in query functions:
```ts
queryFn: async ({ signal }) => {
  const res = await fetch('/api/creators', { signal })
  return res.json()
}
```

---

### Agreement: The `onSettled` Invalidation is Correct

Both models agreed that calling `invalidateQueries` in `onSettled` (not `onSuccess`) is the right pattern. Placing it in `onSuccess` means a failed mutation leaves the cache in its optimistically-updated state until the next natural re-fetch trigger. `onSettled` fires on both success and failure, ensuring the cache always reconciles with server truth after every mutation attempt.

---

### Divergence: How Long to Keep Optimistic State Visible

Our audit recommended rolling back immediately on error. The second model suggested a UX consideration: an instantaneous rollback (Follow → unfollow in ~0ms) can feel jarring to the user and may not communicate failure clearly.

**Alternative pattern:**
```ts
onError: (_err, _creatorId, context) => {
  // Brief delay before rollback to make the failure visible
  setTimeout(() => {
    queryClient.setQueryData(['creators'], context.previousCreators)
    toast.error("Couldn't follow — try again")
  }, 400)
}
```

This is a UX tradeoff, not a correctness issue. The current implementation (immediate rollback) is technically correct. The delayed rollback with a toast is friendlier.

---

## Summary of Cross-Check Additions

| Finding | Source | Severity | Status |
|---|---|---|---|
| `context` null check missing | Cross-model | Medium | Not fixed in current code |
| `signal` not passed to fetch | Cross-model | Low-Medium | Not fixed in current code |
| `onSettled` > `onSuccess` for invalidation | Both agree | Best practice | Already correct |
| Immediate rollback is jarring | Cross-model | UX/Low | Design decision |
| `disabled` guard is correct but incomplete | Both agree | Low | Documented |
