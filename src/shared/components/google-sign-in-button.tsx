import { GoogleLogin } from '@react-oauth/google';
import { useAuthStore } from '@/shared/stores/auth-store';
import { apiClient } from '@/shared/lib/api-client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface Props {
  redirectTo?: string;
}

export function GoogleSignInButton({ redirectTo = '/home' }: Props) {
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleSuccess = async (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) return;
    try {
      const { data } = await apiClient.post<{
        user: { id: number; email: string; username: string; avatarUrl: string | null };
        accessToken: string;
        refreshToken: string;
      }>('/auth/google', { credential: credentialResponse.credential });

      login(data.user, data.accessToken);
      navigate(redirectTo, { replace: true });
    } catch {
      toast.error('No se pudo iniciar sesión con Google');
    }
  };

  return (
    <GoogleLogin
      onSuccess={handleSuccess}
      onError={() => toast.error('Error al iniciar sesión con Google')}
      useOneTap={false}
      shape="pill"
      text="continue_with"
      locale="es"
    />
  );
}
