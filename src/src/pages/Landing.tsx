import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Gamepad2, Presentation } from 'lucide-react';

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-slate-900">Christmas Quiz</CardTitle>
          <CardDescription>Host a game or join your friends!</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Link to="/join">
            <Button className="w-full h-16 text-lg" size="lg">
              <Gamepad2 className="mr-2 h-6 w-6" />
              Join a Quiz
            </Button>
          </Link>
          
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or</span>
            </div>
          </div>

          <Link to="/host">
            <Button variant="outline" className="w-full h-16 text-lg" size="lg">
              <Presentation className="mr-2 h-6 w-6" />
              Host a Quiz
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
