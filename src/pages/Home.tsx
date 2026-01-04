import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
// @ts-ignore - Vite handles image imports
import RizzardLogo from '../assets/rizzard-logo-purple.png';

export const Home = () => {
  return (
    <div className="fixed inset-0 w-full h-full flex flex-col items-center justify-center bg-accent text-accent-foreground">
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
        
        <div className="flex flex-col gap-3 w-full max-w-72">
          <Button asChild size="lg" className="w-full h-12 text-base font-semibold bg-background text-foreground hover:bg-muted border-0 shadow-lg">
            <Link to="/join">Join Quiz</Link>
          </Button>
          {/* STYLE_OVERRIDE: Ghost/Outline button on dark background needs custom white/transparent styling */}
          <Button asChild variant="outline" size="lg" className="w-full h-12 text-base font-semibold bg-transparent text-primary-foreground border-primary-foreground/40 hover:bg-primary-foreground/10 hover:text-primary-foreground hover:border-primary-foreground transition-all">
            <Link to="/host">Host Quiz</Link>
          </Button>
          {/* Separator here */}
          <div className="w-full border-t bg-background my-2" />
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
