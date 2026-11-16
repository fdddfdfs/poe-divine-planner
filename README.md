# Divine Planner

A small, static Path of Exile 1 calculator for the expected cost of divining one side of a rare item with random 1-/2-mod protection.

## Use

Choose prefixes or suffixes, include **all modifiers on that side**, enter the raw roll ranges from your item, and choose targets. Names are editable with a small suggestion list; this is not a tier/mod database. Demo ranges are illustrative. Multiple numeric rolls in a hybrid belong under the **same modifier**. Check “Already at target” only if every numeric target on that modifier is currently met. For a modifier you don't care about, set its target to the minimum with “At least” so every roll qualifies, but keep it listed as a candidate for the random lock.

The comparison covers:

- No lock: reroll until all targets are met simultaneously.
- Specific modifier: use a one-mod craft while the selected modifier meets its target; remove it when the target is lost.
- All target rolls: use one-/two-mod protection while one/two modifiers meet their targets.
- Optimal adaptive policy: minimize expected total cost by choosing among no craft and the one-/two-mod crafts at each state.

“Specific” and “all” describe when to use a craft. **Neither guarantees which modifiers get protected.** Locks choose a fresh uniform subset of distinct modifiers on each Divine. A craft persists between rolls and is paid for again only on a change. Costs include craft removal on replacement and final cleanup. The default zero removal price ignores the small currency cost; enter its Divine equivalent to include it.

## Model and limits

This implementation uses the random-per-Divine behavior explicitly confirmed by the requester. The public FAQ describes random protection for removing currency; that alone is not proof of every Divine interaction. Confirm behavior in-game following patches.

- One side, 1–3 modifiers, uniform independent numeric rolls, inclusive endpoints.
- Each modifier has 1–3 independent numeric rolls. Its hit probability is their product.
- The opposite side is outside the objective and can change; an available opposite-side crafting slot is required.
- No fractured, mirrored, corrupted, lucky, catalyst/quality-scaled or otherwise special cases.
- No full-side locks: they prevent all progress on the side being optimized.
- The optimizer covers only Divines and the entered partial-lock costs, not other crafting systems.
- Combined single-roll probabilities below 1e-10 are rejected to avoid misleading numerical precision.
- Costs are expectations, not budgets or guaranteed outcomes.
- Defaults are 1/2 Divines per partial craft. All prices are editable; no market feed.

State = `(target success bitmask, currently applied craft)`. Transitions enumerate every uniformly selected protected subset and every independent unlocked roll outcome. For each fixed strategy, the expected reward satisfies `(I − P) V = r`. Partial-pivot Gaussian elimination solves those systems. Policy iteration finds the least expected total cost over actions 0, 1, 2 (excluding locks that protect the entire selected side). The state includes the existing craft so switching costs are counted correctly. Terminal rewards include final removal.

## Development

Node.js 22+, no installed dependencies or build required:

```sh
npm test
npm start
```

Open http://127.0.0.1:4173. Static files are in `dist/`. GitHub Actions runs the math tests and deploys only that directory to Pages. Enable GitHub Pages with **GitHub Actions** as its source.

Tests cover inclusive/decimal ranges, hybrid grouping, random protection, geometric expectations, starting crafts/completed states, numerical guards, optimal-cost dominance and an independent seeded Monte Carlo cross-check for all four strategies.

The UI stores setups in localStorage. Share links encode the setup in the URL fragment, which is not sent to the server. There is no backend, analytics, login or API key. Google Fonts is the only external visual resource; system fonts are the fallback.

## References

- [GGG Covens of Umbra FAQ](https://www.pathofexile.com/forum/view-post/26880030)
- [3.30 patch notes mirror](https://poedb.tw/us/Version_3.30.0)
- [FAQ transcript and discussion](https://www.reddit.com/r/pathofexile/comments/1xtt53e/updates_to_covens_of_umbra_faq_1111/)

Fan-made; not affiliated with Grinding Gear Games. No game art is included.
