import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { toast } from 'sonner@2.0.3';

export default function JoinQuiz() {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !name) {
      toast.error('Please fill in all fields');
      return;
    }

    setLoading(true);

    try {
      const upperCode = code.toUpperCase();
      
      // 1. Find Quiz
      const { data: quiz, error: quizError } = await supabase
        .from('quizzes')
        .select('id, status')
        .eq('code', upperCode)
        .single();

      if (quizError || !quiz) {
        toast.error('Quiz not found. Please check the code.');
        setLoading(false);
        return;
      }

      const quizId = quiz.id;
      
      // 2. Manage Token (Check localStorage first)
      let token = localStorage.getItem(`quiz_token_${quizId}`);
      if (!token) {
        token = crypto.randomUUID();
        localStorage.setItem(`quiz_token_${quizId}`, token);
      }

      // 3. Register Participant
      // Check if already registered
      const { data: existing } = await supabase
        .from('quiz_participants')
        .select('id, display_name')
        .eq('quiz_id', quizId)
        .eq('player_token', token)
        .single();

      if (!existing) {
        const { error: joinError } = await supabase
          .from('quiz_participants')
          .insert({
            quiz_id: quizId,
            display_name: name,
            player_token: token
          });

        if (joinError) {
          console.error(joinError);
          toast.error('Failed to join quiz.');
          setLoading(false);
          return;
        }
      } else {
        // If re-joining, maybe update name? Or just welcome back.
        if (existing.display_name !== name) {
            await supabase.from('quiz_participants').update({ display_name: name }).eq('id', existing.id);
        }
      }

      toast.success('Joined successfully!');
      navigate(`/play/${upperCode}`);

    } catch (err) {
      console.error(err);
      toast.error('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Join Quiz</CardTitle>
          <CardDescription>Enter the code and your name to start.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleJoin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Quiz Code</Label>
              <Input 
                id="code" 
                placeholder="XMAS25" 
                value={code} 
                onChange={(e) => setCode(e.target.value)}
                maxLength={10}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Your Name</Label>
              <Input 
                id="name" 
                placeholder="Santa's Helper" 
                value={name} 
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Joining...' : 'Join Game'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
