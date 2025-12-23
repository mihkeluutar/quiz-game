
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../utils/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Checkbox } from '../../components/ui/checkbox';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../../components/ui/accordion';
import { toast } from 'sonner';

export const HostCreate = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [minQuestions, setMinQuestions] = useState(1);
  const [suggestedQuestions, setSuggestedQuestions] = useState(3);
  const [maxQuestions, setMaxQuestions] = useState(10);
  const [enableAuthorGuessing, setEnableAuthorGuessing] = useState(true);
  const [creating, setCreating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/host/auth');
    }
  }, [loading, user, navigate]);

  const validateInputs = (): boolean => {
    if (minQuestions < 1) {
      setValidationError("Minimum questions must be at least 1");
      return false;
    }
    if (suggestedQuestions < minQuestions) {
      setValidationError("Suggested questions must be >= minimum questions");
      return false;
    }
    if (maxQuestions < suggestedQuestions) {
      setValidationError("Maximum questions must be >= suggested questions");
      return false;
    }
    setValidationError(null);
    return true;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    if (!validateInputs()) {
      return;
    }

    setCreating(true);
    try {
      console.log('Creating quiz with:', {
        name,
        minQuestions,
        suggestedQuestions,
        maxQuestions,
        enableAuthorGuessing,
        host_id: user.id
      });
      
      const quiz = await api.createQuiz(
        name,
        minQuestions,
        suggestedQuestions,
        maxQuestions,
        enableAuthorGuessing,
        user.id
      );
      
      console.log('Quiz created:', quiz);
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
          <CardTitle className="text-2xl font-bold">Create a New Quiz</CardTitle>
          <CardDescription>
            Set up your quiz and invite players to join
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleCreate}>
          <CardContent className="space-y-6">
            {/* Quiz Name */}
            <div className="space-y-2">
              <Label htmlFor="name" className="text-base font-semibold">Quiz Name</Label>
              <Input 
                id="name" 
                placeholder="e.g. Christmas 2025" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                className="text-base"
                required 
              />
            </div>

            {/* Suggested Questions - Always Visible */}
            <div className="space-y-2">
              <Label htmlFor="suggested" className="text-base font-semibold">
                Questions per Player
              </Label>
              <Input 
                id="suggested" 
                type="number" 
                min={1} 
                value={isNaN(suggestedQuestions) ? '' : suggestedQuestions} 
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 1;
                  setSuggestedQuestions(val);
                  validateInputs();
                }} 
                className="text-base"
                required 
              />
              <p className="text-sm text-muted-foreground">
                Each player will create this many questions
              </p>
            </div>

            {/* Advanced Settings - Accordion */}
            <Accordion type="multiple" className="w-full">
              <AccordionItem value="question-limits">
                <AccordionTrigger>Question Limits</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 pt-2">
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="min" className="text-sm">Minimum Questions</Label>
                        <Input 
                          id="min" 
                          type="number" 
                          min={1} 
                          value={isNaN(minQuestions) ? '' : minQuestions} 
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 1;
                            setMinQuestions(val);
                            validateInputs();
                          }} 
                          required 
                        />
                        <p className="text-xs text-muted-foreground">
                          Players must create at least this many questions
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="max" className="text-sm">Maximum Questions</Label>
                        <Input 
                          id="max" 
                          type="number" 
                          min={1} 
                          value={isNaN(maxQuestions) ? '' : maxQuestions} 
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 1;
                            setMaxQuestions(val);
                            validateInputs();
                          }} 
                          required 
                        />
                        <p className="text-xs text-muted-foreground">
                          Players cannot create more than this many questions
                        </p>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="game-options">
                <AccordionTrigger>Game Options</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 pt-2">
                    <Label 
                      htmlFor="authorGuessing" 
                      className="cursor-pointer font-normal items-start gap-3"
                    >
                      <Checkbox 
                        id="authorGuessing" 
                        checked={enableAuthorGuessing}
                        onCheckedChange={(checked) => setEnableAuthorGuessing(checked === true)}
                      />
                      <div className="space-y-1">
                        <div className="text-sm font-medium leading-none">
                          Enable Author Guessing
                        </div>
                        <p className="text-xs text-muted-foreground font-normal leading-relaxed">
                          Players guess who created each question block during gameplay
                        </p>
                      </div>
                    </Label>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {validationError && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                {validationError}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={creating || !!validationError}>
              {creating ? 'Creating...' : 'Create Quiz'}
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
};
