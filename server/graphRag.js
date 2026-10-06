import OpenAI from 'openai';

function textValue(value, depth = 0) {
  if (value == null || depth > 3) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(item => textValue(item, depth + 1)).filter(Boolean).join(' ');
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([key]) => !['raw'].includes(key))
      .map(([key, child]) => `${key}: ${textValue(child, depth + 1)}`)
      .filter(Boolean)
      .join(' ');
  }
  return '';
}

function tokenize(text = '') {
  const base = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9_\-.]+/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 1);
  const expanded = new Set(base);
  for (const token of base) {
    if (token.endsWith('s') && token.length > 3) expanded.add(token.slice(0, -1));
    if (token.startsWith('connect')) ['connect', 'connects', 'connected', 'connection', 'connectivity'].forEach(t => expanded.add(t));
    if (token.startsWith('equip')) ['equipment', 'equipments', 'pump', 'tank', 'vessel', 'exchanger', 'pipe', 'line', 'source', 'sink', 'plantitem'].forEach(t => expanded.add(t));
    if (token === 'pid' || token === 'p&id') ['p&id', 'pid', 'graph', 'dexpi'].forEach(t => expanded.add(t));
    if (token.startsWith('note') || token.startsWith('annot')) ['note', 'notes', 'annotation', 'label', 'description', 'review', 'comment'].forEach(t => expanded.add(t));
  }
  return Array.from(expanded);
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

function endpointId(endpoint) {
  return typeof endpoint === 'object' ? endpoint?.id : endpoint;
}

function buildEvidenceDocs(graph = {}) {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const links = Array.isArray(graph.links) ? graph.links : [];
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const nodeDocs = nodes.map(node => {
    const genericTerms = ['Equipment', 'Pump', 'HeatExchanger', 'Pipe', 'Source', 'Sink', 'DecisionBranch', 'ReviewItem', 'ReviewQueue'].includes(node.type)
      ? ' equipment graph node plantitem connected object note annotation label description'
      : '';
    const text = [node.id, node.name, node.type, genericTerms, textValue(node.attributes), node.lastDecision]
      .filter(Boolean)
      .join(' ');
    return {
      kind: 'node',
      id: node.id,
      label: node.name || node.attributes?.tagName || node.id,
      type: node.type || 'Node',
      text,
      payload: {
        id: node.id,
        name: node.name,
        type: node.type,
        attributes: node.attributes || {},
        generatedByDecision: Boolean(node.generatedByDecision || node.attributes?.generatedByDecision)
      }
    };
  });
  const linkDocs = links.map((link, index) => {
    const source = endpointId(link.source);
    const target = endpointId(link.target);
    const sourceNode = nodeById.get(source);
    const targetNode = nodeById.get(target);
    const text = [
      'connected connection connectivity graph edge link equipment relationship note annotation label description',
      link.label,
      link.type,
      source,
      target,
      sourceNode?.name,
      sourceNode?.type,
      targetNode?.name,
      targetNode?.type,
      textValue(link)
    ].filter(Boolean).join(' ');
    return {
      kind: 'link',
      id: `${source || 'unknown'}->${target || 'unknown'}#${index}`,
      label: link.label || 'connects_to',
      type: 'Link',
      text,
      payload: {
        source,
        target,
        label: link.label,
        sourceName: sourceNode?.name,
        targetName: targetNode?.name,
        generatedByDecision: Boolean(link.generatedByDecision)
      }
    };
  });
  return { docs: [...nodeDocs, ...linkDocs], nodeById, links };
}

function scoreDoc(doc, queryTokens, queryText) {
  const text = doc.text.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (text.includes(token)) score += token.length > 3 ? 3 : 1;
    if (String(doc.label || '').toLowerCase().includes(token)) score += 2;
    if (String(doc.id || '').toLowerCase().includes(token)) score += 2;
  }
  if (queryText && text.includes(queryText.toLowerCase())) score += 8;
  if (doc.payload?.generatedByDecision) score += 1;
  return score;
}

function retrieveEvidence(graph, query, limit = 8) {
  const { docs, nodeById, links } = buildEvidenceDocs(graph);
  const queryTokens = tokenize(query);
  let ranked = docs
    .map(doc => ({ ...doc, score: scoreDoc(doc, queryTokens, query) }))
    .filter(doc => doc.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const lowerQuery = String(query || '').toLowerCase();
  if (!ranked.length && /connect|equip|pipe|line|pump|tank|exchanger/.test(lowerQuery)) {
    ranked = docs
      .filter(doc => doc.kind === 'link' || ['Equipment', 'Pump', 'HeatExchanger', 'Pipe', 'Source', 'Sink'].includes(doc.type))
      .slice(0, limit)
      .map(doc => ({ ...doc, score: 1 }));
  }

  const expanded = [...ranked];
  const topNodeIds = ranked.filter(doc => doc.kind === 'node').map(doc => doc.id);
  for (const nodeId of topNodeIds.slice(0, 3)) {
    links
      .filter(link => endpointId(link.source) === nodeId || endpointId(link.target) === nodeId)
      .slice(0, 3)
      .forEach((link, index) => {
        const source = endpointId(link.source);
        const target = endpointId(link.target);
        const other = source === nodeId ? target : source;
        const otherNode = nodeById.get(other);
        expanded.push({
          kind: 'neighbor',
          id: `${nodeId}-neighbor-${other}-${index}`,
          label: `${nodeId} ${link.label || 'connected_to'} ${other}`,
          type: 'NeighborEvidence',
          score: 1,
          text: `${nodeId} ${link.label || 'connected_to'} ${other} ${otherNode?.name || ''} ${otherNode?.type || ''}`,
          payload: { source, target, label: link.label, neighborName: otherNode?.name, neighborType: otherNode?.type }
        });
      });
  }

  return uniqueBy(expanded, item => `${item.kind}:${item.id}`).slice(0, limit);
}

function endpointLabel(item, side) {
  const id = item.payload?.[side];
  const name = item.payload?.[`${side}Name`] || (side === 'source' ? item.payload?.sourceName : item.payload?.targetName);
  if (name && id && name !== id) return `${name} (${id})`;
  return name || id || '?';
}

function formatEvidenceLine(item, index) {
  if (item.kind === 'link' || item.kind === 'neighbor') {
    return `${index + 1}. ${endpointLabel(item, 'source')} -- ${item.payload?.label || 'connects_to'} -- ${endpointLabel(item, 'target')}`;
  }
  return `${index + 1}. ${item.label || item.id} (${item.type})`;
}

function findMainNodeForQuery(query, evidence) {
  const lowerQuery = String(query || '').toLowerCase();
  const nodes = evidence.filter(item => item.kind === 'node');
  return nodes.find(item => {
    const label = String(item.label || '').toLowerCase();
    const id = String(item.id || '').toLowerCase();
    return label && lowerQuery.includes(label) || id && lowerQuery.includes(id);
  }) || nodes[0];
}

function directConnectionsForNode(nodeEvidence, evidence) {
  const nodeId = nodeEvidence.id;
  const nodeLabel = nodeEvidence.label;
  const connections = evidence
    .filter(item => item.kind === 'link' || item.kind === 'neighbor')
    .filter(item => {
      const payload = item.payload || {};
      return payload.source === nodeId
        || payload.target === nodeId
        || payload.sourceName === nodeLabel
        || payload.targetName === nodeLabel
        || item.text?.includes(nodeId);
    });
  return uniqueBy(connections, item => `${item.payload?.source || '?'}|${item.payload?.label || 'connects_to'}|${item.payload?.target || '?'}`);
}

function describeConnections(nodeEvidence, evidence) {
  const label = nodeEvidence.label || nodeEvidence.id;
  const connected = directConnectionsForNode(nodeEvidence, evidence);
  if (!connected.length) {
    return `${label}: I did not retrieve direct connection evidence for this node.`;
  }

  const rows = connected.slice(0, 8).map(item => {
    const payload = item.payload || {};
    const other = payload.source === nodeEvidence.id ? endpointLabel(item, 'target') : endpointLabel(item, 'source');
    return `${other}${payload.label && payload.label !== 'connects_to' ? ` via ${payload.label}` : ''}`;
  });
  return `${label} is connected to ${rows.join('; ')}.`;
}

function describeNodeRole(nodeEvidence, evidence) {
  const label = nodeEvidence.label || nodeEvidence.id;
  const type = nodeEvidence.type || nodeEvidence.payload?.type || 'graph node';
  const attrs = nodeEvidence.payload?.attributes || {};
  const description = attrs.description || attrs.service || attrs.tagName || attrs.lineNumber || '';
  const connected = directConnectionsForNode(nodeEvidence, evidence).slice(0, 4);
  const connectionText = connected.length
    ? connected.map((item, index) => formatEvidenceLine(item, index).replace(/^\d+\.\s*/, '')).join('; ')
    : 'No direct connection evidence was retrieved for this node.';

  const role = type === 'Source'
    ? 'It acts as an upstream source or feed boundary in the selected P&ID graph.'
    : type === 'Sink'
      ? 'It acts as a downstream sink or process boundary in the selected P&ID graph.'
      : type === 'Pump'
        ? 'It represents a pump or pressure-moving equipment item in the selected P&ID graph.'
        : type === 'HeatExchanger'
          ? 'It represents heat-transfer equipment in the selected P&ID graph.'
          : type === 'Pipe'
            ? 'It represents a piping or line segment in the selected P&ID graph.'
            : `It is represented as a ${type} node in the selected P&ID graph.`;

  return `${label} is a ${type} node. ${role}${description ? ` Source attribute note: ${description}.` : ''}\n\nConnection evidence: ${connectionText}`;
}

function fallbackAnswer(query, evidence, candidate, decisionLog) {
  if (!evidence.length) {
    return `I could not find matching graph evidence for: "${query}". Try asking about a tag, equipment type, line, nozzle, material, pump duty, flow rate, treatment configuration, or review item.`;
  }
  const mainNode = findMainNodeForQuery(query, evidence);
  const connectionQuestion = /\bconnected\b|\bconnects?\b|\bconnection\b|\blinked\b|\battached\b|\bneighbor/i.test(query);
  const wantsEvidence = /\bevidence\b|\bcitation\b|\bsources?\b/i.test(query);
  const answer = connectionQuestion && mainNode ? describeConnections(mainNode, evidence)
    : mainNode ? `${mainNode.label}: ${mainNode.payload?.attributes?.description || mainNode.type || 'Equipment in the diagram'}.`
    : 'I could not identify the equipment. Which equipment or tag do you mean?';
  return answer + (wantsEvidence ? `\n\nEvidence: ${evidence.slice(0, 5).map((item, index) => formatEvidenceLine(item, index)).join('\n')}` : '');
}

export async function answerGraphRag({ query, graph, candidate, decisionLog, designId, model = process.env.OPENAI_MODEL || 'gpt-5-mini' }) {
  const evidence = retrieveEvidence(graph, query, 10);
  if (!process.env.OPENAI_API_KEY) {
    return { mode: 'fallback', answer: fallbackAnswer(query, evidence, candidate, decisionLog), evidence };
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 25000, maxRetries: 0 });
  const evidenceText = evidence.map((item, index) => `${index + 1}. [${item.kind}] ${item.label || item.id} | ${JSON.stringify(item.payload)}`).join('\n');
  const prompt = `Question: ${query}\n\nSelected design id: ${designId || 'unknown'}\n\nCandidate state:\n${JSON.stringify(candidate || {}, null, 2)}\n\nDecision log summary:\n${JSON.stringify((decisionLog || []).map(entry => ({ topic: entry.topic, selectedOption: entry.selectedOption, decision: entry.decision, confidence: entry.confidence, responseSource: entry.responseSource })), null, 2)}\n\nRetrieved graph evidence:\n${evidenceText || 'No matching graph evidence.'}\n\nAnswer using only the retrieved graph evidence and candidate/decision-log context. If evidence is insufficient, say so. For simple connection questions, name the connected equipment and relevant line in one or two sentences. Do not add headings, evidence lists, retrieval counts, item numbers, source node IDs, GraphRAG terminology or engineering-approval disclaimers. Give sources only if explicitly requested. Do not infer that no other connections exist merely because retrieval is limited.`;

  try {
    const completion = await Promise.race([
      client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: 'Help users understand the equipment and connections in their diagram. Answer in natural English only and ground factual claims in the supplied evidence. Answer the actual question directly and briefly. Do not narrate internal retrieval or append generic disclaimers. If the relevant connection is missing, say you cannot identify it from the diagram.' },
          { role: 'user', content: prompt }
        ]
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('GraphRAG LLM timeout; using retrieved evidence fallback')), 26000))
    ]);
    const answer = completion.choices?.[0]?.message?.content || fallbackAnswer(query, evidence, candidate, decisionLog);
    return { mode: 'openai', model, answer, evidence };
  } catch (error) {
    return { mode: 'fallback_after_error', error: error instanceof Error ? error.message : String(error), answer: fallbackAnswer(query, evidence, candidate, decisionLog), evidence };
  }
}
