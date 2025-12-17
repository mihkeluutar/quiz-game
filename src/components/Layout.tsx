
import React from 'react';
import { Toaster } from 'sonner@2.0.3';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">
      <main className="w-full min-h-screen flex flex-col">
        {children}
      </main>
      <Toaster position="top-center" />
    </div>
  );
};
