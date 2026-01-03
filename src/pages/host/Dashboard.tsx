
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuizState } from '../../hooks/useQuizState';
import { api } from '../../utils/api';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription} from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Separator } from '../../components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../../components/ui/accordion';
import { toast } from 'sonner';
import { Check, X, ArrowRight, ArrowLeft, Trophy, Users, Eye, Loader2, Plus, Trash2, Edit } from 'lucide-react';
import { HostBlockEditor } from '../../components/HostBlockEditor';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";

// Component to handle conditional text alignment and dynamic font sizing
const QuestionTextDisplay = ({ text }: { text: string }) => {
    const textRef = useRef<HTMLParagraphElement>(null);
    const [isMultiLine, setIsMultiLine] = useState(false);

    // Calculate font size based on text length
    const fontSizeClass = useMemo(() => {
        const length = text.length;
        if (length <= 50) {
            return 'text-4xl md:text-5xl'; // Very short - largest
        } else if (length <= 100) {
            return 'text-3xl md:text-4xl'; // Short - large
        } else if (length <= 150) {
            return 'text-2xl md:text-3xl'; // Medium - medium-large
        } else {
            return 'text-xl md:text-2xl'; // Long - smaller
        }
    }, [text]);

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
        <p 
            ref={textRef}
            className={`${fontSizeClass} font-light leading-tight text-slate-900 mb-8 ${isMultiLine ? 'text-left' : 'text-center'}`}
        >
            {text}
        </p>
    );
};

export const HostDashboard = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { state, loading, error, refresh } = useQuizState(code || '');
  const [isRevealed, setIsRevealed] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showFinishConfirmation, setShowFinishConfirmation] = useState(false);
  const [shuffleBlocksOnStart, setShuffleBlocksOnStart] = useState(true);
  const [pendingGrades, setPendingGrades] = useState<Record<string, boolean>>({});
  const [editingHostBlockId, setEditingHostBlockId] = useState<string | null>(null);
  const [creatingHostBlock, setCreatingHostBlock] = useState(false);

  // Reset revealed state when question changes
  useEffect(() => {
      setIsRevealed(false);
  }, [state?.currentQuestion?.id, state?.quiz.phase]);
  
  if (loading) return <div className="p-8 text-center flex justify-center"><Loader2 className="animate-spin" /> Loading quiz data...</div>;
  if (error || !state) return <div className="p-8 text-center text-red-500">Error: {error}</div>;

  const { quiz, participants, blocks, answers, questions, currentBlock, currentQuestion, guesses } = state;

  const handleAction = async (action: string, payload?: any) => {
    setActionLoading(true);
    try {
      await api.performAction(code!, action, payload);
      await refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitGrades = async () => {
    const entries = Object.entries(pendingGrades) as [string, boolean][];
    if (entries.length === 0) return;
    setActionLoading(true);
    try {
      for (const [key, value] of entries) {
        const [questionId, participantId] = key.split(':');
        await api.gradeAnswer(code!, questionId, participantId, value);
      }
      setPendingGrades({});
      await refresh();
      toast.success('Grades submitted');
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit grades');
    } finally {
      setActionLoading(false);
    }
  };

  const copyLink = () => {
    const url = `${window.location.origin}/join`; 
    const text = `Join at ${url} with code ${quiz.code}`;
    
    navigator.clipboard.writeText(text)
      .then(() => toast.success("Copied to clipboard"))
      .catch((err) => {
        console.error("Clipboard failed", err);
        toast.error("Clipboard blocked. Share Code: " + quiz.code);
      });
  };

  // Stats Calculation for Finish Dialog
  const totalQuestions = Object.values(questions).reduce((acc: number, qs: any) => acc + qs.length, 0);
  const totalAnswers = answers.length;
  const expectedAnswers = totalQuestions * participants.length;
  const progressPercent = Math.round((totalAnswers / (expectedAnswers || 1)) * 100);

  // --- VIEWS ---

  // 1. LOBBY
  if (quiz.status === 'CREATION') {
    const readyCount = participants.filter(p => {
       const userBlock = blocks.find(b => b.author_participant_id === p.id);
       if (!userBlock) return false;
       const qs = questions[userBlock.id] || [];
       return qs.length >= quiz.max_questions_per_player; 
    }).length;

    const totalQuestions = Object.values(questions).reduce(
      (acc: number, qs: any) => acc + (Array.isArray(qs) ? qs.length : 0),
      0
    );
    const hasAnyQuestions = totalQuestions > 0;

    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 space-y-12 animate-in fade-in duration-500">
        <div className="text-center space-y-4">
          <h1 className="text-6xl font-light tracking-tighter text-slate-900">{quiz.name}</h1>
          <div className="inline-flex items-center gap-4 bg-slate-100 px-8 py-4 rounded-2xl border border-slate-200 shadow-sm">
             <span className="text-slate-500 font-medium uppercase tracking-widest text-sm">Join Code</span>
             <span className="text-4xl font-mono font-bold text-slate-800 tracking-wider">{quiz.code}</span>
             <Button variant="ghost" size="icon" onClick={copyLink} className="ml-2 hover:bg-white rounded-full">
                 <Check className="w-4 h-4" />
             </Button>
          </div>
        </div>

        <div className="w-full max-w-4xl space-y-6">
             {/* Host Question Blocks Section */}
             <div className="space-y-4">
               <div className="flex justify-between items-center border-b border-slate-200 pb-4">
                 <h2 className="text-xl font-medium text-slate-600">Host Question Blocks</h2>
                 {!editingHostBlockId && !creatingHostBlock && (
                   <Button onClick={() => setCreatingHostBlock(true)} variant="outline" size="sm">
                     <Plus className="h-4 w-4 mr-2" />
                     Create New Block
                   </Button>
                 )}
               </div>
               
               {editingHostBlockId || creatingHostBlock ? (
                 <HostBlockEditor
                   code={code!}
                   blockId={editingHostBlockId}
                   existingBlock={editingHostBlockId ? blocks.find(b => b.id === editingHostBlockId) : undefined}
                   existingQuestions={editingHostBlockId ? (questions[editingHostBlockId] || []) : []}
                   onSave={() => {
                     setEditingHostBlockId(null);
                     setCreatingHostBlock(false);
                     refresh();
                   }}
                   onCancel={() => {
                     setEditingHostBlockId(null);
                     setCreatingHostBlock(false);
                   }}
                 />
               ) : (
                 <div className="space-y-3">
                   {blocks
                     .filter((b: any) => b.author_type === 'host' || (!b.author_participant_id && b.author_type !== 'player'))
                     .map((block: any) => {
                       const blockQuestions = questions[block.id] || [];
                       return (
                         <Card key={block.id}>
                           <CardHeader>
                             <div className="flex items-center justify-between">
                               <div>
                                 <CardTitle>{block.title}</CardTitle>
                                 <CardDescription>
                                   {blockQuestions.length} {blockQuestions.length === 1 ? 'question' : 'questions'}
                                 </CardDescription>
                               </div>
                               <div className="flex gap-2">
                                 <Button
                                   variant="outline"
                                   size="sm"
                                   onClick={() => setEditingHostBlockId(block.id)}
                                 >
                                   <Edit className="h-4 w-4 mr-2" />
                                   Edit
                                 </Button>
                                 <Button
                                   variant="outline"
                                   size="sm"
                                   onClick={async () => {
                                     if (confirm(`Delete block "${block.title}"? This cannot be undone.`)) {
                                       try {
                                         // For now, we'll need to implement delete on server
                                         // For now, just show error
                                         toast.error('Delete functionality coming soon');
                                       } catch (e: any) {
                                         toast.error(e.message);
                                       }
                                     }
                                   }}
                                   className="text-destructive hover:text-destructive"
                                 >
                                   <Trash2 className="h-4 w-4" />
                                 </Button>
                               </div>
                             </div>
                           </CardHeader>
                         </Card>
                       );
                     })}
                   {blocks.filter((b: any) => b.author_type === 'host' || (!b.author_participant_id && b.author_type !== 'player')).length === 0 && (
                     <p className="text-sm text-slate-500 text-center py-8">No host blocks yet. Create one to add questions before players join.</p>
                   )}
                 </div>
               )}
             </div>

             <Separator />

             <div className="flex justify-between items-end border-b border-slate-200 pb-4">
                 <h2 className="text-xl font-medium text-slate-600">
                     Participants <span className="text-slate-400">({participants.length})</span>
                 </h2>
                 <div className="text-sm text-slate-400">
                     Waiting for players to join...
                 </div>
             </div>
             
             <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                 {participants.map(p => {
                    const block = blocks.find(b => b.author_participant_id === p.id);
                    const qCount = block ? (questions[block.id] || []).length : 0;
                    const isReady = qCount > 0;
                    return (
                        <div key={p.id} className={`
                            group flex items-center justify-between p-4 rounded-xl border transition-all duration-300
                            ${isReady ? 'bg-green-50 border-green-200 shadow-sm' : 'bg-white border-slate-100 hover:border-slate-300'}
                        `}>
                            <div className="flex flex-col">
                                <span className={`font-bold ${isReady ? 'text-green-800' : 'text-slate-700'}`}>{p.display_name}</span>
                                <span className="text-xs text-slate-400">{qCount} Questions Added</span>
                            </div>
                            {isReady && (
                                <div className="bg-green-200 text-green-700 rounded-full p-1">
                                    <Check className="w-3 h-3" />
                                </div>
                            )}
                        </div>
                    );
                 })}
                 
                 {/* Empty States for visuals */}
                 {Array.from({ length: Math.max(0, 4 - participants.length) }).map((_, i) => (
                     <div key={`empty-${i}`} className="border-2 border-dashed border-slate-100 rounded-xl p-4 flex items-center justify-center text-slate-200 font-medium select-none">
                         ...
                     </div>
                 ))}
             </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 p-6 bg-white/80 backdrop-blur-sm border-t border-slate-100 flex flex-col gap-3 items-center">
            <div className="flex items-center gap-2 text-sm text-slate-500 w-full max-w-md">
              <input
                id="shuffle-blocks"
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                checked={shuffleBlocksOnStart}
                onChange={(e) => setShuffleBlocksOnStart(e.target.checked)}
              />
              <label htmlFor="shuffle-blocks" className="cursor-pointer">
                Shuffle block order when starting
              </label>
            </div>
            <Button 
              size="lg"
              className="w-full max-w-md h-14 text-lg shadow-xl shadow-blue-100 hover:shadow-blue-200 transition-all" 
              onClick={() => handleAction('START_GAME', { shuffleBlocks: shuffleBlocksOnStart })}
              disabled={participants.length === 0 || !hasAnyQuestions || actionLoading}
            >
              {actionLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
              Lock Quiz & Start Playing
            </Button>
        </div>
      </div>
    );
  }

  // 2. FINISHED
  if (quiz.status === 'FINISHED') {
    // ⚡ Bolt: Memoize expensive calculations for the results screen.
    // These stats are derived from the full quiz data, which can be large.
    // useMemo ensures we only re-calculate them when the underlying data changes,
    // preventing sluggish UI re-renders on the "FINISHED" screen.
    const scores = useMemo(() => {
        return participants.map(p => {
            const myBlock = blocks.find(b => b.author_participant_id === p.id);
            const myQuestions = myBlock ? questions[myBlock.id] || [] : [];
            const myQuestionIds = new Set(myQuestions.map(q => q.id));

            const allQuestions = (Object.values(questions) as any[][]).flat();
            const questionsToAnswerCount = allQuestions.length;

            const qPoints = answers.filter(a => a.participant_id === p.id && a.is_correct).length;

            const blocksToGuessCount = blocks.length;
            const gPoints = guesses.filter(g => g.guesser_participant_id === p.id && g.is_correct).length;

            return {
                ...p,
                score: qPoints + gPoints,
                qPoints,
                maxQPoints: questionsToAnswerCount,
                gPoints,
                maxGPoints: blocksToGuessCount
            };
        }).sort((a, b) => b.score - a.score);
    }, [participants, blocks, questions, answers, guesses]);

    // ⚡ Bolt: Memoize block accuracy stats.
    const blockStats = useMemo(() => {
        return blocks.map(b => {
            const bQs = questions[b.id] || [];
            const bQIds = new Set(bQs.map(q => q.id));
            const bAnswers = answers.filter(a => bQIds.has(a.question_id));
            const correct = bAnswers.filter(a => a.is_correct).length;
            const total = bAnswers.length;
            const accuracy = total > 0 ? (correct / total) : 0;
            return { ...b, accuracy };
        });
    }, [blocks, questions, answers]);

    const hardestBlock = useMemo(() =>
        [...blockStats].sort((a, b) => a.accuracy - b.accuracy)[0],
        [blockStats]
    );
    const easiestBlock = useMemo(() =>
        [...blockStats].sort((a, b) => b.accuracy - a.accuracy)[0],
        [blockStats]
    );

    const top3 = scores.slice(0, 3);

    return (
      <div className="p-8 space-y-12 max-w-7xl mx-auto w-full animate-in fade-in duration-500">
        
        {/* Header */}
        <div className="text-center space-y-2">
            <h1 className="text-4xl font-light tracking-tight text-slate-800">Quiz Complete</h1>
            <p className="text-slate-500">The results are in!</p>
        </div>

        {/* Podium */}
        <div className="flex justify-center items-end gap-4 h-64 mb-12">
            {/* 2nd Place */}
            {top3[1] && (
                <div className="flex flex-col items-center gap-2 w-1/4 animate-in slide-in-from-bottom-10 delay-100 duration-700">
                    <div className="font-bold text-slate-600 text-center text-sm md:text-base truncate w-full">{top3[1].display_name}</div>
                    <div className="w-full bg-slate-300 h-32 rounded-t-lg shadow-md flex items-start justify-center pt-4 relative">
                        <span className="text-4xl font-black text-white/50">2</span>
                        <Badge className="absolute -top-3 bg-slate-500 hover:bg-slate-500 text-white border-none">{top3[1].score} pts</Badge>
                    </div>
                </div>
            )}
            
            {/* 1st Place */}
            {top3[0] && (
                <div className="flex flex-col items-center gap-2 w-1/3 z-10 animate-in slide-in-from-bottom-20 duration-700">
                    <Trophy className="w-8 h-8 text-yellow-500 mb-1" />
                    <div className="font-bold text-slate-800 text-center text-lg md:text-xl truncate w-full">{top3[0].display_name}</div>
                    <div className="w-full bg-gradient-to-b from-yellow-300 to-yellow-400 h-48 rounded-t-lg shadow-xl flex items-start justify-center pt-4 relative">
                         <span className="text-6xl font-black text-white/50">1</span>
                         <Badge className="absolute -top-3 bg-yellow-600 hover:bg-yellow-600 text-white border-none text-lg px-4 py-1">{top3[0].score} pts</Badge>
                    </div>
                </div>
            )}

            {/* 3rd Place */}
            {top3[2] && (
                <div className="flex flex-col items-center gap-2 w-1/4 animate-in slide-in-from-bottom-10 delay-200 duration-700">
                    <div className="font-bold text-slate-600 text-center text-sm md:text-base truncate w-full">{top3[2].display_name}</div>
                    <div className="w-full bg-orange-200 h-24 rounded-t-lg shadow-md flex items-start justify-center pt-4 relative">
                        <span className="text-4xl font-black text-white/50">3</span>
                        <Badge className="absolute -top-3 bg-orange-400 hover:bg-orange-400 text-white border-none">{top3[2].score} pts</Badge>
                    </div>
                </div>
            )}
        </div>

        {/* Detailed Scores List */}
        <Card className="border-0 shadow-lg bg-white overflow-hidden">
            <CardHeader className="bg-slate-50 border-b">
                <CardTitle className="flex items-center gap-2 text-slate-700">
                    <Users className="w-5 h-5" /> Full Leaderboard
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                {scores.map((p, idx) => (
                    <div key={p.id} className={`flex items-center justify-between p-4 border-b last:border-0 hover:bg-slate-50 transition-colors ${idx < 3 ? 'bg-yellow-50/30' : ''}`}>
                        <div className="flex items-center gap-6">
                            <span className={`font-mono font-bold w-6 text-right ${idx < 3 ? 'text-yellow-600 text-xl' : 'text-slate-400'}`}>
                                {idx + 1}
                            </span>
                            <div>
                                <p className="font-bold text-slate-800 text-lg">{p.display_name}</p>
                                <div className="flex gap-4 text-xs text-slate-500 uppercase tracking-wider font-medium mt-1">
                                    <span>Questions ({p.qPoints}/{p.maxQPoints})</span>
                                    <span>•</span>
                                    <span>Authors ({p.gPoints}/{p.maxGPoints})</span>
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                             <div className="text-2xl font-black text-slate-800">{p.score}</div>
                             <div className="text-xs text-slate-400 font-medium uppercase">Total Points</div>
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             {hardestBlock && (
                 <Card className="bg-red-50 border-red-100">
                     <CardHeader className="pb-2">
                         <CardTitle className="text-red-900 text-sm uppercase tracking-widest">Most Difficult Round</CardTitle>
                     </CardHeader>
                     <CardContent>
                         <div className="text-2xl font-bold text-red-800">{hardestBlock.title}</div>
                         <p className="text-red-600 mt-1">Only {Math.round(hardestBlock.accuracy * 100)}% correct answers</p>
                     </CardContent>
                 </Card>
             )}
             
             {easiestBlock && (
                 <Card className="bg-green-50 border-green-100">
                     <CardHeader className="pb-2">
                         <CardTitle className="text-green-900 text-sm uppercase tracking-widest">Easiest Round</CardTitle>
                     </CardHeader>
                     <CardContent>
                         <div className="text-2xl font-bold text-green-800">{easiestBlock.title}</div>
                         <p className="text-green-600 mt-1">{Math.round(easiestBlock.accuracy * 100)}% correct answers</p>
                     </CardContent>
                 </Card>
             )}
        </div>

        {/* Question-by-Question Results */}
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-semibold mb-1">Question Breakdown</h2>
                <p className="text-sm text-muted-foreground">See how each participant answered every question</p>
            </div>
                    {blocks.map((block) => {
                        const blockQuestions = questions[block.id] || [];
                        if (blockQuestions.length === 0) return null;
                        
                        const blockAuthor = participants.find(p => p.id === block.author_participant_id);
                        
                        return (
                            <Card key={block.id} className="overflow-hidden">
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-1">
                                            <CardTitle>{block.title}</CardTitle>
                                            <CardDescription>
                                                Created by {blockAuthor?.display_name || 'Unknown'} • {blockQuestions.length} {blockQuestions.length === 1 ? 'question' : 'questions'}
                                            </CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <Accordion type="multiple" className="w-full">
                                        {blockQuestions
                                            .sort((a, b) => a.index_in_block - b.index_in_block)
                                            .map((question) => {
                                                const questionAnswers = answers.filter(a => a.question_id === question.id);
                                                const correctAnswers = questionAnswers.filter(a => a.is_correct === true);
                                                const wrongAnswers = questionAnswers.filter(a => a.is_correct === false);
                                                
                                                return (
                                                    <AccordionItem key={question.id} value={question.id} className="data-[state=open]:border-2 data-[state=open]:border-border data-[state=open]:border-b-4 data-[state=open]:border-b-muted-foreground data-[state=open]:rounded-lg data-[state=open]:p-1">
                                                        <AccordionTrigger className="hover:no-underline items-center">
                                                            <div className="flex items-center gap-3 text-left flex-1">
                                                                <Badge variant="outline" className="w-8 h-8 rounded-full p-0 flex items-center justify-center">
                                                                    {question.index_in_block + 1}
                                                                </Badge>
                                                                <div className="flex-1">
                                                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                                        <span className="font-semibold">{question.text}</span>
                                                                        <Badge variant="secondary" className="text-xs">
                                                                            {question.type === 'mcq' ? 'Multiple choice' : 'Open answer'}
                                                                        </Badge>
                                                                    </div>
                                                                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                                                        <span className="flex items-center gap-1">
                                                                            <Check className="w-3 h-3 text-green-600" />
                                                                            {correctAnswers.length} correct
                                                                        </span>
                                                                        <span className="flex items-center gap-1">
                                                                            <X className="w-3 h-3 text-red-600" />
                                                                            {wrongAnswers.length} wrong
                                                                        </span>
                                                                        <span>{questionAnswers.length}/{participants.length} answered</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </AccordionTrigger>
                                                        <AccordionContent>
                                                            <div className="space-y-4 pt-2">
                                                                {question.type === 'mcq' && question.options && (
                                                                    <div>
                                                                        <div className="flex items-center justify-between mb-2">
                                                                            <p className="text-xs font-medium text-muted-foreground">Options:</p>
                                                                            {question.correct_answer && (() => {
                                                                                const correctIdx = question.options.findIndex(opt => opt === question.correct_answer);
                                                                                const correctLetter = correctIdx >= 0 ? String.fromCharCode(65 + correctIdx) : '';
                                                                                return correctLetter ? (
                                                                                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
                                                                                        Correct: {correctLetter}
                                                                                    </Badge>
                                                                                ) : null;
                                                                            })()}
                                                                        </div>
                                                                        <div className="space-y-2">
                                                                            {question.options.map((opt, idx) => {
                                                                                const isCorrect = opt === question.correct_answer;
                                                                                return (
                                                                                    <div 
                                                                                        key={idx}
                                                                                        className={`flex items-start gap-2 p-2 rounded-md border ${
                                                                                            isCorrect 
                                                                                                ? 'bg-green-50 border-green-200' 
                                                                                                : 'bg-slate-50 border-slate-200'
                                                                                        }`}
                                                                                    >
                                                                                        <span className={`font-semibold text-sm min-w-6 ${
                                                                                            isCorrect ? 'text-green-700' : 'text-slate-600'
                                                                                        }`}>
                                                                                            {String.fromCharCode(65 + idx)}.
                                                                                        </span>
                                                                                        <span className={`text-sm flex-1 break-words ${
                                                                                            isCorrect ? 'text-green-800 font-medium' : 'text-slate-700'
                                                                                        }`}>
                                                                                            {opt}
                                                                                        </span>
                                                                                        {isCorrect && (
                                                                                            <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                                                                                        )}
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                
                                                                {question.type === 'open' && question.correct_answer && (
                                                                    <div>
                                                                        <p className="text-xs font-medium text-muted-foreground mb-2">Expected answer:</p>
                                                                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-sm px-3 py-1.5">
                                                                            {question.correct_answer}
                                                                        </Badge>
                                                                    </div>
                                                                )}
                                                                
                                                                <Separator />
                                                                
                                                                <div>
                                                                    <p className="text-xs font-medium text-muted-foreground mb-3">Participant Answers</p>
                                                                    <Table>
                                                                        <TableHeader>
                                                                            <TableRow>
                                                                                <TableHead className="w-48">Participant</TableHead>
                                                                                <TableHead>Answer</TableHead>
                                                                                <TableHead className="w-24 text-right">Status</TableHead>
                                                                            </TableRow>
                                                                        </TableHeader>
                                                                        <TableBody>
                                                                            {participants.map((participant, idx) => {
                                                                                const answer = questionAnswers.find(a => a.participant_id === participant.id);
                                                                                const isAuthor = participant.id === block.author_participant_id;
                                                                                const isCorrect = answer?.is_correct === true;
                                                                                const isWrong = answer?.is_correct === false;
                                                                                const isLast = idx === participants.length - 1;
                                                                                
                                                                                return (
                                                                                    <TableRow key={participant.id} className={isLast ? "border-b-0" : ""}>
                                                                                        <TableCell className="w-48">
                                                                                            <div className="flex items-center gap-2 min-w-0">
                                                                                                <span className="font-medium truncate">{participant.display_name}</span>
                                                                                                {isAuthor && (
                                                                                                    <Badge variant="outline" className="text-xs flex-shrink-0">Author</Badge>
                                                                                                )}
                                                                                            </div>
                                                                                        </TableCell>
                                                                                        <TableCell>
                                                                                            {answer ? (
                                                                                                <span className={isCorrect ? "text-green-700" : isWrong ? "text-red-700" : "text-muted-foreground"}>
                                                                                                    {answer.answer_text}
                                                                                                </span>
                                                                                            ) : (
                                                                                                <span className="text-muted-foreground italic text-sm">No answer</span>
                                                                                            )}
                                                                                        </TableCell>
                                                                                        <TableCell className="text-right">
                                                                                            {answer && (
                                                                                                <Badge 
                                                                                                    variant={isCorrect ? "default" : "destructive"}
                                                                                                    className="gap-1"
                                                                                                >
                                                                                                    {isCorrect ? (
                                                                                                        <>
                                                                                                            <Check className="w-3 h-3" />
                                                                                                            Correct
                                                                                                        </>
                                                                                                    ) : (
                                                                                                        <>
                                                                                                            <X className="w-3 h-3" />
                                                                                                            Wrong
                                                                                                        </>
                                                                    )}
                                                                                                </Badge>
                                                                                            )}
                                                                                        </TableCell>
                                                                                    </TableRow>
                                                                                );
                                                                            })}
                                                                        </TableBody>
                                                                    </Table>
                                                                </div>
                                                            </div>
                                                        </AccordionContent>
                                                    </AccordionItem>
                                                );
                                            })}
                                    </Accordion>
                                </CardContent>
                            </Card>
                        );
                    })}
        </div>

        {/* Actions */}
        <div className="flex gap-4 pt-8">
             <Button onClick={() => navigate('/host')} variant="outline" size="lg" className="flex-1 h-12 text-base">
                 Create New Game
             </Button>
             <Button onClick={() => handleAction('RESTART_GAME')} size="lg" className="flex-1 h-12 text-base">
                 Restart This Game
             </Button>
        </div>
      </div>
    );
  }

  // 3. PLAYING
  const phaseLabel = quiz.phase === 'QUESTION' ? 'Question Phase' : 
                     quiz.phase === 'AUTHOR_GUESS' ? 'Guess Phase' : 'Reveal Phase';

  if (!currentBlock && quiz.status !== 'FINISHED') {
      return (
          <div className="flex items-center justify-center h-screen bg-slate-50">
               <div className="text-center space-y-4">
                   <Loader2 className="w-10 h-10 animate-spin text-slate-300 mx-auto" />
                   <h2 className="text-xl font-medium text-slate-600">Loading Game State...</h2>
               </div>
          </div>
      );
  }

  // Helper to change state securely
  const setState = async (updates: { phase?: string, current_question_id?: string | null, current_block_id?: string }) => {
      setActionLoading(true);
      try {
          await api.performAction(code!, 'SET_STATE', updates);
          await refresh();
      } catch (err: any) {
          toast.error(err.message);
      } finally {
          setActionLoading(false);
      }
  };

  const handleGrade = async (questionId: string, participantId: string, correct: boolean) => {
      setActionLoading(true);
      try {
          await api.gradeAnswer(code!, questionId, participantId, correct);
          await refresh();
      } catch (err: any) {
          toast.error(err.message);
      } finally {
          setActionLoading(false);
      }
  };

  const jumpToBlock = (blockId: string) => {
      const blockQs = questions[blockId] || [];
      setState({
          current_block_id: blockId,
          current_question_id: blockQs.length > 0 ? blockQs[0].id : null,
          phase: 'QUESTION'
      });
  };

  const currentBlockIdx = blocks.findIndex(b => b.id === currentBlock?.id);
  
  // Calculate navigation targets
  const blockQs = currentBlock ? (questions[currentBlock.id] || []) : [];
  const currentQIdx = blockQs.findIndex(q => q.id === currentQuestion?.id);

  const goBack = () => {
      // Logic for BACK button inside block
      if (quiz.phase === 'AUTHOR_REVEAL') {
          setState({ phase: 'AUTHOR_GUESS' });
          return;
      }
      if (quiz.phase === 'AUTHOR_GUESS') {
          // Go to last question
          if (blockQs.length > 0) {
              setState({ phase: 'QUESTION', current_question_id: blockQs[blockQs.length - 1].id });
          }
          return;
      }
      if (quiz.phase === 'QUESTION') {
          if (currentQIdx > 0) {
              // Go to prev question
              setState({ current_question_id: blockQs[currentQIdx - 1].id });
          } else {
             // First question. Do we allow going back to previous block?
             // User said "inside block i always want to have back and next buttons".
             // Maybe disable if at start of block? Or go to prev block?
             // Let's go to prev block's Reveal phase if it exists.
             if (currentBlockIdx > 0) {
                 const prevBlock = blocks[currentBlockIdx - 1];
                 setState({ 
                     current_block_id: prevBlock.id, 
                     current_question_id: null, // No active question in reveal
                     phase: 'AUTHOR_REVEAL' 
                 });
             }
          }
      }
  };

  const goNext = async () => {
       // Logic for NEXT button inside block
       if (quiz.phase === 'QUESTION') {
           if (currentQIdx < blockQs.length - 1) {
               setState({ current_question_id: blockQs[currentQIdx + 1].id });
           } else {
               // End of block - check if host block or if author guessing is disabled
               const isHostBlock = currentBlock && (currentBlock.author_type === 'host' || !currentBlock.author_participant_id);
               const shouldSkipGuessing = isHostBlock || !quiz.enable_author_guessing;
               
               if (shouldSkipGuessing) {
                   // Skip guess phase - go directly to next block
                   if (currentBlockIdx < blocks.length - 1) {
                       const nextBlock = blocks[currentBlockIdx + 1];
                       const nextQs = questions[nextBlock.id] || [];
                       setState({ 
                           current_block_id: nextBlock.id,
                           current_question_id: nextQs.length > 0 ? nextQs[0].id : null,
                           phase: 'QUESTION'
                       });
                   } else {
                       await handleAction('FINISH_GAME');
                   }
               } else {
                   // Player block with author guessing enabled -> Guess phase
                   setState({ phase: 'AUTHOR_GUESS', current_question_id: null });
               }
           }
           return;
       }
       if (quiz.phase === 'AUTHOR_GUESS') {
           setState({ phase: 'AUTHOR_REVEAL' });
           return;
       }
       if (quiz.phase === 'GRADING') {
           await handleSubmitGrades();
           await handleAction('FINISH_GAME');
           return;
       }
       if (quiz.phase === 'AUTHOR_REVEAL') {
           // Explicitly check if we are at the last block
           const isLastBlock = currentBlockIdx >= blocks.length - 1;
           
           if (!isLastBlock) {
               jumpToBlock(blocks[currentBlockIdx + 1].id);
           } else {
               // Finish confirmation
               setShowFinishConfirmation(true);
           }
       }
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-white">
      {/* Header with Block Navigation */}
      <div className="bg-white border-b shadow-sm z-10">
          <div className="p-4 flex justify-between items-center border-b max-w-7xl mx-auto w-full">
             <div className="flex items-center gap-2">
                 <Link to="/host" className="text-slate-500 hover:text-slate-800"><ArrowLeft className="w-4 h-4" /></Link>
                 <span className="font-mono text-sm text-slate-500">HOST VIEW</span>
                 <Badge variant="outline" className="ml-2">{phaseLabel}</Badge>
             </div>
             <div className="flex gap-2">
                 <Button 
                    variant="ghost" 
                    size="sm" 
                    disabled={currentBlockIdx <= 0 || actionLoading}
                    onClick={() => jumpToBlock(blocks[currentBlockIdx - 1].id)}
                 >
                     <ArrowLeft className="w-4 h-4 mr-1" /> Prev Block
                 </Button>
                 <Button 
                    variant="ghost" 
                    size="sm"
                    disabled={currentBlockIdx >= blocks.length - 1 || actionLoading}
                    onClick={() => jumpToBlock(blocks[currentBlockIdx + 1].id)}
                 >
                     Next Block <ArrowRight className="w-4 h-4 ml-1" />
                 </Button>
             </div>
          </div>
          
          {/* Scrollable Block List */}
          <div className="bg-slate-50 border-b">
              <div className="flex overflow-x-auto p-2 gap-2 scrollbar-hide max-w-7xl mx-auto">
                  {blocks.map((b, idx) => {
                      const isCurrent = b.id === currentBlock?.id;
                      const isPast = idx < currentBlockIdx;
                      return (
                          <button
                            key={b.id}
                            onClick={() => jumpToBlock(b.id)}
                            disabled={actionLoading}
                            className={`
                                flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all border
                                ${isCurrent ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'}
                                ${isPast ? 'opacity-60' : ''}
                            `}
                          >
                              <div className="flex items-center gap-2">
                                  {isPast && <Check className="w-3 h-3" />}
                                  <span className="whitespace-nowrap w-40 truncate">{b.title}</span>
                              </div>
                          </button>
                      );
                  })}
              </div>
          </div>
      </div>

      <div className="flex-1 overflow-auto bg-slate-50">
        <div className="p-4 space-y-8 max-w-7xl mx-auto w-full pt-8">
        {quiz.phase === 'QUESTION' && currentQuestion ? (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Question Card */}
                <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
                    <div className="bg-slate-50/50 border-b border-slate-100 p-6 flex justify-between items-center">
                         <div className="flex items-center gap-3 flex-1">
                             <span className="text-slate-700 text-base font-semibold">
                                 Question {currentQIdx + 1} of {currentBlock?.title || 'Block'}
                             </span>
                         </div>
                         <div className="flex items-center gap-2 ml-4">
                             <Button
                                 variant="outline"
                                 size="sm"
                                 onClick={goBack}
                                 disabled={actionLoading || (currentQIdx === 0)}
                                 className="bg-white hover:bg-slate-50"
                             >
                                 <ArrowLeft className="w-4 h-4" />
                             </Button>
                             <Button
                                 variant="outline"
                                 size="sm"
                                 onClick={() => goNext()}
                                 disabled={actionLoading}
                                 className="bg-white hover:bg-slate-50"
                             >
                                 <ArrowRight className="w-4 h-4" />
                             </Button>
                         </div>
                         {isRevealed && (
                             <Badge variant="secondary" className="text-base px-4 py-1 bg-green-100 text-green-700 hover:bg-green-100 ml-4">
                                 Answer: {currentQuestion.type === 'mcq' ? currentQuestion.correct_answer : 'Open Answer'}
                             </Badge>
                         )}
                    </div>
                    
                    <div className="p-6 text-center">
                        <QuestionTextDisplay text={currentQuestion.text} />
                        
                        {currentQuestion.image_url && (
                            <div className="w-full flex justify-center mb-6">
                                <div className="relative rounded-xl overflow-hidden shadow-lg border border-slate-100">
                                    <img src={currentQuestion.image_url} alt="Question" className="max-h-96 object-contain bg-slate-50" />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Answers Section */}
                <div className="space-y-4">
                    <div className="flex justify-between items-center px-2">
                        <div className="flex items-center gap-4">
                          <h3 className="font-medium text-slate-500 flex items-center gap-2">
                              <Users className="w-4 h-4" /> 
                              <span>{answers.filter(a => a.question_id === currentQuestion.id).length}</span>
                              <span className="text-slate-300">/</span>
                              <span>{participants.length}</span>
                              <span className="text-slate-400 text-sm ml-1">Answered</span>
                          </h3>
                          {!isRevealed && (
                              <Button size="sm" onClick={() => setIsRevealed(true)} variant="outline" className="bg-white hover:bg-slate-50 text-slate-600 border-slate-200">
                                  <Eye className="mr-2 w-4 h-4" /> Reveal Answers
                              </Button>
                          )}
                        </div>
                        <div />{/* spacer to keep layout symmetric */}
                    </div>
                    
                    {!isRevealed ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 md:gap-4 gap-4">
                            {participants.map(p => {
                                const hasAnswered = answers.some(a => a.question_id === currentQuestion!.id && a.participant_id === p.id);
                                return (
                                    <div key={p.id} className={`
                                        p-4 rounded-xl border flex items-center justify-between transition-all duration-300
                                        ${hasAnswered 
                                            ? 'bg-green-500 border-green-600 text-white shadow-md transform scale-105' 
                                            : 'bg-white border-slate-100 text-slate-400'}
                                    `}>
                                        <span className={`text-sm font-medium ${hasAnswered ? 'text-white' : ''}`}>{p.display_name}</span>
                                        {hasAnswered && <Check className="w-4 h-4 text-white" />}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {answers.filter(a => a.question_id === currentQuestion.id).map(ans => {
                                const p = participants.find(part => part.id === ans.participant_id);
                                return (
                                    <div key={ans.id} className="bg-white p-4 border border-slate-200 rounded-xl shadow-sm flex flex-col gap-2 relative overflow-hidden group hover:border-slate-300 transition-colors">
                                        <div className="flex justify-between items-start">
                                            <span className="font-bold text-slate-700">{p?.display_name}</span>
                                            {currentQuestion.type === 'mcq' && (
                                                <Badge variant={ans.is_correct ? "default" : "destructive"} className={ans.is_correct ? "bg-green-600 hover:bg-green-700" : ""}>
                                                    {ans.is_correct ? 'Correct' : 'Wrong'}
                                                </Badge>
                                            )}
                                        </div>
                                        
                                        <div className="text-slate-600 font-medium text-lg leading-snug break-words">
                                            {ans.answer_text}
                                        </div>

                                        {currentQuestion.type === 'open' && (
                                            <div className="flex gap-2 mt-2 pt-2 border-t border-slate-100">
                                                <Button 
                                                    size="sm" 
                                                    variant={ans.is_correct ? "default" : "outline"}
                                                    className={`flex-1 ${ans.is_correct ? 'bg-green-600 hover:bg-green-700' : 'hover:bg-green-50 hover:text-green-700 hover:border-green-200'}`}
                                                    onClick={() => handleGrade(currentQuestion.id, ans.participant_id, true)}
                                                    disabled={actionLoading}
                                                >
                                                    <Check className="w-4 h-4 mr-1" /> Correct
                                                </Button>
                                                <Button 
                                                    size="sm" 
                                                    variant={ans.is_correct === false ? "destructive" : "outline"}
                                                    className="flex-1"
                                                    onClick={() => handleGrade(currentQuestion.id, ans.participant_id, false)}
                                                    disabled={actionLoading}
                                                >
                                                    <X className="w-4 h-4 mr-1" /> Wrong
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        ) : quiz.phase === 'GRADING' ? (
            <div className="space-y-6 max-w-[1200px] mx-auto w-full animate-in fade-in duration-500">
                <div className="space-y-2">
                    <h2 className="text-2xl font-semibold text-slate-900">Grade open answers</h2>
                    <p className="text-sm text-slate-500">
                        Review free-text answers without seeing who wrote them. Select grades, then submit them all at once.
                    </p>
                </div>
                {(() => {
                    const openQuestionMap: Record<string, any> = {};
                    Object.values(questions).forEach((qs: any) => {
                        (qs || []).forEach((q: any) => {
                            if (q.type === 'open') openQuestionMap[q.id] = q;
                        });
                    });
                    const grouped: { question: any; answers: any[] }[] = [];
                    const byQ: Record<string, any[]> = {};
                    answers.forEach((ans: any) => {
                        if (!openQuestionMap[ans.question_id]) return;
                        if (!byQ[ans.question_id]) byQ[ans.question_id] = [];
                        byQ[ans.question_id].push(ans);
                    });
                    Object.entries(byQ).forEach(([qid, list]) => {
                        const q = openQuestionMap[qid];
                        grouped.push({ question: q, answers: list as any[] });
                    });
                    if (grouped.length === 0) {
                        return (
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-sm text-slate-500">
                                No open-answer responses to grade.
                            </div>
                        );
                    }
                    return (
                        <>
                          <div className="space-y-3">
                              {grouped.map((group, idx) => (
                                  <Card key={group.question.id}>
                                      <CardHeader className="space-y-2">
                                          <CardTitle className="text-base text-slate-800 flex items-center gap-2">
                                              <span className="inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-700 text-xs px-2 py-0.5">
                                                  Q{idx + 1}
                                              </span>
                                              {group.question.text}
                                          </CardTitle>
                                          <p className="text-xs text-slate-500">
                                              Expected answer: <span className="font-semibold text-slate-800">{group.question.correct_answer}</span>
                                          </p>
                                      </CardHeader>
                                      <CardContent className="space-y-3">
                                          {group.answers.map((ans, aIdx) => {
                                              const key = `${group.question.id}:${ans.participant_id}`;
                                              const override = key in pendingGrades ? pendingGrades[key] : undefined;
                                              const effective =
                                                override !== undefined ? override : ans.is_correct;
                                              const status =
                                                effective === true ? 'Correct' :
                                                effective === false ? 'Wrong' :
                                                'Pending';
                                              return (
                                                  <div
                                                    key={ans.id}
                                                    className="border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-4 bg-white"
                                                  >
                                                      <div className="min-w-0">
                                                          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                                                              <span>Answer {aIdx + 1}</span>
                                                              <span className={status === 'Correct' ? 'text-green-600 font-semibold' : status === 'Wrong' ? 'text-red-500 font-semibold' : 'text-slate-400'}>
                                                                  {status}
                                                              </span>
                                                          </div>
                                                          <div className="text-slate-700 text-sm font-medium break-words">
                                                              {ans.answer_text}
                                                          </div>
                                                      </div>
                                                      <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                                                          <Button 
                                                            size="sm" 
                                                            variant={effective === true ? "default" : "outline"}
                                                            className={effective === true ? 'bg-green-600 hover:bg-green-700' : 'hover:bg-green-50 hover:text-green-700 hover:border-green-200'}
                                                            onClick={() => {
                                                              const key = `${group.question.id}:${ans.participant_id}`;
                                                              setPendingGrades(prev => ({ ...prev, [key]: true }));
                                                            }}
                                                            disabled={actionLoading}
                                                          >
                                                              <Check className="w-4 h-4 mr-1" /> Correct
                                                          </Button>
                                                          <Button 
                                                            size="sm" 
                                                            variant={effective === false ? "destructive" : "outline"}
                                                            onClick={() => {
                                                              const key = `${group.question.id}:${ans.participant_id}`;
                                                              setPendingGrades(prev => ({ ...prev, [key]: false }));
                                                            }}
                                                            disabled={actionLoading}
                                                          >
                                                              <X className="w-4 h-4 mr-1" /> Wrong
                                                          </Button>
                                                      </div>
                                                  </div>
                                              );
                                          })}
                                      </CardContent>
                                  </Card>
                              ))}
                          </div>
                        </>
                    );
                })()}
            </div>
        ) : (quiz.phase === 'AUTHOR_GUESS' || quiz.phase === 'AUTHOR_REVEAL') && currentBlock && (currentBlock.author_type !== 'host' && currentBlock.author_participant_id) ? (
            /* STYLE_OVERRIDE: min-h-[500px] kept for visual balance in author reveal screen */
            <div className="flex flex-col items-center justify-center min-h-[500px] space-y-12 animate-in fade-in duration-700">
                 <div className="text-center space-y-4">
                    <span className="text-slate-400 uppercase tracking-widest font-semibold text-sm">Block Author Mystery</span>
                    <h2 className="text-5xl md:text-6xl font-black text-slate-800 tracking-tight leading-tight">
                        Who created <br/>
                        <span className="text-blue-600">"{currentBlock.title}"</span>?
                    </h2>
                 </div>

                 {quiz.phase === 'AUTHOR_REVEAL' ? (
                     <div className="relative animate-in zoom-in spin-in-3 duration-700">
                         <div className="absolute inset-0 bg-green-400 blur-3xl opacity-20 rounded-full"></div>
                         <div className="relative bg-white p-12 rounded-3xl shadow-2xl border-4 border-green-100 flex flex-col items-center gap-4 text-center min-w-xs">
                             <span className="text-slate-400 uppercase tracking-widest font-bold text-xs">The Author Is</span>
                             <h1 className="text-5xl font-black text-slate-800">
                                 {participants.find(p => p.id === currentBlock.author_participant_id)?.display_name}
                             </h1>
                             <div className="bg-green-100 text-green-800 px-4 py-1 rounded-full text-sm font-bold mt-2">
                                 Created this round
                             </div>
                         </div>
                     </div>
                 ) : (
                     <div className="w-full max-w-md bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
                        <div className="bg-slate-50 border-b border-slate-100 p-4">
                            <h3 className="text-sm uppercase text-slate-500 font-bold text-center">Live Guesses</h3>
                        </div>
                        <div className="max-h-72 overflow-auto p-4 space-y-2">
                            {(() => {
                                const blockGuesses = guesses.filter(g => g.block_id === currentBlock.id);
                                const guessedIds = new Set(blockGuesses.map(g => g.guesser_participant_id));

                                const guessed = participants
                                  .filter(p => guessedIds.has(p.id))
                                  .sort((a, b) => {
                                      const ia = blockGuesses.findIndex(g => g.guesser_participant_id === a.id);
                                      const ib = blockGuesses.findIndex(g => g.guesser_participant_id === b.id);
                                      return ia - ib;
                                  });
                                const notGuessed = participants.filter(p => !guessedIds.has(p.id));

                                const ordered = [...guessed, ...notGuessed];

                                return ordered.map(p => {
                                    const hasGuessed = guessedIds.has(p.id);
                                    return (
                                        <div
                                          key={p.id}
                                          className={`text-sm flex justify-between items-center p-3 rounded-lg animate-in slide-in-from-left-2 border
                                            ${
                                              hasGuessed
                                                ? 'bg-green-50 border-green-100'
                                                : 'bg-slate-50 border-slate-200'
                                            }`}
                                        >
                                            <span className="font-medium text-slate-700">{p.display_name}</span>
                                            <span
                                              className={`italic text-xs ${
                                                hasGuessed ? 'text-green-700' : 'text-slate-400'
                                              }`}
                                            >
                                                {hasGuessed ? 'has guessed' : 'has not guessed yet'}
                                            </span>
                                        </div>
                                    );
                                });
                            })()}
                            {participants.length === 0 && (
                                <div className="text-slate-400 text-center text-sm italic py-8 flex flex-col items-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin opacity-50" />
                                    Waiting for players...
                                </div>
                            )}
                        </div>
                     </div>
                 )}
            </div>
        ) : (
            <div className="text-center p-8">Loading state...</div>
        )}
        </div>
      </div>

      {/* Persistent Controls Footer - Hidden during QUESTION phase */}
      {quiz.phase !== 'QUESTION' && (
          <div className="border-t bg-white shadow-md z-20">
              <div className="p-4 max-w-7xl mx-auto flex justify-between gap-4">
                  <Button 
                    variant="outline" 
                    size="lg" 
                    className="flex-1" 
                    onClick={goBack}
                    disabled={actionLoading}
                  >
                      <ArrowLeft className="mr-2 w-5 h-5" /> Back
                  </Button>
                  
                  <Button 
                    variant="default" 
                    size="lg" 
                    className="flex-[2] text-lg" 
                    onClick={goNext}
                    disabled={actionLoading}
                  >
                      {actionLoading ? <Loader2 className="animate-spin mr-2" /> : null}
                      {quiz.phase === 'AUTHOR_GUESS' ? 'Reveal Author' :
                       quiz.phase === 'GRADING' ? 'Show Results' :
                       currentBlockIdx === blocks.length - 1 ? 'Finish Quiz' : 'Next Block'}
                      <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
              </div>
          </div>
      )}
      
      <AlertDialog open={showFinishConfirmation} onOpenChange={setShowFinishConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finish the Quiz?</AlertDialogTitle>
            <AlertDialogDescription>
                This was the last block. Are you sure you want to end the game?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="bg-slate-100 p-3 rounded-md text-sm space-y-1 my-2">
               <div className="flex justify-between">
                   <span>Blocks Completed:</span>
                   <span className="font-bold">{blocks.length}</span>
               </div>
               <div className="flex justify-between">
                   <span>Questions Answered:</span>
                   <span className="font-bold">{totalAnswers} / {expectedAnswers}</span>
               </div>
               <div className="flex justify-between">
                   <span>Completion Rate:</span>
                   <span className={`font-bold ${progressPercent === 100 ? 'text-green-600' : 'text-orange-500'}`}>
                       {progressPercent}%
                   </span>
               </div>
           </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={async () => {
                  setShowFinishConfirmation(false);
                  await setState({ phase: 'GRADING', current_question_id: null, current_block_id: currentBlock?.id });
              }}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Start Grading
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
