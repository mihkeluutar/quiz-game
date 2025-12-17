import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Textarea } from '../../components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { toast } from 'sonner@2.0.3';
import { Trash2, Image as ImageIcon, Plus } from 'lucide-react';
import { Quiz, Block, Question, QuizParticipant } from '../../types/schema';

export default function PlayerLobby() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [participant, setParticipant] = useState<QuizParticipant | null>(null);
  const [block, setBlock] = useState<Block | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  
  // Load initial data
  useEffect(() => {
    if (!code) return;
    const load = async () => {
      // 1. Get Quiz
      const { data: q } = await supabase.from('quizzes').select('*').eq('code', code).single();
      if (!q) {
          toast.error('Quiz not found');
          navigate('/');
          return;
      }
      setQuiz(q);

      // 2. Get Participant
      const token = localStorage.getItem(`quiz_token_${q.id}`);
      if (!token) {
          navigate('/join');
          return;
      }
      const { data: p } = await supabase.from('quiz_participants').select('*').eq('quiz_id', q.id).eq('player_token', token).single();
      if (!p) {
          navigate('/join');
          return;
      }
      setParticipant(p);

      // 3. Get or Create Block
      let { data: b } = await supabase.from('blocks').select('*').eq('quiz_id', q.id).eq('author_participant_id', p.id).single();
      if (!b) {
          const { data: newBlock } = await supabase.from('blocks').insert({
              quiz_id: q.id,
              author_participant_id: p.id,
              title: `${p.display_name}'s Round`
          }).select().single();
          b = newBlock;
      }
      setBlock(b);

      // 4. Get Questions
      if (b) {
          const { data: qs } = await supabase.from('questions').select('*').eq('block_id', b.id).order('index_in_block');
          setQuestions(qs || []);
      }
      
      // Redirect if game started
      if (q.status === 'PLAY') {
          navigate(`/play/${code}`);
      }
      
      setLoading(false);
    };
    load();
    
    // Subscribe to quiz status changes
    const channel = supabase.channel('lobby_status')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'quizzes', filter: `code=eq.${code}` }, (payload) => {
            if (payload.new.status === 'PLAY') {
                navigate(`/play/${code}`);
            }
        })
        .subscribe();
        
    return () => { supabase.removeChannel(channel); };
  }, [code, navigate]);

  const handleUpdateBlockTitle = async (title: string) => {
      if (!block) return;
      await supabase.from('blocks').update({ title }).eq('id', block.id);
      setBlock({ ...block, title });
  };

  const handleAddQuestion = async () => {
      if (!block || !quiz) return;
      if (questions.length >= quiz.max_questions_per_player) {
          toast.error(`Max ${quiz.max_questions_per_player} questions allowed`);
          return;
      }

      const newQ = {
          block_id: block.id,
          index_in_block: questions.length,
          text: '',
          type: 'open' as const, // default
          options: ['Option 1', 'Option 2'], // default for mcq
          correct_answer: '',
          image_url: null
      };

      const { data } = await supabase.from('questions').insert(newQ).select().single();
      if (data) setQuestions([...questions, data]);
  };

  const handleUpdateQuestion = async (id: string, updates: Partial<Question>) => {
      await supabase.from('questions').update(updates).eq('id', id);
      setQuestions(questions.map(q => q.id === id ? { ...q, ...updates } : q));
  };
  
  const handleDeleteQuestion = async (id: string) => {
      await supabase.from('questions').delete().eq('id', id);
      setQuestions(questions.filter(q => q.id !== id));
  };

  const handleImageUpload = async (id: string, file: File) => {
      try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage.from('quiz-images').upload(filePath, file);
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from('quiz-images').getPublicUrl(filePath);
        
        await handleUpdateQuestion(id, { image_url: publicUrl });
        toast.success('Image uploaded');
      } catch (error) {
          console.error(error);
          toast.error('Upload failed');
      }
  };

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-24">
      <div className="max-w-md mx-auto space-y-6">
        <Card>
            <CardHeader>
                <CardTitle>Create Your Round</CardTitle>
            </CardHeader>
            <CardContent>
                <Label>Round Title</Label>
                <Input 
                    value={block?.title || ''} 
                    onChange={e => handleUpdateBlockTitle(e.target.value)} 
                    placeholder="e.g. Geography"
                />
            </CardContent>
        </Card>

        {questions.map((q, idx) => (
            <Card key={q.id} className="relative">
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="absolute top-2 right-2 text-red-500"
                    onClick={() => handleDeleteQuestion(q.id)}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
                <CardHeader>
                    <CardTitle className="text-sm">Question {idx + 1}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label>Question Text</Label>
                        <Textarea 
                            value={q.text} 
                            onChange={e => handleUpdateQuestion(q.id, { text: e.target.value })} 
                            placeholder="What is..."
                        />
                    </div>
                    
                    <div className="space-y-2">
                        <Label>Image (Optional)</Label>
                        <div className="flex items-center gap-2">
                            {q.image_url ? (
                                <img src={q.image_url} className="h-12 w-12 object-cover rounded" />
                            ) : (
                                <ImageIcon className="h-8 w-8 text-gray-300" />
                            )}
                            <Input 
                                type="file" 
                                accept="image/*" 
                                onChange={e => e.target.files?.[0] && handleImageUpload(q.id, e.target.files[0])}
                            />
                        </div>
                    </div>

                    <Tabs value={q.type} onValueChange={v => handleUpdateQuestion(q.id, { type: v as any })}>
                        <TabsList className="w-full">
                            <TabsTrigger value="open" className="flex-1">Open Answer</TabsTrigger>
                            <TabsTrigger value="mcq" className="flex-1">Multiple Choice</TabsTrigger>
                        </TabsList>
                        
                        <TabsContent value="open" className="space-y-2">
                            <Label>Correct Answer</Label>
                            <Input 
                                value={q.correct_answer || ''} 
                                onChange={e => handleUpdateQuestion(q.id, { correct_answer: e.target.value })}
                                placeholder="The answer is..."
                            />
                        </TabsContent>
                        
                        <TabsContent value="mcq" className="space-y-2">
                            <Label>Options</Label>
                            {q.options?.map((opt, i) => (
                                <div key={i} className="flex gap-2">
                                    <Input 
                                        value={opt} 
                                        onChange={e => {
                                            const newOpts = [...(q.options || [])];
                                            newOpts[i] = e.target.value;
                                            handleUpdateQuestion(q.id, { options: newOpts });
                                        }}
                                    />
                                    <input 
                                        type="radio" 
                                        name={`correct-${q.id}`} 
                                        checked={q.correct_answer === opt}
                                        onChange={() => handleUpdateQuestion(q.id, { correct_answer: opt })}
                                    />
                                </div>
                            ))}
                            <Button variant="outline" size="sm" onClick={() => {
                                handleUpdateQuestion(q.id, { options: [...(q.options || []), `Option ${(q.options?.length || 0) + 1}`] });
                            }}>
                                Add Option
                            </Button>
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        ))}

        <Button className="w-full" onClick={handleAddQuestion} disabled={questions.length >= (quiz?.max_questions_per_player || 3)}>
            <Plus className="mr-2 h-4 w-4" /> Add Question
        </Button>
        
        <div className="h-8" />
      </div>
      
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t text-center">
          <p className="text-sm text-muted-foreground">Waiting for host to start...</p>
      </div>
    </div>
  );
}
