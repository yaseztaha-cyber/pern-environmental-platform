import { useState, useEffect } from 'react';

const ONBOARDING_STEPS = [
  {
    title: "Welcome to PERN",
    description: "Your comprehensive Environmental Intelligence Platform for real-time monitoring, AI analysis, and automation."
  },
  {
    title: "Live Mode vs Simulation",
    description: "Toggle between real MQTT sensor data (Live) and simulated data. Live mode requires a running MQTT broker."
  },
  {
    title: "Virtual Sensors",
    description: "PERN automatically computes 10 virtual (soft) sensors from your physical readings with confidence scores."
  },
  {
    title: "Automation & Control",
    description: "Create rules that automatically control devices (fans, pumps, buzzers) and send real push notifications via ntfy."
  }
];

export default function OnboardingModal() {
  const [show, setShow] = useState(() => !localStorage.getItem('pern_onboarded'));
  const [step, setStep] = useState(0);

  const finish = () => {
    localStorage.setItem('pern_onboarded', 'true');
    setShow(false);
  };

  useEffect(() => {
    if (!show) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [show]);

  if (!show) return null;

  const next = () => {
    if (step < ONBOARDING_STEPS.length - 1) {
      setStep(step + 1);
    } else {
      finish();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100]" role="dialog" aria-modal="true" aria-label="Onboarding tour"
      onKeyDown={(e) => { if (e.key === 'Escape') finish(); }}>
      <div className="glass max-w-lg p-8 rounded-3xl">
        <div className="text-[var(--emerald)] text-xs tracking-widest mb-1">STEP {step + 1} / {ONBOARDING_STEPS.length}</div>
        <div className="text-2xl font-semibold tracking-tight mb-3">{ONBOARDING_STEPS[step].title}</div>
        <p className="text-[var(--text-secondary)] mb-8 leading-relaxed">{ONBOARDING_STEPS[step].description}</p>

        <div className="flex gap-3">
          <button 
            onClick={finish}
            className="flex-1 py-3 bg-white/10 hover:bg-white/20 rounded-2xl text-sm"
          >
            Skip Tour
          </button>
          <button 
            onClick={next}
            className="flex-1 py-3 bg-[var(--emerald)] hover:opacity-90 rounded-2xl text-sm font-medium"
            autoFocus
          >
            {step === ONBOARDING_STEPS.length - 1 ? 'Get Started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}