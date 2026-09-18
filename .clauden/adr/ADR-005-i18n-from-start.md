# ADR-005 - i18n from the start, English hockey terminology

- **Status:** Accepted
- **Date:** 2026-09-18
- **Relates to:** NFR-05

## Context

The author is Slovak and a Slovak or Czech audience is plausible if the
product goal activates. The portfolio audience is international. Hockey
terminology in Slovak is a mix of Slovak words and long-established
anglicisms, and Slovak hockey speech uses the anglicisms freely.

Retrofitting i18n into a finished application is unpleasant, touching every
component. Doing it from the start costs a little in every component instead.

## Decision

`@nuxtjs/i18n` from the first component in Phase 1, with `en` and `sk`
locales. English is the source locale.

Code identifiers, specification documents and the domain vocabulary are
English (`Fixture`, `Skater`, `Pairing`) - this is already NFR-05 and D-07.

Within the `sk` locale, established hockey anglicisms are kept rather than
translated. Interface chrome, labels and prose are Slovak.

## Rationale

The cost asymmetry decides the timing question: i18n added late is a
whole-application refactor, added early it is a habit.

On terminology: translating hockey terms into invented or archaic Slovak
equivalents reads as wrong to anyone who follows the sport, which is precisely
the audience. Keeping the anglicisms matches how Slovak hockey is actually
spoken, and it keeps translation keys stable and small.

## Consequences

- Every user-facing string goes through a translation key from day one. No
  exceptions, because one hardcoded string is how the discipline dies.
- A `sk` terminology glossary is needed so the same concept does not get two
  translations across screens.
- Player and Club names come from data, not translations, and are never
  localised.
- Two locales must be reviewed on every interface change.
