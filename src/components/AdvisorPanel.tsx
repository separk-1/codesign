import { useState, useRef, useEffect, useMemo } from 'react';
import { askGemini } from '../utils/gemini';
import { useSimulationStore } from '../store/simulationStore';
import { useGraphData } from '../hooks/useGraphData';
import { FormattedText } from '../utils/markdown';
import { parseCsv, filterParsedCsv, ParsedCsv } from '../utils/csvHelper';

type Msg = { sender: 'AI' | 'User'; text: string };

function buildStateKeywords(simState: any) {
  const keys: string[] = [];

  // alarms based keywords
  if (simState.fw_low_flow) keys.push('FW', 'FEEDWATER', 'LOW_FLOW', 'AFW', 'AUX');
  if (simState.sg_low_level) keys.push('SG', 'STEAM', 'GENERATOR', 'LEVEL', 'AFW', 'AUX');
  if (simState.trip_reactor) keys.push('TRIP', 'REACTOR', 'SCRAM');

  // always include core LOFW terms
  keys.push('LOFW', 'LOSS', 'FEED', 'FEEDWATER', 'AFW', 'AUX', 'STEAM', 'GENERATOR');

  // de-dupe
  return Array.from(new Set(keys));
}

function clampText(text: string, maxChars: number) {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n...(truncated)';
}

function buildCompactContext(simState: any, entityCsv: ParsedCsv, relationshipCsv: ParsedCsv) {
  const alarms = [
    simState.fw_low_flow && 'FW_LOW_FLOW',
    simState.sg_low_level && 'SG_LOW_LEVEL',
    simState.trip_reactor && 'REACTOR_TRIPPED',
  ].filter(Boolean).join(', ');

  const keywords = buildStateKeywords(simState);

  // keep only a small slice of KG
  const compactEntities = filterParsedCsv(entityCsv, keywords, 8);
  const compactRels = filterParsedCsv(relationshipCsv, keywords, 10);

  const ctx = `
STATE:
FW=${simState.fw_flow.toFixed(1)} L/s
SG=${simState.sg_level.toFixed(1)} %
SteamPress=${simState.steam_press.toFixed(1)} kg/cm2
Reactivity=${simState.reactivity.toFixed(1)} %
Turbine=${simState.turbine_rpm.toFixed(0)} RPM
Alarms=${alarms || 'NONE'}

PROCEDURE_NODES (filtered):
${compactEntities || '(no matched entities)'}

RELATIONSHIPS (filtered):
${compactRels || '(no matched relationships)'}
`;

  // hard cap total context size
  return clampText(ctx.trim(), 3500);
}

export const AdvisorPanel = () => {
  const [messages, setMessages] = useState<Msg[]>([
    { sender: 'AI', text: 'System Initialized. Monitoring LOFW scenario.' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  const { entityCsv, relationshipCsv, loading: graphLoading } = useGraphData();

  const parsedEntityCsv = useMemo(() => parseCsv(entityCsv), [entityCsv]);
  const parsedRelationshipCsv = useMemo(() => parseCsv(relationshipCsv), [relationshipCsv]);

  const handleSend = async () => {
    if (loading) return;
    if (!input.trim()) return;

    if (graphLoading) {
      setMessages(prev => [...prev, { sender: 'AI', text: 'System loading knowledge graph. Please wait...' }]);
      return;
    }

    const userQuestion = input.trim();
    setMessages(prev => [...prev, { sender: 'User', text: userQuestion }]);
    setInput('');
    setLoading(true);

    const context = buildCompactContext(simState, parsedEntityCsv, parsedRelationshipCsv);

    try {
      const answer = await askGemini(userQuestion, context);
      setMessages(prev => [...prev, { sender: 'AI', text: answer }]);
    } catch (error: any) {
      // If your askGemini throws with status, you can special-case 429
      const status = error?.status || error?.response?.status;
      if (status === 429) {
        setMessages(prev => [...prev, { sender: 'AI', text: 'Rate limited. Wait a few seconds and try again.' }]);
      } else {
        setMessages(prev => [...prev, { sender: 'AI', text: 'Connection failed. System offline.' }]);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="panel-title">
        <span>AI ADVISOR (GraphRAG)</span>
        <span style={{ fontSize: '0.6rem', color: '#22c55e' }}>
          ONLINE
        </span>
      </div>

      <div className="panel-content" style={{ flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        <div
          ref={chatRef}
          style={{
            flex: 1,
            padding: '10px',
            overflowY: 'auto',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}
        >
          {messages.map((msg, idx) => (
            <div
              key={idx}
              style={{
                alignSelf: msg.sender === 'User' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                backgroundColor: msg.sender === 'User' ? '#3b82f6' : '#334155',
                color: '#f1f5f9',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                border: '1px solid rgba(255,255,255,0.1)',
                whiteSpace: 'pre-wrap'
              }}
            >
              <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)', marginBottom: '2px' }}>
                {msg.sender}
              </div>
              <FormattedText text={msg.text} />
            </div>
          ))}
          {loading && <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic' }}>Thinking...</div>}
        </div>

        <div style={{ padding: '8px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '8px', background: 'var(--bg-panel-light)' }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask Advisor..."
            disabled={loading}
            style={{
              flex: 1,
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-color)',
              color: 'white',
              padding: '6px',
              borderRadius: '4px',
              fontSize: '0.8rem'
            }}
          />
          <button
            className="dcs-btn"
            onClick={handleSend}
            disabled={loading}
            style={{ padding: '4px 10px' }}
          >
            SEND
          </button>
        </div>
      </div>
    </>
  );
};
