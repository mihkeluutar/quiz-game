import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
// @ts-ignore - Vite handles image imports
import RizzardLogo from '../assets/rizzard-logo-purple.png';

export const Home = () => {
  return (
    <div className="fixed inset-0 w-full h-full flex flex-col items-center justify-center bg-accent text-white">
      <div className="flex flex-col items-center justify-center w-full max-w-md px-6 space-y-10 animate-in fade-in zoom-in duration-500">
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center">
            <img
              src={RizzardLogo}
              alt="Quizzard logo"
              className="w-full max-w-xs md:max-w-sm h-auto"
            />
          </div>
        </div>
        
        <div className="flex flex-col gap-3 w-full max-w-[280px]">
          <Button asChild size="lg" className="w-full h-12 text-base font-semibold bg-white text-accent hover:bg-red-50 border-0 shadow-lg">
            <Link to="/join">Join Quiz</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full h-12 text-base font-semibold bg-transparent text-white border-white/40 hover:bg-white/10 hover:text-white hover:border-white transition-all">
            <Link to="/host">Host Quiz</Link>
          </Button>
          {/* Separator here */}
          <div className="w-full border-t bg-white my-2" />
          <Button
            asChild
            variant="transparent"
            size="lg"
            className="w-full"
          >
            <Link className="text-base"to="/host/auth">Login as Host</Link>
          </Button>
        </div>
      </div>
    </div>
  );
};
