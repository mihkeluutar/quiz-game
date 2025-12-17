
import { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import { QuizState } from '../types/quiz';

export function useQuizState(code: string, token?: string) {
  const [state, setState] = useState<QuizState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const data = await api.getQuizState(code, token);
      setState(data);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [code, token]);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 3000); // Poll every 3s
    return () => clearInterval(interval);
  }, [fetchState]);

  return { state, loading, error, refresh: fetchState };
}
