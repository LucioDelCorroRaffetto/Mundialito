import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { useJoinLeague, usePublicLeagues } from '@/shared/hooks/use-leagues';

export function LeagueJoinPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const joinMutation = useJoinLeague();
  const { data: publicLeagues } = usePublicLeagues();

  const handleJoinByCode = async () => {
    const trimmed = code.trim();
    if (!trimmed) { setError('Ingresá el código'); return; }
    setError('');
    try {
      const league = await joinMutation.mutateAsync(trimmed);
      navigate(`/leagues/${league.id}`);
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { error?: { message?: string } } } };
      const msg = apiError?.response?.data?.error?.message;
      if (msg === 'Already a member of this league') {
        setError('Ya sos miembro de esta liga');
      } else if (msg?.includes('not found') || msg?.includes('Not found')) {
        setError('Código inválido o liga inexistente');
      } else {
        setError('No se pudo unir. Verificá el código e intentá de nuevo.');
      }
    }
  };

  const handleJoinLeague = async (leagueCode: string) => {
    try {
      const league = await joinMutation.mutateAsync(leagueCode);
      navigate(`/leagues/${league.id}`);
    } catch {
      // If already a member, just navigate there via search results
    }
  };

  return (
    <div className="flex flex-col min-h-full animate-fade-in">
      <div className="flex items-center gap-3 px-4 pt-5 pb-6">
        <button onClick={() => navigate(-1)} className="p-2 rounded-md bg-elevated border border-border" aria-label="Volver">
          <ArrowLeft size={18} className="text-text" />
        </button>
        <h1 className="text-xl-s font-display font-bold text-text">Unirse a una liga</h1>
      </div>

      <div className="flex flex-col gap-6 px-4">
        <div className="flex flex-col gap-3">
          <p className="text-sm-s font-semibold text-text">Tengo un código de liga</p>
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder="Ej: ASADO42"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                error={error}
                className="uppercase font-mono tracking-widest"
              />
            </div>
            <Button
              onClick={handleJoinByCode}
              loading={joinMutation.isPending}
              className="flex-shrink-0"
            >
              Unirse
            </Button>
          </div>
        </div>

        {publicLeagues && publicLeagues.data.length > 0 && (
          <>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs-s text-muted">o explorá ligas públicas</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <div className="flex flex-col gap-2">
              {publicLeagues.data.map((league) => (
                <div key={league.id} className="flex items-center gap-3 p-4 rounded-lg bg-card border border-border">
                  <div className="flex-1 min-w-0">
                    <p className="text-base-s font-semibold text-text">{league.name}</p>
                  </div>
                  <button
                    onClick={() => handleJoinLeague(league.code)}
                    disabled={joinMutation.isPending}
                    className="px-3 py-1.5 rounded-md bg-accent text-accent-on text-sm-s font-semibold flex-shrink-0 hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    Unirse
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
