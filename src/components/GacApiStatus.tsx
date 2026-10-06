import { useEffect, useRef, useState } from 'react';
export function GacApiStatus() {
  const [status, setStatus] = useState('Checking API');
  const lastReplyStatus = useRef('');
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => fetch('/api/health', { signal: controller.signal, cache: 'no-store' }).then(r => r.json()).then(health => {
      setStatus(health.ok ? health.hasOpenAIKey ? lastReplyStatus.current || 'API online · key configured' : 'API online · key missing' : 'Local mode');
    }).catch(() => { if (!controller.signal.aborted) setStatus('Local mode'); });
    refresh();
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    const onReply = (event: Event) => {
      lastReplyStatus.current = String((event as CustomEvent).detail);
      setStatus(lastReplyStatus.current);
    };
    window.addEventListener('gac-api-status', onReply);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('gac-api-status', onReply);
    };
  }, []);
  return <span style={{ fontSize: 11, fontWeight: 'normal' }}>{status}</span>;
}
