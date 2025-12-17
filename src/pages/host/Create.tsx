
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../utils/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { toast } from 'sonner@2.0.3';

export const HostCreate = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [maxQuestions, setMaxQuestions] = useState(3);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/host/auth');
    }
  }, [loading, user, navigate]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    if (isNaN(maxQuestions) || maxQuestions < 1) {
        toast.error("Please enter a valid number of questions");
        return;
    }

    setCreating(true);
    try {
      const quiz = await api.createQuiz(name, maxQuestions, user.id);
      navigate(`/host/${quiz.code}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="flex-1 p-6 flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create a New Quiz</CardTitle>
        </CardHeader>
        <form onSubmit={handleCreate}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Quiz Name</Label>
              <Input 
                id="name" 
                placeholder="e.g. Xmas 2025" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max">Questions per Player</Label>
              <Input 
                id="max" 
                type="number" 
                min={1} 
                max={10} 
                value={isNaN(maxQuestions) ? '' : maxQuestions} 
                onChange={(e) => setMaxQuestions(parseInt(e.target.value))} 
                required 
              />
            </div>
            <Button type="submit" className="w-full" disabled={creating}>
              {creating ? 'Creating...' : 'Create Quiz'}
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
};
