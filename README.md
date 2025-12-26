# Quiz Game App

A collaborative, real-time quiz game where players create their own questions and compete to answer correctly while guessing who authored each question block.

## About

This is an interactive quiz platform that turns players into question creators. Here's how it works:

1. **Host creates a quiz** - Sets up a game with customizable question limits and optional author guessing
2. **Players join** - Enter a quiz code to join the game
3. **Question creation phase** - Players create their own question blocks with multiple questions (multiple choice or open-ended), optionally with images
4. **Gameplay** - Host controls the flow as players answer questions in real-time
5. **Author guessing** - After each player-created block, players guess who authored it (optional feature)
6. **Scoring** - Points awarded for correct answers and correct author guesses
7. **Results** - Leaderboard and detailed breakdown of all answers

The app supports flexible question creation (min/max/suggested per player), host-created question blocks, and real-time synchronization between host and players.

## Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** - Build tool and dev server
- **React Router** - Client-side routing
- **Radix UI** - Accessible component primitives
- **Tailwind CSS** - Utility-first styling
- **Lucide React** - Icon library
- **Sonner** - Toast notifications

### Backend
- **Supabase** - Backend-as-a-Service
  - **Edge Functions** (Deno) - Serverless API endpoints
  - **Hono** - Web framework for Edge Functions
  - **Storage** - Image uploads for questions
  - **KV Store** - Current data storage (key-value pattern)
- **Supabase Realtime** - For future event-driven updates

### Development
- **TypeScript** - Type safety
- **SWC** - Fast React compiler
- **ESLint/TypeScript** - Code quality

## Running the code

Run `npm i` to install the dependencies.

Run `npm run dev` to start the development server.

The app will be available at `http://localhost:3000`.

## Project Structure

- `src/pages/` - Page components (host and player views)
- `src/components/` - Reusable UI components
- `src/hooks/` - Custom React hooks
- `src/utils/` - API client and utilities
- `src/types/` - TypeScript type definitions
- `src/supabase/functions/` - Edge Function server code
- `docs/plans/` - Architecture analysis and planning documents

## Original Design

The original project design is available at https://www.figma.com/design/A05BPUJelSbvPkZCk1pHmn/Christmas-Quiz-App.
