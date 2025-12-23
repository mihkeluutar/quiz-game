
export type User = {
  id: string;
  email: string;
  display_name?: string;
};

export type QuizStatus = 'CREATION' | 'PLAY' | 'FINISHED';

export type QuizPhase = 'QUESTION' | 'AUTHOR_GUESS' | 'AUTHOR_REVEAL' | 'GRADING';

export type Quiz = {
  id: string;
  code: string;
  name: string;
  host_user_id: string;
  status: QuizStatus;
  max_questions_per_player: number;
  // Fallback: min_questions_per_player defaults to max_questions_per_player if not set
  min_questions_per_player?: number;
  // Fallback: suggested_questions_per_player defaults to max_questions_per_player if not set
  suggested_questions_per_player?: number;
  // Fallback: enable_author_guessing defaults to true if not set
  enable_author_guessing?: boolean;
  current_block_id?: string;
  current_question_id?: string;
  phase?: QuizPhase; // To track if we are guessing the author
  created_at: string;
};

export type Participant = {
  id: string;
  quiz_id: string;
  user_id?: string;
  display_name: string;
  player_token: string;
  score?: number; // Calculated on fly usually, but useful in state
};

export type Block = {
  id: string;
  quiz_id: string;
  // Fallback: author_type defaults to "player" if not set (for backward compatibility)
  author_type?: "host" | "player";
  // For player blocks: contains participant_id
  // For host blocks: can be null or host_user_id (implementation choice)
  // Fallback: if author_participant_id exists in old data, it's a player block
  author_participant_id?: string | null;
  title: string;
  order_index?: number;
  is_locked: boolean;
};

export type QuestionType = 'open' | 'mcq';

export type Question = {
  id: string;
  block_id: string;
  index_in_block: number;
  text: string;
  type: QuestionType;
  options?: string[]; // For MCQ
  correct_answer: string; // Text or index
  image_url?: string;
};

export type Answer = {
  id: string;
  quiz_id: string;
  question_id: string;
  participant_id: string;
  answer_text: string;
  is_correct?: boolean;
};

export type BlockGuess = {
  id: string;
  quiz_id: string;
  block_id: string;
  guesser_participant_id: string;
  guessed_participant_id: string;
  is_correct?: boolean;
};

// The full state payload sent to clients
export type QuizState = {
  quiz: Quiz;
  participants: Participant[];
  blocks: Block[]; // Host sees all; Players see own in CREATION, or current in PLAY
  questions: Record<string, Question[]>; // block_id -> questions
  answers: Answer[]; // Host sees all; Players see own
  guesses: BlockGuess[];
  current_block?: Block;
  current_question?: Question;
};

// Utility functions for fallback values (ensures backward compatibility with old quizzes)

/**
 * Get min_questions_per_player with fallback to max_questions_per_player
 */
export function getMinQuestionsPerPlayer(quiz: Quiz): number {
  return quiz.min_questions_per_player ?? quiz.max_questions_per_player;
}

/**
 * Get suggested_questions_per_player with fallback to max_questions_per_player
 */
export function getSuggestedQuestionsPerPlayer(quiz: Quiz): number {
  return quiz.suggested_questions_per_player ?? quiz.max_questions_per_player;
}

/**
 * Get enable_author_guessing with fallback to true
 */
export function getEnableAuthorGuessing(quiz: Quiz): boolean {
  return quiz.enable_author_guessing ?? true;
}

/**
 * Get author_type with fallback to "player" (for backward compatibility)
 */
export function getAuthorType(block: Block): "host" | "player" {
  // If author_participant_id exists and author_type is not set, it's a player block (old format)
  if (!block.author_type && block.author_participant_id) {
    return "player";
  }
  return block.author_type ?? "player";
}
