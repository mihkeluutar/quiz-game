
import { projectId, publicAnonKey } from './supabase/info';
import { supabase } from './supabase/client';
import { Quiz, Participant, Block, Question, Answer, BlockGuess, QuizState } from '../types/quiz';

const SERVER_URL = `https://${projectId}.supabase.co/functions/v1/make-server-cbaebbc3`;

async function fetchAPI(endpoint: string, method: string, body?: any, token?: string) {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${publicAnonKey}`,
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['X-Player-Token'] = token;
  }

  const res = await fetch(`${SERVER_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    // Be defensive: non-JSON errors (like 404 HTML) otherwise crash parsing.
    const text = await res.text();
    try {
      const err = JSON.parse(text);
      throw new Error(err.error || `API Error (${res.status})`);
    } catch {
      throw new Error(`API Error (${res.status}): ${text.slice(0, 120)}`);
    }
  }
  return res.json();
}

export const api = {
  createQuiz: (
    name: string,
    min_questions_per_player: number,
    suggested_questions_per_player: number,
    max_questions_per_player: number,
    enable_author_guessing: boolean,
    host_id: string
  ) => {
    const body = { 
      name, 
      min_questions_per_player,
      suggested_questions_per_player,
      max_questions_per_player,
      enable_author_guessing,
      host_id 
    };
    console.log('API call - createQuiz body:', body);
    return fetchAPI('/quiz/create', 'POST', body);
  },

  listHostQuizzes: (host_id: string) =>
    fetchAPI(`/quiz/host/${encodeURIComponent(host_id)}`, 'GET'),

  joinQuiz: (code: string, display_name: string, player_token: string) =>
    fetchAPI('/quiz/join', 'POST', { code, display_name, player_token }),

  getQuizState: (code: string, player_token?: string): Promise<QuizState> =>
    fetchAPI(`/quiz/${code}`, 'GET', undefined, player_token),

  saveBlock: (code: string, participant_id: string, title: string, questions: Partial<Question>[]) =>
    fetchAPI(`/quiz/${code}/block`, 'POST', { participant_id, title, questions, author_type: 'player' }),

  saveHostBlock: (code: string, block_id: string | null, title: string, questions: Partial<Question>[]) =>
    fetchAPI(`/quiz/${code}/block`, 'POST', { block_id, title, questions, author_type: 'host' }),

  deleteHostBlock: async (code: string, block_id: string) => {
    // Get current state
    const state = await api.getQuizState(code);
    const blocks = state.blocks || [];
    const questionsMap = state.questions || {};
    
    // Remove block
    const updatedBlocks = blocks.filter((b: Block) => b.id !== block_id);
    
    // Remove questions for this block
    const updatedQuestions = { ...questionsMap };
    delete updatedQuestions[block_id];
    
    // We need to update the server - for now, we'll use a workaround
    // by saving an empty block and then the server should handle deletion
    // Actually, we need a delete endpoint. Let me add that to server first.
    throw new Error('Delete host block not yet implemented - need server endpoint');
  },

  performAction: (code: string, action: string, payload?: any) =>
    fetchAPI(`/quiz/${code}/action`, 'POST', { action, payload }),

  submitAnswer: (code: string, participant_id: string, question_id: string, answer_text: string) =>
    fetchAPI(`/quiz/${code}/answer`, 'POST', { participant_id, question_id, answer_text }),
    
  submitGuess: (code: string, participant_id: string, block_id: string, guessed_participant_id: string) =>
    fetchAPI(`/quiz/${code}/guess`, 'POST', { participant_id, block_id, guessed_participant_id }),
    
  gradeAnswer: (code: string, question_id: string, participant_id: string, is_correct: boolean) =>
    fetchAPI(`/quiz/${code}/grade`, 'POST', { question_id, participant_id, is_correct }),

  // Image upload
  uploadImage: async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    
    // We can't use the standard fetchAPI helper easily because it assumes JSON body
    // So we manually construct the request
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${publicAnonKey}`,
      // 'Content-Type': 'multipart/form-data', // Fetch automatically sets this with boundary
    };

    const res = await fetch(`${SERVER_URL}/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const text = await res.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        console.error("Upload response parsing failed. Response text:", text);
        throw new Error(`Upload failed: Server returned invalid JSON (${text.substring(0, 100)}...)`);
    }

    if (!res.ok) {
      throw new Error(data.error || 'Upload Failed');
    }

    return data.publicUrl;
  }
};
