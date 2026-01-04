import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { api } from "../../utils/api";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { toast } from "sonner@2.0.3";
import { Loader2, Plus, ArrowRight } from "lucide-react";

type HostQuiz = {
  id: string;
  code: string;
  name: string;
  status: string;
  created_at: string;
  max_questions_per_player: number;
};

export const HostHome = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [quizzes, setQuizzes] = useState<HostQuiz[]>([]);

  useEffect(() => {
    if (!authLoading && !user) navigate("/host/auth");
  }, [authLoading, user, navigate]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await api.listHostQuizzes(user.id);
      setQuizzes((res?.quizzes || []) as HostQuiz[]);
    } catch (e: any) {
      toast.error(e.message || "Failed to load quizzes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (authLoading || !user) {
    return (
      <div className="p-8 text-center flex justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 flex justify-center">
      <div className="w-full max-w-3xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-foreground">Your quizzes</h1>
            <p className="text-sm text-muted-foreground">Re-open any quiz you created.</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => navigate("/host/create")} className="gap-2">
              <Plus className="h-4 w-4" />
              New quiz
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Quizzes</CardTitle>
            <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading && quizzes.length === 0 ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : quizzes.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No quizzes found for your account yet.
              </div>
            ) : (
              quizzes.slice(0, 12).map((q) => (
                <Link
                  key={q.id}
                  to={`/host/${q.code}`}
                  className="block rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="font-medium text-foreground truncate">{q.name}</div>
                        <Badge variant="outline" className="text-xs">
                          {q.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                        <span className="font-mono">{q.code}</span>
                        <span className="text-muted-foreground/50">•</span>
                        <span>{q.max_questions_per_player} questions/player</span>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};


