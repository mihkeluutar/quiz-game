import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Users, Play, ChevronRight, ChevronLeft, Trophy, Lock } from 'lucide-react';
import { Quiz, QuizParticipant, Block, Question, Answer, BlockGuess } from '../../types/schema';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../../../components/ui/accordion';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';

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

  const handlePrev = async () => {
      // Logic for previous
      if (!quiz.current_block_id) return;
      
      const currentBlock = blocks.find(b => b.id === quiz.current_block_id);
      if (!currentBlock) return;

      // Current Phase: Question or Guess?
      if (quiz.current_question_id) {
          // In Question Phase. Try to find previous question in this block.
          const blockQs = questions
            .filter(q => q.block_id === currentBlock.id)
            .sort((a, b) => a.index_in_block - b.index_in_block);
          
          const currentIndex = blockQs.findIndex(q => q.id === quiz.current_question_id);
          if (currentIndex > 0) {
              // Previous Question
              await supabase.from('quizzes').update({
                  current_question_id: blockQs[currentIndex - 1].id
              }).eq('id', quiz.id);
          } else {
              // First question - could go to previous block's last question or stay here
              // For now, stay at first question (button will be disabled)
              return;
          }
      } else {
          // In Author Guess Phase. Go back to last question of current block.
          const blockQs = questions
            .filter(q => q.block_id === currentBlock.id)
            .sort((a, b) => a.index_in_block - b.index_in_block);
          
          if (blockQs.length > 0) {
              await supabase.from('quizzes').update({
                  current_question_id: blockQs[blockQs.length - 1].id
              }).eq('id', quiz.id);
          }
      }
      
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
                onPrev={handlePrev}
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

// Component to handle conditional text alignment based on wrapping
const QuestionText = ({ text }: { text: string }) => {
    const textRef = useRef<HTMLDivElement>(null);
    const [isMultiLine, setIsMultiLine] = useState(false);

    useEffect(() => {
        const checkWrapping = () => {
            if (!textRef.current) return;
            
            const element = textRef.current;
            
            // Create a temporary span to measure single-line width
            const temp = document.createElement('span');
            const computedStyle = window.getComputedStyle(element);
            temp.style.visibility = 'hidden';
            temp.style.position = 'absolute';
            temp.style.whiteSpace = 'nowrap';
            temp.style.fontSize = computedStyle.fontSize;
            temp.style.fontWeight = computedStyle.fontWeight;
            temp.style.fontFamily = computedStyle.fontFamily;
            temp.style.letterSpacing = computedStyle.letterSpacing;
            temp.textContent = text;
            
            document.body.appendChild(temp);
            const singleLineWidth = temp.offsetWidth;
            document.body.removeChild(temp);
            
            // Compare to actual element width
            const elementWidth = element.offsetWidth;
            
            // If text width exceeds element width, it wraps (multi-line)
            setIsMultiLine(singleLineWidth > elementWidth);
        };

        // Use ResizeObserver for reliable detection
        let resizeObserver: ResizeObserver | null = null;
        if (textRef.current && typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(checkWrapping);
            resizeObserver.observe(textRef.current);
        }
        
        // Initial checks with multiple timeouts to catch different render phases
        const timeoutId1 = setTimeout(checkWrapping, 0);
        const timeoutId2 = setTimeout(checkWrapping, 50);
        const timeoutId3 = setTimeout(checkWrapping, 200);
        
        // Also check on window resize as fallback
        window.addEventListener('resize', checkWrapping);
        
        return () => {
            clearTimeout(timeoutId1);
            clearTimeout(timeoutId2);
            clearTimeout(timeoutId3);
            if (resizeObserver && textRef.current) {
                resizeObserver.unobserve(textRef.current);
            }
            window.removeEventListener('resize', checkWrapping);
        };
    }, [text]);

    return (
        <div 
            ref={textRef}
            className={`text-lg font-medium text-slate-900 mb-4 ${isMultiLine ? 'text-left' : 'text-center'}`}
        >
            {text}
        </div>
    );
};

function PlayView({ quiz, participants, blocks, questions, answers, guesses, onNext, onPrev }: any) {
    const currentBlock = blocks.find((b: any) => b.id === quiz.current_block_id);
    const currentQuestion = questions.find((q: any) => q.id === quiz.current_question_id);
    
    // Derived state
    const isAuthorGuessPhase = !currentQuestion && !!currentBlock;
    
    // Calculate question number within block
    const blockQuestions = questions
        .filter((q: any) => q.block_id === currentBlock?.id)
        .sort((a: any, b: any) => a.index_in_block - b.index_in_block);
    const questionNumber = currentQuestion 
        ? blockQuestions.findIndex((q: any) => q.id === currentQuestion.id) + 1
        : 0;
    
    // Check if prev/next buttons should be enabled
    const canGoPrev = currentQuestion && questionNumber > 1;
    const canGoNext = currentQuestion && questionNumber < blockQuestions.length;
    
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
                <div className="flex items-center justify-between">
                    <div className="flex-1">
                        {!isAuthorGuessPhase && currentQuestion && (
                            <CardTitle className="text-lg font-semibold">
                                Question {questionNumber} of {currentBlock?.title || 'Block'}
                            </CardTitle>
                        )}
                        {isAuthorGuessPhase && (
                            <CardTitle>
                                Guess the Author: "{currentBlock?.title}"
                            </CardTitle>
                        )}
                        {!isAuthorGuessPhase && !currentQuestion && (
                            <CardTitle>Loading...</CardTitle>
                        )}
                    </div>
                    {!isAuthorGuessPhase && currentQuestion && (
                        <div className="flex items-center gap-2 ml-4">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={onPrev}
                                disabled={!canGoPrev}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={onNext}
                                disabled={!canGoNext}
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    )}
                </div>
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
                         {currentQuestion?.text && (
                             <QuestionText text={currentQuestion.text} />
                         )}
                         
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
            {isAuthorGuessPhase && (
                <div className="p-4 border-t bg-slate-50 flex justify-end">
                    <Button size="lg" onClick={onNext}>
                        Next Step <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                </div>
            )}
        </Card>
    );
}

function FinishedView({ participants, answers, guesses, questions, blocks }: any) {
    const [selectedPlayerId, setSelectedPlayerId] = useState<string>('all');

    // Calculate scores
    const scores = useMemo(() => {
        return participants
            .map((p: any) => {
                const correctAnswers = answers.filter(
                    (a: any) => a.participant_id === p.id && a.is_correct
                ).length;

                const correctGuesses = guesses.filter(
                    (g: any) => g.guesser_participant_id === p.id && g.is_correct
                ).length;

                return {
                    ...p,
                    score: correctAnswers * 10 + correctGuesses * 5,
                    correctAnswers,
                    correctGuesses,
                };
            })
            .sort((a: any, b: any) => b.score - a.score);
    }, [participants, answers, guesses]);

    const blocksWithQuestions = useMemo(() => {
        const byBlock: Record<string, Question[]> = {};
        (questions || []).forEach((q: Question) => {
            if (!byBlock[q.block_id]) byBlock[q.block_id] = [];
            byBlock[q.block_id].push(q);
        });

        return (blocks || [])
            .map((b: Block) => ({
                ...b,
                questions: (byBlock[b.id] || []).slice().sort((a, bq) => a.index_in_block - bq.index_in_block),
            }))
            .filter((b: any) => b.questions.length > 0);
    }, [blocks, questions]);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center">
                    <Trophy className="mr-2 h-6 w-6 text-yellow-500" /> Final Scoreboard
                </CardTitle>
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
                                <TableCell className="text-right font-bold text-lg">
                                    {p.score}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>

                <div className="mt-8 border-t pt-6 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                            <p className="text-sm font-semibold text-slate-800">
                                Full quiz summary
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Explore performance per block and per question.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">View for</span>
                            <Select
                                value={selectedPlayerId}
                                onValueChange={(value) => setSelectedPlayerId(value)}
                            >
                                <SelectTrigger className="w-[200px] h-8 text-xs">
                                    <SelectValue placeholder="All players" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All players</SelectItem>
                                    {participants.map((p: any) => (
                                        <SelectItem key={p.id} value={p.id}>
                                            {p.display_name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <Accordion type="single" collapsible className="w-full space-y-2">
                        {blocksWithQuestions.map((block: any) => {
                            const questionIds = new Set(
                                block.questions.map((q: Question) => q.id)
                            );
                            const blockAnswers = answers.filter((a: Answer) =>
                                questionIds.has(a.question_id)
                            );
                            const correctInBlock = blockAnswers.filter(
                                (a: Answer) => a.is_correct
                            ).length;
                            const totalInBlock = blockAnswers.length;
                            const accuracy =
                                totalInBlock > 0
                                    ? Math.round((correctInBlock / totalInBlock) * 100)
                                    : null;

                            return (
                                <AccordionItem key={block.id} value={block.id}>
                                    <AccordionTrigger className="flex items-center justify-between gap-4">
                                        <div className="flex flex-col items-start text-left">
                                            <span className="text-sm font-medium text-slate-800">
                                                {block.title}
                                            </span>
                                            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                                {block.questions.length} questions
                                            </span>
                                        </div>
                                        {accuracy !== null && (
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-muted-foreground">
                                                    Correct answers
                                                </span>
                                                <Badge
                                                    variant="outline"
                                                    className={
                                                        accuracy >= 70
                                                            ? 'border-green-300 text-green-700 bg-green-50'
                                                            : accuracy <= 30
                                                            ? 'border-red-300 text-red-700 bg-red-50'
                                                            : ''
                                                    }
                                                >
                                                    {accuracy}%
                                                </Badge>
                                            </div>
                                        )}
                                    </AccordionTrigger>
                                    <AccordionContent>
                                        <div className="space-y-3 mt-2">
                                            {block.questions.map((q: Question, index: number) => {
                                                const qAnswers = answers.filter(
                                                    (a: Answer) => a.question_id === q.id
                                                );
                                                const qTotal = qAnswers.length;
                                                const qCorrect = qAnswers.filter(
                                                    (a: Answer) => a.is_correct
                                                ).length;

                                                let playerSummary: React.ReactElement | null = null;
                                                if (selectedPlayerId !== 'all') {
                                                    const player = participants.find(
                                                        (p: any) => p.id === selectedPlayerId
                                                    );
                                                    const playerAnswer = qAnswers.find(
                                                        (a: Answer) =>
                                                            a.participant_id === selectedPlayerId
                                                    );

                                                    let label = 'No answer';
                                                    let badgeClass =
                                                        'bg-slate-100 text-slate-700 border-slate-200';

                                                    if (playerAnswer) {
                                                        if (playerAnswer.is_correct) {
                                                            label = 'Correct';
                                                            badgeClass =
                                                                'bg-green-100 text-green-700 border-green-300';
                                                        } else if (playerAnswer.is_correct === false) {
                                                            label = 'Wrong';
                                                            badgeClass =
                                                                'bg-red-100 text-red-700 border-red-300';
                                                        } else {
                                                            label = 'Pending grade';
                                                        }
                                                    }

                                                    playerSummary = (
                                                        <span
                                                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${badgeClass}`}
                                                        >
                                                            {player?.display_name || 'Player'}: {label}
                                                        </span>
                                                    );
                                                }

                                                return (
                                                    <div
                                                        key={q.id}
                                                        className="rounded-lg border border-slate-200 bg-slate-50/60 p-3"
                                                    >
                                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                                            <div className="space-y-1">
                                                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[11px] font-semibold text-slate-700">
                                                                        {index + 1}
                                                                    </span>
                                                                    <span className="uppercase tracking-wide">
                                                                        {q.type === 'mcq'
                                                                            ? 'Multiple choice'
                                                                            : 'Open'}
                                                                    </span>
                                                                </div>
                                                                <p className="text-sm font-medium text-slate-900">
                                                                    {q.text}
                                                                </p>
                                                                {q.type === 'mcq' && (
                                                                    <p className="text-[11px] text-muted-foreground">
                                                                        Correct option:{' '}
                                                                        <span className="font-semibold">
                                                                            {q.correct_answer}
                                                                        </span>
                                                                    </p>
                                                                )}
                                                            </div>
                                                            <div className="flex flex-col items-end gap-1 text-right">
                                                                <span className="text-xs text-muted-foreground">
                                                                    {qCorrect}/{qTotal} correct
                                                                </span>
                                                                <span className="text-[11px] text-muted-foreground">
                                                                    {qTotal}/{participants.length}{' '}
                                                                    answered
                                                                </span>
                                                                {playerSummary}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            );
                        })}
                    </Accordion>
                </div>
            </CardContent>
        </Card>
    );
}
