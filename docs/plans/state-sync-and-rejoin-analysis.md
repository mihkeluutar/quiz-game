## Quiz State Sync & Player Rejoin – Current Issues and Risks

This document analyzes the current implementation of quiz state synchronization and player identity/rejoin flows, based on the existing code. It does **not** propose final solutions, but it identifies concrete problems that need to be addressed before scaling further.

---

## 1. Polling-Based State Synchronization

### 1.1 How it works now

- **Hook**: `useQuizState`

```24:30:src/hooks/useQuizState.ts
useEffect(() => {
  fetchState();
  const interval = setInterval(fetchState, 3000); // Poll every 3s
  return () => clearInterval(interval);
}, [fetchState]);
```

- **Consumers**:
  - Host view: `HostDashboard` uses `useQuizState(code || '')`.
  - Player view: `PlayerGame` uses `useQuizState(code || '', token)`.

Every mounted consumer of `useQuizState` triggers:

\[
\text{requests} \approx \frac{\text{session length (s)}}{\text{interval (s)}} \times \text{number of screens}
\]

For a 1.5h (5400s) quiz and 3s interval:

\[
 \frac{5400}{3} = 1800 \text{ requests per screen}
\]

With:
- 1 host device on the dashboard,
- ~11 players on the game screen,

you already reach ~21,600 `getQuizState` calls, without counting:
- reconnections,
- multiple open tabs/devices,
- any other views that might use `useQuizState`.

Given your reported ~150k Supabase requests for a session, this polling is a major contributor.

### 1.2 Problems

- **Unbounded scaling with players**: Total requests grow linearly with the number of active devices, even when nothing in the game is changing.
- **Load independent of events**: Polling continues during:
  - long explanation segments,
  - host thinking time,
  - breaks,
  even though state is static.
- **Mobile power & network usage**: Phones on mobile data or weak Wi-Fi are continuously sending requests every 3s, which:
  - drains battery,
  - increases the likelihood of transient failures and partial state.
- **Latency under load**: When many devices poll at once, the backend may slow down, ironically **increasing perceived lag** at the exact moments when everyone is looking at the screen.

---

## 2. Player Identity & Rejoin Flow

### 2.1 Current join flow

- **Join screen**: `PlayerJoin`

```11:28:src/pages/player/Join.tsx
const navigate = useNavigate();
const [code, setCode] = useState('');
const [name, setName] = useState('');
...
let token = localStorage.getItem('player_token');
if (!token) {
  token = crypto.randomUUID();
  localStorage.setItem('player_token', token);
}
const trimmedName = name.trim();
...
const { quiz, participant, is_rejoined } = await api.joinQuiz(
  code.toUpperCase(),
  trimmedName,
  token
);
navigate(`/play/${quiz.code}`);
```

- **Server-side join**: `/quiz/join` in the Supabase Edge function
  - Normalizes names (trim + lowercase) to avoid duplicates.
  - Reuses existing participant **either by token or by normalized name**, and updates `player_token` when rejoining.

This part is robust and designed to support:
- reconnecting from a different device (same name),
- recovering from lost `player_token` (name-based match).

### 2.2 Current game entry (`/play/:code`)

- **Route**: `App.tsx`

```24:28:src/App.tsx
{/* Player Routes */}
<Route path="/join" element={<PlayerJoin />} />
<Route path="/play/:code" element={<PlayerGame />} />
```

- **PlayerGame** consumes quiz state using the **local** `player_token`:

```26:37:src/pages/player/Game.tsx
const { code } = useParams<{ code: string }>();
// We need the token from localStorage
const token = localStorage.getItem('player_token') || '';
const { state, loading, error } = useQuizState(code || '', token);
...
const { quiz, participants = [], ... } = state;
const me = participants?.find(p => p.player_token === token);

if (!me) return <div className="p-8">You are not part of this quiz. Please join again.</div>;
```

### 2.3 Problems & edge cases

1. **Direct deep-link without prior join**
   - Scenario:
     - Player scans a QR or receives a link like `/play/ABCD12`.
     - Browser has no `player_token` in `localStorage`.
   - `PlayerGame` calls `useQuizState` with `token = ''`.
   - Server returns full state, but `participants.find(p => p.player_token === '')` fails.
   - UI shows: “You are not part of this quiz. Please join again.”  
   - **Problem**: There is no automatic redirection back to `/join` with the code prefilled, so the user must manually:
     - realize they need to go back,
     - navigate to `/join`,
     - re-enter the code.

2. **Device change after joining**
   - Scenario:
     - Player joins on Device A, name “Alice”.
     - A participant row is created, with `player_token = tokenA`.
     - Later they open `/play/ABCD12` on Device B:
       - No `player_token` in Device B.
       - They bypass `/join` and open `/play/:code` directly.
   - `PlayerGame` again uses `token = ''`, finds no matching participant, and shows the “not part of this quiz” message.
   - **Note**: The server **does** support re-attaching by name in `/quiz/join`, but this path is never used when landing directly on `/play/:code`.

3. **Stale or mismatched `player_token`**
   - If a quiz is restarted or if participants are cleared, existing `player_token`s stored in localStorage can easily become invalid.
   - In that case:
     - `useQuizState` returns a quiz with participants that do not match the local token.
     - `me` is `undefined` and the user is stuck with the “not part of this quiz” message.
   - There is no mechanism to:
     - fall back to a “please confirm your name to rejoin” flow,
     - or to automatically send the user back through `/join`.

4. **No resilience to mobile sleep/refresh**
   - When a phone locks/sleeps and Safari/Chrome later discards the tab’s memory:
     - The player may re-open the tab at `/play/:code` with:
       - lost React state,
       - potentially lost `localStorage` (depending on browser policies / private mode).
   - Current behavior again leads to the hard “You are not part of this quiz” state, without a smooth recovery path.

---

## 3. Redundant / Excessive State Fetching Patterns

Beyond the basic 3s polling, some code paths lead to **additional bursts of requests**:

- **Host actions** (`HostDashboard`):

```138:147:src/pages/host/Dashboard.tsx
const handleAction = async (action: string, payload?: any) => {
  setActionLoading(true);
  try {
    await api.performAction(code!, action, payload);
    await refresh();
  } catch (err: any) {
    toast.error(err.message);
  } finally {
    setActionLoading(false);
  }
};
```

- Each host action (START_GAME, NEXT_QUESTION, etc.) triggers:
  - one `performAction` API call (server-side mutation),
  - followed by an immediate `refresh()` = another `getQuizState` call.
- Meanwhile, **all players** are polling independently and will also call `getQuizState` within ≤3 seconds of that same action.

### Problems

- **Spiky load on state changes**:
  - When the host hits “Next Question”, the backend immediately receives:
    - 1 state-mutating request (host),
    - 1 extra state read (host `refresh`),
    - plus **a wave of near-simultaneous polls from every player**.
  - This spike is overlaid on top of the constant baseline polling.

- **No backoff or error handling strategy**:
  - If the backend slows down or temporarily errors:
    - Clients continue polling at 3s regardless of failure rate.
    - There is no exponential backoff or “circuit breaker” to ease pressure on a struggling backend.

---

## 4. Server Behavior Assumptions & Privacy

The state endpoint on the Edge function currently has a very permissive behavior:

```271:283:src/supabase/functions/server/index.tsx
// Security / Privacy Filtering
// Host (no token usually, or specific host logic) - For this app, if no token provided, treat as host or public view? 
// We'll rely on the client to send the right token. If the user matches quiz.host_user_id (sent via auth header?), they are host.
// For simplicity here, we return most data but filter answers/guesses if needed.
// Actually, standard players shouldn't see others' questions in creation mode.

const isHost = true; // We'll trust the client logic for now or rely on specific endpoint for sensitive data
// Ideally we check: const isHost = user_id === quiz.host_user_id
```

### Problems

1. **Assuming host context (`isHost = true`) for all callers**
   - Every client, including players, can receive near-host-level data.
   - Although some filtering is applied in CREATION phase, the comment explicitly acknowledges this is not ideal.

2. **Increased payload size per poll**
   - Because the state returned is large (quiz, participants, blocks, questions, answers, guesses, currentBlock, currentQuestion), every 3s poll transfers:
     - full participants list,
     - full block and question structures,
     - all answers and guesses so far.
   - Combined with the high request frequency, this compounds network and processing cost.

While not the root cause of the 150k request count, these design choices amplify the impact of the polling strategy.

---

## 5. Summary of Key Risks

1. **Request Explosion Under Load**
   - Poll-every-3s for every device is the main driver of the observed ~150k requests for a 1.5h, 11-player quiz.
   - The more players you add (or the more devices players use), the worse this gets.

2. **Fragile Rejoin / Deep-Link Experience**
   - Direct `/play/:code` access without prior `/join` leads to a dead-end “You are not part of this quiz” message.
   - Device switches, mobile browser behavior, and quiz restarts can easily invalidate `player_token` and strand players.
   - The server already has strong name-based rejoin logic, but the direct `/play/:code` path never uses it.

3. **Spiky State Fetches Around Host Actions**
   - Host `performAction + refresh` calls cluster with player polls.
   - This can cause perceived lag exactly when state transitions are most visible (question changes, phase transitions).

4. **Over-Privileged and Heavy State Responses**
   - `isHost = true` by default for the state endpoint exposes more data than necessary to all clients.
   - Large payloads, combined with frequent polling, increase bandwidth and server CPU usage.

---

## 6. High-Level Directions for Future Improvement (Non-Binding)

The following are **not implemented** yet, but are natural next steps that directly address the issues above:

- **Event-driven player updates**:
  - Keep host as the “driver” of the game.
  - Use Supabase Realtime (or a similar channel) so that when the host advances the game, a single event notifies all players to refresh.
  - Replace 3s polling on players with “refresh-on-event + occasional safety poll”.

- **Robust rejoin flow for `/play/:code`**:
  - If a device at `/play/:code` has no valid `player_token` in the quiz:
    - Redirect to `/join?code=XYZ` with prefilled code.
  - Ensure that path always goes through the existing `/quiz/join` endpoint to leverage the name-based reattach logic.

- **Smarter host fetching**:
  - Optionally reduce host polling frequency or also move host to an event-driven model.
  - Debounce/limit `refresh()` calls after host actions if necessary.

- **State shape and privacy**:
  - Move away from `isHost = true` for all callers and return role-appropriate slices of quiz state.
  - This would reduce payload size and tighten privacy but is secondary to fixing the polling and rejoin issues.

These directions can be refined into a concrete implementation plan once you’re ready to make functional changes again.


