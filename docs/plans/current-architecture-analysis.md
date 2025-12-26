# Current Architecture Analysis

This document describes the current data storage architecture, API design, and identifies the problems that need to be addressed. This serves as a baseline understanding before migrating to the recommended relational structure.

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
      options?: string[];        // For MCQ (stored as JSONB array)
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

**Issue:** Some entities reference `quiz.id` (UUID), others reference `quiz.code` (string). Additionally, join codes are conflated with quiz identity.

**Examples:**
- `Participant.quiz_id` → `quiz.id` (UUID)
- `Answer.quiz_id` → `quiz.code` (string) ❌
- `BlockGuess.quiz_id` → `quiz.code` (string) ❌
- Join codes used as primary identifier in API endpoints ❌

**Impact:**
- Confusion about which identifier to use
- Potential bugs when querying
- No way to enforce referential integrity
- Join codes cannot expire or be revoked (they're the identity)
- Cannot replay quizzes (code is tied to single instance)

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

### 3.8 JSONB Storage Issues

**Issue:** All data is stored as JSONB, including:
- MCQ options as JSONB arrays (`questions.options`)
- No way to query individual options
- No referential integrity for options
- Difficult to support multi-correct MCQ

**Impact:**
- Cannot efficiently query or filter options
- No way to enforce correctness constraints
- Limited flexibility for future features

---

## Summary

The current architecture uses a single KV table with JSONB values, leading to:

- **6 separate KV reads** per state fetch
- **No referential integrity** or foreign key constraints
- **Race conditions** from non-transactional writes
- **Inefficient queries** requiring full data loads
- **No audit trail** or history tracking
- **Join codes as identity** preventing expiry/revocation
- **No replay capability** without overwriting history
- **JSONB arrays** for MCQ options limiting queryability

These issues limit scalability, data integrity, and feature development. See `database-and-backend-spec.md` for the recommended relational architecture that addresses all these problems.

