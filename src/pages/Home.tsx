import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';

export const Home = () => {
  return (
    <div className="fixed inset-0 w-full h-full flex flex-col items-center justify-center bg-[#B91C1C] text-white">
      <div className="flex flex-col items-center justify-center w-full max-w-md px-6 space-y-10 animate-in fade-in zoom-in duration-500">
        <div className="text-center space-y-3">
          <h1 className="text-6xl font-bold tracking-tighter">Xmas Quiz</h1>
          <p className="text-red-100/90 text-lg font-medium">Host or join a festive quiz!</p>
        </div>
        
        <div className="flex flex-col gap-3 w-full max-w-[280px]">
          <Button asChild size="lg" className="w-full h-12 text-base font-semibold bg-white text-[#B91C1C] hover:bg-red-50 border-0 shadow-lg">
            <Link to="/join">Join Quiz</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full h-12 text-base font-semibold bg-transparent text-white border-white/40 hover:bg-white/10 hover:text-white hover:border-white transition-all">
            <Link to="/host">Host Quiz</Link>
          </Button>
          <Button
            asChild
            size="lg"
            className="w-full h-11 text-sm font-medium bg-black/30 hover:bg-black/50 text-white border border-white/30"
          >
            <Link to="/host/auth">Login as Host</Link>
          </Button>
        </div>
      </div>
    </div>
  );
};
