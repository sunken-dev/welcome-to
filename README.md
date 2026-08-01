# Welcome To

An unofficial, fan-made browser implementation of *Welcome To Your Perfect Home*,
built for practising alone and for playing the same deck as someone else without
any network.

One HTML file. No build step, no dependencies, no server, no analytics, no
network requests. Your settings and best score live in your own browser and go
nowhere else.

> This is not an official product and is not affiliated with or endorsed by
> Blue Cocker Games or Deep Water Games. It contains none of the published
> artwork. See [Credits and legal](#credits-and-legal).

---

## What it does

**Two ways to play**

- **Standard turn** *(the default)* — one card is flipped from each of three
  stacks and its effect pairs with the number now showing on top of that stack.
  This is the multiplayer round, played alone.
- **Solo variant** (2018 rulebook, p9) — draw three construction cards, use one
  for its number and a *different* one for its effect, discard the third. The
  Solo card is shuffled into the bottom half of the deck; when it turns up, all
  City Plans flip to Approved and only their lower value is available from then
  on.

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

**The advanced variant**

Two switches in Setup, both off by default. **Advanced plans** adds the nine
starred City Plans. **Roundabouts** lets you replace an empty house with one, at
any point in your turn: it is fenced on both sides, is not a house, and
**numbering starts over on the far side of it** — so you can run 1–15 up to the
roundabout and begin again beyond it. The first costs 3 points and the second 5
more, and you may build two. Turning them on also brings in the tenth advanced
plan, which needs all the parks, all the pools and a roundabout in one street.

**Everything else**

- Six themes: Drafting office, Hillside, Cat town, Orbit, Scriptorium,
  Risograph. Cosmetic only — the rules and values are identical under each.
- Game clock, per-round clock and average round time.
- Curate the pool of City Plans; one has to stay on in each category.
- Name your city by clicking the ellipsis in the title, up to 15 characters.
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
| Planned pools | `2,6,7` / `0,3,7` / `1,6,10` &mdash; nine in all |
| Real estate | `1,3` / `2,3,4` / `3,4,5,6` / `4,5,6,7,8` / `5,6,7,8,10` / `6,7,8,10,12` |
| Roundabouts | `0·3·8`, two at most |
| Deck | 81 cards — 18 Surveyor / 18 Real Estate / 18 Landscaper / 9 Pool / 9 Temp Agency / 9 Bis |
| Numbers | `3× 1,2,14,15` · `4× 3,13` · `5× 4,12` · `6× 5,11` · `7× 6,10` · `8× 7,9` · `9× 8` |

The number printed on the back of each effect card is encoded individually, read
off a physical deck, and reproduces the rulebook's distribution exactly.

There is a useful internal check on the pool positions: there are nine of them,
and the pool ladder has exactly nine crossable boxes.

### Inferred — one thing only

- **The basic City Plans.** The rulebook prints the ten advanced plans in full
  but not the eighteen standard ones, so the twelve standard combinations here
  are invented, using the point pairs visible on the card photographs.

Everything else comes from the rulebook or from a deck read card by card,
including the number printed on the back of each effect card. If your printing
differs anywhere, correct it in **Game setup** — the values are saved, and a
correction to a table in a later version replaces the stored one while keeping
your own preferences.

### Not available yet

- **Multiplayer.** Two to six players over a small relay is written and tested,
  but the buttons are switched off and it is undocumented for now.
- The expert variant on p11, where every card forms a single deck and each player
  draws three, keeps two and passes the third to their right — that needs a hand
  per player rather than one shared deal
- The 2023 Collector Edition's AAA Solo Mode, a different game with its own
  opponent cards
- Rejoining a sheet already under way — your board lives in the tab, so a reload
  means dropping out of that game

---

## Running it locally

There is nothing to install.

```sh
git clone https://github.com/<you>/<repo>.git
cd <repo>
open welcome-to.html     # or: xdg-open welcome-to.html
```

Opening the file directly over `file://` works. If you would rather serve it:

```sh
python3 -m http.server 8000   # then visit /welcome-to.html
```

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
