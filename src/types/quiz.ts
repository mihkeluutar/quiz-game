
export type User = {
  id: string;
  email: string;
  display_name?: string;
};

export type QuizStatus = 'CREATION' | 'PLAY' | 'FINISHED';

export type QuizPhase = 'QUESTION' | 'AUTHOR_GUESS' | 'AUTHOR_REVEAL';

export type Quiz = {
  id: string;
  code: string;
  name: string;
  host_user_id: string;
  status: QuizStatus;
  max_questions_per_player: number;
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
  author_participant_id: string;
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
