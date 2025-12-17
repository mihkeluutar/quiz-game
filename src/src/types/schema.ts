export interface User {
  id: string;
  display_name: string | null;
  email: string | null;
}

export interface Quiz {
  id: string;
  code: string;
  name: string;
  host_user_id: string;
  status: 'CREATION' | 'PLAY' | 'FINISHED';
  max_questions_per_player: number;
  current_block_id: string | null;
  current_question_id: string | null;
  created_at: string;
}

export interface QuizParticipant {
  id: string;
  quiz_id: string;
  user_id: string | null;
  display_name: string;
  player_token: string;
  created_at: string;
}

export interface Block {
  id: string;
  quiz_id: string;
  author_participant_id: string;
  title: string;
  order_index: number | null;
  is_locked: boolean;
}

export interface Question {
  id: string;
  block_id: string;
  index_in_block: number;
  text: string;
  type: 'open' | 'mcq';
  options: string[] | null;
  correct_answer: string | null;
  image_url: string | null;
}

export interface Answer {
  id: string;
  quiz_id: string;
  question_id: string;
  participant_id: string;
  answer_text: string;
  is_correct: boolean | null;
  created_at: string;
}

export interface BlockGuess {
  id: string;
  quiz_id: string;
  block_id: string;
  guesser_participant_id: string;
  guessed_participant_id: string;
  is_correct: boolean | null;
}
