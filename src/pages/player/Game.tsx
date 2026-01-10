
import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuizState } from '../../hooks/useQuizState';
import { api } from '../../utils/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '../../components/ui/card';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { toast } from 'sonner';
import { Loader2, Image as ImageIcon, Send, CheckCircle2, X, Plus, Trash2 } from 'lucide-react';
import { Question, getMinQuestionsPerPlayer, getSuggestedQuestionsPerPlayer } from '../../types/quiz';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';

export const PlayerGame = () => {
  const { code } = useParams<{ code: string }>();
  // We need the token from localStorage
  const token = localStorage.getItem('player_token') || '';
  const { state, loading, error } = useQuizState(code || '', token);
  
  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;
  if (error || !state) return <div className="p-8 text-center text-destructive">{error || 'Game not found'}</div>;

  const { quiz, participants = [], blocks = [], currentBlock, currentQuestion, answers = [], guesses = [] } = state;
  const me = participants?.find(p => p.player_token === token);

  if (!me) return <div className="p-8">You are not part of this quiz. Please join again.</div>;

  // --- 1. CREATION MODE ---
  if (quiz.status === 'CREATION') {
    const myBlock = blocks?.find(b => b.author_participant_id === me.id);
    const myQuestions = (myBlock && state.questions && state.questions[myBlock.id]) || [];

    return <PlayerCreation 
      code={code!} 
      participantId={me.id} 
      existingBlock={myBlock}
      existingQuestions={myQuestions}
      quiz={quiz}
    />;
  }

  // --- 2. FINISHED MODE ---
  if (quiz.status === 'FINISHED') {
      return <PlayerFinished me={me} answers={answers} guesses={guesses} />;
  }

  // --- 3. PLAY MODE ---
  
  // Phase: AUTHOR_GUESS or AUTHOR_REVEAL (only for player blocks)
  if ((quiz.phase === 'AUTHOR_GUESS' || quiz.phase === 'AUTHOR_REVEAL') && currentBlock) {
      // Skip author guessing for host blocks
      const isHostBlock = currentBlock.author_type === 'host' || !currentBlock.author_participant_id;
      if (isHostBlock) {
          // Host blocks should never show author guessing - this shouldn't happen, but handle gracefully
          return <div className="p-8 text-center">Loading next question...</div>;
      }
      
      return (
          <PlayerAuthorGuess 
            code={code!} 
            me={me} 
            quiz={quiz} 
            currentBlock={currentBlock} 
            participants={participants} 
            guesses={guesses} 
          />
      );
  }

  // Phase: QUESTION
  if (quiz.phase === 'QUESTION') {
      return (
          <PlayerQuestion 
            code={code!}
            me={me}
            currentBlock={currentBlock}
            currentQuestion={currentQuestion}
            answers={answers}
          />
      );
  }

  // Fallback state if game is playing but data is loading or out of sync
  if (quiz.status === 'PLAY') {
       return (
          <div className="flex items-center justify-center h-screen p-6 text-center">
              <div className="space-y-4">
                  <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
                  <h2 className="text-xl font-semibold">Loading current round...</h2>
                  <p className="text-muted-foreground">Syncing with host...</p>
              </div>
          </div>
      );
  }

  return (
      <div className="flex items-center justify-center h-screen p-6 text-center">
          <div className="space-y-4">
              <Loader2 className="w-12 h-12 animate-spin mx-auto text-destructive" />
              <h2 className="text-xl font-semibold">Waiting for host...</h2>
              <p className="text-muted-foreground">Get ready for the next question!</p>
          </div>
      </div>
  );
};

// --- Sub-components to fix Hook Rules ---

const PlayerFinished = ({ me, answers, guesses }: any) => {
    const myQPoints = (answers || []).filter((a: any) => a.participant_id === me.id && a.is_correct).length;
    const myGPoints = (guesses || []).filter((g: any) => g.guesser_participant_id === me.id && g.is_correct).length;
    const total = myQPoints + myGPoints;

    return (
        <div className="p-6 space-y-8 text-center">
            <h1 className="text-3xl font-bold text-destructive">Quiz Finished!</h1>
            <Card>
                <CardHeader><CardTitle>Your Score</CardTitle></CardHeader>
                <CardContent className="text-5xl font-bold text-green-600">{total}</CardContent>
                <CardFooter className="flex justify-center text-sm text-muted-foreground">
                    Questions: {myQPoints} | Guesses: {myGPoints}
                </CardFooter>
            </Card>
            <p>Check the host screen for full leaderboard!</p>
        </div>
    );
};

const PlayerAuthorGuess = ({ code, me, quiz, currentBlock, participants, guesses }: any) => {
    const myGuess = (guesses || []).find((g: any) => g.block_id === currentBlock.id && g.guesser_participant_id === me.id);
    const realAuthor = (participants || []).find((p: any) => p.id === currentBlock.author_participant_id);
    const [submitting, setSubmitting] = useState(false);

    const handleGuess = async (authorId: string) => {
        if (myGuess || quiz.phase === 'AUTHOR_REVEAL' || submitting) return; 
        setSubmitting(true);
        try {
            await api.submitGuess(code, me.id, currentBlock.id, authorId);
            toast.success("Guess submitted!");
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="p-6 space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Who created the block "{currentBlock.title}"?</CardTitle>
                </CardHeader>
            <CardContent className="grid gap-2">
                    {(participants || []).map((p: any) => { 
                        const isSelected = myGuess?.guessed_participant_id === p.id;
                        // In Reveal phase, highlight correct one
                        const isCorrect = quiz.phase === 'AUTHOR_REVEAL' && p.id === realAuthor?.id;
                        const isWrong = quiz.phase === 'AUTHOR_REVEAL' && isSelected && !isCorrect;

                        let btnClass = isSelected ? 'bg-primary ring-2 ring-primary/50' : '';
                        if (isCorrect) btnClass = 'bg-green-600 ring-2 ring-green-300 hover:bg-green-700';
                        if (isWrong) btnClass = 'bg-destructive ring-2 ring-destructive/50 hover:bg-destructive/90';

                        return (
                            <Button 
                              key={p.id} 
                              variant={isSelected || isCorrect || isWrong ? "default" : "outline"}
                              className={`justify-start ${btnClass}`}
                              onClick={() => handleGuess(p.id)}
                              disabled={!!myGuess || quiz.phase === 'AUTHOR_REVEAL' || submitting}
                            >
                                {submitting && !myGuess && !isCorrect && !isWrong ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                {p.display_name}
                                {isSelected && !isCorrect && !isWrong && <CheckCircle2 className="ml-auto w-4 h-4" />}
                                {isCorrect && <CheckCircle2 className="ml-auto w-4 h-4 text-white" />}
                                {isWrong && <X className="ml-auto w-4 h-4 text-white" />}
                            </Button>
                        );
                    })}
                    {(participants || []).length === 0 && <p>No players to guess!</p>}
                </CardContent>
                <CardFooter className="flex-col gap-2">
                    {quiz.phase === 'AUTHOR_GUESS' && myGuess && <p className="text-sm text-slate-500 w-full text-center">Waiting for reveal...</p>}
                    {quiz.phase === 'AUTHOR_REVEAL' && (
                        <div className="text-center w-full space-y-2">
                             <p className="text-lg font-bold">It was {realAuthor?.display_name}!</p>
                             {myGuess?.is_correct ? (
                                 <p className="text-green-600 font-bold">You guessed correctly! (+1 pt)</p>
                             ) : (
                                 <p className="text-red-500">Better luck next time.</p>
                             )}
                        </div>
                    )}
                </CardFooter>
            </Card>
        </div>
    );
};

// Component to handle conditional text alignment based on wrapping
const QuestionText = ({ text }: { text: string }) => {
    const textRef = useRef<HTMLHeadingElement>(null);
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
        <h2 
            ref={textRef}
            className={`text-xl md:text-2xl font-bold leading-tight ${isMultiLine ? 'text-left' : 'text-center'}`}
        >
            {text}
        </h2>
    );
};

const PlayerQuestion = ({ code, me, currentBlock, currentQuestion, answers }: any) => {
    // If we are in question phase but don't have the question data yet, show loading
    if (!currentQuestion) {
        return (
          <div className="flex flex-col h-screen bg-slate-50">
              <div className="p-4 bg-white border-b text-center">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Current Block</span>
                  <h2 className="text-lg font-bold text-slate-800 animate-pulse bg-slate-200 h-6 w-1/2 mx-auto rounded"></h2>
              </div>
              <div className="flex-1 flex items-center justify-center p-6">
                  <div className="text-center space-y-4">
                      <Loader2 className="w-12 h-12 animate-spin mx-auto text-blue-500" />
                      <h2 className="text-xl font-semibold">Loading Question...</h2>
                  </div>
              </div>
          </div>
        );
    }

    const myAnswer = (answers || []).find((a: any) => a.question_id === currentQuestion.id && a.participant_id === me.id);
    const [submitting, setSubmitting] = useState(false);
    const [selectedOption, setSelectedOption] = useState<string | null>(null);
    
    const handleSubmit = async (text: string) => {
        if (myAnswer || submitting) return;
        setSubmitting(true);
        try {
            await api.submitAnswer(code, me.id, currentQuestion.id, text);
            toast.success("Answer submitted!");
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col h-screen bg-slate-50">
            {/* Header showing Block Name */}
            <div className="p-4 bg-white border-b shadow-sm sticky top-0 z-10 text-center">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Current Block</span>
                <h2 className="text-lg font-bold text-slate-800">{currentBlock?.title || 'Quiz'}</h2>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-20">
                <Card className="overflow-hidden border-2 border-slate-200 shadow-sm">
                    <CardContent className="p-0">
                        {currentQuestion.image_url && (
                            <div className="w-full bg-slate-100 border-b">
                                <img 
                                  src={currentQuestion.image_url} 
                                  alt="Question Image" 
                                  className="w-full max-h-72 object-contain mx-auto"
                                />
                            </div>
                        )}
                        <div className="p-6">
                            <QuestionText text={currentQuestion.text} />
                        </div>
                    </CardContent>
                </Card>

                {/* Input Section */}
                <div className="space-y-4 max-w-md mx-auto w-full">
                    {myAnswer ? (
                        <div className="text-center p-8 space-y-4 bg-green-50 rounded-xl border border-green-100 animate-in fade-in slide-in-from-bottom-4">
                            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
                            <h3 className="text-2xl font-bold text-green-700">Answer Locked In!</h3>
                            <p className="text-slate-600">You're ready. Waiting for others...</p>
                            <div className="font-medium bg-white p-3 rounded-lg border inline-block shadow-sm">
                                You answered: <span className="text-blue-600 font-bold">{myAnswer.answer_text}</span>
                            </div>
                        </div>
                    ) : (
                        <>
                            {currentQuestion.type === 'mcq' && currentQuestion.options ? (
                                <div className="space-y-4">
                                    <div className="grid gap-3">
                                        {currentQuestion.options.map((opt: string, i: number) => {
                                            const isSelected = selectedOption === opt;
                                            return (
                                                <Button
                                                  key={i}
                                                  type="button"
                                                  variant={isSelected ? "default" : "outline"}
                                                  className={`w-full justify-start text-left h-auto py-4 px-6 text-lg border-2 transition-all whitespace-normal
                                                    ${isSelected ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700' : 'hover:border-blue-300 hover:bg-blue-50'}`}
                                                  onClick={() => setSelectedOption(opt)}
                                                  disabled={submitting}
                                                >
                                                  <div className={`font-bold mr-3 ${isSelected ? 'text-white/80' : 'text-slate-300'}`}>
                                                      {String.fromCharCode(65 + i)}
                                                  </div>
                                                  {opt}
                                                </Button>
                                            );
                                        })}
                                    </div>
                                    <Button
                                      className="w-full text-lg py-6"
                                      size="lg"
                                      type="button"
                                      disabled={submitting || !selectedOption}
                                      onClick={() => {
                                          if (selectedOption) {
                                              handleSubmit(selectedOption);
                                          }
                                      }}
                                    >
                                        {submitting ? (
                                          <>
                                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                            Sending...
                                          </>
                                        ) : (
                                          <>
                                            <Send className="mr-2 w-5 h-5" />
                                            Lock In Answer
                                          </>
                                        )}
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-4 bg-white p-4 rounded-xl border shadow-sm">
                                    <Label htmlFor="answer-input" className="text-slate-500">Your Answer</Label>
                                    <Input 
                                       placeholder="Type your answer here..." 
                                       disabled={submitting}
                                       className="text-lg py-6"
                                       onKeyDown={(e) => {
                                           if (e.key === 'Enter') handleSubmit(e.currentTarget.value);
                                       }}
                                       id="open-answer-input"
                                       autoFocus
                                    />
                                    <Button 
                                      className="w-full text-lg py-6" 
                                      size="lg"
                                      disabled={submitting}
                                      onClick={() => {
                                          const el = document.getElementById('open-answer-input') as HTMLInputElement;
                                          if (el && el.value.trim()) handleSubmit(el.value);
                                      }}
                                    >
                                        {submitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Send className="ml-2 w-5 h-5" />}
                                        {submitting ? 'Sending...' : 'Lock In Answer'}
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- Sub-component: PlayerCreation ---

const compressImage = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) { reject(new Error('No context')); return; }
            
            // Max dimensions
            const MAX_WIDTH = 1024;
            const MAX_HEIGHT = 1024;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                }
            }

            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            
            canvas.toBlob((blob) => {
                URL.revokeObjectURL(img.src); // Cleanup
                if (!blob) { reject(new Error('Compression failed')); return; }
                const newFile = new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() });
                resolve(newFile);
            }, 'image/jpeg', 0.7);
        };
        img.onerror = (err) => {
            URL.revokeObjectURL(img.src); // Cleanup
            reject(err);
        };
    });
};

const PlayerCreation = ({ code, participantId, existingBlock, existingQuestions, quiz }: any) => {
    const minQuestions = getMinQuestionsPerPlayer(quiz);
    const suggestedQuestions = getSuggestedQuestionsPerPlayer(quiz);
    const maxQuestions = quiz.max_questions_per_player;
    
    const [title, setTitle] = useState(existingBlock?.title || '');
    const [saving, setSaving] = useState(false);
    const [questions, setQuestions] = useState<Partial<Question>[]>(
        existingQuestions.length > 0 
        ? existingQuestions 
        : Array(suggestedQuestions).fill({ type: 'open', text: '', options: ['', ''], correct_answer: '' })
    );
    const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
    const [joinedWithoutQuestions, setJoinedWithoutQuestions] = useState(false);
    const [questionToDelete, setQuestionToDelete] = useState<number | null>(null);

    // If user has already saved a block, they are effectively "ready" but can edit.
    // If they choose to join without questions, we show waiting screen.
    if (joinedWithoutQuestions) {
        return (
            <div className="flex items-center justify-center h-screen p-6 text-center">
                <div className="space-y-4">
                    <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
                    <h2 className="text-xl font-semibold">You're in!</h2>
                    <p className="text-slate-500">Sit back and relax while others finish their questions.</p>
                    <Button variant="outline" onClick={() => setJoinedWithoutQuestions(false)}>
                        Edit My Questions
                    </Button>
                </div>
            </div>
        );
    }

    const updateQuestion = (idx: number, field: string, value: any) => {
        const newQs = [...questions];
        newQs[idx] = { ...newQs[idx], [field]: value };
        setQuestions(newQs);
    };

    const handleUpload = async (idx: number, file: File) => {
        try {
            setUploadingIdx(idx);
            toast.info("Compressing & Uploading...");
            
            // Compress if image
            let fileToUpload = file;
            if (file.type.startsWith('image/')) {
                try {
                   fileToUpload = await compressImage(file);
                } catch (ce) {
                   console.warn("Compression failed, trying original", ce);
                }
            }

            // Hard limit check (4.5MB safe limit for 5MB bucket)
            if (fileToUpload.size > 4.5 * 1024 * 1024) {
                 throw new Error(`File is too large (${(fileToUpload.size / 1024 / 1024).toFixed(1)}MB). Please use a smaller image.`);
            }

            const url = await api.uploadImage(fileToUpload);
            updateQuestion(idx, 'image_url', url);
            toast.success("Image uploaded!");
        } catch (e: any) {
            console.error("Upload error detail:", e);
            let msg = e.message || "Unknown error";
            // Handle if error is object
            if (typeof e.message === 'object') msg = JSON.stringify(e.message);
            
            toast.error("Upload failed: " + msg);
        } finally {
            setUploadingIdx(null);
        }
    };


    const addQuestion = () => {
        if (questions.length < maxQuestions) {
            setQuestions([...questions, { type: 'open', text: '', options: ['', ''], correct_answer: '' }]);
        }
    };

    const handleRemoveClick = (idx: number) => {
        const question = questions[idx];
        const hasContent = question.text && question.text.trim() !== '';
        
        if (hasContent) {
            // Show confirmation dialog for non-empty questions
            setQuestionToDelete(idx);
        } else {
            // Remove empty questions immediately
            removeQuestion(idx);
        }
    };

    const removeQuestion = (idx: number) => {
        if (questions.length > minQuestions) {
            const newQuestions = questions.filter((_, i) => i !== idx);
            setQuestions(newQuestions);
            setQuestionToDelete(null);
        }
    };


    const handleSave = async () => {
        setSaving(true);
        try {
            // Validate
            if (!title) throw new Error("Block title is required");
            
            // Count questions with non-empty text
            const questionsWithText = questions.filter(q => q.text && q.text.trim() !== '');
            if (questionsWithText.length < minQuestions) {
                throw new Error(`You must create at least ${minQuestions} question${minQuestions > 1 ? 's' : ''} with text`);
            }
            
            // Validate each question
            for (const q of questions) {
                if (q.text && q.text.trim() !== '') {
                    if (q.type === 'mcq' && (!q.options || q.options.length < 2)) {
                        throw new Error("MCQs need at least 2 options");
                    }
                    if (!q.correct_answer) {
                        throw new Error("All questions need a correct answer");
                    }
                }
            }

            await api.saveBlock(code, participantId, title, questions);
            toast.success("Block saved!");
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="p-4 space-y-6 pb-20">
            <div className="space-y-2">
                <h1 className="text-2xl font-bold">Create Your Block</h1>
                <p className="text-sm text-slate-500">
                    Create between {minQuestions} and {maxQuestions} questions (suggested: {suggestedQuestions}).
                </p>
            </div>
            
            <div className="space-y-2">
                <Label>Block Title</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. 80s Music" />
            </div>

            {questions.map((q: any, i: number) => (
                <Card key={i}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Question {i + 1}</CardTitle>
                        {questions.length > minQuestions && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveClick(i)}
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        )}
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Input 
                            value={q.text} 
                            onChange={e => updateQuestion(i, 'text', e.target.value)} 
                            placeholder="Question text..." 
                        />
                        
                        <div className="space-y-2">
                            {q.image_url ? (
                                <div className="relative group rounded-lg border overflow-hidden w-full h-40 bg-slate-50">
                                    <img src={q.image_url} alt="Preview" className="w-full h-full object-contain" />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                        <Button variant="secondary" size="sm" className="pointer-events-auto relative">
                                            Change
                                            <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={(e) => e.target.files?.[0] && handleUpload(i, e.target.files[0])} />
                                        </Button>
                                        <Button variant="destructive" size="sm" onClick={() => updateQuestion(i, 'image_url', '')}>Remove</Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <Label className={`cursor-pointer bg-slate-100 p-2 rounded hover:bg-slate-200 flex items-center gap-2 text-xs border ${uploadingIdx === i ? 'opacity-50 pointer-events-none' : ''}`}>
                                        {uploadingIdx === i ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                                        {uploadingIdx === i ? 'Uploading...' : 'Add Image'}
                                        <input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleUpload(i, e.target.files[0])} />
                                    </Label>
                                </div>
                            )}
                        </div>

                        <RadioGroup 
                            value={q.type} 
                            onValueChange={val => updateQuestion(i, 'type', val)} 
                            className="flex gap-4"
                        >
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="open" id={`q${i}-open`} />
                                <Label htmlFor={`q${i}-open`}>Open Answer</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="mcq" id={`q${i}-mcq`} />
                                <Label htmlFor={`q${i}-mcq`}>Multiple Choice</Label>
                            </div>
                        </RadioGroup>

                        {q.type === 'mcq' && (
                            <div className="space-y-2 pl-4 border-l-2 border-slate-100">
                                <Label>Options</Label>
                                {(q.options || ['', '']).map((opt: string, optIdx: number) => {
                                    const options = q.options || [''];
                                    const canRemove = options.length > 2;
                                    
                                    return (
                                        <div key={optIdx} className="flex gap-2 items-center">
                                            <Input 
                                                value={opt} 
                                                onChange={e => {
                                                    const newOpts = [...options];
                                                    newOpts[optIdx] = e.target.value;
                                                    updateQuestion(i, 'options', newOpts);
                                                }}
                                                placeholder={`Option ${optIdx + 1}`}
                                                className="h-8 text-sm flex-1"
                                            />
                                            <div className="flex items-center gap-2">
                                                <input 
                                                    type="radio" 
                                                    name={`correct-${i}`}
                                                    checked={q.correct_answer === opt && opt !== ''}
                                                    onChange={() => updateQuestion(i, 'correct_answer', opt)}
                                                    className="w-4 h-4 text-green-600"
                                                />
                                                {canRemove && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => {
                                                            const newOpts = options.filter((_, idx) => idx !== optIdx);
                                                            // If we're removing the correct answer, clear it
                                                            if (q.correct_answer === opt) {
                                                                updateQuestion(i, 'correct_answer', '');
                                                            }
                                                            updateQuestion(i, 'options', newOpts);
                                                        }}
                                                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => updateQuestion(i, 'options', [...(q.options || []), ''])}
                                >+ Add Option</Button>
                            </div>
                        )}

                        {q.type === 'open' && (
                             <div className="space-y-2">
                                 <Label>Correct Answer (for host)</Label>
                                 <Input 
                                    value={q.correct_answer} 
                                    onChange={e => updateQuestion(i, 'correct_answer', e.target.value)} 
                                    placeholder="Expected answer..." 
                                 />
                             </div>
                        )}
                    </CardContent>
                </Card>
            ))}

            {questions.length < maxQuestions && (
                <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={addQuestion}
                >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Another Question
                </Button>
            )}

            <Button className="w-full" size="lg" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : existingBlock ? 'Update Questions' : 'Save & Join'}
            </Button>
            
            {!existingBlock && (
                <div className="text-center pt-4 border-t">
                    <p className="text-sm text-slate-500 mb-2">Don't want to make questions?</p>
                    <Button variant="ghost" className="text-slate-500 hover:text-slate-800" onClick={() => setJoinedWithoutQuestions(true)}>
                        Join as Player Only
                    </Button>
                </div>
            )}

            <AlertDialog open={questionToDelete !== null} onOpenChange={(open) => !open && setQuestionToDelete(null)}>
                <AlertDialogContent className="max-w-md mx-4">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Question?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This question has content. Are you sure you want to delete it? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => questionToDelete !== null && removeQuestion(questionToDelete)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 focus:ring-destructive"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};
