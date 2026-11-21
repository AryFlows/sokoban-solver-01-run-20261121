# Frost Sokoban Solver

[![make.fun](https://make.fun/badge/sokoban-solver-01-run-20261121.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121)
[![rank](https://make.fun/badge/sokoban-solver-01-run-20261121/AryFlows/sokoban-solver-01-run-20261121/rank.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121)
[![reward](https://make.fun/badge/sokoban-solver-01-run-20261121/AryFlows/sokoban-solver-01-run-20261121/reward.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121)

Push-optimal Sokoban solver for make.fun's **Build the best Sokoban solver, 21 November 2026** bounty. Referral code: `m2fjazt9`.

## How it works

Every level is a one-square-wide hallway with small rooms (3–4 boxes each) off it, and a box pushed through a door can never come back — so each room can be solved on its own and a level's push-optimal count is the sum of its rooms' optima.

1. **Live squares** — reverse search from the goals marks every square a box can still be pushed onto a goal from; boxes anywhere else are dead.
2. **Room decomposition** — the player's row is cut where its open squares are not live (the hallway), and each connected component holding boxes becomes a room. If the split ever fails, the solver falls back to one push search over the whole level.
3. **Push-optimal BFS per room** — breadth-first search over box configurations, where a state is the sorted box squares plus the player's reachable region (named by its lowest square). Expansions run in a fixed order (up, down, left, right; boxes sorted), pushes must land on a live square, and pushes creating a frozen 2×2 block are rejected. BFS by pushes means the first solved state found is push-optimal. While one room is solved, every other room's boxes act as walls; the player carries over from where the previous room left them.
4. **Move rebuild** — each push is preceded by the shortest player walk (fixed direction order) to the square behind the box; the output is plain lowercase `u`/`d`/`l`/`r` letters.

Everything is deterministic: fixed iteration orders everywhere, no clock, no randomness, no environment-dependent behaviour — two runs write byte-identical output. Work is budgeted by state caps (250,000 states per room), never by time.

## Run locally

```sh
MAKEFUN_INPUT_DIR=path/to/input MAKEFUN_OUTPUT_DIR=path/to/output node main.ts
```

Reads `<input>/<id>/level.txt` for each instance and writes `<output>/<id>/solution.txt`. Requires Node 22 (TypeScript types are stripped natively); no dependencies, only `node:fs` / `node:path`.

## Score

On the practice set the solver targets 1,000,000 — every instance at its push-optimal count (13 / 16 / 29 / 47 / 60 pushes).
