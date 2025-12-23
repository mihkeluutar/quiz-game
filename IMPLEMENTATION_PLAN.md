# Implementation Plan: Flexible Question Mechanics

This document outlines a step-by-step implementation plan for the flexible question mechanics described in `SPECS.md`. Each step is designed to be independently testable to catch bugs early.

## Overview

The implementation is broken down into 8 incremental steps:
1. Update TypeScript types
2. Update server-side quiz creation
3. Update client-side quiz creation UI
4. Update player question creation UI (add/remove questions)
5. Add question reordering
6. Add option management (remove/reorder)
7. Add host question blocks
8. Add author guessing toggle logic

---

## Step 1: Update TypeScript Types

**Goal**: Extend the Quiz and Block types to support new fields.

**Files to Modify**:
- `src/types/quiz.ts`

**Changes**:
1. Update `Quiz` type to include:
   - `min_questions_per_player: number`
   - `suggested_questions_per_player: number`
   - `enable_author_guessing: boolean`
   - Keep `max_questions_per_player` (already exists)

2. Update `Block` type to include:
   - `author_type?: "host" | "player"` (optional for backward compatibility)
   - Make `author_participant_id` optional: `author_participant_id?: string | null`

**Testing Checklist**:
- [ ] TypeScript compiles without errors
- [ ] No type errors in existing files (may need to add default values temporarily)
- [ ] Run `npm run build` to verify no type issues

**Notes**:
- Use optional fields initially to maintain backward compatibility
- Default values will be handled in Step 2

---

## Step 2: Update Server-Side Quiz Creation

**Goal**: Update the server endpoint to accept and store new quiz parameters.

**Files to Modify**:
- `src/supabase/functions/server/index.tsx` (quiz creation endpoint)

**Changes**:
1. Update `/quiz/create` endpoint to accept:
   - `min_questions_per_player` (default: 1)
   - `max_questions_per_player` (default: 10)
   - `suggested_questions_per_player` (default: 3)
   - `enable_author_guessing` (default: true)

2. Add validation:
   - `min_questions_per_player >= 1`
   - `suggested_questions_per_player >= min_questions_per_player`
   - `max_questions_per_player >= suggested_questions_per_player`

3. Store all fields in the quiz object

4. For backward compatibility: If old `max_questions` is provided, set:
   - `max_questions_per_player = max_questions`
   - `suggested_questions_per_player = max_questions`
   - `min_questions_per_player = 1`
   - `enable_author_guessing = true`

**Testing Checklist**:
- [ ] Create quiz with new parameters via API directly (use curl/Postman)
- [ ] Verify quiz object contains all new fields
- [ ] Test validation: try invalid combinations (min > max, etc.)
- [ ] Test backward compatibility: create quiz with old `max_questions` parameter
- [ ] Check that existing quizzes still work (if any in test data)

**Test Command** (example):
```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/make-server-cbaebbc3/quiz/create \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Quiz",
    "host_id": "test-host-id",
    "min_questions_per_player": 1,
    "suggested_questions_per_player": 3,
    "max_questions_per_player": 10,
    "enable_author_guessing": true
  }'
```

---

## Step 3: Update Client-Side Quiz Creation UI

**Goal**: Replace fixed question input with flexible min/suggested/max inputs and author guessing checkbox.

**Files to Modify**:
- `src/pages/host/Create.tsx`
- `src/utils/api.ts` (update `createQuiz` function)

**Changes**:
1. In `Create.tsx`:
   - Replace single `maxQuestions` state with:
     - `minQuestions` (default: 1)
     - `suggestedQuestions` (default: 3)
     - `maxQuestions` (default: 10)
     - `enableAuthorGuessing` (default: true)
   
   - Update form UI:
     - Add three number inputs for min/suggested/max
     - Add checkbox for "Enable Author Guessing"
     - Add validation: min ≤ suggested ≤ max
     - Show error messages for invalid combinations

2. In `api.ts`:
   - Update `createQuiz` function signature to accept new parameters
   - Send all parameters to server

**Testing Checklist**:
- [ ] UI displays all three question inputs and checkbox
- [ ] Default values are correct (1, 3, 10, checked)
- [ ] Validation prevents min > suggested > max
- [ ] Error messages appear for invalid inputs
- [ ] Quiz creation succeeds with new parameters
- [ ] Navigate to dashboard and verify quiz was created correctly
- [ ] Check browser console for errors

**Manual Test Steps**:
1. Open quiz creation page
2. Enter quiz name
3. Set min=2, suggested=5, max=8
4. Uncheck "Enable Author Guessing"
5. Create quiz
6. Verify dashboard shows the quiz
7. Check network tab to see API call includes all new fields

---

## Step 4: Update Player Question Creation UI - Add/Remove Questions

**Goal**: Allow players to add and remove questions dynamically (within min/max bounds).

**Files to Modify**:
- `src/pages/player/Game.tsx` (PlayerCreation component)

**Changes**:
1. Update initial state:
   - Use `quiz.suggested_questions_per_player` instead of `maxQuestions`
   - Initialize with suggested number of empty questions

2. Add "Add Another Question" button:
   - Visible when `questions.length < quiz.max_questions_per_player`
   - Adds new empty question to array
   - Disabled when at maximum

3. Add "Remove Question" button on each question:
   - Visible when `questions.length > quiz.min_questions_per_player`
   - Removes question from array
   - Re-indexes remaining questions

4. Update validation:
   - Before saving, check `questions.length >= quiz.min_questions_per_player`
   - Show error if below minimum
   - Count only questions with non-empty text toward minimum

**Testing Checklist**:
- [ ] Player sees suggested number of questions initially
- [ ] "Add Another Question" button appears when below max
- [ ] Button is disabled at maximum
- [ ] Can add questions up to max
- [ ] "Remove Question" button appears when above min
- [ ] Button is hidden at minimum
- [ ] Can remove questions down to min
- [ ] Cannot save with fewer than min questions (with text)
- [ ] Empty questions don't count toward minimum
- [ ] Questions are properly saved to server

**Manual Test Steps**:
1. Create quiz with min=2, suggested=3, max=5
2. Join as player
3. Verify 3 question slots appear
4. Add 2 more questions (total 5)
5. Try to add 6th - should be disabled
6. Remove questions down to 2
7. Try to remove below 2 - should be disabled
8. Save with 2 questions - should succeed
9. Try to save with 1 question - should show error

---

## Step 5: Add Question Reordering

**Goal**: Allow players to reorder questions within their block.

**Files to Modify**:
- `src/pages/player/Game.tsx` (PlayerCreation component)

**Changes**:
1. Add reordering UI:
   - Option A: Up/Down arrow buttons on each question
   - Option B: Drag handles for drag-and-drop (requires library like `@dnd-kit/core`)
   - **Recommendation**: Start with arrow buttons (simpler, no dependencies)

2. Implement reorder functions:
   - `moveQuestionUp(index)`: Swap with previous question
   - `moveQuestionDown(index)`: Swap with next question
   - Update `index_in_block` for affected questions

3. Update save logic:
   - Ensure `index_in_block` matches array order when saving

**Testing Checklist**:
- [ ] Up arrow on first question is disabled/hidden
- [ ] Down arrow on last question is disabled/hidden
- [ ] Can move question up
- [ ] Can move question down
- [ ] Question order persists after save
- [ ] Order is reflected in saved data (check network request)
- [ ] Reordering doesn't break question data (text, options, etc.)

**Manual Test Steps**:
1. Create quiz and join as player
2. Add 4 questions with different text (Q1, Q2, Q3, Q4)
3. Move Q3 up - should become Q2
4. Move Q1 down - should become Q2
5. Save questions
6. Reload page - verify order is preserved
7. Check network request - verify `index_in_block` values are correct

---

## Step 6: Add Option Management (Remove/Reorder)

**Goal**: Allow players to remove and reorder options within MCQ questions.

**Files to Modify**:
- `src/pages/player/Game.tsx` (PlayerCreation component, within question cards)

**Changes**:
1. Add "Remove Option" button:
   - On each option (except when only 2 remain for MCQ)
   - Removes option from array
   - Updates question state immediately

2. Add option reordering:
   - Up/Down arrow buttons on each option
   - Or drag handles (same approach as question reordering)

3. Update validation:
   - MCQ questions must have at least 2 options
   - Disable remove button when at minimum

**Testing Checklist**:
- [ ] Remove button appears on each option (MCQ questions)
- [ ] Remove button is disabled/hidden when only 2 options remain
- [ ] Can remove options down to 2
- [ ] Options can be reordered (up/down)
- [ ] Option order persists after save
- [ ] Correct answer index updates if needed (if stored as index)
- [ ] Open questions don't show option management UI

**Manual Test Steps**:
1. Create quiz and join as player
2. Create MCQ question with 4 options
3. Remove one option - should have 3
4. Try to remove below 2 - should be blocked
5. Reorder options (move option 3 to position 1)
6. Save question
7. Reload - verify option order is preserved
8. Test with open question - should not show option controls

---

## Step 7: Add Host Question Blocks

**Goal**: Allow host to create question blocks before players join.

**Files to Modify**:
- `src/pages/host/Dashboard.tsx` (during CREATION phase)
- `src/supabase/functions/server/index.tsx` (block creation endpoint)
- `src/utils/api.ts` (add host block creation function)

**Changes**:
1. In `Dashboard.tsx`:
   - Add UI section for "Host Question Blocks" (only visible in CREATION phase)
   - Show list of existing host blocks
   - Add "Create New Block" button
   - For each block: show title, question count, edit/delete buttons
   - Block editor: similar to player question creation
   - Host blocks should appear first in block list

2. In server `index.tsx`:
   - Update block creation endpoint to accept `author_type`
   - For host blocks: set `author_participant_id` to null or special identifier
   - Ensure host blocks are ordered first (use `order_index` or similar)

3. In `api.ts`:
   - Add `createHostBlock(code, title, questions)` function
   - Add `updateHostBlock(code, blockId, title, questions)` function
   - Add `deleteHostBlock(code, blockId)` function

4. Update Block type handling:
   - Host blocks have `author_type: "host"` and `author_participant_id: null`
   - Player blocks have `author_type: "player"` and `author_participant_id: <participant_id>`

**Testing Checklist**:
- [ ] Host sees "Host Question Blocks" section in CREATION phase
- [ ] Can create new host block
- [ ] Can add questions to host block (same UI as player)
- [ ] Can edit block title
- [ ] Can delete host block
- [ ] Host blocks appear first in quiz order
- [ ] Host blocks are not editable after quiz starts
- [ ] Players don't see host blocks in their creation view
- [ ] Host blocks appear in quiz flow when game starts

**Manual Test Steps**:
1. Create quiz as host
2. Before any players join, create a host block "Round 1: Warm-up"
3. Add 3 questions to the host block
4. Create another host block "Round 2: Challenge"
5. Add 2 questions to second block
6. Verify blocks appear in order
7. Join as player - verify you don't see host blocks in creation
8. Start quiz - verify host blocks appear first in game flow

---

## Step 8: Add Author Guessing Toggle Logic

**Goal**: Skip author guessing phases when `enable_author_guessing` is false.

**Files to Modify**:
- `src/pages/host/Dashboard.tsx` (action handling)
- `src/pages/player/Game.tsx` (phase rendering)

**Changes**:
1. In `Dashboard.tsx`:
   - When moving to next question/block, check `quiz.enable_author_guessing`
   - If false, skip AUTHOR_GUESS and AUTHOR_REVEAL phases
   - Go directly from last question to next block or grading

2. In `Game.tsx`:
   - Don't render author guessing UI when `enable_author_guessing` is false
   - Skip to next phase automatically

3. Update phase transitions:
   - After last question in block:
     - If `enable_author_guessing`: go to AUTHOR_GUESS
     - If not: go to next block or FINISHED

**Testing Checklist**:
- [ ] Quiz with `enable_author_guessing: false` skips guess phases
- [ ] Quiz with `enable_author_guessing: true` shows guess phases (existing behavior)
- [ ] Host can navigate through quiz without guess phases
- [ ] Players don't see guess UI when disabled
- [ ] Quiz flow is correct: questions → next block (no guess phase)
- [ ] Points/guesses are not recorded when disabled

**Manual Test Steps**:
1. Create quiz with author guessing **disabled**
2. Add host block with 2 questions
3. Join as player, add questions
4. Start quiz
5. Answer questions in host block
6. After last question, verify it goes directly to player blocks (no guess phase)
7. Create another quiz with author guessing **enabled**
8. Verify guess phases appear as before

---

## Final Integration Testing

After completing all steps, perform end-to-end testing:

**Complete Flow Test**:
1. [ ] Create quiz with min=2, suggested=4, max=6, author guessing enabled
2. [ ] Host creates 2 question blocks with 3 questions each
3. [ ] Player 1 joins, adds 4 questions (suggested)
4. [ ] Player 2 joins, adds 6 questions (max)
5. [ ] Player 3 joins, adds 2 questions (min)
6. [ ] All players reorder their questions
7. [ ] All players reorder options in MCQ questions
8. [ ] Host starts quiz
9. [ ] Verify host blocks appear first
10. [ ] Answer all questions
11. [ ] Verify author guessing appears after each player block
12. [ ] Complete quiz and verify scoring

**Edge Cases**:
- [ ] Create quiz with min=max=suggested (all same value)
- [ ] Player tries to save with exactly min questions
- [ ] Player tries to add question at max limit
- [ ] Reorder questions, then add new question
- [ ] Remove question, then reorder remaining
- [ ] Host creates block, then deletes it before starting
- [ ] Quiz with author guessing disabled completes successfully

---

## Rollback Plan

If issues arise, each step can be rolled back independently:

1. **Step 1-2**: Server will accept old format (backward compatible)
2. **Step 3**: Can temporarily revert to old UI (keep server changes)
3. **Step 4-6**: Player features are additive (old behavior still works)
4. **Step 7**: Host blocks are optional (can be skipped)
5. **Step 8**: Author guessing defaults to true (existing behavior)

---

## Notes

- **Backward Compatibility**: Old quizzes should continue to work. Default values handle missing fields.
- **Database Migration**: If using a database (not just KV store), may need migration scripts.
- **UI/UX**: Consider adding loading states, confirmation dialogs for deletions, and better error messages.
- **Performance**: Question reordering with drag-and-drop may require optimization for large question sets.

---

## Estimated Time

- Step 1: 15 minutes
- Step 2: 30 minutes
- Step 3: 45 minutes
- Step 4: 1 hour
- Step 5: 45 minutes
- Step 6: 1 hour
- Step 7: 2 hours
- Step 8: 30 minutes

**Total**: ~6.5 hours (excluding testing time)

