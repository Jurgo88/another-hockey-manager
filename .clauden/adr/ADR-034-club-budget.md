# ADR-034 - A Club's budget is its wage limit, between the floor and the cap

- **Status:** Accepted
- **Date:** 2026-11-12
- **Relates to:** D-04, D-10, ADR-030, ADR-031, ADR-032, ADR-033, ADR-035, issue #121, issue #122

## Context

The roadmap lists a Club budget in Phase 3, and lists club finances beyond wages
among what is deliberately absent. Real Clubs do not all spend to the cap: some
sit near the floor by choice of their owners. That difference is one of the
things that keep Clubs apart.

A budget fed by revenue, from results or attendance, makes a winning Club
richer and so stronger, which works against the table targets of the Phase 3
gate.

The author chose on 2026-11-12: a wage budget per Club, as data, with no revenue,
and scouting capacity equal for every Club.

## Decision

**A Club's budget is the most it will pay in wages:** a share of the cap between
the Competition's floor and its upper limit, held in the Club's data (D-10). It
counts what the cap counts (ADR-031), with the same injury relief.

**It binds every Club.** A move that takes a Club's payroll above its budget is
refused with the rule named, as a move above the cap is. A Manager whose Club has
a budget below the cap plays with less room, as the assistant would. No AI
Club has a different rule (D-04).

**A generated league draws its budgets** from the measured spread of real
payrolls against the cap (#122), one per Club from the league's seed (D-08),
before the opening contracts are scaled to them (ADR-030). A roster file may
declare its Clubs' budgets; without them, the budgets are drawn as for a
generated league.

**A budget stays for the run.** It does not move with results.

**Scouting capacity is not money.** Every Club has the same number of scouting
assignments a Season (ADR-035). It is data, a value of the Competition.

## Options considered

**The cap is everyone's budget.** Simplest, and every Club spends alike; one
source of difference between Clubs goes.

**Revenue from results and attendance.** The genre's usual model, and a feedback
that makes a good Club richer. It needs finances the roadmap leaves out, and it
pushes towards the dynasty the gate forbids.

**Scouting paid from the budget.** A real trade-off between Players and scouts,
but it couples two mechanisms that are calibrated apart, and a poor Club would
also see worse.

**A budget that drifts with the Club's results,** an owner who spends after a
good Season. Possible later, as a value of the Club's data; it adds a feedback
the gate would have to absorb.

## Consequences

- Clubs carry a budget; the interface shows it beside the cap.
- The spread of budgets is a lever of the long-run calibration, bounded by what
  real payrolls measure.
- The lower limit of the cap (ADR-031) still binds: no budget is below the floor.
