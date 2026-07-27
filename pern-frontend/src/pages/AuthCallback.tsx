import { useEffect, useState } from 'react';
import { handleLogtoCallback } from '../lib/auth';
import { useNavigate } from 'react-router';

export default function AuthCallback() {
  const [status, setStatus] = useState('Processing login...');
  const navigate = useNavigate();

  useEffect(() => {
    const processCallback = async () => {
      try {
        await handleLogtoCallback();
        setStatus('Login successful! Redirecting...');
        setTimeout(() => navigate('/'), 1200);
      } catch (error) {
        console.error('Callback error:', error);
        setStatus('Login failed. Please try again.');
        setTimeout(() => navigate('/login'), 2000);
      }
    };

    processCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-1)]">
      <div className="glass p-8 rounded-[var(--radius-sm)] text-center">
        <div className="animate-spin w-8 h-8 border-2 border-[var(--emerald)] border-t-transparent rounded-full mx-auto mb-4"></div>
        <div className="text-[var(--text-secondary)] text-lg">{status}</div>
      </div>
    </div>
  );
}