# 07 - The league over time

What changes in the real NHL from one season to the next, measured for Phase 2
(#83): how Players age, who leaves, what the draft yields, and how much the
table turns over; and for Phase 3 (#122), how Players move and what they are
paid. ADR-022 to ADR-024 and the Phase 2 gate in
`04-validation-targets.md` are built on it.

`pnpm sim:measure` reproduces every table below from public NHL endpoints
(`packages/estimate/src/measure.ts`). The raw responses are cached outside git.

## How to read it

- **Age** is taken on 1 October of the season's first year, as the estimator
  takes it (ADR-021).
- **Age curves use the delta method.** Each step compares the same Player in two
  consecutive seasons, and the steps are averaged by age, weighted by the
  smaller of the two samples. A Player is compared only with himself, so who
  happens to be in the league at an age does not shape the curve.
- **The league's own trend is removed.** Scoring rose and save percentage fell
  between 2015 and 2026. Production is a share of that season's mean and save
  percentage is measured against that season's league figure, so the trend is
  not read as every Player growing or declining.
- **Survivorship is not removed.** Only Players who stayed are paired. Those who
  declined out of the league are missing, and Players paired after a good season
  tend to fall back. Late decline is, if anything, understated, and the first
  years of decline may be slightly deepened by regression to the mean.
- **Speed has one pair of seasons.** NHL EDGE has no league-wide history; the
  2025-26 Skaters were fetched for 2024-25 as well. Read it as a direction,
  not a curve.
- **Leaving** means playing no Fixture the next season. It includes Players
  who return a season later, from injury or the minors.
- **Shortened seasons** (2019-20 and 2020-21) are compared per Fixture and by
  point share.

### Forwards: 5v5 points per 60, share of the mean

Peak at 23. Change is from the season at that age to the next; level is relative to the peak.

| Age | Pairs | Change (share) | Level at age + 1 |
| --- | --- | --- | --- |
| 19 | 67 |  0.09 | -0.06 |
| 20 | 114 |  0.02 | -0.04 |
| 21 | 174 | -0.02 | -0.06 |
| 22 | 259 |  0.06 |  0.00 |
| 23 | 314 | -0.02 | -0.02 |
| 24 | 321 | -0.03 | -0.06 |
| 25 | 319 |  0.01 | -0.05 |
| 26 | 305 | -0.03 | -0.08 |
| 27 | 304 | -0.02 | -0.10 |
| 28 | 270 | -0.06 | -0.16 |
| 29 | 231 | -0.03 | -0.19 |
| 30 | 204 | -0.03 | -0.22 |
| 31 | 170 |  0.00 | -0.22 |
| 32 | 133 | -0.10 | -0.32 |
| 33 | 97 | -0.04 | -0.36 |
| 34 | 70 | -0.06 | -0.41 |
| 35 | 52 | -0.02 | -0.44 |
| 36 | 30 | -0.01 | -0.45 |

### Defencemen: 5v5 points per 60, share of the mean

Peak at 23. Change is from the season at that age to the next; level is relative to the peak.

| Age | Pairs | Change (share) | Level at age + 1 |
| --- | --- | --- | --- |
| 19 | 21 | -0.02 | -0.11 |
| 20 | 51 |  0.05 | -0.05 |
| 21 | 81 |  0.02 | -0.03 |
| 22 | 138 |  0.03 |  0.00 |
| 23 | 156 | -0.00 | -0.00 |
| 24 | 172 | -0.01 | -0.01 |
| 25 | 181 | -0.03 | -0.04 |
| 26 | 177 |  0.00 | -0.04 |
| 27 | 169 | -0.01 | -0.05 |
| 28 | 150 | -0.02 | -0.07 |
| 29 | 138 | -0.05 | -0.12 |
| 30 | 128 | -0.02 | -0.14 |
| 31 | 100 | -0.06 | -0.20 |
| 32 | 75 | -0.03 | -0.23 |
| 33 | 64 | -0.07 | -0.30 |
| 34 | 47 | -0.07 | -0.37 |
| 35 | 26 | -0.02 | -0.38 |

### Skaters: ice time per Fixture

Peak at 27. Change is from the season at that age to the next; level is relative to the peak.

| Age | Pairs | Change (minutes) | Level at age + 1 |
| --- | --- | --- | --- |
| 18 | 23 |  1.01 | -3.43 |
| 19 | 89 |  0.83 | -2.60 |
| 20 | 186 |  0.86 | -1.74 |
| 21 | 284 |  0.74 | -1.00 |
| 22 | 425 |  0.51 | -0.50 |
| 23 | 503 |  0.35 | -0.15 |
| 24 | 533 |  0.13 | -0.02 |
| 25 | 530 |  0.02 | -0.00 |
| 26 | 507 |  0.00 |  0.00 |
| 27 | 488 | -0.04 | -0.04 |
| 28 | 436 | -0.27 | -0.31 |
| 29 | 388 | -0.27 | -0.58 |
| 30 | 350 | -0.35 | -0.93 |
| 31 | 286 | -0.54 | -1.47 |
| 32 | 216 | -0.56 | -2.03 |
| 33 | 165 | -0.74 | -2.76 |
| 34 | 121 | -0.86 | -3.62 |
| 35 | 80 | -1.03 | -4.65 |
| 36 | 51 | -1.47 | -6.12 |
| 37 | 28 | -1.21 | -7.32 |

### Goalies: even-strength save percentage

Peak at 24. Change is from the season at that age to the next; level is relative to the peak.

| Age | Pairs | Change (thousandths) | Level at age + 1 |
| --- | --- | --- | --- |
| 22 | 11 |  0.1 | -0.0 |
| 23 | 21 |  0.0 |  0.0 |
| 24 | 29 | -2.1 | -2.1 |
| 25 | 40 | -0.0 | -2.1 |
| 26 | 38 | -1.7 | -3.8 |
| 27 | 38 | -3.7 | -7.5 |
| 28 | 33 | -0.4 | -7.9 |
| 29 | 35 | -3.1 | -11.0 |
| 30 | 37 |  1.0 | -10.0 |
| 31 | 37 | -3.4 | -13.3 |
| 32 | 27 |  1.8 | -11.5 |
| 33 | 20 |  1.0 | -10.5 |
| 34 | 15 | -2.1 | -12.6 |
| 35 | 11 | -7.4 | -20.0 |
| 36 | 10 | -1.0 | -21.0 |

### Skaters: NHL EDGE top speed, one pair of seasons

Peak at 29. Change is from the season at that age to the next; level is relative to the peak.

| Age | Pairs | Change (mph) | Level at age + 1 |
| --- | --- | --- | --- |
| 19 | 16 |  0.70 | -0.88 |
| 20 | 36 |  0.11 | -0.77 |
| 21 | 35 |  0.18 | -0.59 |
| 22 | 42 |  0.20 | -0.39 |
| 23 | 61 | -0.00 | -0.39 |
| 24 | 51 |  0.11 | -0.28 |
| 25 | 52 |  0.20 | -0.08 |
| 26 | 57 | -0.11 | -0.19 |
| 27 | 59 |  0.03 | -0.16 |
| 28 | 58 |  0.16 |  0.00 |
| 29 | 49 | -0.10 | -0.10 |
| 30 | 50 | -0.13 | -0.23 |
| 31 | 44 | -0.06 | -0.29 |
| 32 | 40 | -0.03 | -0.32 |
| 33 | 27 | -0.20 | -0.51 |
| 34 | 19 | -0.22 | -0.74 |
| 35 | 12 | -0.10 | -0.84 |

### Leaving the league, by age (20 or more Fixtures)

| Group | Player-seasons | Gone the next season | Rate |
| --- | --- | --- | --- |
| 23 or younger | 1805 | 79 | 4.4% |
| 24-27 | 2626 | 192 | 7.3% |
| 28-30 | 1518 | 113 | 7.4% |
| 31-33 | 960 | 125 | 13.0% |
| 34-36 | 417 | 96 | 23.0% |
| 37 or older | 135 | 58 | 43.0% |

### Leaving the league, by ice time in the group

| Group | Player-seasons | Gone the next season | Rate |
| --- | --- | --- | --- |
| Top third by ice time | 2498 | 33 | 1.3% |
| Middle third | 2486 | 133 | 5.3% |
| Bottom third | 2477 | 497 | 20.1% |

Per season, 173 Players who played do not play the next, and 137 play their first.

### Draft, classes 2010-2018

| Round | Picks | Reached the NHL | 200 or more Fixtures | Median seasons to debut |
| --- | --- | --- | --- | --- |
| 1 | 271 | 98.2% | 74.9% | 1 |
| 2 | 275 | 72.7% | 38.5% | 3 |
| 3 | 271 | 55.0% | 19.9% | 3 |
| 4 | 272 | 43.8% | 16.5% | 3 |
| 5 | 271 | 37.3% | 12.9% | 4 |
| 6 | 272 | 29.0% | 8.8% | 4 |
| 7 | 271 | 23.2% | 6.3% | 4 |

### The table from one season to the next

| Measure | Value |
| --- | --- |
| Correlation of Club point shares, consecutive seasons | 0.51 |
| Top 8 still top 8 the next season | 46.3% |
| Bottom 8 still bottom 8 the next season | 51.2% |
| Longest run in the top 8 | 7 seasons (COL) |
| Clubs that finished first, in 11 seasons | 9 |
| Standard deviation of points over 84 Fixtures | 16.1 |

### The age of the league

| Season | Mean age, by Fixtures | Aged 31 or more | Aged 23 or younger | Oldest |
| --- | --- | --- | --- | --- |
| 2015-16 | 26.7 | 16.9% | 34.3% | 43 |
| 2016-17 | 26.6 | 16.7% | 34.6% | 44 |
| 2017-18 | 26.4 | 16.6% | 32.5% | 45 |
| 2018-19 | 26.4 | 15.6% | 32.0% | 41 |
| 2019-20 | 26.6 | 16.0% | 30.5% | 42 |
| 2020-21 | 26.6 | 15.4% | 30.3% | 43 |
| 2021-22 | 26.9 | 16.7% | 29.8% | 44 |
| 2022-23 | 27.2 | 17.3% | 27.9% | 41 |
| 2023-24 | 27.4 | 19.6% | 25.8% | 39 |
| 2024-25 | 27.5 | 21.4% | 26.2% | 39 |
| 2025-26 | 27.6 | 24.2% | 25.7% | 40 |

## The age profile the generator draws from

`pnpm sim:measure --ages` writes the ages of every Player-season, split four
ways, as `packages/sim/src/generate/nhl-age-profile.ts`. Players with 20 or more
Fixtures fall into three thirds by ice time in their position group, as in the
leaving tables above, and Players with fewer form a fourth table. The top third
is oldest, peaking at 27-28; the bottom third peaks at 24; Players with few
Fixtures are the youngest (#84).

## Movement and contracts (Phase 3)

Measured for the Phase 3 gate (#122): who changes Club and when, how much of a
Club returns, what a role is paid, how long contracts run and who re-signs.
ADR-030 to ADR-035 and the Phase 3 gate in `04-validation-targets.md` are built
on it. `pnpm sim:measure --movement` and `--contracts` reproduce the tables.

### How to read it

- **Movement** comes from the NHL's `club-stats` per Club and season, and the
  game logs of every Player who played for more than one Club in a season,
  2015-16 to 2025-26. A Player's Club at the end of a season is the one he
  played for last; at the start, the one he played for first.
- **A move during a season** is dated by the last Fixture for the old Club. It
  is near the deadline when that Fixture is in the 14 days before it, through
  its day; the deadlines are public dates, kept in `src/nhl/movement.ts`. No
  move falls after a deadline: trades stop there.
- **Contracts** come from CapWages Club pages: copies kept by the Internet
  Archive of the end of 2024-25 and 2025-26, the latest copy of each Club that
  still showed that season (taken between February and June), and the live
  pages for 2026-27. Only derived tables are committed (R-10).
- **Players are matched** to the NHL by birth date and last name, accents
  dropped, or by birth date alone where it is unique: 748 of 759 regulars of
  2024-25 and 772 of 781 of 2025-26.
- **A share is a cap hit over that season's upper limit**, $88 million in
  2024-25 and $95.5 million in 2025-26. Contracts are fixed in dollars, so when
  the cap rose by 8.5% between the two, the shares of contracts signed earlier
  fell: the change between the seasons is not inflation in the sense of ADR-030,
  where the cap is constant.
- **Role** is the rank by ice time per Fixture in the position group among
  Players with 20 or more Fixtures, Goalies by Fixtures, as ADR-027 ranks it.
  A tenth of Goalies is six or seven Players, so their rows are noisy.
- **2024-25 pages do not name a contract's type**, so entry-level contracts are
  counted as restricted there.
- **Terms** are standard contracts beginning in the season, signed by Players
  who were regulars the season before, entry-level contracts left out.
- **Re-signing** follows regulars whose contract ended with the season into the
  next view: a contract from the next season with the same Club, with another,
  or none yet when the next view was taken. A Player traded after the copy of
  his Club was taken counts as another Club.

### Changing Club between seasons (20 or more Fixtures, and played the next)

| Group | Players | Another Club | Share |
| --- | --- | --- | --- |
| All | 6798 | 1355 | 19.9% |
| 23 or younger | 1726 | 140 | 8.1% |
| 24-27 | 2434 | 548 | 22.5% |
| 28-30 | 1405 | 340 | 24.2% |
| 31-33 | 835 | 208 | 24.9% |
| 34 or older | 398 | 119 | 29.9% |

### Moving during a season

Of Players with 20 or more Fixtures, 9.6% played for more than one Club (793 of 8242).
Of 921 moves, 48.5% came in the 14 days before the deadline and 0.0% after it.

| Tenth of the regular season | Moves | Share |
| --- | --- | --- |
| 1 | 19 | 2.1% |
| 2 | 29 | 3.1% |
| 3 | 49 | 5.3% |
| 4 | 65 | 7.1% |
| 5 | 54 | 5.9% |
| 6 | 78 | 8.5% |
| 7 | 103 | 11.2% |
| 8 | 423 | 45.9% |
| 9 | 73 | 7.9% |
| 10 | 28 | 3.0% |

| Season | Moves | In the 14 days before the deadline |
| --- | --- | --- |
| 2015-16 | 76 | 31 |
| 2016-17 | 68 | 36 |
| 2017-18 | 82 | 39 |
| 2018-19 | 96 | 32 |
| 2019-20 | 73 | 44 |
| 2020-21 | 62 | 34 |
| 2021-22 | 87 | 49 |
| 2022-23 | 101 | 54 |
| 2023-24 | 75 | 37 |
| 2024-25 | 116 | 54 |
| 2025-26 | 85 | 37 |

### Continuity

A Club's Skater ice time played by Skaters who played for it the season before: 77.1% on average over 312 Club-seasons, from 42.5% to 96.1%.

2024-25: 32 Clubs, 1635 Players under contract, 1007 matched to NHL Players of the season. Of 759 NHL Players with 20 or more Fixtures, 748 are matched with a contract for the season.
2025-26: 32 Clubs, 1577 Players under contract, 1025 matched to NHL Players of the season. Of 781 NHL Players with 20 or more Fixtures, 772 are matched with a contract for the season.

### Forwards: cap share by tenth of role (20 or more Fixtures)

| Tenth | 2024-25 mean | median | 2025-26 mean | median | Change in the mean |
| --- | --- | --- | --- | --- | --- |
| 1 | 8.98% | 9.66% | 8.49% | 8.38% | -5.5% |
| 2 | 6.93% | 7.10% | 6.33% | 7.33% | -8.7% |
| 3 | 5.92% | 6.25% | 5.38% | 5.24% | -9.1% |
| 4 | 3.87% | 3.58% | 4.09% | 3.64% | 5.6% |
| 5 | 3.58% | 3.41% | 3.03% | 2.70% | -15.4% |
| 6 | 2.94% | 2.27% | 2.38% | 2.09% | -19.1% |
| 7 | 2.15% | 1.65% | 2.13% | 1.62% | -1.0% |
| 8 | 1.61% | 1.05% | 1.81% | 0.99% | 11.9% |
| 9 | 1.17% | 0.95% | 1.42% | 1.02% | 21.6% |
| 10 | 1.10% | 0.94% | 1.08% | 0.91% | -1.8% |

### Defencemen: cap share by tenth of role (20 or more Fixtures)

| Tenth | 2024-25 mean | median | 2025-26 mean | median | Change in the mean |
| --- | --- | --- | --- | --- | --- |
| 1 | 8.24% | 8.72% | 7.94% | 8.90% | -3.7% |
| 2 | 6.50% | 6.75% | 6.70% | 7.33% | 3.2% |
| 3 | 4.59% | 4.56% | 5.83% | 6.47% | 27.1% |
| 4 | 5.35% | 5.23% | 4.51% | 4.46% | -15.7% |
| 5 | 3.92% | 3.49% | 3.37% | 3.14% | -14.2% |
| 6 | 3.14% | 3.47% | 2.96% | 2.91% | -5.5% |
| 7 | 2.04% | 1.42% | 2.46% | 1.57% | 21.0% |
| 8 | 1.56% | 0.98% | 1.75% | 0.97% | 12.3% |
| 9 | 1.80% | 1.04% | 1.16% | 0.93% | -35.5% |
| 10 | 1.03% | 0.91% | 1.14% | 0.96% | 10.4% |

### Goalies: cap share by tenth of role (20 or more Fixtures)

| Tenth | 2024-25 mean | median | 2025-26 mean | median | Change in the mean |
| --- | --- | --- | --- | --- | --- |
| 1 | 7.68% | 9.38% | 6.52% | 6.70% | -15.1% |
| 2 | 3.98% | 3.68% | 6.97% | 8.64% | 74.9% |
| 3 | 4.62% | 4.18% | 6.06% | 4.71% | 31.0% |
| 4 | 4.25% | 4.72% | 3.50% | 3.56% | -17.7% |
| 5 | 2.19% | 1.45% | 3.32% | 3.23% | 51.5% |
| 6 | 3.52% | 3.84% | 2.66% | 2.36% | -24.6% |
| 7 | 2.11% | 1.82% | 3.08% | 2.04% | 45.8% |
| 8 | 3.19% | 2.59% | 2.66% | 1.05% | -16.5% |
| 9 | 3.33% | 3.28% | 2.02% | 1.62% | -39.2% |
| 10 | 2.56% | 1.83% | 2.25% | 1.70% | -12.2% |

### Skaters: cap share by third of role and status, 2025-26

| Third | Status | Players | Mean share |
| --- | --- | --- | --- |
| 1 | entry-level | 22 | 0.97% |
| 1 | restricted | 23 | 3.45% |
| 1 | unrestricted | 239 | 6.86% |
| 2 | entry-level | 43 | 0.94% |
| 2 | restricted | 37 | 2.02% |
| 2 | unrestricted | 131 | 3.39% |
| 3 | entry-level | 41 | 0.94% |
| 3 | restricted | 37 | 1.01% |
| 3 | unrestricted | 133 | 1.67% |

### Cap share by age, 2025-26

| Age | Players | Mean share | Mean tenth of role |
| --- | --- | --- | --- |
| 21 or younger | 64 | 1.07% | 5.8 |
| 22-24 | 153 | 2.56% | 5.9 |
| 25-27 | 162 | 3.52% | 6.0 |
| 28-30 | 179 | 4.83% | 4.9 |
| 31-33 | 135 | 4.51% | 5.2 |
| 34 or older | 79 | 4.46% | 5.3 |

### Contracts and payrolls

| Season | Regulars | At the minimum | Entry-level | Restricted | Unrestricted | Payroll, mean | SD | Lowest | Highest | Floor | Clubs within 3 pp of the floor |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2024-25 | 748 | 9.9% | n/a | 28.3% | 71.7% | 93.9% | 9.6% | 63.7% | 111.8% | 73.9% | 1 |
| 2025-26 | 772 | 8.4% | 13.7% | 14.2% | 72.0% | 96.0% | 6.8% | 79.3% | 105.8% | 73.9% | 0 |

### Term of standard contracts beginning in 2025-26, signed by regulars of 2024-25

| Age at the start, or role | Contracts | Median years | Mean years | One year | Five or more |
| --- | --- | --- | --- | --- | --- |
| 21 or younger | 1 | 8 | 8.0 | 0.0% | 100.0% |
| 22-24 | 57 | 2 | 2.6 | 21.1% | 17.5% |
| 25-27 | 83 | 2 | 2.6 | 36.1% | 15.7% |
| 28-30 | 71 | 2 | 3.5 | 32.4% | 38.0% |
| 31-33 | 38 | 2 | 2.5 | 31.6% | 10.5% |
| 34 or older | 33 | 1 | 1.9 | 57.6% | 6.1% |
| Top third | 73 | 5 | 5.0 | 9.6% | 58.9% |
| Middle third | 84 | 2 | 2.5 | 28.6% | 14.3% |
| Bottom third | 126 | 1 | 1.6 | 51.6% | 1.6% |

### Term of standard contracts beginning in 2026-27, signed by regulars of 2025-26

| Age at the start, or role | Contracts | Median years | Mean years | One year | Five or more |
| --- | --- | --- | --- | --- | --- |
| 21 or younger | 5 | 5 | 5.0 | 0.0% | 80.0% |
| 22-24 | 45 | 2 | 3.3 | 22.2% | 26.7% |
| 25-27 | 71 | 2 | 2.6 | 36.6% | 14.1% |
| 28-30 | 62 | 2 | 3.3 | 30.6% | 29.0% |
| 31-33 | 44 | 2 | 2.6 | 25.0% | 18.2% |
| 34 or older | 44 | 1.5 | 1.8 | 50.0% | 4.5% |
| Top third | 56 | 5 | 4.6 | 12.5% | 51.8% |
| Middle third | 93 | 2 | 2.8 | 35.5% | 22.6% |
| Bottom third | 122 | 2 | 1.9 | 39.3% | 3.3% |

### Re-signing: regulars whose contract ended with the season

| Season | Status | Players | Same Club | Another Club | None yet |
| --- | --- | --- | --- | --- | --- |
| 2024-25 | restricted | 118 | 74.6% | 16.9% | 8.5% |
| 2024-25 | unrestricted | 196 | 50.0% | 32.7% | 17.3% |
| 2025-26 | restricted | 100 | 66.0% | 23.0% | 11.0% |
| 2025-26 | unrestricted | 202 | 43.1% | 41.1% | 15.8% |
