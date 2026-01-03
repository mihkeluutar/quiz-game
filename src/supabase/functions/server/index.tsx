
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from "./kv_store.tsx";

const app = new Hono();

app.use('*', logger(console.log));
// Restrict CORS to specific origins for security
const allowedOrigins = [
  Deno.env.get("APP_URL_LOCAL") || "http://localhost:3000",
  // Add production and preview URLs to environment variables
  Deno.env.get("APP_URL_PROD"),
  Deno.env.get("APP_URL_PREVIEW"),
].filter(Boolean); // Filter out any undefined values

app.use('*', cors({
  origin: (origin) => {
    // Allow requests from the same origin (e.g., server-side rendering)
    if (!origin) {
        return undefined; // Or handle as needed
    }
    if (allowedOrigins.includes(origin)) {
      return origin;
    }
    // Deny requests from all other origins
    return null;
  }
}));

// Initialize Supabase Client
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const BUCKET_NAME = "make-cbaebbc3-quiz-images";

// Ensure bucket exists
(async () => {
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(bucket => bucket.name === BUCKET_NAME);
    if (!bucketExists) {
      console.log(`Creating bucket ${BUCKET_NAME}`);
      await supabase.storage.createBucket(BUCKET_NAME, {
        public: true, 
        fileSizeLimit: 10485760, // 10MB (Increased from 5MB)
      });
    } else {
      // Try to update limit to 10MB
      await supabase.storage.updateBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: 10485760, // 10MB
      });
    }
  } catch (e) {
    console.error("Error creating/updating bucket:", e);
  }
})();

// Types (Mirrored from /types/quiz.ts for convenience in server file)
// In a real repo, we'd share this file, but Deno imports can be tricky with local files outside the function dir
// So I will redefine the minimal necessary types or use 'any' where flexible.
type Quiz = any;
type Participant = any;

// Helpers
const generateCode = () => {
  // Generate 4-char uppercase code
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const getQuizKey = (code: string) => `quiz:${code}`;
const getParticipantsKey = (code: string) => `quiz:${code}:participants`;
const getBlocksKey = (code: string) => `quiz:${code}:blocks`;
const getQuestionsKey = (code: string) => `quiz:${code}:questions`;
const getAnswersKey = (code: string) => `quiz:${code}:answers`;
const getGuessesKey = (code: string) => `quiz:${code}:guesses`;

// Routes

// 1. Create Quiz
app.post("/make-server-cbaebbc3/quiz/create", async (c) => {
  try {
    const body = await c.req.json();
    const { 
      name, 
      host_id,
      // New parameters
      min_questions_per_player,
      suggested_questions_per_player,
      max_questions_per_player,
      enable_author_guessing,
      // Backward compatibility: old parameter
      max_questions
    } = body;
    
    // Backward compatibility: if old max_questions is provided, use it
    let finalMinQuestions: number;
    let finalSuggestedQuestions: number;
    let finalMaxQuestions: number;
    let finalEnableAuthorGuessing: boolean;
    
    if (max_questions !== undefined && max_questions_per_player === undefined) {
      // Old format: set defaults based on max_questions
      finalMaxQuestions = max_questions || 10;
      finalSuggestedQuestions = finalMaxQuestions;
      finalMinQuestions = 1;
      finalEnableAuthorGuessing = true;
    } else {
      // New format: use provided values or defaults
      finalMaxQuestions = max_questions_per_player ?? 10;
      finalSuggestedQuestions = suggested_questions_per_player ?? 3;
      finalMinQuestions = min_questions_per_player ?? 1;
      finalEnableAuthorGuessing = enable_author_guessing ?? true;
    }
    
    // Validation
    if (finalMinQuestions < 1) {
      return c.json({ error: "min_questions_per_player must be >= 1" }, 400);
    }
    if (finalSuggestedQuestions < finalMinQuestions) {
      return c.json({ 
        error: "suggested_questions_per_player must be >= min_questions_per_player" 
      }, 400);
    }
    if (finalMaxQuestions < finalSuggestedQuestions) {
      return c.json({ 
        error: "max_questions_per_player must be >= suggested_questions_per_player" 
      }, 400);
    }
    
    let code = generateCode();
    // Ensure uniqueness (simple retry)
    let existing = await kv.get(getQuizKey(code));
    while (existing) {
      code = generateCode();
      existing = await kv.get(getQuizKey(code));
    }

    const quiz = {
      id: crypto.randomUUID(),
      code,
      name,
      host_user_id: host_id,
      status: "CREATION",
      max_questions_per_player: finalMaxQuestions,
      min_questions_per_player: finalMinQuestions,
      suggested_questions_per_player: finalSuggestedQuestions,
      enable_author_guessing: finalEnableAuthorGuessing,
      created_at: new Date().toISOString(),
      phase: "QUESTION"
    };

    await kv.set(getQuizKey(code), quiz);
    
    // Initialize lists
    await kv.set(getParticipantsKey(code), []);
    await kv.set(getBlocksKey(code), []);
    await kv.set(getQuestionsKey(code), {}); // Map block_id -> questions[]
    await kv.set(getAnswersKey(code), []);
    await kv.set(getGuessesKey(code), []);

    return c.json(quiz);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// 1b. List quizzes for a host (read-only, no schema changes)
const listHostQuizzesHandler = async (c: any) => {
  try {
    const hostId = c.req.param("host_id");
    if (!hostId) return c.json({ error: "host_id is required" }, 400);

    // Quizzes are stored under keys like: quiz:{CODE}
    const quizzes = await kv.getByPrefix("quiz:");
    const hostQuizzes = (quizzes || [])
      .filter((q: any) => q && typeof q === "object" && q.host_user_id === hostId && q.code)
      .sort((a: any, b: any) => {
        const at = new Date(a.created_at || 0).getTime();
        const bt = new Date(b.created_at || 0).getTime();
        return bt - at;
      });

    return c.json({ quizzes: hostQuizzes });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};

// Register both variants to avoid path mismatches.
app.get("/make-server-cbaebbc3/quiz/host/:host_id", listHostQuizzesHandler);
app.get("/quiz/host/:host_id", listHostQuizzesHandler);

// 2. Join Quiz
app.post("/make-server-cbaebbc3/quiz/join", async (c) => {
  try {
    const body = await c.req.json();
    let { code, display_name, player_token } = body;

    // Normalize display_name: trim whitespace to prevent duplicate entries
    display_name = display_name?.trim() || '';
    if (!display_name) {
      return c.json({ error: "Display name is required" }, 400);
    }

    const quiz = await kv.get(getQuizKey(code));
    if (!quiz) {
      return c.json({ error: "Quiz not found" }, 404);
    }

    const participants = (await kv.get(getParticipantsKey(code))) || [];
    
    // Check if player already joined
    // 1. Check by token (same device)
    let participant = participants.find((p: any) => p.player_token === player_token);
    let is_rejoined = false;

    // 2. Check by name (different device / lost session)
    // Normalize names for comparison: trim and lowercase
    if (!participant) {
        const normalizedDisplayName = display_name.toLowerCase().trim();
        const existingByName = participants.find((p: any) => {
          const normalizedExistingName = (p.display_name || '').toLowerCase().trim();
          return normalizedExistingName === normalizedDisplayName;
        });
        if (existingByName) {
             participant = existingByName;
             // Update token to new one so they can play on this device
             participant.player_token = player_token;
             await kv.set(getParticipantsKey(code), participants);
             is_rejoined = true;
        }
    } else {
        is_rejoined = true; // They are joining again with same token
    }

    if (!participant) {
      if (quiz.status === 'FINISHED') {
         // Allow joining finished quiz just to view, but maybe restrict?
         // For now, allow it.
      }

      participant = {
        id: crypto.randomUUID(),
        quiz_id: quiz.id,
        display_name,
        player_token,
        created_at: new Date().toISOString()
      };
      participants.push(participant);
      await kv.set(getParticipantsKey(code), participants);
    } else {
        // Update name if changed? Only if not rejoined by name (preserved)
        // If rejoined by name, we keep the name.
        if (!is_rejoined && display_name && participant.display_name !== display_name) {
             participant.display_name = display_name;
             await kv.set(getParticipantsKey(code), participants);
        }
    }

    return c.json({ quiz, participant, is_rejoined });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// 3. Get State
app.get("/make-server-cbaebbc3/quiz/:code", async (c) => {
  const code = c.req.param("code");
  const token = c.req.header("X-Player-Token"); // Identify requester

  const quiz = await kv.get(getQuizKey(code));
  if (!quiz) return c.json({ error: "Not found" }, 404);

  const participants = (await kv.get(getParticipantsKey(code))) || [];
  const blocks = (await kv.get(getBlocksKey(code))) || [];
  const questionsMap = (await kv.get(getQuestionsKey(code))) || {};
  const answers = (await kv.get(getAnswersKey(code))) || [];
  const guesses = (await kv.get(getGuessesKey(code))) || [];

  // Security / Privacy Filtering
  // Host (no token usually, or specific host logic) - For this app, if no token provided, treat as host or public view? 
  // We'll rely on the client to send the right token. If the user matches quiz.host_user_id (sent via auth header?), they are host.
  // For simplicity here, we return most data but filter answers/guesses if needed.
  // Actually, standard players shouldn't see others' questions in creation mode.

  const isHost = true; // We'll trust the client logic for now or rely on specific endpoint for sensitive data
  // Ideally we check: const isHost = user_id === quiz.host_user_id

  let filteredBlocks = blocks;
  let filteredQuestions = questionsMap;

  // Filter for players
  if (quiz.status === 'CREATION') {
      // Players only see their own block
      if (token) {
          const me = participants.find((p: any) => p.player_token === token);
          if (me) {
             filteredBlocks = blocks.filter((b: any) => b.author_participant_id === me.id);
             // filteredQuestions already map, just return relevant
          }
      }
  }

  // Current context
  let currentBlock = null;
  let currentQuestion = null;

  if (quiz.current_block_id) {
      currentBlock = blocks.find((b: any) => b.id === quiz.current_block_id);
  }
  if (quiz.current_question_id && currentBlock) {
      const qs = questionsMap[currentBlock.id] || [];
      currentQuestion = qs.find((q: any) => q.id === quiz.current_question_id);
  }

  return c.json({
    quiz,
    participants,
    blocks: filteredBlocks,
    questions: filteredQuestions, // In a real app, sanitize this!
    answers,
    guesses,
    currentBlock,
    currentQuestion
  });
});

// 4. Save Block (Player or Host)
app.post("/make-server-cbaebbc3/quiz/:code/block", async (c) => {
  const code = c.req.param("code");
  const body = await c.req.json();
  const { participant_id, title, questions, author_type, block_id } = body;

  const quiz = await kv.get(getQuizKey(code));
  if (quiz.status !== 'CREATION') return c.json({ error: "Quiz locked" }, 400);

  const blocks = (await kv.get(getBlocksKey(code))) || [];
  
  // Determine if this is a host block or player block
  let isHostBlock = false;
  if (author_type === 'host') {
    isHostBlock = true;
  } else if (!participant_id) {
    // No participant_id means it could be a host block
    if (block_id) {
      // Check if the block_id points to an existing host block
      const existingBlock = blocks.find((b: any) => b.id === block_id);
      isHostBlock = existingBlock && (!existingBlock.author_participant_id || existingBlock.author_type === 'host');
    } else {
      // No participant_id and no block_id = creating new host block
      isHostBlock = true;
    }
  }
  
  let block;
  if (isHostBlock) {
    // Host block: find by block_id if provided (editing), or create new (creating)
    if (block_id) {
      // Editing existing host block
      block = blocks.find((b: any) => b.id === block_id && (!b.author_participant_id || b.author_type === 'host'));
      if (block) {
        block.title = title;
      } else {
        return c.json({ error: "Host block not found" }, 404);
      }
    } else {
      // Creating new host block - always create a new one (host can have 0...N blocks)
      block = {
        id: crypto.randomUUID(),
        quiz_id: quiz.id,
        author_type: 'host',
        author_participant_id: null,
        title,
        is_locked: false,
        order_index: -1 // Host blocks get negative order_index to appear first
      };
      blocks.push(block);
    }
  } else {
    // Player block: find by participant_id
    block = blocks.find((b: any) => b.author_participant_id === participant_id);
    if (!block) {
      block = {
        id: crypto.randomUUID(),
        quiz_id: quiz.id,
        author_type: 'player',
        author_participant_id: participant_id,
        title,
        is_locked: false,
        order_index: 0
      };
      blocks.push(block);
    } else {
      block.title = title;
    }
  }
  
  // Sort blocks: host blocks first (negative order_index), then player blocks
  blocks.sort((a: any, b: any) => {
    const aOrder = a.order_index ?? (a.author_type === 'host' ? -1 : 0);
    const bOrder = b.order_index ?? (b.author_type === 'host' ? -1 : 0);
    if (aOrder !== bOrder) return aOrder - bOrder;
    // If same order, maintain creation order
    return 0;
  });
  
  await kv.set(getBlocksKey(code), blocks);

  // Save questions
  const questionsMap = (await kv.get(getQuestionsKey(code))) || {};
  // Sanitize and ID questions
  const processedQuestions = questions.map((q: any, idx: number) => ({
    ...q,
    id: q.id || crypto.randomUUID(),
    block_id: block.id,
    index_in_block: idx
  }));
  
  questionsMap[block.id] = processedQuestions;
  await kv.set(getQuestionsKey(code), questionsMap);

  return c.json({ success: true, block, questions: processedQuestions });
});

// 5. Host Action
app.post("/make-server-cbaebbc3/quiz/:code/action", async (c) => {
  const code = c.req.param("code");
  const body = await c.req.json();
  const { action, payload } = body; 
  // actions: START_GAME, NEXT_QUESTION, PREV_QUESTION, START_GUESS, REVEAL_AUTHOR, FINISH_GAME, REVEAL_ANSWER

  let quiz = await kv.get(getQuizKey(code));
  const blocks = (await kv.get(getBlocksKey(code))) || [];
  const questionsMap = (await kv.get(getQuestionsKey(code))) || {};
  
  if (action === 'START_GAME') {
    quiz.status = 'PLAY';
    quiz.phase = 'QUESTION';
    
    // Separate host and player blocks
    const hostBlocks = blocks.filter((b: any) => b.author_type === 'host' || (!b.author_participant_id && b.author_type !== 'player'));
    const playerBlocks = blocks.filter((b: any) => b.author_type === 'player' || (b.author_participant_id && b.author_type !== 'host'));
    
    // Optional shuffle controlled by host via payload.shuffleBlocks (only shuffle player blocks)
    const shouldShuffle = payload && payload.shuffleBlocks;
    let orderedPlayerBlocks = [...playerBlocks];
    if (shouldShuffle && orderedPlayerBlocks.length > 1) {
      for (let i = orderedPlayerBlocks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [orderedPlayerBlocks[i], orderedPlayerBlocks[j]] = [orderedPlayerBlocks[j], orderedPlayerBlocks[i]];
      }
    }
    
    // Host blocks first, then shuffled player blocks
    const orderedBlocks = [...hostBlocks, ...orderedPlayerBlocks];
    await kv.set(getBlocksKey(code), orderedBlocks);
    
    if (orderedBlocks.length > 0) {
        quiz.current_block_id = orderedBlocks[0].id;
        const firstQs = questionsMap[orderedBlocks[0].id] || [];
        if (firstQs.length > 0) quiz.current_question_id = firstQs[0].id;
    }
  }

  if (action === 'NEXT_QUESTION') {
      // Logic to find next question or switch to GUESS phase
      const currentBlock = blocks.find((b: any) => b.id === quiz.current_block_id);
      if (currentBlock) {
          const qs = questionsMap[currentBlock.id] || [];
          const currentIdx = qs.findIndex((q: any) => q.id === quiz.current_question_id);
          
          if (currentIdx < qs.length - 1) {
              // Next question in block
              quiz.current_question_id = qs[currentIdx + 1].id;
              quiz.phase = 'QUESTION';
          } else {
              // End of block -> Check if host block or if author guessing is enabled
              const isHostBlock = currentBlock.author_type === 'host' || !currentBlock.author_participant_id;
              const shouldSkipGuessing = isHostBlock || !quiz.enable_author_guessing;
              
              if (shouldSkipGuessing) {
                  // Skip guess phase - go directly to next block or finish
                  // Use the ordered blocks array (blocks are already sorted from START_GAME)
                  const currentBlockIdx = blocks.findIndex((b: any) => b.id === quiz.current_block_id);
                  if (currentBlockIdx >= 0 && currentBlockIdx < blocks.length - 1) {
                      const nextBlock = blocks[currentBlockIdx + 1];
                      quiz.current_block_id = nextBlock.id;
                      const nextQs = questionsMap[nextBlock.id] || [];
                      quiz.current_question_id = nextQs.length > 0 ? nextQs[0].id : null;
                      quiz.phase = 'QUESTION';
                  } else {
                      quiz.status = 'FINISHED';
                  }
              } else {
                  // Player block with author guessing enabled -> Guess phase
                  quiz.phase = 'AUTHOR_GUESS';
                  quiz.current_question_id = null; // No active question
              }
          }
      }
  }

  if (action === 'REVEAL_AUTHOR') {
      quiz.phase = 'AUTHOR_REVEAL';
  }

  if (action === 'NEXT_BLOCK') {
       // Move from Reveal Phase to Next Block
       const currentIdx = blocks.findIndex((b: any) => b.id === quiz.current_block_id);
       if (currentIdx < blocks.length - 1) {
           const nextBlock = blocks[currentIdx + 1];
           quiz.current_block_id = nextBlock.id;
           const qs = questionsMap[nextBlock.id] || [];
           quiz.current_question_id = qs.length > 0 ? qs[0].id : null;
           quiz.phase = 'QUESTION';
       } else {
           quiz.status = 'FINISHED';
       }
  }

  if (action === 'FINISH_GAME') {
      quiz.status = 'FINISHED';
  }

  if (action === 'RESTART_GAME') {
      quiz.status = 'CREATION';
      quiz.phase = 'QUESTION';
      quiz.current_block_id = null;
      quiz.current_question_id = null;
      
      // Clear game data but keep setup
      await kv.set(getAnswersKey(code), []);
      await kv.set(getGuessesKey(code), []);
  }
  
  // Specific override actions
  if (action === 'SET_STATE') {
      if (payload.phase) quiz.phase = payload.phase;
      if (payload.current_question_id !== undefined) quiz.current_question_id = payload.current_question_id;
      if (payload.current_block_id !== undefined) quiz.current_block_id = payload.current_block_id;
  }

  await kv.set(getQuizKey(code), quiz);
  return c.json(quiz);
});

// 6. Submit Answer
app.post("/make-server-cbaebbc3/quiz/:code/answer", async (c) => {
  const code = c.req.param("code");
  const body = await c.req.json();
  const { participant_id, question_id, answer_text } = body;

  const answers = (await kv.get(getAnswersKey(code))) || [];
  
  // Check if exists
  const existingIdx = answers.findIndex((a: any) => a.question_id === question_id && a.participant_id === participant_id);
  
  // Auto check MCQ logic could go here, but let's just store for now
  // We need to look up question to check correctness
  const questionsMap = (await kv.get(getQuestionsKey(code))) || {};
  let is_correct = false;
  
  // Find question
  let question = null;
  for (const blockId in questionsMap) {
      const q = questionsMap[blockId].find((q: any) => q.id === question_id);
      if (q) {
          question = q;
          break;
      }
  }

  if (question && question.type === 'mcq') {
      is_correct = (answer_text === question.correct_answer);
  }
  // For open text, host checks manually or we loose match? Spec says manual/nullable.
  
  const answer = {
      id: crypto.randomUUID(),
      quiz_id: code, // code as ID proxy or fetch quiz ID? Let's use code context
      question_id,
      participant_id,
      answer_text,
      is_correct: question?.type === 'mcq' ? is_correct : null
  };

  if (existingIdx >= 0) {
      answers[existingIdx] = answer;
  } else {
      answers.push(answer);
  }

  await kv.set(getAnswersKey(code), answers);
  return c.json({ success: true });
});

// 7. Submit Guess
app.post("/make-server-cbaebbc3/quiz/:code/guess", async (c) => {
  const code = c.req.param("code");
  const body = await c.req.json();
  const { participant_id, block_id, guessed_participant_id } = body;

  const guesses = (await kv.get(getGuessesKey(code))) || [];
  const existingIdx = guesses.findIndex((g: any) => g.block_id === block_id && g.guesser_participant_id === participant_id);
  
  // Check correctness
  const blocks = (await kv.get(getBlocksKey(code))) || [];
  const block = blocks.find((b: any) => b.id === block_id);
  const is_correct = block ? block.author_participant_id === guessed_participant_id : false;

  const guess = {
      id: crypto.randomUUID(),
      quiz_id: code,
      block_id,
      guesser_participant_id: participant_id,
      guessed_participant_id,
      is_correct
  };

  if (existingIdx >= 0) {
      guesses[existingIdx] = guess;
  } else {
      guesses.push(guess);
  }

  await kv.set(getGuessesKey(code), guesses);
  return c.json({ success: true });
});

// 8. Host Grade Answer (for open ended)
app.post("/make-server-cbaebbc3/quiz/:code/grade", async (c) => {
    const code = c.req.param("code");
    const body = await c.req.json();
    const { question_id, participant_id, is_correct } = body;

    const answers = (await kv.get(getAnswersKey(code))) || [];
    const ans = answers.find((a: any) => a.question_id === question_id && a.participant_id === participant_id);
    if (ans) {
        ans.is_correct = is_correct;
        await kv.set(getAnswersKey(code), answers);
    }
    return c.json({ success: true });
});

// 9. Upload File (Proxy)
app.post("/make-server-cbaebbc3/upload", async (c) => {
    try {
        const body = await c.req.parseBody();
        const file = body['file'];

        if (!file) {
             return c.json({ error: "No file received" }, 400);
        }
        
        // Handle if file is string (shouldn't be if FormData used correctly)
        if (typeof file === 'string') {
             return c.json({ error: "File upload failed (received string)" }, 400);
        }

        const path = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const fileContent = await file.arrayBuffer();
        
        // Upload using Service Role (bypasses RLS)
        const { error } = await supabase.storage.from(BUCKET_NAME).upload(path, fileContent, {
            contentType: file.type,
            upsert: true
        });

        if (error) {
            console.error("Upload error:", error);
            throw error;
        }
        
        const { data: { publicUrl } } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);
        
        return c.json({ publicUrl });
    } catch (e: any) {
        console.error("Server upload error:", e);
        return c.json({ error: e.message }, 500);
    }
});

Deno.serve(app.fetch);