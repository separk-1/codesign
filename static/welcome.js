// static/ebct.js (v19): tooltip added (auto-create), label/zoom kept
document.addEventListener('DOMContentLoaded', () => {
  const $chat = document.getElementById('chat');
  const $q    = document.getElementById('q');
  const $send = document.getElementById('send');
  const $roleHint = document.getElementById('roleHint');
  const $roleBtns = document.querySelectorAll('.rolebtn');
  const $dbBtn = document.getElementById('db-btn');
  const $graphContainer = document.getElementById('graph-container');

  const $pidSelect = document.getElementById('pid-select');
  const $pidIcons  = document.querySelectorAll('.pid-icon');

  let state = { role: null, used: null };
  let messages = [];

  // P&ID 셀렉트 / 아이콘 클릭 핸들러
  if ($pidSelect) {
    $pidSelect.addEventListener('change', () => {
      const pid = $pidSelect.value || 'ALL';
      currentPid = pid;
      if ($pidIcons && $pidIcons.length) {
        $pidIcons.forEach(btn => {
          btn.classList.toggle('active', btn.dataset.pid === pid || (pid === 'ALL' && btn.dataset.pid === 'ALL'));
        });
      }
      renderGraph(pid);
    });
  }

  if ($pidIcons && $pidIcons.length) {
    $pidIcons.forEach(btn => {
      btn.addEventListener('click', () => {
        const pid = btn.dataset.pid || 'ALL';
        currentPid = pid;
        $pidIcons.forEach(b => b.classList.toggle('active', b === btn));
        if ($pidSelect) $pidSelect.value = pid;
        renderGraph(pid);
      });
    });
  }

  // 그래프 전체 데이터 캐시 + 현재 필터
  let fullGraphData = null;
  let currentPid = 'ALL';

  const converter = new showdown.Converter();
  const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const bubble = (role, text) => {
    const b = document.createElement('div');
    b.className = `bubble ${role === 'user' ? 'user' : 'bot'}`;
    b.innerHTML = converter.makeHtml(text);
    $chat.appendChild(b);
    $chat.scrollTop = $chat.scrollHeight;
    return b;
  };

  const plainText = (text, className) => {
    const p = document.createElement('div');
    p.className = className;
    p.textContent = text;
    $chat.appendChild(p);
    $chat.scrollTop = $chat.scrollHeight;
    return p;
  };

  // role select
  $roleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const role = btn.dataset.role;
      if (!role) return;
      state.role = role;
      $roleHint.textContent =
        state.role === 'designer'
          ? 'Designer mode – plain language, alternatives first.'
          : 'Engineer mode – numbers, units, assumptions.';
      $roleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      bubble('bot',
        state.role === 'designer'
          ? 'Designer mode activated. How can I help you today?'
          : 'Engineer mode activated. Please provide the baseline parameters.'
      );
      $q.focus();
    });
  });

  // DB(Graph) toggle
  let graphVisible = false;
  $dbBtn.addEventListener('click', async () => {
    graphVisible = !graphVisible;
    $dbBtn.setAttribute('aria-pressed', graphVisible);
    $dbBtn.classList.toggle('active', graphVisible);

    $chat.style.display = graphVisible ? 'none' : 'flex';
    $graphContainer.style.display = graphVisible ? 'block' : 'none';
    if (graphVisible) {
      $q.placeholder = 'Drag / wheel to explore the graph.';
      renderGraph();
    } else {
      $q.placeholder = 'Ask a question…';
    }
  });

  async function send() {
    const text = ($q.value || '').trim();

    $q.value = '';
    messages.push({ role: 'user', content: text });
    bubble('user', esc(text));

    const loadingText = plainText('Generating response...', 'loading-text');

    try {
      const res = await fetch('/api/chat', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ messages, state })
      });
      const raw = await res.text();
      let data; try { data = JSON.parse(raw); } catch { data = { reply: raw }; }

      loadingText.classList.add('fade-out');
      loadingText.addEventListener('transitionend', () => loadingText.remove());

      if (!res.ok) {
        bubble('bot', `Error: ${esc(data.error || 'Server error')}`);
        return;
      }

      const reply = data.reply || '(no reply)';
      bubble('bot', reply);

      if (data.rationale && data.rationale !== "Direct calculation performed.") {
        const det = document.createElement('details');
        det.className = 'bubble bot muted';
        const sum = document.createElement('summary');
        sum.textContent = 'Show technical rationale';
        det.appendChild(sum);
        const div = document.createElement('div');
        div.style.marginTop = '10px';
        div.innerHTML = converter.makeHtml(data.rationale);
        det.appendChild(div);
        $chat.appendChild(det);
        $chat.scrollTop = $chat.scrollHeight;
      }

      if (data.calc && data.calc.used) state.used = data.calc.used;
      messages.push({ role: 'assistant', content: reply });
    } catch (e) {
      loadingText.classList.add('fade-out');
      loadingText.addEventListener('transitionend', () => loadingText.remove());
      console.error(e);
      bubble('bot', 'Request failed. See Console.');
    }
  }

  $send.addEventListener('click', send);
  $q.addEventListener('keydown', (e)=>{ if(e.key==='Enter') send(); });

  // ====== TOOLTIP (auto-create if missing) ======
  let $tip = document.getElementById('kg-tooltip');
  if (!$tip) {
    $tip = document.createElement('div');
    $tip.id = 'kg-tooltip';
    $tip.style.position = 'fixed';
    $tip.style.pointerEvents = 'none';
    $tip.style.zIndex = '1000';
    $tip.style.display = 'none';
    $tip.style.maxWidth = '360px';
    $tip.style.padding = '10px 12px';
    $tip.style.background = '#111';
    $tip.style.color = '#fff';
    $tip.style.borderRadius = '10px';
    $tip.style.boxShadow = '0 6px 20px rgba(0,0,0,.25)';
    $tip.style.font = '13px/1.4 system-ui, -apple-system, Segoe UI, Arial';
    document.body.appendChild($tip);
  }

  function tipHtml(d){
  const kind = d.label || d.type || '';
  const lines = [];
  lines.push(
    `<div style="font-weight:700;margin-bottom:6px;">${d.id} ` +
    `<span style="opacity:.7">(${kind})</span></div>`
  );

  // 1) 제목: tag_name / line_number / equipment_tag / id
  const title =
    d.tag_name ||
    d.line_number ||
    d.equipment_tag ||
    d.id;

  const type = d.label || d.type || "node";

  lines.push(
    `<div style="font-weight:700;margin-bottom:6px;">${title} <span style="opacity:.7">(${type})</span></div>`
  );

  // 2) 타입별로 주요 메타데이터
  if (d.label === "Equipment") {
    if (d.pid_name)  lines.push(`<div><b>P&ID:</b> ${d.pid_name}</div>`);
    if (d.tag_name)  lines.push(`<div><b>Tag:</b> ${d.tag_name}</div>`);
    if (d.class_name) lines.push(`<div><b>Class:</b> ${d.class_name}</div>`);
  }

  if (d.label === "Nozzle") {
    if (d.equipment_tag)    lines.push(`<div><b>Equipment:</b> ${d.equipment_tag}</div>`);
    if (d.subtag)           lines.push(`<div><b>Nozzle:</b> ${d.subtag}</div>`);
    if (d.nominal_diameter) lines.push(`<div><b>ND:</b> ${d.nominal_diameter}</div>`);
  }

  if (d.label === "Line") {
    if (d.line_number)       lines.push(`<div><b>Line:</b> ${d.line_number}</div>`);
    if (d.fluid_code)        lines.push(`<div><b>Fluid:</b> ${d.fluid_code}</div>`);
    if (d.nominal_diameter)  lines.push(`<div><b>ND:</b> ${d.nominal_diameter}</div>`);
    if (d.piping_class_code) lines.push(`<div><b>Class:</b> ${d.piping_class_code}</div>`);
  }

  // 3) description/rationale 있으면 그대로
  if (d.description) lines.push(`<div style="margin-top:6px;">${d.description}</div>`);
  if (d.rationale)   lines.push(`<div style="opacity:.85;">${d.rationale}</div>`);

  return lines.join("");
}



  function showTip(html, x, y){
    $tip.innerHTML = html;
    $tip.style.display = 'block';
    const rect = $tip.getBoundingClientRect();
    let tx = x + 14, ty = y + 14;
    if (tx + rect.width  > window.innerWidth)  tx = x - rect.width - 14;
    if (ty + rect.height > window.innerHeight) ty = y - rect.height - 14;
    $tip.style.left = tx + 'px';
    $tip.style.top  = ty + 'px';
  }
  function hideTip(){ $tip.style.display = 'none'; }

    // ====== GRAPH RENDER (fixed labels/zoom/overlap + tooltip) ======
    // ====== GRAPH RENDER (fixed labels/zoom/overlap + tooltip) ======
  async function renderGraph(pidName = 'ALL') {
    try {
      // 1) 처음 한 번만 서버에서 전체 그래프 로드
      if (!fullGraphData) {
        const res = await fetch('/api/knowledge-graph');
        if (!res.ok) throw new Error('Failed to fetch knowledge graph');
        fullGraphData = await res.json();

        // P&ID 목록을 셀렉트 박스에 채우기
        if ($pidSelect && fullGraphData.nodes) {
          const pidSet = new Set(
            fullGraphData.nodes
              .map(n => n.pid_name)
              .filter(Boolean)
          );
          const sorted = Array.from(pidSet).sort();
          sorted.forEach(pn => {
            const opt = document.createElement('option');
            opt.value = pn;
            opt.textContent = pn;
            $pidSelect.appendChild(opt);
          });
        }
      }

      currentPid = pidName || currentPid || 'ALL';

      const baseNodes = fullGraphData.nodes || [];
      const baseLinks = (fullGraphData.links || fullGraphData.edges || []);

      // 2) pid_name으로 서브그래프 만들기
      let nodes, links;
      if (currentPid === 'ALL') {
        nodes = baseNodes.map(d => ({ ...d }));
        links = baseLinks.map(e => ({ ...e }));
      } else {
        nodes = baseNodes
          .filter(n => n.pid_name === currentPid)
          .map(d => ({ ...d }));

        const keep = new Set(nodes.map(n => n.id));
        links = baseLinks
          .filter(e => keep.has(e.source) && keep.has(e.target))
          .map(e => ({ ...e }));
      }

      const width  = $graphContainer.offsetWidth || Math.floor(window.innerWidth * 0.9);
      const height = $graphContainer.offsetHeight || 560;

      const svg = d3.select("#knowledge-graph")
        .html("")
        .attr("width", width)
        .attr("height", height)
        .attr("shape-rendering", "geometricPrecision");

      // Root group for zoom/pan
      const root = svg.append("g");
      const gLinks  = root.append("g").attr("class","kg-links");
      const gNodes  = root.append("g").attr("class","kg-nodes");
      const gLabels = root.append("g").attr("class","kg-labels"); // keep labels on top

      const linksNorm = links.map(e => ({
        source: (e.source && e.source.id) ? e.source.id : e.source,
        target: (e.target && e.target.id) ? e.target.id : e.target,
        type: e.type || 'rel'
      }));
      const nodesNorm = nodes;

      // Simulation
      const sim = d3.forceSimulation(nodesNorm)
        .force("link", d3.forceLink(linksNorm).id(d=>d.id).distance(110).strength(0.8))
        .force("charge", d3.forceManyBody().strength(-300))
        .force("collide", d3.forceCollide().radius(18))
        .force("center", d3.forceCenter(width/2, height/2));

      // Links
      const link = gLinks.selectAll("line").data(linksNorm).join("line")
        .attr("stroke", "#b0bec5")
        .attr("stroke-opacity", 0.9)
        .attr("stroke-width", 1.4)
        .attr("vector-effect", "non-scaling-stroke")
        .on("mouseenter", (e,d) => showTip(
          `<b>${esc(d.source.id || d.source)}</b> — <i>${esc(d.type)}</i> → <b>${esc(d.target.id || d.target)}</b>`,
          e.clientX, e.clientY))
        .on("mousemove",  (e,d) => showTip(
          `<b>${esc(d.source.id || d.source)}</b> — <i>${esc(d.type)}</i> → <b>${esc(d.target.id || d.target)}</b>`,
          e.clientX, e.clientY))
        .on("mouseleave", hideTip);

      // Nodes
      const nodeColor = d => {
        if (d.color) return d.color;
        if (d.label === 'Equipment') return '#3498DB';
        if (d.label === 'Nozzle')    return '#27AE60';
        if (d.label === 'Line')      return '#9CA3AF';
        return '#64748b';
      };

      const nodeLabel = d =>
        d.tag_name || d.line_number || d.equipment_tag || d.id;

      const node = gNodes.selectAll("circle").data(nodesNorm).join("circle")
        .attr("r", 9)
        .attr("fill", nodeColor)
        .attr("stroke", "#fff")
        .attr("stroke-width", 1.4)
        .attr("vector-effect", "non-scaling-stroke")
        .style("cursor","pointer")
        .on("mouseenter", (e,d)=> showTip(tipHtml(d), e.clientX, e.clientY))
        .on("mousemove",  (e,d)=> showTip(tipHtml(d), e.clientX, e.clientY))
        .on("mouseleave", hideTip)
        .call(d3.drag()
          .on("start", (e,d)=>{ if(!e.active) sim.alphaTarget(0.3).restart(); d.fx=d.x; d.fy=d.y; hideTip(); })
          .on("drag",  (e,d)=>{ d.fx=e.x; d.fy=e.y; })
          .on("end",   (e,d)=>{ if(!e.active) sim.alphaTarget(0); d.fx=null; d.fy=null; })
        );

      // Labels: halo + fill
      const labelHalo = gLabels.selectAll("text.halo").data(nodesNorm).join("text")
        .attr("class","halo")
        .attr("text-anchor","start")
        .attr("font-family","Inter, system-ui, -apple-system, Segoe UI, Arial")
        .attr("font-size", 14)
        .attr("fill", "#111")
        .attr("stroke", "#fff")
        .attr("stroke-width", 4)
        .attr("paint-order", "stroke")
        .attr("vector-effect","non-scaling-stroke")
        .text(nodeLabel);

      const label = gLabels.selectAll("text.lbl").data(nodesNorm).join("text")
        .attr("class","lbl")
        .attr("text-anchor","start")
        .attr("font-family","Inter, system-ui, -apple-system, Segoe UI, Arial")
        .attr("font-size", 14)
        .attr("fill", "#111")
        .style("pointer-events","auto")
        .text(nodeLabel)
        .on("mouseenter", (e,d)=> showTip(tipHtml(d), e.clientX, e.clientY))
        .on("mousemove",  (e,d)=> showTip(tipHtml(d), e.clientX, e.clientY))
        .on("mouseleave", hideTip);

      sim.on("tick", () => {
        link
          .attr("x1", d => d.source.x)
          .attr("y1", d => d.source.y)
          .attr("x2", d => d.target.x)
          .attr("y2", d => d.target.y);
        node
          .attr("cx", d => d.x)
          .attr("cy", d => d.y);
        label
          .attr("x", d => d.x + 12)
          .attr("y", d => d.y + 4);
        labelHalo
          .attr("x", d => d.x + 12)
          .attr("y", d => d.y + 4);
      });

      // Zoom & pan + 사용자 줌 고정
      let userZoomed = false;
      const zoom = d3.zoom()
        .scaleExtent([0.2, 6])
        .on("zoom", (event) => {
          userZoomed = true;
          root.attr("transform", event.transform);
        });
      svg.call(zoom).on("dblclick.zoom", null);

      // Fit view (사용자가 줌하기 전까지만)
      sim.on('end', () => {
        if (!userZoomed) fitToView();
      });

      window.addEventListener('resize', () => {
        svg.attr("width", $graphContainer.offsetWidth)
           .attr("height", $graphContainer.offsetHeight || 560);
        if (!userZoomed) fitToView();
      });

      function fitToView(pad=60){
        const b = root.node().getBBox();
        if (!isFinite(b.x) || !isFinite(b.width)) return;
        const w = +svg.attr('width'), h = +svg.attr('height');
        const k = Math.min((w-pad)/b.width, (h-pad)/b.height, 2.5);
        const tx = (w/2) - k*(b.x + b.width/2);
        const ty = (h/2) - k*(b.y + b.height/2);
        svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
      }
    } catch (e) {
      console.error(e);
      const svg = d3.select("#knowledge-graph");
      const width  = $graphContainer.offsetWidth  || Math.floor(window.innerWidth * 0.9);
      const height = $graphContainer.offsetHeight || 560;
      svg.html("").attr("width", width).attr("height", height);
      svg.append("text")
        .attr("x", width/2).attr("y", height/2)
        .attr("text-anchor","middle")
        .attr("font-size",16).attr("fill","#dc2626")
        .text("Failed to load knowledge graph.");
    }
  }


  bubble('bot',
    "Hi :) Welcome to Flow2PID! Ask me to create Piping and Instrumentation Diagrams (P&IDs) based on your process flow requirements. Just describe the components and connections you need, and I'll help you generate a P&ID."
  );
});
