import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { toast } from 'sonner@2.0.3';
import { Users, Play, ChevronRight, Trophy, Lock } from 'lucide-react';
import { Quiz, QuizParticipant, Block, Question, Answer, BlockGuess } from '../../types/schema';

export default function HostDashboard() {
  const { code } = useParams();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [participants, setParticipants] = useState<QuizParticipant[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [guesses, setGuesses] = useState<BlockGuess[]>([]);
  const [loading, setLoading] = useState(true);

  // Subscriptions
  useEffect(() => {
    if (!code) return;
    
    const fetchInitial = async () => {
      const { data: q } = await supabase.from('quizzes').select('*').eq('code', code).single();
      if (q) {
        setQuiz(q);
        const { data: p } = await supabase.from('quiz_participants').select('*').eq('quiz_id', q.id);
        setParticipants(p || []);
        const { data: b } = await supabase.from('blocks').select('*').eq('quiz_id', q.id);
        setBlocks(b || []);
        // Fetch all questions for this quiz's blocks
        if (b && b.length > 0) {
            const blockIds = b.map(x => x.id);
            const { data: qs } = await supabase.from('questions').select('*').in('block_id', blockIds);
            setQuestions(qs || []);
        }
        // Fetch answers/guesses
        const { data: ans } = await supabase.from('answers').select('*').eq('quiz_id', q.id);
        setAnswers(ans || []);
        const { data: g } = await supabase.from('block_guesses').select('*').eq('quiz_id', q.id);
        setGuesses(g || []);
      }
      setLoading(false);
    };

    fetchInitial();

    const channel = supabase.channel('host_game')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'quiz_participants' }, () => fetchInitial()) // Simple refresh
        .on('postgres_changes', { event: '*', schema: 'public', table: 'blocks' }, () => fetchInitial())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'questions' }, () => fetchInitial())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'answers' }, () => fetchInitial())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'block_guesses' }, () => fetchInitial())
        .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [code]);

  if (loading || !quiz) return <div className="p-8">Loading quiz...</div>;

  const handleStartGame = async () => {
    // 1. Lock blocks
    // 2. Set Order (random for now)
    // 3. Set Status PLAY
    // 4. Set first block/question
    
    const shuffledBlocks = [...blocks].sort(() => Math.random() - 0.5);
    // Update order
    for (let i = 0; i < shuffledBlocks.length; i++) {
        await supabase.from('blocks').update({ order_index: i, is_locked: true }).eq('id', shuffledBlocks[i].id);
    }
    
    const firstBlock = shuffledBlocks[0];
    // Find first question
    const firstQ = questions.find(q => q.block_id === firstBlock.id && q.index_in_block === 0); 
    // Assuming 0-based index. I should normalize this. I'll sort questions by index.
    
    // Sort questions for logic
    const blockQuestions = questions.filter(q => q.block_id === firstBlock.id).sort((a, b) => a.index_in_block - b.index_in_block);
    
    await supabase.from('quizzes').update({
        status: 'PLAY',
        current_block_id: firstBlock.id,
        current_question_id: blockQuestions[0]?.id || null
    }).eq('id', quiz.id);
    
    // Refresh local
    const { data: updated } = await supabase.from('quizzes').select('*').eq('id', quiz.id).single();
    if (updated) setQuiz(updated);
  };

  const handleNext = async () => {
      // Logic for next
      if (!quiz.current_block_id) return;
      
      const currentBlock = blocks.find(b => b.id === quiz.current_block_id);
      if (!currentBlock) return;

      // Current Phase: Question or Guess?
      if (quiz.current_question_id) {
          // In Question Phase. Try to find next question in this block.
          const blockQs = questions
            .filter(q => q.block_id === currentBlock.id)
            .sort((a, b) => a.index_in_block - b.index_in_block);
          
          const currentIndex = blockQs.findIndex(q => q.id === quiz.current_question_id);
          if (currentIndex < blockQs.length - 1) {
              // Next Question
              await supabase.from('quizzes').update({
                  current_question_id: blockQs[currentIndex + 1].id
              }).eq('id', quiz.id);
          } else {
              // End of questions -> Author Guess
              await supabase.from('quizzes').update({
                  current_question_id: null 
              }).eq('id', quiz.id);
          }
      } else {
          // In Author Guess Phase. Move to Next Block.
          const sortedBlocks = [...blocks].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
          const currentBlockIndex = sortedBlocks.findIndex(b => b.id === currentBlock.id);
          
          if (currentBlockIndex < sortedBlocks.length - 1) {
              const nextBlock = sortedBlocks[currentBlockIndex + 1];
              const nextBlockQs = questions
                .filter(q => q.block_id === nextBlock.id)
                .sort((a, b) => a.index_in_block - b.index_in_block);
              
              await supabase.from('quizzes').update({
                  current_block_id: nextBlock.id,
                  current_question_id: nextBlockQs[0]?.id || null // If no questions, will go straight to author guess? Loop?
              }).eq('id', quiz.id);
          } else {
              // Finish Quiz
              await supabase.from('quizzes').update({
                  status: 'FINISHED',
                  current_block_id: null,
                  current_question_id: null
              }).eq('id', quiz.id);
          }
      }
      
      const { data: updated } = await supabase.from('quizzes').select('*').eq('id', quiz.id).single();
      if (updated) setQuiz(updated);
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
            <div>
                <h1 className="text-2xl font-bold">{quiz.name}</h1>
                <p className="text-sm text-muted-foreground">Code: {quiz.code}</p>
            </div>
            <div className="space-x-2">
                <Badge variant={quiz.status === 'PLAY' ? "default" : "secondary"}>{quiz.status}</Badge>
            </div>
        </div>

        {quiz.status === 'CREATION' && (
            <CreationView 
                participants={participants} 
                blocks={blocks} 
                questions={questions}
                onStart={handleStartGame} 
            />
        )}

        {quiz.status === 'PLAY' && (
            <PlayView 
                quiz={quiz}
                participants={participants}
                blocks={blocks}
                questions={questions}
                answers={answers}
                guesses={guesses}
                onNext={handleNext}
            />
        )}

        {quiz.status === 'FINISHED' && (
            <FinishedView 
                participants={participants}
                answers={answers}
                guesses={guesses}
                questions={questions}
                blocks={blocks}
            />
        )}
      </div>
    </div>
  );
}

function CreationView({ participants, blocks, questions, onStart }: any) {
    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle>Lobby</CardTitle>
                    <CardDescription>{participants.length} players joined</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {participants.map((p: any) => {
                            const pBlock = blocks.find((b: any) => b.author_participant_id === p.id);
                            const qCount = pBlock ? questions.filter((q: any) => q.block_id === pBlock.id).length : 0;
                            return (
                                <div key={p.id} className="p-4 border rounded-lg bg-white flex flex-col items-center">
                                    <Users className="h-8 w-8 mb-2 text-slate-400" />
                                    <span className="font-medium">{p.display_name}</span>
                                    <span className="text-xs text-muted-foreground">{qCount} questions</span>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>
            <Button size="lg" className="w-full" onClick={onStart}>
                <Lock className="mr-2 h-4 w-4" /> Lock Quiz & Start Playing
            </Button>
        </div>
    );
}

function PlayView({ quiz, participants, blocks, questions, answers, guesses, onNext }: any) {
    const currentBlock = blocks.find((b: any) => b.id === quiz.current_block_id);
    const currentQuestion = questions.find((q: any) => q.id === quiz.current_question_id);
    
    // Derived state
    const isAuthorGuessPhase = !currentQuestion && !!currentBlock;
    
    // Answers for current question
    const currentAnswers = currentQuestion 
        ? answers.filter((a: any) => a.question_id === currentQuestion.id)
        : [];
        
    // Guesses for current block
    const currentGuesses = currentBlock
        ? guesses.filter((g: any) => g.block_id === currentBlock.id)
        : [];

    return (
        <Card className="min-h-[500px] flex flex-col">
            <CardHeader className="border-b">
                <CardTitle>
                    {isAuthorGuessPhase 
                        ? `Guess the Author: "${currentBlock?.title}"`
                        : `Question: ${currentQuestion?.text || 'Loading...'}`
                    }
                </CardTitle>
                <CardDescription>
                    Block: {currentBlock?.title}
                </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 p-6">
                {isAuthorGuessPhase ? (
                    <div className="space-y-6">
                        <div className="text-center p-8 bg-slate-50 rounded-xl">
                            <h3 className="text-xl font-medium mb-4">Who created this block?</h3>
                            <div className="text-3xl font-bold text-primary">
                                {currentGuesses.length} / {participants.length} guesses
                            </div>
                        </div>
                        {/* Reveal Logic could go here */}
                    </div>
                ) : (
                    <div className="space-y-6">
                         {currentQuestion?.image_url && (
                             <img src={currentQuestion.image_url} alt="Question" className="max-h-64 mx-auto rounded-lg object-contain" />
                         )}
                         
                         {currentQuestion?.type === 'mcq' && (
                             <div className="grid grid-cols-2 gap-4">
                                 {currentQuestion.options?.map((opt: string, i: number) => (
                                     <div key={i} className={`p-4 border rounded-lg ${currentQuestion.correct_answer === opt ? 'bg-green-100 border-green-500' : 'bg-slate-50'}`}>
                                         {opt}
                                     </div>
                                 ))}
                             </div>
                         )}
                         
                         <div className="p-4 bg-slate-100 rounded-lg">
                             <div className="flex justify-between items-center mb-2">
                                 <span className="font-medium">Answers Received</span>
                                 <span>{currentAnswers.length} / {participants.length}</span>
                             </div>
                             <div className="space-y-1">
                                 {currentAnswers.map((a: any) => {
                                     const p = participants.find((p: any) => p.id === a.participant_id);
                                     return (
                                         <div key={a.id} className="text-sm flex justify-between">
                                             <span>{p?.display_name}</span>
                                             {/* Host sees answers */}
                                             <span className="font-mono">{a.answer_text}</span>
                                         </div>
                                     );
                                 })}
                             </div>
                         </div>
                    </div>
                )}
            </CardContent>
            <div className="p-4 border-t bg-slate-50 flex justify-end">
                <Button size="lg" onClick={onNext}>
                    Next Step <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
            </div>
        </Card>
    );
}

function FinishedView({ participants, answers, guesses, questions, blocks }: any) {
    // Calculate scores
    const scores = useMemo(() => {
        return participants.map((p: any) => {
            // Question points
            const correctAnswers = answers.filter((a: any) => 
                a.participant_id === p.id && a.is_correct
                // Note: For open answers, is_correct might be null unless host marked it.
                // For MCQ, we auto-calc. 
                // Simple logic: if type=mcq and text=correct, or if is_correct=true
            ).length;

            // Guess points
            const correctGuesses = guesses.filter((g: any) => 
                g.guesser_participant_id === p.id && g.is_correct
            ).length;

            return {
                ...p,
                score: (correctAnswers * 10) + (correctGuesses * 5), // 10 pts per Q, 5 per guess
                correctAnswers,
                correctGuesses
            };
        }).sort((a: any, b: any) => b.score - a.score);
    }, [participants, answers, guesses]);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center"><Trophy className="mr-2 h-6 w-6 text-yellow-500" /> Final Scoreboard</CardTitle>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Rank</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Questions</TableHead>
                            <TableHead>Guesses</TableHead>
                            <TableHead className="text-right">Total Score</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {scores.map((p: any, i: number) => (
                            <TableRow key={p.id}>
                                <TableCell className="font-medium">#{i + 1}</TableCell>
                                <TableCell>{p.display_name}</TableCell>
                                <TableCell>{p.correctAnswers}</TableCell>
                                <TableCell>{p.correctGuesses}</TableCell>
                                <TableCell className="text-right font-bold text-lg">{p.score}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
