# Quiz Game Specifications

This document outlines the requirements and specifications for the quiz game application.

## Player Name Normalization

### Requirement
Player display names must be normalized to prevent duplicate entries caused by whitespace variations.

### Problem Statement
When a player joins a quiz, their display name should be treated consistently regardless of leading or trailing whitespace. For example, a player joining as "Kristo " (with trailing space) and later as "Kristo" (without space) should be recognized as the same player, not create duplicate entries.

### Implementation Details

#### Client-Side Normalization
- **Location**: `src/pages/player/Join.tsx`
- **Behavior**: 
  - All player names are trimmed (leading and trailing whitespace removed) before being sent to the API
  - Empty names (after trimming) are rejected with an error message
  - The trimmed name is used for all API calls

#### Server-Side Normalization
- **Location**: `src/supabase/functions/server/index.tsx` (join endpoint)
- **Behavior**:
  - Display names are trimmed when received from the client
  - Name comparisons for duplicate detection use normalized names (trimmed and lowercased)
  - This ensures case-insensitive and whitespace-insensitive matching
  - Empty names are rejected with a 400 error

#### Alternative Implementation
- **Location**: `src/src/pages/Player/JoinQuiz.tsx`
- **Behavior**:
  - Names are trimmed before database operations
  - Duplicate detection checks normalized names (case-insensitive, trimmed)
  - Re-joining players with the same normalized name update their token instead of creating duplicates

### Normalization Rules
1. **Trim**: Remove all leading and trailing whitespace characters
2. **Case-insensitive comparison**: When checking for existing players, names are compared in lowercase
3. **Storage**: The trimmed name is stored in the database (not the original with whitespace)
4. **Validation**: Empty names (after trimming) are not allowed

### Example Scenarios

| Input Name | Normalized Name | Result |
|------------|----------------|--------|
| "Kristo " | "Kristo" | Accepted |
| " Kristo" | "Kristo" | Accepted |
| "  Kristo  " | "Kristo" | Accepted |
| "Kristo" | "Kristo" | Accepted |
| "   " | "" | Rejected (empty) |
| "kristo" | "kristo" | Accepted (but matches "Kristo" for duplicate detection) |

### Benefits
- Prevents duplicate player entries
- Ensures consistent player identity across sessions
- Improves user experience by handling common input mistakes
- Maintains data integrity in the quiz participant list

## Question Adding Mechanics

### Requirement
The quiz system must support flexible question creation with configurable limits, question management (add/remove/reorder), option management (add/remove/reorder), and host-created question blocks.

### Problem Statement
Currently, the quiz system uses a fixed number of questions per player. This limits flexibility and doesn't allow for:
- Variable question counts per player (some may want to add more or fewer questions)
- Dynamic question management during the planning phase
- Option reordering and removal
- Host-created question blocks that appear before player questions
- Optional author guessing mechanics

### Implementation Details

#### Quiz Creation Settings
- **Location**: `src/pages/host/Create.tsx` and `src/src/pages/Host/HostHome.tsx`
- **Behavior**:
  - Replace fixed "Questions per Player" input with flexible question settings
  - Add three fields:
    - **Suggested Questions**: A recommended number of questions (default: 3)
    - **Minimum Questions**: Minimum required questions per player (default: 1)
    - **Maximum Questions**: Maximum allowed questions per player (default: 10)
  - Add checkbox: **"Enable Author Guessing"** (default: checked)
    - When enabled: Players guess who created each question block during gameplay
    - When disabled: Author guessing phase is skipped entirely
  - Validation: Minimum ≤ Suggested ≤ Maximum

#### Host Question Blocks
- **Location**: `src/pages/host/Dashboard.tsx` (during CREATION phase)
- **Behavior**:
  - Host can create multiple question blocks before players join
  - Each host block has:
    - A title (e.g., "Round 1: General Knowledge")
    - One or more questions (same structure as player questions)
    - Author set to "host" (not a participant ID)
  - Host blocks appear first in the quiz order
  - Host can add, edit, remove, and reorder their blocks during CREATION phase
  - Host blocks are locked when quiz status changes from CREATION to STARTED

#### Player Question Management
- **Location**: `src/pages/player/Game.tsx` (PlayerCreation component)
- **Behavior**:
  - Initial state: Player starts with "Suggested Questions" number of empty question slots
  - **"Add Another Question"** button:
    - Visible when current question count < Maximum Questions
    - Adds a new empty question slot
    - Disabled when Maximum Questions is reached
  - **Remove Question** button:
    - Available on each question (except when at Minimum Questions)
    - Removes the question from the list
    - Re-indexes remaining questions
  - **Reorder Questions**:
    - Drag-and-drop or up/down arrow buttons
    - Updates `index_in_block` for all affected questions
    - Persists order when saving
  - Validation:
    - Player must have at least Minimum Questions before saving
    - Player cannot exceed Maximum Questions
    - Empty questions (no text) are not counted toward minimum

#### Question Option Management
- **Location**: `src/pages/player/Game.tsx` (PlayerCreation component, within question cards)
- **Behavior**:
  - **Remove Option** button:
    - Available on each option (except when only 2 options remain for MCQ questions)
    - Removes the option from the question
    - Updates question state immediately
  - **Reorder Options**:
    - Drag-and-drop or up/down arrow buttons within the options list
    - Updates option order in the question
    - Persists order when saving
  - **Add Option** button:
    - Available for MCQ questions
    - Adds a new empty option field
    - No maximum limit (but UI should prevent excessive options)

#### Server-Side Handling
- **Location**: `src/supabase/functions/server/index.tsx`
- **Behavior**:
  - Quiz creation endpoint accepts:
    - `min_questions_per_player`: integer
    - `max_questions_per_player`: integer
    - `suggested_questions_per_player`: integer
    - `enable_author_guessing`: boolean
  - Block creation endpoint:
    - Accepts `author_type`: "host" | "player"
    - For host blocks: `author_participant_id` is null or special "host" identifier
    - For player blocks: `author_participant_id` is the participant ID
  - Question saving endpoint:
    - Validates question count is within min/max bounds
    - Preserves question order via `index_in_block`
    - Preserves option order within each question

#### Author Guessing Mechanics
- **Location**: `src/pages/host/Dashboard.tsx` and `src/pages/player/Game.tsx`
- **Behavior**:
  - When `enable_author_guessing` is true:
    - After each block's questions, show "Guess the Author" phase
    - Players select which participant created the block
    - Host reveals the correct author
    - Points are awarded for correct guesses
  - When `enable_author_guessing` is false:
    - Skip AUTHOR_GUESS and AUTHOR_REVEAL phases entirely
    - Move directly from last question to next block or grading

### Data Model Changes

#### Quiz Schema
```typescript
{
  min_questions_per_player: number;      // Minimum required
  max_questions_per_player: number;      // Maximum allowed
  suggested_questions_per_player: number; // Recommended/default
  enable_author_guessing: boolean;       // Toggle for author guessing
}
```

#### Block Schema
```typescript
{
  author_type: "host" | "player";       // Type of author
  author_participant_id: string | null;  // null for host blocks
  // ... existing fields
}
```

### User Interface Flow

#### Host Quiz Creation
1. Host enters quiz name
2. Host sets question limits (min, suggested, max)
3. Host checks/unchecks "Enable Author Guessing"
4. Host creates quiz
5. Host can add question blocks (optional)
6. Host starts quiz when ready

#### Player Question Creation
1. Player joins quiz
2. Player sees suggested number of question slots
3. Player fills in questions
4. Player can:
   - Add more questions (up to max)
   - Remove questions (down to min)
   - Reorder questions
   - Add/remove/reorder options within questions
5. Player saves when ready (validates min requirement)

### Example Scenarios

| Scenario | Min | Suggested | Max | Player Action | Result |
|----------|-----|-----------|-----|---------------|--------|
| Default | 1 | 3 | 10 | Player adds 2 questions | 5 questions total (valid) |
| Minimum | 2 | 3 | 10 | Player tries to remove to 1 | Blocked (below minimum) |
| Maximum | 1 | 3 | 5 | Player tries to add 6th | Blocked (above maximum) |
| Host Block | - | - | - | Host creates block | Appears first, author="host" |
| No Guessing | - | - | - | Author guessing disabled | Skips guess phases |

### Benefits
- Provides flexibility for players with varying question creation preferences
- Allows hosts to add introductory or themed question blocks
- Improves question organization through reordering capabilities
- Gives hosts control over quiz mechanics (author guessing)
- Maintains data integrity through validation rules
- Enhances user experience with intuitive question management

