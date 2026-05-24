# The Pulse — Project Structure

```
the-pulse/
├── app/
│   ├── api/
│   │   ├── creators/
│   │   │   └── route.ts          ← Feed endpoint (mock data + 1s delay)
│   │   └── creators/[id]/
│   │       └── route.ts          ← Detail endpoint (for hover prefetch)
│   ├── components/
│   │   ├── FeedClient.tsx        ← React Query provider + feed query + SWR indicator
│   │   ├── CreatorCard.tsx       ← Card UI + Follow mutation + hover prefetch
│   │   └── RefreshButton.tsx     ← Manual cache invalidation
│   ├── lib/
│   │   └── queryClient.ts        ← Shared QueryClient singleton (staleTime, gcTime, etc.)
│   ├── layout.tsx                ← Root layout
│   └── page.tsx                  ← Server shell → mounts FeedClient
├── docs/
│   ├── 00-structure.md           ← This file
│   ├── 01-explanation.md         ← Stage 2: ELI7 line-by-line
│   ├── 02-principles.md          ← Stage 3: Four caching principles mapped to code
│   ├── 03-audit.md               ← Stage 4: Five vulnerability audits
│   ├── 04-cross-check.md         ← Stage 5: Cross-model race condition review
│   ├── 05-tinker.md              ← Stage 6: Slow 3G + offline tinker test
│   └── 06-lie-detector.md        ← Stage 7: Four truths, one lie
├── public/
├── package.json
├── tsconfig.json
├── next.config.ts
└── tailwind.config.ts
```

## Key Architectural Decisions

| Decision | Rationale |
|---|---|
| React Query over SWR | Richer DevTools, cleaner mutation API, `cancelQueries` support |
| Module-level QueryClient singleton | Prevents cache reset on re-render cycles |
| `staleTime: 30s`, `gcTime: 5min` | 30s covers typical navigation; 5min covers tab-switching sessions |
| Optimistic update + rollback | Zero latency follow; clean failure recovery |
| `onSettled` (not `onSuccess`) for invalidation | Re-syncs on both success AND failure |
| Hover prefetch on detail endpoint | Eliminates navigation latency without user input |

## The Five Caching Behaviours — Where to Find Each

| Behaviour | File | Key Lines |
|---|---|---|
| Stale-while-revalidate | `lib/queryClient.ts` | `staleTime`, `gcTime` |
| SWR visual indicator | `components/FeedClient.tsx` | `isFetching && !isLoading` |
| Optimistic Follow update | `components/CreatorCard.tsx` | `onMutate` → `setQueryData` |
| Rollback on failure | `components/CreatorCard.tsx` | `onError` → `setQueryData(previousCreators)` |
| Manual cache invalidation | `components/RefreshButton.tsx` | `invalidateQueries` |
| Prefetch on hover | `components/CreatorCard.tsx` | `onMouseEnter` → `prefetchQuery` |
| Background refetch on focus | `lib/queryClient.ts` | `refetchOnWindowFocus: true` |
