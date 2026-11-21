import * as fs from "node:fs";
import * as path from "node:path";

// Frost Sokoban Solver: push-optimal room-by-room Sokoban solver.
// Idea: every level is a hallway with small rooms (3-4 boxes each) off it.
// Boxes can never leave their room, so each room is solved independently
// with a push-optimal breadth-first search, and the push sequences are
// stitched together with shortest player walks. No clock, no randomness:
// every iteration order is fixed, so two runs produce identical output.

const DX: number[] = [0, 0, -1, 1];
const DY: number[] = [-1, 1, 0, 0];
const LETTER: string[] = ["u", "d", "l", "r"];
const ROOM_CAP = 250000;
const WHOLE_CAP = 1000000;

interface Level {
  w: number;
  h: number;
  open: boolean[];
  goals: Set<number>;
  boxes: number[];
  player: number;
}

interface PushStep {
  box: number;
  dir: number;
}

interface Room {
  boxes: number[];
  goals: number[];
  minSq: number;
}

function parseLevel(text: string): Level {
  const rawLines: string[] = text.split("\n");
  while (rawLines.length > 0 && rawLines[rawLines.length - 1].replace(/\r/g, "").length === 0) {
    rawLines.pop();
  }
  const lines: string[] = rawLines.map((l) => l.replace(/\r/g, ""));
  let w = 0;
  for (const l of lines) {
    if (l.length > w) {
      w = l.length;
    }
  }
  const h: number = lines.length;
  const open: boolean[] = new Array<boolean>(w * h).fill(false);
  const goals = new Set<number>();
  const boxes: number[] = [];
  let player = -1;
  for (let y = 0; y < h; y++) {
    const line: string = lines[y];
    for (let x = 0; x < w; x++) {
      const ch: string = x < line.length ? line[x] : "#";
      const idx: number = y * w + x;
      if (ch === "#") {
        open[idx] = false;
      } else {
        open[idx] = true;
        if (ch === "." || ch === "*" || ch === "+") {
          goals.add(idx);
        }
        if (ch === "$" || ch === "*") {
          boxes.push(idx);
        }
        if (ch === "@" || ch === "+") {
          player = idx;
        }
      }
    }
  }
  boxes.sort((a, b) => a - b);
  return { w, h, open, goals, boxes, player };
}

// A square is live when a box standing there can still be pushed onto a
// goal. Reverse search from the goals: a box on y can be pushed in
// direction d onto live square x = y + d when the player can stand on
// z = y - d, so y is live when x is live and both y and z are open floor.
function computeLive(level: Level): boolean[] {
  const n: number = level.w * level.h;
  const live: boolean[] = new Array<boolean>(n).fill(false);
  const stack: number[] = [];
  for (const g of level.goals) {
    live[g] = true;
    stack.push(g);
  }
  while (stack.length > 0) {
    const x: number = stack.pop() as number;
    const xx: number = x % level.w;
    const xy: number = Math.floor(x / level.w);
    for (let d = 0; d < 4; d++) {
      const yx: number = xx - DX[d];
      const yy: number = xy - DY[d];
      const zx: number = yx - DX[d];
      const zy: number = yy - DY[d];
      if (yx < 0 || yx >= level.w || yy < 0 || yy >= level.h) {
        continue;
      }
      if (zx < 0 || zx >= level.w || zy < 0 || zy >= level.h) {
        continue;
      }
      const y: number = yy * level.w + yx;
      const z: number = zy * level.w + zx;
      if (!level.open[y] || !level.open[z] || live[y]) {
        continue;
      }
      live[y] = true;
      stack.push(y);
    }
  }
  return live;
}

// Flood-fill the squares the player can reach from `start`, treating every
// square with blocked[i] set as impassable. Returns the visited mask and
// the lowest reachable square index (the region's canonical name).
function floodReach(
  start: number,
  blocked: boolean[],
  w: number,
  h: number,
): { reach: boolean[]; low: number } {
  const n: number = w * h;
  const reach: boolean[] = new Array<boolean>(n).fill(false);
  if (blocked[start]) {
    return { reach, low: start };
  }
  const stack: number[] = [start];
  reach[start] = true;
  let low: number = start;
  while (stack.length > 0) {
    const cur: number = stack.pop() as number;
    if (cur < low) {
      low = cur;
    }
    const cx: number = cur % w;
    const cy: number = Math.floor(cur / w);
    for (let d = 0; d < 4; d++) {
      const nx: number = cx + DX[d];
      const ny: number = cy + DY[d];
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) {
        continue;
      }
      const ni: number = ny * w + nx;
      if (blocked[ni] || reach[ni]) {
        continue;
      }
      reach[ni] = true;
      stack.push(ni);
    }
  }
  return { reach, low };
}

// True when pushing a box onto `landing` (with `boxSet` the new box
// positions) creates a frozen 2x2 block: four squares, each wall or box,
// holding at least one box that is not on a goal.
function createsFrozen2x2(
  landing: number,
  boxSet: Set<number>,
  open: boolean[],
  goals: Set<number>,
  w: number,
  h: number,
): boolean {
  const lx: number = landing % w;
  const ly: number = Math.floor(landing / w);
  for (let oy = -1; oy <= 0; oy++) {
    for (let ox = -1; ox <= 0; ox++) {
      const tx: number = lx + ox;
      const ty: number = ly + oy;
      if (tx < 0 || ty < 0 || tx + 1 >= w || ty + 1 >= h) {
        continue;
      }
      let allSolid = true;
      let offGoalBox = false;
      for (let dy = 0; dy <= 1; dy++) {
        for (let dx = 0; dx <= 1; dx++) {
          const s: number = (ty + dy) * w + (tx + dx);
          if (!open[s] && !boxSet.has(s)) {
            // wall square: solid
          } else if (boxSet.has(s)) {
            if (!goals.has(s)) {
              offGoalBox = true;
            }
          } else {
            allSolid = false;
          }
        }
      }
      if (allSolid && offGoalBox) {
        return true;
      }
    }
  }
  return false;
}

// Push-optimal BFS over box configurations. `staticBlocked` marks squares
// blocked by boxes that do not move in this search (other rooms' boxes).
// Returns the push sequence, or null when unsolved / over the state cap.
function solveBoxes(
  startBoxes: number[],
  goals: Set<number>,
  playerStart: number,
  staticBlocked: boolean[],
  live: boolean[],
  open: boolean[],
  w: number,
  h: number,
  cap: number,
): PushStep[] | null {
  const n: number = w * h;
  const base: number = n;
  const numericKey: boolean = startBoxes.length <= 5;
  const start: number[] = startBoxes.slice().sort((a, b) => a - b);

  const isSolved = (boxes: number[]): boolean => {
    for (const b of boxes) {
      if (!goals.has(b)) {
        return false;
      }
    }
    return true;
  };
  if (isSolved(start)) {
    return [];
  }

  const keyOf = (boxes: number[], low: number): number | string => {
    if (numericKey) {
      let k: number = low;
      for (const b of boxes) {
        k = k * base + b;
      }
      return k;
    }
    return low + ":" + boxes.join(",");
  };

  const qBoxes: number[][] = [start];
  const qPlayer: number[] = [playerStart];
  const parent: number[] = [-1];
  const pBox: number[] = [-1];
  const pDir: number[] = [-1];
  const seen = new Map<number | string, number>();

  const blocked0: boolean[] = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    blocked0[i] = !open[i] || staticBlocked[i];
  }
  for (const b of start) {
    blocked0[b] = true;
  }
  const startReach = floodReach(playerStart, blocked0, w, h);
  seen.set(keyOf(start, startReach.low), 0);

  let head = 0;
  while (head < qBoxes.length) {
    const si: number = head;
    head++;
    const boxes: number[] = qBoxes[si];
    const player: number = qPlayer[si];
    const boxSet = new Set<number>(boxes);
    const blocked: boolean[] = new Array<boolean>(n).fill(false);
    for (let i = 0; i < n; i++) {
      blocked[i] = !open[i] || staticBlocked[i];
    }
    for (const b of boxes) {
      blocked[b] = true;
    }
    const reachInfo = floodReach(player, blocked, w, h);
    const reach: boolean[] = reachInfo.reach;

    for (let bi = 0; bi < boxes.length; bi++) {
      const box: number = boxes[bi];
      const bx: number = box % w;
      const by: number = Math.floor(box / w);
      for (let d = 0; d < 4; d++) {
        const behindX: number = bx - DX[d];
        const behindY: number = by - DY[d];
        const landX: number = bx + DX[d];
        const landY: number = by + DY[d];
        if (behindX < 0 || behindX >= w || behindY < 0 || behindY >= h) {
          continue;
        }
        if (landX < 0 || landX >= w || landY < 0 || landY >= h) {
          continue;
        }
        const behind: number = behindY * w + behindX;
        const landing: number = landY * w + landX;
        if (!open[behind] || !reach[behind]) {
          continue;
        }
        if (!open[landing] || boxSet.has(landing) || staticBlocked[landing]) {
          continue;
        }
        if (!live[landing]) {
          continue;
        }
        const nb: number[] = boxes.slice();
        nb[bi] = landing;
        nb.sort((a, b) => a - b);
        const nbSet = new Set<number>(nb);
        if (createsFrozen2x2(landing, nbSet, open, goals, w, h)) {
          continue;
        }
        const nbBlocked: boolean[] = new Array<boolean>(n).fill(false);
        for (let i = 0; i < n; i++) {
          nbBlocked[i] = !open[i] || staticBlocked[i];
        }
        for (const b of nb) {
          nbBlocked[b] = true;
        }
        const nbReach = floodReach(box, nbBlocked, w, h);
        const key = keyOf(nb, nbReach.low);
        if (seen.has(key)) {
          continue;
        }
        const ni: number = qBoxes.length;
        seen.set(key, ni);
        qBoxes.push(nb);
        qPlayer.push(box);
        parent.push(si);
        pBox.push(box);
        pDir.push(d);
        if (isSolved(nb)) {
          const steps: PushStep[] = [];
          let cur: number = ni;
          while (cur !== 0) {
            steps.push({ box: pBox[cur], dir: pDir[cur] });
            cur = parent[cur];
          }
          steps.reverse();
          return steps;
        }
        if (qBoxes.length >= cap) {
          return null;
        }
      }
    }
  }
  return null;
}

// Shortest player walk from `from` to `to` (boxes and walls impassable),
// fixed direction order up, down, left, right. Returns the move letters.
function walkPath(
  from: number,
  to: number,
  blocked: boolean[],
  w: number,
  h: number,
): string | null {
  if (from === to) {
    return "";
  }
  const n: number = w * h;
  const prev = new Int32Array(n).fill(-1);
  const prevDir = new Int8Array(n).fill(-1);
  const queue: number[] = [from];
  prev[from] = from;
  let qi = 0;
  while (qi < queue.length) {
    const cur: number = queue[qi];
    qi++;
    if (cur === to) {
      break;
    }
    const cx: number = cur % w;
    const cy: number = Math.floor(cur / w);
    for (let d = 0; d < 4; d++) {
      const nx: number = cx + DX[d];
      const ny: number = cy + DY[d];
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) {
        continue;
      }
      const ni: number = ny * w + nx;
      if (blocked[ni] || prev[ni] !== -1) {
        continue;
      }
      prev[ni] = cur;
      prevDir[ni] = d;
      queue.push(ni);
    }
  }
  if (prev[to] === -1) {
    return null;
  }
  let letters = "";
  let cur: number = to;
  while (cur !== from) {
    letters = LETTER[prevDir[cur]] + letters;
    cur = prev[cur];
  }
  return letters;
}

// Split the board into rooms: cut the player's row where its open squares
// are not live (the hallway), then take the connected components of what
// is left that hold boxes. Returns null when the split does not account
// for every box or a room's box/goal counts disagree.
function decompose(level: Level, live: boolean[]): Room[] | null {
  const n: number = level.w * level.h;
  const playerRow: number = Math.floor(level.player / level.w);
  const cut: boolean[] = new Array<boolean>(n).fill(false);
  for (let x = 0; x < level.w; x++) {
    const idx: number = playerRow * level.w + x;
    if (level.open[idx] && !live[idx]) {
      cut[idx] = true;
    }
  }
  const comp = new Int32Array(n).fill(-1);
  const rooms: Room[] = [];
  let compId = 0;
  for (let i = 0; i < n; i++) {
    if (!level.open[i] || cut[i] || comp[i] !== -1) {
      continue;
    }
    const stack: number[] = [i];
    comp[i] = compId;
    const squares: number[] = [];
    while (stack.length > 0) {
      const cur: number = stack.pop() as number;
      squares.push(cur);
      const cx: number = cur % level.w;
      const cy: number = Math.floor(cur / level.w);
      for (let d = 0; d < 4; d++) {
        const nx: number = cx + DX[d];
        const ny: number = cy + DY[d];
        if (nx < 0 || nx >= level.w || ny < 0 || ny >= level.h) {
          continue;
        }
        const ni: number = ny * level.w + nx;
        if (!level.open[ni] || cut[ni] || comp[ni] !== -1) {
          continue;
        }
        comp[ni] = compId;
        stack.push(ni);
      }
    }
    compId++;
    const sqSet = new Set<number>(squares);
    const rBoxes: number[] = level.boxes.filter((b) => sqSet.has(b));
    const rGoals: number[] = [];
    for (const g of level.goals) {
      if (sqSet.has(g)) {
        rGoals.push(g);
      }
    }
    if (rBoxes.length > 0) {
      if (rBoxes.length !== rGoals.length) {
        return null;
      }
      let minSq: number = squares[0];
      for (const s of squares) {
        if (s < minSq) {
          minSq = s;
        }
      }
      rBoxes.sort((a, b) => a - b);
      rGoals.sort((a, b) => a - b);
      rooms.push({ boxes: rBoxes, goals: rGoals, minSq });
    }
  }
  let accounted = 0;
  for (const r of rooms) {
    accounted += r.boxes.length;
  }
  if (accounted !== level.boxes.length || rooms.length === 0) {
    return null;
  }
  rooms.sort((a, b) => a.minSq - b.minSq);
  return rooms;
}

function solveLevel(level: Level): string {
  const live: boolean[] = computeLive(level);
  const n: number = level.w * level.h;
  const rooms: Room[] | null = decompose(level, live);

  // Whole-level fallback: one push search over every box at once.
  const solveWhole = (): string | null => {
    const emptyBlocked: boolean[] = new Array<boolean>(n).fill(false);
    const pushes: PushStep[] | null = solveBoxes(
      level.boxes,
      level.goals,
      level.player,
      emptyBlocked,
      live,
      level.open,
      level.w,
      level.h,
      WHOLE_CAP,
    );
    if (pushes === null) {
      return null;
    }
    return rebuildMoves(level, pushes, level.boxes.slice());
  };

  if (rooms === null) {
    return solveWhole() ?? "";
  }

  // Current box position of every room (starts at the room's start boxes).
  const roomBoxes: number[][] = rooms.map((r) => r.boxes.slice());
  let player: number = level.player;
  let moves = "";

  for (let ri = 0; ri < rooms.length; ri++) {
    const staticBlocked: boolean[] = new Array<boolean>(n).fill(false);
    for (let rj = 0; rj < rooms.length; rj++) {
      if (rj === ri) {
        continue;
      }
      for (const b of roomBoxes[rj]) {
        staticBlocked[b] = true;
      }
    }
    const roomGoals = new Set<number>(rooms[ri].goals);
    const pushes: PushStep[] | null = solveBoxes(
      roomBoxes[ri],
      roomGoals,
      player,
      staticBlocked,
      live,
      level.open,
      level.w,
      level.h,
      ROOM_CAP,
    );
    if (pushes === null) {
      return solveWhole() ?? moves;
    }
    // Rebuild this room's moves against the live board (all rooms' boxes).
    const allBoxes: number[] = [];
    for (const rb of roomBoxes) {
      for (const b of rb) {
        allBoxes.push(b);
      }
    }
    allBoxes.sort((a, b) => a - b);
    const roomMoves: string | null = rebuildMovesForRoom(
      level,
      pushes,
      allBoxes,
      player,
      ri,
      roomBoxes,
    );
    if (roomMoves === null) {
      return solveWhole() ?? moves;
    }
    moves += roomMoves.text;
    player = roomMoves.endPlayer;
    // Record this room's boxes at their new (goal) positions so later
    // rooms treat them as walls in the right places.
    for (const step of pushes) {
      const bx: number = step.box % level.w;
      const by: number = Math.floor(step.box / level.w);
      const landing: number = (by + DY[step.dir]) * level.w + (bx + DX[step.dir]);
      const at: number = roomBoxes[ri].indexOf(step.box);
      if (at !== -1) {
        roomBoxes[ri][at] = landing;
      }
    }
    roomBoxes[ri].sort((a, b) => a - b);
  }
  return moves;
}

// Rebuild move letters for a push sequence. `allBoxes` is the full board's
// box list at the start of the sequence; `roomBoxes` is updated in place
// for the room being solved. Returns the letters plus the final player
// square, or null when a walk is impossible.
function rebuildMovesForRoom(
  level: Level,
  pushes: PushStep[],
  allBoxes: number[],
  playerStart: number,
  roomIdx: number,
  roomBoxes: number[][],
): { text: string; endPlayer: number } | null {
  const n: number = level.w * level.h;
  const curBoxes: number[] = allBoxes.slice();
  let player: number = playerStart;
  let text = "";
  for (const step of pushes) {
    const bx: number = step.box % level.w;
    const by: number = Math.floor(step.box / level.w);
    const behind: number = (by - DY[step.dir]) * level.w + (bx - DX[step.dir]);
    const landing: number = (by + DY[step.dir]) * level.w + (bx + DX[step.dir]);
    const blocked: boolean[] = new Array<boolean>(n).fill(false);
    for (let i = 0; i < n; i++) {
      blocked[i] = !level.open[i];
    }
    for (const b of curBoxes) {
      blocked[b] = true;
    }
    const walk: string | null = walkPath(player, behind, blocked, level.w, level.h);
    if (walk === null) {
      return null;
    }
    text += walk;
    text += LETTER[step.dir];
    const at: number = curBoxes.indexOf(step.box);
    if (at === -1) {
      return null;
    }
    curBoxes[at] = landing;
    curBoxes.sort((a, b) => a - b);
    player = step.box;
  }
  return { text, endPlayer: player };
}

// Rebuild moves for a whole-level push sequence.
function rebuildMoves(level: Level, pushes: PushStep[], startBoxes: number[]): string | null {
  const n: number = level.w * level.h;
  const curBoxes: number[] = startBoxes.slice().sort((a, b) => a - b);
  let player: number = level.player;
  let text = "";
  for (const step of pushes) {
    const bx: number = step.box % level.w;
    const by: number = Math.floor(step.box / level.w);
    const behind: number = (by - DY[step.dir]) * level.w + (bx - DX[step.dir]);
    const landing: number = (by + DY[step.dir]) * level.w + (bx + DX[step.dir]);
    const blocked: boolean[] = new Array<boolean>(n).fill(false);
    for (let i = 0; i < n; i++) {
      blocked[i] = !level.open[i];
    }
    for (const b of curBoxes) {
      blocked[b] = true;
    }
    const walk: string | null = walkPath(player, behind, blocked, level.w, level.h);
    if (walk === null) {
      return null;
    }
    text += walk;
    text += LETTER[step.dir];
    const at: number = curBoxes.indexOf(step.box);
    if (at === -1) {
      return null;
    }
    curBoxes[at] = landing;
    curBoxes.sort((a, b) => a - b);
    player = step.box;
  }
  return text;
}

function main(): void {
  const inDir: string = process.env.MAKEFUN_INPUT_DIR || "/input";
  const outDir: string = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  let ids: string[] = [];
  try {
    ids = fs
      .readdirSync(inDir)
      .filter((d) => {
        try {
          return fs.statSync(path.join(inDir, d)).isDirectory();
        } catch {
          return false;
        }
      })
      .sort();
  } catch {
    ids = [];
  }
  for (const id of ids) {
    let moves = "";
    try {
      const text: string = fs.readFileSync(path.join(inDir, id, "level.txt"), "utf8");
      const level: Level = parseLevel(text);
      if (level.player >= 0 && level.boxes.length > 0) {
        moves = solveLevel(level);
      }
    } catch {
      moves = "";
    }
    const dir: string = path.join(outDir, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "solution.txt"), moves, "utf8");
  }
}

main();
