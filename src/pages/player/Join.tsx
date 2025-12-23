
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { toast } from 'sonner';

export const PlayerJoin = () => {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Get or create a player token
      // We use a single token per device for simplicity, or we could scope it.
      let token = localStorage.getItem('player_token');
      if (!token) {
        token = crypto.randomUUID();
        localStorage.setItem('player_token', token);
      }

      // 2. Join
      // Trim whitespace from name to prevent duplicate entries (e.g., "John " vs "John")
      const trimmedName = name.trim();
      if (!trimmedName) {
        toast.error('Please enter a valid name');
        setLoading(false);
        return;
      }
      const { quiz, participant, is_rejoined } = await api.joinQuiz(code.toUpperCase(), trimmedName, token);
      
      if (is_rejoined) {
          toast.success(`Welcome back, ${participant.display_name}!`);
      } else {
          toast.success("Joined the party!");
      }

      // 3. Redirect
      navigate(`/play/${quiz.code}`);
      
    } catch (err: any) {
      toast.error(err.message || 'Failed to join');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 p-6 flex items-center justify-center bg-green-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-green-800">Join a Quiz</CardTitle>
          <CardDescription>Enter the code from your host.</CardDescription>
        </CardHeader>
        <form onSubmit={handleJoin}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Quiz Code</Label>
              <Input 
                id="code" 
                placeholder="e.g. XMAS25" 
                value={code} 
                onChange={(e) => setCode(e.target.value.toUpperCase())} 
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Your Name</Label>
              <Input 
                id="name" 
                placeholder="e.g. Elfie" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                required 
              />
            </div>
            <Button type="submit" className="w-full bg-green-600 hover:bg-green-700" disabled={loading}>
              {loading ? 'Joining...' : 'Join Quiz'}
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
};
