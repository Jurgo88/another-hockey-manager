# 06 - Roster file

A roster file holds the Rosters of every Club in one Competition. It is how real
names enter the game: a Manager imports a file, and the project distributes none
(ADR-003). Export exists so that a Roster can be edited, rated and shared outside
the application. Decisions are in ADR-020.

## Shape

JSON, UTF-8. Version 2 (version 1 is the same without `capUpperLimit` and
`contract`, and is still read):

```json
{
  "format": "ahm-roster",
  "formatVersion": 2,
  "competitionId": "nhl",
  "capUpperLimit": 104000000,
  "clubs": [
    {
      "id": "bos",
      "code": "BOS",
      "name": "Boston",
      "skaters": [
        {
          "id": "bos-s00",
          "firstName": "Ada",
          "lastName": "Example",
          "age": 27,
          "potential": 15,
          "handedness": "left",
          "positions": ["LW", "RW"],
          "attributes": {
            "shooting": 15, "passing": 13, "puckControl": 14, "offPositioning": 15,
            "checking": 9, "defPositioning": 10, "shotBlocking": 8, "faceoffs": 6,
            "speed": 16, "stamina": 14, "discipline": 11
          },
          "provenance": {
            "speed": { "source": "measured", "confidence": 0.95, "note": "NHL EDGE max speed 23.9 mph" }
          },
          "contract": { "capHit": 7250000, "years": 3, "kind": "standard", "onExpiry": "unrestricted" }
        }
      ],
      "goalies": [
        {
          "id": "bos-g0",
          "firstName": "Bo",
          "lastName": "Example",
          "age": 29,
          "potential": 15,
          "handedness": "left",
          "attributes": {
            "reflexes": 16, "positioning": 15, "reboundControl": 14, "recovery": 14, "puckHandling": 11
          }
        }
      ]
    }
  ]
}
```

## Fields

| Field | Rule |
| --- | --- |
| `format` | Exactly `"ahm-roster"`. |
| `formatVersion` | `2`, or `1` without contracts. A newer version is refused. |
| `competitionId` | The id of the Competition structure the Rosters are for, `"nhl"` for NHL 2026-27. |
| `capUpperLimit` | Version 2, optional: the cap in whole currency the contracts' amounts are in. Required when any Player has a contract. |
| `clubs` | Every Club of that structure, each once, in any order. |
| Club `id` | A Club id of the structure. |
| Club `code`, `name` | Non-empty text. A public build does not use real Club marks (ADR-003). |
| `skaters` | 26: 16 forwards and 10 defencemen by natural position, which is the first of `positions`. |
| `goalies` | 3. |
| Player `id` | Non-empty text, unique across the whole file. Kept as it is. |
| `firstName`, `lastName` | Non-empty text. |
| `age` | Whole years at the start of the Season, 16 to 45. |
| `potential` | 1 to 20. The ceiling of the Player's level (below). Never shown to a Manager. |
| `handedness` | `"left"` or `"right"`. |
| `positions` | Skaters only. One to five distinct of `LW`, `C`, `RW`, `LD`, `RD`, the natural one first. |
| `attributes` | Every attribute of the Player's kind, each a whole number from 1 to 20. Skaters have 11, Goalies 5, as in `02-domain-model.md`. |
| `contract` | Version 2, optional (ADR-030): `capHit` in whole currency from 0, `years` left from 1 to 10 with this Season counted, `kind` `entry-level` or `standard`, `onExpiry` `restricted` or `unrestricted`. Held as a share of `capUpperLimit`, so it keeps its weight in a league with another cap. A Player without one gets the contract the league opens with. |
| `provenance` | Optional, and may name only some attributes. Each entry has `source` (`measured`, `derived`, `rated` or `generated`), `confidence` from 0 to 1, optionally `note`, and optionally `seasonsAged`, the whole number of Seasons of modelled development since the value was set (ADR-022). |

A field that is not in this table is an error, so a misspelt attribute name is
caught rather than ignored.

## Level and potential

The level is the mean of a Skater's attributes without `faceoffs` and
`discipline`, and the mean of all five for a Goalie. `potential` is the level the
Player can still reach. A `potential` at or below the level means no growth is
left. Single attributes may sit above it.

## Provenance on import

An attribute keeps the provenance the file gives it. An attribute with none
arrives as `rated` at confidence 0.8, so a hand-rated file needs no provenance at
all. Export always writes the provenance of every attribute, so a file exported
and imported again is unchanged.

## What a file does not hold

Fatigue, form, injuries and Lineups belong to a Season, not to a Roster. An
imported Player starts the Season rested, at form 50 and fit.

## Errors

A file is checked as a whole, and every problem is reported with its path, for
example `clubs[3].skaters[12].attributes.speed: 23 is outside 1-20`.
