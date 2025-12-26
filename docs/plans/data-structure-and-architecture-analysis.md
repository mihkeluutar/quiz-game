# Data Structure & Architecture Analysis

This document maps out the current data storage architecture, how quiz entities (questions, blocks, participants, etc.) are organized, and identifies structural improvements needed to support event-driven updates, better scalability, and proper relational integrity.

---

## 1. Current Storage Architecture

### 1.1 Supabase Table Structure

**Single Table: `kv_store_cbaebbc3`**

```sql
CREATE TABLE kv_store_cbaebbc3 (
  key TEXT NOT NULL PRIMARY KEY,
  value JSONB NOT NULL
);
```

This is a **key-value store** pattern, not a relational database. All quiz data is stored as JSONB values under string keys.

### 1.2 Key Naming Patterns

The server uses a flat key namespace with colon-separated prefixes:

```typescript
// From src/supabase/functions/server/index.tsx
const getQuizKey = (code: string) => `quiz:${code}`;
const getParticipantsKey = (code: string) => `quiz:${code}:participants`;
const getBlocksKey = (code: string) => `quiz:${code}:blocks`;
const getQuestionsKey = (code: string) => `quiz:${code}:questions`;
const getAnswersKey = (code: string) => `quiz:${code}:answers`;
const getGuessesKey = (code: string) => `quiz:${code}:guesses`;
```

**Examples:**
- `quiz:ABCD12` → Quiz object
- `quiz:ABCD12:participants` → Array of Participant objects
- `quiz:ABCD12:blocks` → Array of Block objects
- `quiz:ABCD12:questions` → Object mapping `{ block_id: Question[] }`
- `quiz:ABCD12:answers` → Array of Answer objects
- `quiz:ABCD12:guesses` → Array of BlockGuess objects

### 1.3 Data Structure Per Entity

#### Quiz Object (`quiz:{code}`)
```typescript
{
  id: string;                    // UUID
  code: string;                  // 6-char code (e.g., "ABCD12")
  name: string;                  // Quiz name
  host_user_id: string;          // Host identifier
  status: "CREATION" | "PLAY" | "FINISHED";
  max_questions_per_player: number;
  min_questions_per_player?: number;
  suggested_questions_per_player?: number;
  enable_author_guessing?: boolean;
  current_block_id?: string;     // Current block in play
  current_question_id?: string;   // Current question in play
  phase?: "QUESTION" | "AUTHOR_GUESS" | "AUTHOR_REVEAL" | "GRADING";
  created_at: string;           // ISO timestamp
}
```

#### Participants Array (`quiz:{code}:participants`)
```typescript
Participant[] = [
  {
    id: string;                  // UUID
    quiz_id: string;             // References quiz.id
    user_id?: string;             // Optional Supabase user ID
    display_name: string;         // Player name (normalized)
    player_token: string;        // Device token for rejoin
    score?: number;              // Calculated field
  },
  // ...
]
```

#### Blocks Array (`quiz:{code}:blocks`)
```typescript
Block[] = [
  {
    id: string;                  // UUID
    quiz_id: string;             // References quiz.id
    author_type?: "host" | "player";
    author_participant_id?: string | null;  // null for host blocks
    title: string;
    order_index?: number;        // For ordering (host blocks: -1, player: 0+)
    is_locked: boolean;
  },
  // ...
]
```

#### Questions Map (`quiz:{code}:questions`)
```typescript
{
  [block_id: string]: Question[] = [
    {
      id: string;                // UUID
      block_id: string;          // References block.id
      index_in_block: number;    // Order within block
      text: string;
      type: "open" | "mcq";
      options?: string[];        // For MCQ
      correct_answer: string;    // Text or option value
      image_url?: string;        // Supabase Storage URL
    },
    // ...
  ]
}
```

**Note:** Questions are stored as a **nested map** (object) where keys are `block_id` and values are arrays. This requires:
- Loading the entire map to find questions for a single block
- Manual synchronization when blocks are deleted
- No direct foreign key constraints

#### Answers Array (`quiz:{code}:answers`)
```typescript
Answer[] = [
  {
    id: string;                  // UUID
    quiz_id: string;             // References quiz.code (not id!)
    question_id: string;          // References question.id
    participant_id: string;       // References participant.id
    answer_text: string;
    is_correct?: boolean;         // null for open questions until graded
  },
  // ...
]
```

#### Guesses Array (`quiz:{code}:guesses`)
```typescript
BlockGuess[] = [
  {
    id: string;                  // UUID
    quiz_id: string;             // References quiz.code (not id!)
    block_id: string;             // References block.id
    guesser_participant_id: string;  // Who made the guess
    guessed_participant_id: string;  // Who they guessed
    is_correct?: boolean;
  },
  // ...
]
```

---

## 2. Current API & Data Flow

### 2.1 API Endpoints (Edge Function)

All endpoints are under `/make-server-cbaebbc3/quiz/*`:

| Endpoint | Method | Purpose | Reads/Writes |
|----------|--------|---------|--------------|
| `/quiz/create` | POST | Create quiz | Writes: `quiz:{code}`, initializes 5 keys |
| `/quiz/host/:host_id` | GET | List host's quizzes | Reads: `quiz:*` (prefix scan) |
| `/quiz/join` | POST | Join quiz as player | Reads: `quiz:{code}`, `quiz:{code}:participants`<br>Writes: `quiz:{code}:participants` |
| `/quiz/:code` | GET | Get full quiz state | Reads: 6 keys (quiz, participants, blocks, questions, answers, guesses) |
| `/quiz/:code/block` | POST | Save block (host/player) | Reads: `quiz:{code}`, `quiz:{code}:blocks`, `quiz:{code}:questions`<br>Writes: `quiz:{code}:blocks`, `quiz:{code}:questions` |
| `/quiz/:code/action` | POST | Host actions (START_GAME, etc.) | Reads: `quiz:{code}`, `quiz:{code}:blocks`, `quiz:{code}:questions`<br>Writes: `quiz:{code}` |
| `/quiz/:code/answer` | POST | Submit answer | Reads: `quiz:{code}:answers`, `quiz:{code}:questions`<br>Writes: `quiz:{code}:answers` |
| `/quiz/:code/guess` | POST | Submit author guess | Reads: `quiz:{code}:guesses`, `quiz:{code}:blocks`<br>Writes: `quiz:{code}:guesses` |
| `/quiz/:code/grade` | POST | Grade open answer | Reads: `quiz:{code}:answers`<br>Writes: `quiz:{code}:answers` |
| `/upload` | POST | Upload image | Writes: Supabase Storage bucket |

### 2.2 State Fetching Pattern

**Hook: `useQuizState`** (`src/hooks/useQuizState.ts`)

```typescript
export function useQuizState(code: string, token?: string) {
  // Polls GET /quiz/:code every 3 seconds
  // Returns full QuizState object
}
```

**QuizState Payload** (`src/types/quiz.ts`):
```typescript
{
  quiz: Quiz;
  participants: Participant[];
  blocks: Block[];
  questions: Record<string, Question[]>;  // block_id -> questions
  answers: Answer[];
  guesses: BlockGuess[];
  currentBlock?: Block;
  currentQuestion?: Question;
}
```

**Every poll fetches:**
- Entire quiz object
- Entire participants array
- Entire blocks array
- Entire questions map (all blocks)
- Entire answers array (all answers so far)
- Entire guesses array (all guesses so far)
- Computed `currentBlock` and `currentQuestion`

**Payload size grows linearly with:**
- Number of participants
- Number of blocks
- Number of questions
- Number of answers submitted
- Number of guesses made

For a 1.5h quiz with 11 players, 33 questions, this can easily be **50-200KB per request**, multiplied by thousands of requests.

### 2.3 Client-Side API Layer

**File: `src/utils/api.ts`**

All API calls go through a single `fetchAPI` helper that:
- Uses Supabase public anon key for auth
- Optionally sends `X-Player-Token` header
- Calls Edge Function endpoints

**Key functions:**
- `api.getQuizState(code, token?)` → Full state fetch
- `api.performAction(code, action, payload?)` → Host actions
- `api.submitAnswer(...)`, `api.submitGuess(...)`, etc. → Player actions

---

## 3. Problems with Current Architecture

### 3.1 No Relational Integrity

**Issue:** The KV store has no foreign key constraints or referential integrity.

**Examples:**
- `Answer.quiz_id` can reference a non-existent quiz
- `Question.block_id` can reference a deleted block
- `Block.author_participant_id` can reference a deleted participant
- Orphaned data accumulates (e.g., answers for deleted questions)

**Impact:**
- Data corruption risks
- Manual cleanup required
- No cascade deletes
- Difficult to validate data consistency

### 3.2 Inefficient Queries

**Issue:** Every state fetch requires **6 separate KV reads**:

```typescript
const quiz = await kv.get(getQuizKey(code));
const participants = await kv.get(getParticipantsKey(code));
const blocks = await kv.get(getBlocksKey(code));
const questionsMap = await kv.get(getQuestionsKey(code));
const answers = await kv.get(getAnswersKey(code));
const guesses = await kv.get(getGuessesKey(code));
```

**Problems:**
- 6 round-trips to database per poll
- No way to fetch partial state (e.g., "just answers for question X")
- Can't use SQL joins or indexes
- `getByPrefix` for listing quizzes is inefficient (scans all `quiz:*` keys)

### 3.3 Denormalized Questions Structure

**Issue:** Questions are stored as a nested map `{ block_id: Question[] }` instead of a flat array.

**Problems:**
- Must load entire map to find questions for one block
- No direct query: "get question by ID"
- Manual synchronization when blocks are deleted
- Difficult to enforce `index_in_block` uniqueness per block

**Better structure would be:**
- Flat array of questions with `block_id` foreign key
- Query: `SELECT * FROM questions WHERE block_id = ? ORDER BY index_in_block`

### 3.4 Inconsistent ID References

**Issue:** Some entities reference `quiz.id` (UUID), others reference `quiz.code` (string).

**Examples:**
- `Participant.quiz_id` → `quiz.id` (UUID)
- `Answer.quiz_id` → `quiz.code` (string) ❌
- `BlockGuess.quiz_id` → `quiz.code` (string) ❌

**Impact:**
- Confusion about which identifier to use
- Potential bugs when querying
- No way to enforce referential integrity

### 3.5 No Indexing or Filtering

**Issue:** KV store has no indexes, so filtering/querying requires:
- Loading entire arrays/maps
- Filtering in application code
- No way to efficiently query: "answers for question X" or "blocks by author"

**Example from code:**
```typescript
// Must load ALL answers, then filter in memory
const answers = (await kv.get(getAnswersKey(code))) || [];
const questionAnswers = answers.filter(a => a.question_id === currentQuestion.id);
```

**Impact:**
- Wastes memory and bandwidth
- Slow for large datasets
- Can't scale beyond small quizzes

### 3.6 Atomicity & Race Conditions

**Issue:** KV operations are not transactional. Multiple concurrent writes can cause:
- Lost updates (last write wins)
- Partial state (some keys updated, others not)
- Race conditions when multiple players submit answers simultaneously

**Example:**
```typescript
// Two players submit answers at the same time
// Both read answers array, both append, both write
// Result: one answer is lost
const answers = await kv.get(getAnswersKey(code));
answers.push(newAnswer);
await kv.set(getAnswersKey(code), answers);
```

**Impact:**
- Data loss risk
- Requires careful locking (not implemented)
- Difficult to debug

### 3.7 No Audit Trail or History

**Issue:** KV store only holds current state. No way to:
- See when an answer was submitted
- Track state changes over time
- Debug "what happened at timestamp X?"
- Recover from accidental deletions

**Impact:**
- Limited debugging capabilities
- No analytics on player behavior
- Can't replay game state

---

## 4. Recommended Relational Structure

### 4.1 Proposed Supabase Tables

```sql
-- Core quiz table
CREATE TABLE quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,  -- 6-char code
  name TEXT NOT NULL,
  host_user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('CREATION', 'PLAY', 'FINISHED')),
  phase TEXT CHECK (phase IN ('QUESTION', 'AUTHOR_GUESS', 'AUTHOR_REVEAL', 'GRADING')),
  max_questions_per_player INTEGER NOT NULL,
  min_questions_per_player INTEGER,
  suggested_questions_per_player INTEGER,
  enable_author_guessing BOOLEAN DEFAULT true,
  current_block_id UUID REFERENCES blocks(id),
  current_question_id UUID REFERENCES questions(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quizzes_code ON quizzes(code);
CREATE INDEX idx_quizzes_host ON quizzes(host_user_id);

-- Participants
CREATE TABLE participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  user_id TEXT,  -- Optional Supabase auth user ID
  display_name TEXT NOT NULL,
  player_token TEXT NOT NULL,  -- Device token for rejoin
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(quiz_id, player_token),
  UNIQUE(quiz_id, LOWER(TRIM(display_name)))  -- Prevent duplicate names
);

CREATE INDEX idx_participants_quiz ON participants(quiz_id);
CREATE INDEX idx_participants_token ON participants(player_token);

-- Blocks
CREATE TABLE blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL CHECK (author_type IN ('host', 'player')),
  author_participant_id UUID REFERENCES participants(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  is_locked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_blocks_quiz ON blocks(quiz_id);
CREATE INDEX idx_blocks_author ON blocks(author_participant_id);
CREATE INDEX idx_blocks_order ON blocks(quiz_id, order_index);

-- Questions (flat structure)
CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  index_in_block INTEGER NOT NULL,
  text TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('open', 'mcq')),
  options JSONB,  -- Array of strings for MCQ
  correct_answer TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(block_id, index_in_block)  -- Prevent duplicate indices
);

CREATE INDEX idx_questions_block ON questions(block_id);
CREATE INDEX idx_questions_block_order ON questions(block_id, index_in_block);

-- Answers
CREATE TABLE answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  answer_text TEXT NOT NULL,
  is_correct BOOLEAN,  -- null until graded for open questions
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(question_id, participant_id)  -- One answer per question per player
);

CREATE INDEX idx_answers_quiz ON answers(quiz_id);
CREATE INDEX idx_answers_question ON answers(question_id);
CREATE INDEX idx_answers_participant ON answers(participant_id);

-- Author guesses
CREATE TABLE block_guesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  block_id UUID NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  guesser_participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  guessed_participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  is_correct BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(block_id, guesser_participant_id)  -- One guess per block per player
);

CREATE INDEX idx_guesses_quiz ON block_guesses(quiz_id);
CREATE INDEX idx_guesses_block ON block_guesses(block_id);
CREATE INDEX idx_guesses_guesser ON block_guesses(guesser_participant_id);
```

### 4.2 Benefits of Relational Structure

1. **Foreign Key Constraints**
   - Automatic cascade deletes
   - Prevents orphaned data
   - Database enforces referential integrity

2. **Indexes**
   - Fast queries: "answers for question X"
   - Efficient joins
   - Scales to large datasets

3. **Atomic Transactions**
   - Multiple writes in one transaction
   - Prevents race conditions
   - ACID guarantees

4. **Partial Queries**
   - Can fetch only needed data
   - Reduces payload size
   - Faster response times

5. **Audit Trail**
   - `created_at` / `updated_at` timestamps
   - Can add triggers for change logging
   - Enables analytics

6. **Type Safety**
   - CHECK constraints enforce valid values
   - UNIQUE constraints prevent duplicates
   - Database validates data

---

## 5. Required Code Changes

### 5.1 Server-Side (Edge Function)

**Current:** `src/supabase/functions/server/index.tsx` uses KV store helpers.

**Needed Changes:**
1. Replace `kv.get()` / `kv.set()` with Supabase client queries
2. Use transactions for multi-step operations
3. Add proper error handling for constraint violations
4. Implement partial state queries (e.g., "just answers for question X")

**Example Migration:**
```typescript
// OLD (KV)
const quiz = await kv.get(getQuizKey(code));
const participants = await kv.get(getParticipantsKey(code));

// NEW (Relational)
const { data: quiz } = await supabase
  .from('quizzes')
  .select('*')
  .eq('code', code)
  .single();

const { data: participants } = await supabase
  .from('participants')
  .select('*')
  .eq('quiz_id', quiz.id);
```

### 5.2 Client-Side API Layer

**Current:** `src/utils/api.ts` calls Edge Function endpoints.

**Potential Changes:**
1. Could add direct Supabase client queries for read-only operations (bypass Edge Function)
2. Keep Edge Function for mutations (to enforce business logic)
3. Or keep all operations through Edge Function for consistency

**Decision needed:** Should clients query Supabase directly, or always go through Edge Function?

### 5.3 Hooks

**Current:** `useQuizState` polls full state every 3s.

**Needed Changes:**
1. Support partial state queries (e.g., "just current question + answers")
2. Add event-driven updates (Supabase Realtime subscriptions)
3. Implement optimistic updates for better UX

**Example:**
```typescript
// Subscribe to quiz changes
useEffect(() => {
  const channel = supabase
    .channel(`quiz:${code}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'quizzes',
      filter: `code=eq.${code}`
    }, () => {
      refresh();
    })
    .subscribe();
  
  return () => {
    supabase.removeChannel(channel);
  };
}, [code]);
```

### 5.4 Type Definitions

**Current:** `src/types/quiz.ts` defines TypeScript types.

**Needed Changes:**
1. Ensure types match new database schema
2. Add nullable fields where appropriate
3. Update utility functions for fallback values

**Note:** Types are already well-structured and mostly compatible.

---

## 6. Migration Strategy

### 6.1 Data Migration

**Challenge:** Existing quizzes in KV store need to be migrated to relational tables.

**Options:**

1. **One-time migration script**
   - Read all `quiz:*` keys from KV store
   - Transform to relational structure
   - Insert into new tables
   - Mark migrated quizzes

2. **Dual-write period**
   - Write to both KV and relational during transition
   - Read from relational (new quizzes) or KV (old quizzes)
   - Gradually migrate old quizzes

3. **Fresh start**
   - Don't migrate old data
   - Only new quizzes use relational structure
   - Old quizzes remain in KV (read-only)

**Decision needed:** Which migration strategy?

### 6.2 Backward Compatibility

**Challenge:** Existing clients expect KV-based API responses.

**Options:**

1. **Keep Edge Function API unchanged**
   - Edge Function reads from relational DB
   - Returns same JSON structure
   - Clients don't need changes

2. **Version API endpoints**
   - `/v1/quiz/:code` (old KV-based)
   - `/v2/quiz/:code` (new relational)
   - Migrate clients gradually

**Recommendation:** Option 1 (keep API shape, change backend)

**Reality** The application is small and low traffic; all clients can migrate on a small notice, no persistent connections exist, as quizzes take a few hours.

---

## 7. Open Questions & Decisions Needed

### 7.1 Storage Strategy

**Question 1:** Should we migrate from KV store to relational tables?

**Options:**
- **a) Yes, full migration** - Better long-term, more work upfront
- **b) Hybrid approach** - New quizzes in relational, old in KV
- **c) Keep KV, optimize** - Add indexes/caching, keep current structure

**Recommendation:** Option a) for scalability and data integrity.

---

### 7.2 API Architecture

**Question 2:** Should clients query Supabase directly or always go through Edge Function?

**Options:**
- **a) Direct Supabase queries** - Faster, less server load, but bypasses business logic
- **b) Always through Edge Function** - Consistent, enforces rules, but adds latency
- **c) Hybrid** - Reads direct, writes through Edge Function

**Recommendation:** Option c) for best performance + security balance.

---

### 7.3 State Fetching Strategy

**Question 3:** How should clients fetch quiz state?

**Options:**
- **a) Full state every time** - Simple, but wasteful
- **b) Partial state queries** - Efficient, but more complex
- **c) Event-driven + partial** - Best UX, most complex

**Recommendation:** Option c) with Supabase Realtime subscriptions.

---

### 7.4 Player Identity

**Question 4:** How should player tokens be managed?

**Current:** `player_token` in localStorage, matched on server.

**Options:**
- **a) Keep current approach** - Simple, but fragile
- **b) Use Supabase Auth** - More robust, but requires sign-up
- **c) Hybrid** - Anonymous tokens + optional auth

**Recommendation:** Option c) for flexibility.

---

### 7.5 Image Storage

**Question 5:** Current image uploads go to Supabase Storage. Keep this?

**Current:** `/upload` endpoint uploads to `make-cbaebbc3-quiz-images` bucket.

**Options:**
- **a) Keep Supabase Storage** - Already working
- **b) Move to CDN** - Better performance, more cost
- **c) Inline base64** - Simple, but bloats database

**Recommendation:** Option a) unless performance issues arise.

---

## 8. Implementation Priority

### Phase 1: Critical Fixes (Address 150k requests)
1. ✅ **Event-driven updates** - Replace polling with Supabase Realtime
2. ✅ **Rejoin flow** - Fix `/play/:code` deep-link handling
3. ⚠️ **Partial state queries** - Only fetch needed data

### Phase 2: Data Structure (Long-term scalability)
1. ⚠️ **Migrate to relational tables** - Replace KV store
2. ⚠️ **Add indexes** - Optimize queries
3. ⚠️ **Implement transactions** - Prevent race conditions

### Phase 3: Polish (UX & Performance)
1. ⚠️ **Optimistic updates** - Better perceived performance
2. ⚠️ **Caching strategy** - Reduce redundant queries
3. ⚠️ **Analytics** - Track player behavior

---

## 9. Summary

### Current State
- **Storage:** Single KV table with JSONB values
- **Queries:** 6 separate KV reads per state fetch
- **Polling:** Every 3s from every device
- **Structure:** Denormalized, no referential integrity
- **Scalability:** Limited by KV store constraints

### Recommended Direction
- **Storage:** Relational tables with foreign keys
- **Queries:** SQL with indexes, partial fetches
- **Updates:** Event-driven (Supabase Realtime) + safety polls
- **Structure:** Normalized, ACID transactions
- **Scalability:** Can handle large quizzes efficiently

### Key Decisions Needed
1. Migrate KV → Relational? (Recommended: Yes)
2. Client queries direct or via Edge Function? (Recommended: Hybrid)
3. Full or partial state queries? (Recommended: Partial + events)
4. Migration strategy? (Recommended: Dual-write period)

---

**Next Steps:**
1. Review this analysis
2. Answer open questions (Section 7)
3. Create detailed migration plan
4. Implement Phase 1 fixes (event-driven updates)
5. Plan Phase 2 migration (relational structure)

