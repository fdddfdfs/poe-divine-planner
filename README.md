# Divine Planner

A small, static Path of Exile 1 calculator for the expected cost of divining one side of a rare item with random 1-/2-mod protection.

## Use

**Paste an item:** hover a rare item in PoE and copy its advanced description (normally Ctrl+Alt+C; use your configured advanced-description binding). Paste in the item box to import automatically, or click **Import item** after editing the text. The English copy must contain `{ Prefix Modifier ... }` / `{ Suffix Modifier ... }` headers and inline `current(min-max)` ranges. Ordinary text without those details is rejected instead of guessing tiers.

Both sides are imported and retained when switching Prefixes/Suffixes, including edits. Implicits, enchantments, item properties and reminder text are excluded. Hybrid stat lines stay in one modifier; added damage keeps its two numeric ranges. Fixed modifiers still occupy a random-lock candidate. Targets default to the highest numeric value, with “Already at target” derived from current values. Review lower-is-better targets and inferred decimal Step sizes. Copied values are shown beside the editable ranges.

The importer checks opposite-side slot availability and existing bench crafts. A removable opposite-side bench craft (such as crafted Double Damage on a suffix) is assumed to make room for the first lock, even with all three opposite affix slots occupied. The original craft remains during plain Divines and is removed only if a lock is actually applied. That one-time removal uses the entered removal price; recrafting the original modifier afterward is excluded. Crafts on the side being optimized are not silently removed. When a lock cannot be added, only no-lock calculations are recommended. You can explicitly change **Can apply a lock craft** after preparing the item. Existing metacrafts, scaled/catalyst values and unidentified items are rejected with explanations; the previous setup is preserved. Import does not require a mod database or send item text to a server.

Choose prefixes or suffixes, include **all modifiers on that side**, enter the raw roll ranges from your item, and choose targets. Names are editable with a small suggestion list; this is not a tier/mod database. The default demo is Oblivion Beak, a Synthesised Despot Axe, using its supplied current rolls and ranges. Reset demo and Try example load the same item; saved personal setups still restore on reload. Multiple numeric rolls in a hybrid belong under the **same modifier**. Check “Already at target” only if every numeric target on that modifier is currently met. For a modifier you don't care about, set its target to the minimum with “At least” so every roll qualifies, but keep it listed as a candidate for the random lock.

The comparison covers:

- No lock: reroll until all targets are met simultaneously.
- Specific modifier with 1-lock: use a one-mod craft while the selected variable modifier meets its target; remove it when the target is lost.
- Specific modifier with 2-lock: use a two-mod craft under the same rule. Requires three modifiers on the selected side so the lock permits progress.
- All target rolls: use one-/two-mod protection while one/two variable modifiers meet their targets. Fixed and always-satisfied modifiers do not trigger locks.
- Optimal adaptive policy: minimize expected total cost by choosing among no craft and the one-/two-mod crafts at each state.

“Specific” and “all” describe when to use a craft. **Neither guarantees which modifiers get protected.** Locks choose a fresh uniform subset of distinct modifiers on each Divine. A craft persists between rolls and is paid for again only on a change. Costs include craft removal on replacement and final cleanup. The default zero removal price ignores the small currency cost; enter its Divine equivalent to include it.

The **What to do after each roll** guide translates the optimal policy into step-by-step instructions: your first move, named targets (including every hybrid roll), an action for each possible target outcome, and when to stop. If the optimal action depends on the craft already present, it lists each case. It updates with targets and prices, and omits impossible outcomes for fractured or always-satisfied modifiers.

## Model and limits

This implementation uses the random-per-Divine behavior explicitly confirmed by the requester. The public FAQ describes random protection for removing currency; that alone is not proof of every Divine interaction. Confirm behavior in-game following patches.

- One side, 1–3 modifiers, uniform independent numeric rolls, inclusive endpoints.
- Each modifier has 1–3 independent numeric rolls. Its hit probability is their product.
- The opposite side is outside the objective and can change; an available opposite-side crafting slot is required.
- Fractured modifiers remain at their copied values, contribute no Divine target or cost, and are excluded from the specific-modifier choice and target-count lock policy. They still occupy affix slots and remain candidates for random protection. Both inline `(fractured)` markers and fractured affix headers are recognized; hybrid modifiers freeze as a whole. The manual editor also has a fracture toggle.
- Corrupted, mirrored and unmodifiable flags are accepted and ignored for this planning model, as requested. This models a modifiable equivalent, not in-game crafting eligibility.
- No lucky or catalyst/quality-scaled cases.
- No full-side locks: they prevent all progress on the side being optimized.
- The optimizer covers only Divines and the entered partial-lock costs, not other crafting systems.
- Combined single-roll probabilities below 1e-10 are rejected to avoid misleading numerical precision.
- Costs are expectations, not budgets or guaranteed outcomes.
- Defaults are 1/2 Divines per partial craft. All prices are editable; no market feed.

State = `(target success bitmask, currently applied craft)`. Transitions enumerate every uniformly selected protected subset and every independent unlocked roll outcome. For each fixed strategy, the expected reward satisfies `(I − P) V = r`. Partial-pivot Gaussian elimination solves those systems. Policy iteration finds the least expected total cost over actions 0, 1, 2 (excluding locks that protect the entire selected side). The state includes the existing craft so switching costs are counted correctly. Terminal rewards include final lock removal. An extra craft state tracks the original removable bench craft until its first replacement, so removal is charged only on paths that use a lock.

## Development

Node.js 22+, no installed dependencies or build required:

```sh
npm test
npm start
```

Open http://127.0.0.1:4173. Static files are in `dist/`. GitHub Actions runs the math tests and deploys only that directory to Pages. Enable GitHub Pages with **GitHub Actions** as its source.

Tests cover inclusive/decimal ranges, hybrid grouping, random protection, geometric expectations, starting crafts/completed states, numerical guards, optimal-cost dominance and an independent seeded Monte Carlo cross-check for all five strategies.

The UI stores setups in localStorage. Share links encode the setup in the URL fragment, which is not sent to the server. There is no backend, analytics, login or API key. Google Fonts is the only external visual resource; system fonts are the fallback.

## References

- [GGG Covens of Umbra FAQ](https://www.pathofexile.com/forum/view-post/26880030)
- [3.30 patch notes mirror](https://poedb.tw/us/Version_3.30.0)
- [FAQ transcript and discussion](https://www.reddit.com/r/pathofexile/comments/1xtt53e/updates_to_covens_of_umbra_faq_1111/)
- [Reported fractured-mod / partial-lock interaction](https://www.reddit.com/r/pathofexile/comments/1xvvga4/12_prefixessuffixes_cannot_be_changed_meta_craft/)
- [Advanced item clipboard format research](https://github.com/timeloop-vault/poe-inspect/blob/main/docs/research/item-format-and-data.md)

Fan-made; not affiliated with Grinding Gear Games. No game art is included.

The independent warstaff audit (`python scripts/audit_warstaff.py`) uses exact rational arithmetic, checks all five strategy metrics, and verifies optimal actions in every state.
