# 07 - The league over time

What changes in the real NHL from one season to the next, measured for Phase 2
(#83): how Players age, who leaves, what the draft yields, and how much the
table turns over. ADR-022 to ADR-024 and the Phase 2 gate in
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
