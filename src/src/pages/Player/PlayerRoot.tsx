import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import PlayerLobby from './PlayerLobby';
import PlayerGame from './PlayerGame';

export default function PlayerRoot() {
  const { code } = useParams();
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    const fetchStatus = async () => {
        const { data } = await supabase.from('quizzes').select('status').eq('code', code).single();
        setStatus(data?.status || null);
    };
    fetchStatus();

    const channel = supabase.channel('root_status')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'quizzes', filter: `code=eq.${code}` }, (payload) => {
            setStatus(payload.new.status);
        })
        .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [code]);

  if (!status) return <div className="p-8 text-center text-white">Loading...</div>;

  // If status is CREATION, show Lobby (Block Editor)
  if (status === 'CREATION') {
      return <PlayerLobby />;
  }
  
  // If PLAY or FINISHED, show Game/Results
  return <PlayerGame />;
}
