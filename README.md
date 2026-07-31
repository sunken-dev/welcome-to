# Welcome To ...

An unofficial, fan-made browser implementation of the **solo variant** of
*Welcome To Your Perfect Home*, built for practising alone and for playing the
same deck as someone else without any network.

**Live:** <https://welcome-to.sunken.dev>

> This is not an official product and is not affiliated with or endorsed by
> Blue Cocker Games or Deep Water Games. It contains none of the published
> artwork. See [Credits and legal](#credits-and-legal).

---

## What it does

**Two ways to play**

- **Official solo variant** (2018 rulebook, p9) — draw three construction
  cards, use one for its number and a *different* one for its effect, discard
  the third. The Solo card is shuffled into the bottom half of the deck; when it
  turns up, all City Plans flip to Approved and only their lower value is
  available from then on.
- **Standard turn, played solo** — the multiplayer round, for practising it:
  one card is flipped from each of three stacks and its effect pairs with the
  number now showing on top of that stack.

**The sheet**

Three streets of 10, 11 and 12 houses; ascending order per street; fences,
parks, swimming pools, the real estate ladder, bis houses, temp agency and
building permit refusals. Estates used for a City Plan are struck through and
can no longer be split.

**Hints** *(toggle in the toolbar)*

In the solo variant the deck is dealt once and never reshuffled, so the odds are
**exact rather than estimated**. The panel shows, for every house number and
every effect, the chance it appears among your next three cards, along with the
Solo card's status — including the fact that it cannot appear before round 14,
which follows from how the deck is built.

In the standard turn it instead shows what each stack still holds *beneath* its
top card, because the top card's number is already visible and its effect is
printed in its corners.

**Seeds**

Every sheet has a seed, shown on the briefing and printed on the final
scoresheet. Type a seed to rebuild that exact sheet. Two people entering the
same seed — with the same mode and the same plan pool — see identical cards
round after round, with nothing passing between their devices.

The deck and the plan draw run on **separate streams** from the one seed, so
rerolling plans or switching one out of the pool cannot disturb the cards. Plan
rerolls are reproducible too, keyed on the seed plus the reroll count.

**Everything else**

- Six themes: Drafting office, Hillside, Cat town, Orbit, Scriptorium,
  Risograph. Cosmetic only — the rules and values are identical under each.
- Game clock, per-round clock and average round time.
- Curate the pool of City Plans; one has to stay on in each category.
- Name your city by clicking the ellipsis in the title.
- One-round undo, and every scoring table is editable.

---

## Rules fidelity

Values come from the Blue Cocker / Deep Water Games **2018 English rulebook
v2.0**. Both worked scoresheets in the rulebook reproduce exactly from the
tables in the app, which is the check that gives some confidence in the rest.

### Taken from the rulebook

| | |
|---|---|
| Streets | 10 · 11 · 12 houses |
| Park boxes | `0·2·4·10` / `0·2·4·6·14` / `0·2·4·6·8·18` |
| Swimming pools | `0·3·6·9·13·17·21·26·31·36` |
| Bis | `0·1·3·6·9·12·16·20·24·28` |
| Permit refusal | `0·0·3·5` |
| Temp agency, solo | seven points only from six temps upward, otherwise nothing |
| Deck | 81 cards — 18 Surveyor / 18 Real Estate / 18 Landscaper / 9 Pool / 9 Temp Agency / 9 Bis |
| Numbers | `3× 1,2,14,15` · `4× 3,13` · `5× 4,12` · `6× 5,11` · `7× 6,10` · `8× 7,9` · `9× 8` |

The number printed on the back of each effect card is encoded individually, read
off a physical deck, and reproduces the rulebook's distribution exactly.

### Inferred, and editable in **Setup**

- **The real estate columns.** Not printed in the rules text. Reconstructed from
  the p6 example — a size-2 estate going from 2 to 3 points — and solved against
  both worked scoresheets, which they reproduce exactly. A longer column could
  in principle do the same.
- **Which houses have a planned pool.** Printed on the sheet, not in the rules,
  so the spread here is a guess. This also affects the two advanced plans about
  pools.
- **The basic City Plans.** The rulebook lists only the advanced plans in full,
  so the twelve standard combinations are invented, using the point pairs
  visible on the card photographs. The nine advanced plans are quoted verbatim.

If your printing differs, correct it in Setup — the values are saved.

### Not implemented

- Roundabouts, and the one advanced plan that needs one
- The expert variant (passing cards round), which needs opponents
- The 2023 Collector Edition's AAA Solo Mode, a different game with its own
  opponent cards
- Multiplayer scoring: who validated a City Plan first, the temp agency
  1st/2nd/3rd ranking, and one player ending the game for everyone

## Credits and legal

*Welcome To Your Perfect Home* is designed by **Benoît Turpin**, illustrated by
**Anne Heidsieck**, and published by **Blue Cocker Games**, with the English
edition by **Deep Water Games**. All rights in the game are theirs. If you enjoy
this, buy the game — it is better on paper, with other people.

This repository is an independent fan project:

- **No published artwork is used.** Every visual here is original: the effect
  glyphs are plain geometry drawn for this project, and the themes are my own.
- **No rulebook is included.** Please do not commit the publisher's PDFs to this
  repository. The numeric tables reproduced above are facts about the game
  needed to score it, not a substitute for the rules.
- **It is not a replacement for owning the game.** There is no shortcut here
  around buying it.

Game mechanics are not copyrightable; artwork, text and trade dress are. This
project stays on the right side of that line deliberately. If the publisher
would prefer it did not exist, open an issue and it comes down.
