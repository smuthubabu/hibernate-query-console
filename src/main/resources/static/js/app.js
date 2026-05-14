// ===========================
// Hibernate Query Console - app.js
// ===========================

let editor;
let currentResults = [];
let currentColumns = [];
let currentPage = 0;
const PAGE_SIZE = 100;
const MAX_HISTORY = 20;

// ---- INIT ----
document.addEventListener('DOMContentLoaded', function () {
    initEditor();
    loadEntities();
    checkHealth();
    loadHistory();
    loadSavedQueries();
    initResizeHandle();
    setInterval(checkHealth, 30000);
});

function initEditor() {
    editor = CodeMirror.fromTextArea(document.getElementById('hqlEditor'), {
        mode: 'text/x-sql',
        theme: 'eclipse',
        lineNumbers: true,
        autofocus: true,
        indentWithTabs: false,
        tabSize: 2,
        lineWrapping: true,
        extraKeys: {
            'Ctrl-Enter': executeQuery,
            'Cmd-Enter': executeQuery,
            'Ctrl-Space': cm => CodeMirror.showHint(cm, hqlHint, { completeSingle: false })
        }
    });

    editor.on('keyup', (cm, e) => {
        if (cm.state.completionActive) return;
        const cursor = cm.getCursor();
        const before = cm.getLine(cursor.line).slice(0, cursor.ch);
        const autoTrigger = e.key === '.' ||
            (e.key === ' ' && /(?:from|join(?:\s+fetch)?)\s*$/i.test(before));
        if (autoTrigger) {
            CodeMirror.showHint(cm, hqlHint, { completeSingle: false });
        }
    });
}

// ---- HEALTH CHECK ----
function checkHealth() {
    fetch('/api/health')
        .then(r => r.json())
        .then(data => {
            const dot = document.getElementById('healthDot');
            const text = document.getElementById('healthText');
            if (data.status === 'UP') {
                dot.className = 'health-dot up';
                text.textContent = `Connected (${data.entityCount} entities)`;
            } else {
                dot.className = 'health-dot down';
                text.textContent = 'Disconnected';
            }
        })
        .catch(() => {
            document.getElementById('healthDot').className = 'health-dot down';
            document.getElementById('healthText').textContent = 'Server Error';
        });
}

// ---- LEFT PANEL TABS ----
function switchLeftTab(tab) {
    document.querySelectorAll('.left-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.left-tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById('tabBtn' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');
    document.getElementById('leftTab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');
}

// ---- GRAPH PANEL EXPAND ----
let graphExpanded = false;

function toggleGraphDock() {
    graphExpanded = !graphExpanded;
    const panel     = document.getElementById('leftPanel');
    const toggleBtn = document.getElementById('panelToggleBtn');
    if (graphExpanded) {
        panel.style.width    = Math.round(window.innerWidth * 0.65) + 'px';
        panel.style.maxWidth = '90vw';
        toggleBtn.textContent = '◀';
        toggleBtn.title = 'Collapse panel';
        switchLeftTab('graph');
        renderGraphInto(document.getElementById('entityGraph'), 3, 50, allEntities);
    } else {
        panel.style.width    = '260px';
        panel.style.maxWidth = '';
        toggleBtn.textContent = '▶';
        toggleBtn.title = 'Expand schema graph';
        renderGraphInto(document.getElementById('entityGraph'), 1, 0, allEntities);
    }
}

function renderGraphInto(graphEl, cols, gapX, entities) {
    activeGraphEl = graphEl;
    activeCols = cols;
    activeGapX = gapX;
    if (!entities.length) { graphEl.innerHTML = '<div class="loading">No entities</div>'; return; }

    // Calculate positions (multi-column grid)
    cardPositions = {};
    const maxH = [];
    entities.forEach((e, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        if (!maxH[row]) maxH[row] = 0;
        const h = collapsedCards.has(e.simpleClassName)
            ? HEADER_H
            : HEADER_H + (e.fields||[]).length * FIELD_H + FOOTER_H;
        maxH[row] = Math.max(maxH[row], h);
        cardPositions[e.simpleClassName] = { x: ORIGIN_X + col*(CARD_W+gapX), y: 0, w: CARD_W, h };
    });
    entities.forEach((e, i) => {
        const row = Math.floor(i / cols);
        let y = ORIGIN_Y;
        for (let r = 0; r < row; r++) y += (maxH[r]||0) + GAP_Y;
        cardPositions[e.simpleClassName].y = y;
    });

    const totalRows = Math.ceil(entities.length / cols);
    let canvasH = ORIGIN_Y;
    for (let r = 0; r < totalRows; r++) canvasH += (maxH[r]||0) + GAP_Y;
    const canvasW = cols === 1
        ? ORIGIN_X + CARD_W + DETOUR_X + 20
        : ORIGIN_X + cols*(CARD_W+gapX) + DETOUR_X + 20;

    let cards = '';
    entities.forEach(e => cards += buildCard(e, cardPositions[e.simpleClassName]));

    graphEl.innerHTML = `
        <div class="gdiagram" style="width:${canvasW}px;height:${canvasH}px;position:relative;">
            ${cards}
        </div>`;

    // Create SVG via DOM (no ID — use stored reference)
    activeDiagram = graphEl.querySelector('.gdiagram');
    activeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    activeSvg.setAttribute('width', canvasW);
    activeSvg.setAttribute('height', canvasH);
    activeSvg.style.cssText = 'position:absolute;top:0;left:0;overflow:visible;pointer-events:none;';
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `<marker id="garr_${graphEl.id}" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
        <path d="M0,0 L0,6 L8,3 z" fill="#1565C0"/>
    </marker>`;
    activeSvg.appendChild(defs);
    activeDiagram.insertBefore(activeSvg, activeDiagram.firstChild);

    refreshLines(entities);
}

// ---- ENTITY BROWSER ----
let allEntities = [];

function loadEntities() {
    fetch('/api/entities')
        .then(r => r.json())
        .then(entities => {
            allEntities = entities;
            entities.forEach(e => collapsedCards.add(e.simpleClassName));
            document.getElementById('entityCount').textContent = entities.length;
            renderEntityTree(entities);
            renderEntityGraph(entities);
        })
        .catch(() => {
            document.getElementById('entityTree').innerHTML =
                '<div class="loading" style="color:red">Failed to load entities</div>';
        });
}

function renderEntityTree(entities) {
    const tree = document.getElementById('entityTree');
    if (!entities.length) {
        tree.innerHTML = '<div class="loading">No entities found</div>';
        return;
    }

    const packages = {};
    entities.forEach(e => {
        const pkg = e.packageName || '(default)';
        if (!packages[pkg]) packages[pkg] = [];
        packages[pkg].push(e);
    });

    let html = '';
    Object.keys(packages).sort().forEach(pkg => {
        const pkgId = 'pkg_' + pkg.replace(/\./g, '_');
        const shortPkg = pkg.split('.').slice(-2).join('.');
        html += `<div class="pkg-group">
            <div class="pkg-header" onclick="togglePkg('${pkgId}', this)" title="${pkg}">
                <span class="tree-arrow expanded">▾</span>
                <span class="tree-icon">📁</span> ${shortPkg}
            </div>
            <div class="pkg-entities" id="${pkgId}">`;

        packages[pkg].forEach(entity => {
            const eId = 'entity_' + entity.simpleClassName;
            const fId = 'fields_' + entity.simpleClassName;
            html += `
                <div class="entity-row">
                    <div class="entity-item" id="${eId}"
                         onclick="selectEntity('${entity.className}', '${entity.simpleClassName}', '${fId}', this)"
                         title="${entity.className}">
                        <span class="tree-arrow">▸</span>
                        <span class="tree-icon">◈</span>
                        <span class="entity-name">${entity.simpleClassName}</span>
                    </div>
                    <div class="entity-fields" id="${fId}">`;

            if (entity.fields && entity.fields.length) {
                entity.fields.forEach(f => {
                    const cls = f.id ? 'field-id' : (f.association ? 'field-assoc' : '');
                    const icon = f.id ? '🔑' : (f.association ? '🔗' : '○');
                    const shortType = f.type ? f.type.split('.').pop() : '';
                    html += `<div class="field-item ${cls}"
                                  onclick="insertFieldInQuery('${entity.simpleClassName}', '${f.name}')"
                                  title="${f.type}">
                                <span class="field-connector">│&nbsp;&nbsp;</span>
                                ${icon} <span class="field-name">${f.name}</span>
                                <span class="field-type">: ${shortType}</span>
                              </div>`;
                });
            }
            html += `</div></div>`;
        });
        html += `</div></div>`;
    });
    tree.innerHTML = html;
}

function togglePkg(id, header) {
    const el = document.getElementById(id);
    const arrow = header.querySelector('.tree-arrow');
    if (!el) return;
    const collapsed = el.style.display === 'none';
    el.style.display = collapsed ? '' : 'none';
    arrow.textContent = collapsed ? '▾' : '▸';
    arrow.classList.toggle('expanded', collapsed);
}

function selectEntity(className, simpleName, fId, rowEl) {
    document.querySelectorAll('.entity-item').forEach(e => e.classList.remove('selected'));
    rowEl.classList.add('selected');

    const fields = document.getElementById(fId);
    if (fields) {
        const visible = fields.classList.contains('visible');
        document.querySelectorAll('.entity-fields').forEach(f => f.classList.remove('visible'));
        document.querySelectorAll('.entity-item .tree-arrow').forEach(a => { a.textContent = '▸'; a.classList.remove('expanded'); });
        if (!visible) {
            fields.classList.add('visible');
            const arrow = rowEl.querySelector('.tree-arrow');
            if (arrow) { arrow.textContent = '▾'; arrow.classList.add('expanded'); }
        }
    }

    const alias = simpleName.charAt(0).toLowerCase();
    editor.setValue(`from ${simpleName} ${alias}`);
}

function insertFieldInQuery(entityName, fieldName) {
    const current = editor.getValue();
    const alias = entityName.charAt(0).toLowerCase();
    if (!current.toLowerCase().includes('select')) {
        editor.setValue(`select ${alias}.${fieldName}\n${current}`);
    } else {
        editor.replaceSelection(alias + '.' + fieldName);
    }
}

function filterEntities(search) {
    const lower = search.toLowerCase();
    document.querySelectorAll('.entity-row').forEach(row => {
        const name = row.querySelector('.entity-name');
        row.style.display = (!lower || (name && name.textContent.toLowerCase().includes(lower))) ? '' : 'none';
    });
    if (search) {
        document.querySelectorAll('.pkg-entities').forEach(e => e.style.display = '');
    }
}

// ---- SCHEMA GRAPH (Hibern8IDE-style) ----
const CARD_W   = 210;
const FIELD_H  = 20;
const HEADER_H = 28;
const FOOTER_H = 24;
const GAP_Y    = 50;
const DETOUR_X = 40;
const ORIGIN_X = 16;
const ORIGIN_Y = 16;

let cardPositions  = {};
let dragState      = null;
let activeSvg      = null;   // reference to the live SVG element
let activeDiagram  = null;   // reference to the live diagram div
let activeGraphEl  = null;   // reference to the live graph container
let activeCols     = 1;
let activeGapX     = 0;

function renderEntityGraph(entities) {
    renderGraphInto(document.getElementById('entityGraph'), 1, 0, entities);
}

const collapsedCards = new Set();

function buildCard(entity, p) {
    const collapsed = collapsedCards.has(entity.simpleClassName);
    let fields = '';
    (entity.fields || []).forEach(f => {
        const icon = f.id ? '🔑' : (f.association ? '🔗' : '○');
        const cls  = f.id ? 'gef-id' : (f.association ? 'gef-assoc' : '');
        const t    = f.type ? f.type.split('.').pop() : '';
        fields += `<div class="gef ${cls}" onmousedown="event.stopPropagation()" onclick="insertFieldInQuery('${entity.simpleClassName}','${f.name}')">
            <span class="gef-icon">${icon}</span>
            <span class="gef-name">${f.name}</span>
            <span class="gef-type">${t}</span>
        </div>`;
    });
    return `<div class="gcard ${collapsed ? 'gcard-collapsed' : ''}" id="gc_${entity.simpleClassName}"
                 style="left:${p.x}px;top:${p.y}px;width:${p.w}px;"
                 onmousedown="startCardDrag(event,'${entity.simpleClassName}')">
        <div class="gcard-header" title="${entity.className}">
            <button class="gcollapse-btn" onmousedown="event.stopPropagation()"
                    onclick="toggleCardCollapse(event,'${entity.simpleClassName}')"
                    title="${collapsed ? 'Expand' : 'Collapse'}">${collapsed ? '▶' : '▼'}</button>
            <span class="gcard-title">🏷 ${entity.simpleClassName}</span>
            <span class="gcard-pkg">${entity.packageName ? entity.packageName.split('.').pop() : ''}</span>
        </div>
        <div class="gcard-fields" id="gcf_${entity.simpleClassName}" ${collapsed ? 'style="display:none"' : ''}>${fields}</div>
        <div class="gcard-footer" id="gcfoot_${entity.simpleClassName}"
             onmousedown="event.stopPropagation()" onclick="queryFromGraph('${entity.simpleClassName}')"
             ${collapsed ? 'style="display:none"' : ''}>▶ Query</div>
    </div>`;
}

function toggleCardCollapse(event, name) {
    event.stopPropagation();
    const collapsed = collapsedCards.has(name);
    if (collapsed) collapsedCards.delete(name); else collapsedCards.add(name);

    const fields = activeGraphEl.querySelector('#gcf_' + name);
    const footer = activeGraphEl.querySelector('#gcfoot_' + name);
    const btn    = event.currentTarget;
    const card   = activeGraphEl.querySelector('#gc_' + name);

    fields.style.display = collapsed ? '' : 'none';
    footer.style.display = collapsed ? '' : 'none';
    btn.textContent = collapsed ? '▼' : '▶';
    card.classList.toggle('gcard-collapsed', !collapsed);

    // Recalculate height and reflow positions
    const entity = allEntities.find(e => e.simpleClassName === name);
    const fieldCount = entity ? (entity.fields || []).length : 0;
    cardPositions[name].h = collapsed
        ? HEADER_H + fieldCount * FIELD_H + FOOTER_H
        : HEADER_H;

    reflowCards();
    refreshLines(allEntities);
}

function reflowCards() {
    if (!activeGraphEl || !allEntities.length) return;
    const cols = activeCols;
    const gapX = activeGapX;

    // Recalculate max height per row
    const maxH = [];
    allEntities.forEach((e, i) => {
        const row = Math.floor(i / cols);
        if (!maxH[row]) maxH[row] = 0;
        maxH[row] = Math.max(maxH[row], cardPositions[e.simpleClassName].h);
    });

    // Assign x/y for each card
    allEntities.forEach((e, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        let y = ORIGIN_Y;
        for (let r = 0; r < row; r++) y += (maxH[r] || 0) + GAP_Y;
        const x = ORIGIN_X + col * (CARD_W + gapX);
        cardPositions[e.simpleClassName].x = x;
        cardPositions[e.simpleClassName].y = y;
        const card = activeGraphEl.querySelector('#gc_' + e.simpleClassName);
        if (card) { card.style.top = y + 'px'; card.style.left = x + 'px'; }
    });

    const totalRows = Math.ceil(allEntities.length / cols);
    let canvasH = ORIGIN_Y;
    for (let r = 0; r < totalRows; r++) canvasH += (maxH[r] || 0) + GAP_Y;
    const canvasW = cols === 1
        ? ORIGIN_X + CARD_W + DETOUR_X + 20
        : ORIGIN_X + cols * (CARD_W + gapX) + DETOUR_X + 20;

    if (activeDiagram) { activeDiagram.style.height = canvasH + 'px'; activeDiagram.style.width = canvasW + 'px'; }
    if (activeSvg) { activeSvg.setAttribute('height', canvasH); activeSvg.setAttribute('width', canvasW); }
}

function refreshLines(entities) {
    if (!activeSvg) return;
    // Remove old paths/labels, keep defs
    const defs = activeSvg.querySelector('defs');
    while (activeSvg.lastChild && activeSvg.lastChild !== defs) activeSvg.removeChild(activeSvg.lastChild);

    const markerId = defs ? defs.querySelector('marker').id : 'garr';

    entities.forEach(e => {
        (e.fields || []).filter(f => f.association).forEach(f => {
            const typeName = f.type ? f.type.split('.').pop() : '';
            const from = cardPositions[e.simpleClassName];
            const to   = cardPositions[typeName];
            if (!from || !to) return;

            const rx = Math.max(from.x + from.w, to.x + to.w) + DETOUR_X;
            const x1 = from.x + from.w, y1 = from.y + from.h / 2;
            const x2 = to.x   + to.w,   y2 = to.y   + to.h / 2;

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', `M${x1},${y1} L${rx},${y1} L${rx},${y2} L${x2},${y2}`);
            path.setAttribute('stroke', '#1565C0');
            path.setAttribute('stroke-width', '2');
            path.setAttribute('fill', 'none');
            path.setAttribute('marker-end', `url(#${markerId})`);
            path.setAttribute('stroke-dasharray', '5,3');
            activeSvg.appendChild(path);

            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', rx + 4);
            label.setAttribute('y', (y1 + y2) / 2);
            label.setAttribute('font-size', '10');
            label.setAttribute('fill', '#1565C0');
            label.setAttribute('font-family', 'monospace');
            label.textContent = f.name;
            activeSvg.appendChild(label);
        });
    });
}

function startCardDrag(e, name) {
    if (e.button !== 0) return;
    e.preventDefault();
    const card = activeGraphEl ? activeGraphEl.querySelector('#gc_' + name) : document.getElementById('gc_' + name);
    const diagram = activeDiagram || card.parentElement;
    const dr = diagram.getBoundingClientRect();
    dragState = {
        name, card,
        ox: e.clientX - cardPositions[name].x,
        oy: e.clientY - cardPositions[name].y,
        dr
    };
    card.classList.add('dragging');
    document.addEventListener('mousemove', onCardDrag);
    document.addEventListener('mouseup', stopCardDrag);
}

function onCardDrag(e) {
    if (!dragState) return;
    const { name, card, ox, oy, dr } = dragState;
    const x = Math.max(0, e.clientX - dr.left - ox);
    const y = Math.max(0, e.clientY - dr.top  - oy);
    cardPositions[name].x = x;
    cardPositions[name].y = y;
    card.style.left = x + 'px';
    card.style.top  = y + 'px';
    refreshLines(allEntities);
}

function stopCardDrag() {
    if (dragState) { dragState.card.classList.remove('dragging'); dragState = null; }
    document.removeEventListener('mousemove', onCardDrag);
    document.removeEventListener('mouseup', stopCardDrag);
}

function queryFromGraph(simpleName) {
    const alias = simpleName.charAt(0).toLowerCase();
    const hql   = `from ${simpleName} ${alias}`;
    editor.setValue(hql);
    if (graphExpanded) toggleGraphDock();
    switchLeftTab('tree');
    executeQuery();
}

// ---- QUERY EXECUTION ----
function executeQuery() {
    const hql = editor.getValue().trim();
    if (!hql) { addMessage('error', 'Please enter an HQL query'); return; }

    setExecStatus('⏳ Running...');
    showTab('results');

    const request = {
        hql: hql,
        maxResults: 100,
        firstResult: 0,
        readOnly: document.getElementById('readOnlyToggle').checked
    };

    const start = Date.now();
    fetch('/api/query/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
    })
    .then(r => r.json())
    .then(result => {
        const elapsed = Date.now() - start;
        if (result.success) {
            currentResults = result.rows || [];
            currentColumns = result.columns || [];
            currentPage = 0;
            renderResults();
            setExecStatus(`✅ ${result.totalRows} rows in ${result.executionTimeMs}ms`);
            document.getElementById('resultStats').textContent =
                `${result.totalRows} rows, ${result.executionTimeMs}ms`;
            addMessage('success', `Query returned ${result.totalRows} rows in ${result.executionTimeMs}ms`);
            if (result.generatedSql) {
                document.getElementById('sqlOutput').textContent = formatSql(result.generatedSql);
            }
            addToHistory(hql);
        } else {
            setExecStatus('❌ Error');
            document.getElementById('errorOutput').textContent = result.message + '\n\n' + (result.errorDetail || '');
            addMessage('error', result.message);
            showTab('error');
        }
    })
    .catch(e => {
        setExecStatus('❌ Failed');
        addMessage('error', 'Network error: ' + e.message);
    });
}

function renderResults() {
    const container = document.getElementById('resultsContainer');
    if (!currentResults.length) {
        container.innerHTML = '<div class="empty-state">Query returned 0 rows</div>';
        document.getElementById('paginationContainer').innerHTML = '';
        return;
    }

    const start = currentPage * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, currentResults.length);
    const pageRows = currentResults.slice(start, end);

    let html = '<table class="results-table"><thead><tr>';
    currentColumns.forEach(col => {
        html += `<th>${col}</th>`;
    });
    html += '</tr></thead><tbody>';

    pageRows.forEach((row, rowIdx) => {
        html += `<tr onclick="openInspector(${start + rowIdx})">`;
        currentColumns.forEach(col => {
            const val = row[col];
            const display = val === null || val === undefined ? '<span style="opacity:0.4">null</span>' :
                           String(val).substring(0, 100);
            html += `<td title="${val !== null && val !== undefined ? String(val) : 'null'}">${display}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;

    // Pagination
    const totalPages = Math.ceil(currentResults.length / PAGE_SIZE);
    renderPagination(totalPages);
}

function renderPagination(totalPages) {
    const container = document.getElementById('paginationContainer');
    if (totalPages <= 1) { container.innerHTML = ''; return; }

    let html = `<button class="page-btn" onclick="goToPage(${currentPage - 1})" 
                        ${currentPage === 0 ? 'disabled' : ''}>‹ Prev</button>`;
    for (let i = 0; i < totalPages; i++) {
        if (i < 3 || i > totalPages - 3 || Math.abs(i - currentPage) < 2) {
            html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" 
                             onclick="goToPage(${i})">${i + 1}</button>`;
        } else if (Math.abs(i - currentPage) === 2) {
            html += `<span>...</span>`;
        }
    }
    html += `<button class="page-btn" onclick="goToPage(${currentPage + 1})"
                     ${currentPage >= totalPages - 1 ? 'disabled' : ''}>Next ›</button>`;
    html += `<span style="margin-left:8px;font-size:11px;color:var(--text-muted)">
                Page ${currentPage + 1} of ${totalPages} 
                (${currentResults.length} total rows)
             </span>`;
    container.innerHTML = html;
}

function goToPage(page) {
    const totalPages = Math.ceil(currentResults.length / PAGE_SIZE);
    if (page < 0 || page >= totalPages) return;
    currentPage = page;
    renderResults();
}

// ---- SQL GENERATION ----
function showGeneratedSql() {
    const hql = editor.getValue().trim();
    if (!hql) return;

    fetch('/api/query/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hql })
    })
    .then(r => r.json())
    .then(data => {
        document.getElementById('sqlOutput').textContent =
            data.sql ? formatSql(data.sql) : (data.error || 'Could not generate SQL');
        showTab('sql');
    });
}

function runGeneratedSql() {
    const sql = document.getElementById('sqlOutput').textContent.trim();
    if (!sql || sql.startsWith('Click') || sql.startsWith('Could not')) {
        addMessage('error', 'No SQL to run. Click "Show SQL" first.');
        return;
    }
    document.getElementById('sqlExecStatus').textContent = '⏳ Running...';
    const start = Date.now();
    fetch('/api/query/execute-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hql: sql, maxResults: 1000, firstResult: 0 })
    })
    .then(r => r.json())
    .then(result => {
        const elapsed = Date.now() - start;
        if (result.success) {
            currentResults = result.rows || [];
            currentColumns = result.columns || [];
            currentPage = 0;
            renderResults();
            showTab('results');
            document.getElementById('sqlExecStatus').textContent = `✅ ${result.totalRows} rows in ${result.executionTimeMs}ms`;
            document.getElementById('resultStats').textContent = `${result.totalRows} rows, ${result.executionTimeMs}ms`;
            addMessage('success', `SQL returned ${result.totalRows} rows in ${result.executionTimeMs}ms`);
        } else {
            document.getElementById('sqlExecStatus').textContent = '❌ Error';
            document.getElementById('errorOutput').textContent = result.message + '\n\n' + (result.errorDetail || '');
            showTab('error');
            addMessage('error', result.message);
        }
    })
    .catch(e => {
        document.getElementById('sqlExecStatus').textContent = '❌ Failed';
        addMessage('error', 'Network error: ' + e.message);
    });
}

function validateQuery() {
    const hql = editor.getValue().trim();
    if (!hql) return;

    fetch('/api/query/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hql })
    })
    .then(r => r.json())
    .then(data => {
        addMessage(data.valid ? 'success' : 'error', data.message);
        showTab('messages');
    });
}

function formatSql(sql) {
    if (!sql) return sql;
    return sql.split('\n\n/* --- */\n\n')
              .map(s => formatSingleSql(s.trim()))
              .join('\n\n/* --- */\n\n');
}

function formatSingleSql(sql) {
    if (!sql) return sql;
    sql = sql.replace(/\s+/g, ' ').trim();

    // Uppercase keywords
    [['select','SELECT'],['from','FROM'],['where','WHERE'],
     ['inner join','INNER JOIN'],['left join','LEFT JOIN'],['right join','RIGHT JOIN'],
     ['cross join','CROSS JOIN'],['outer join','OUTER JOIN'],
     ['order by','ORDER BY'],['group by','GROUP BY'],['having','HAVING'],
     [' on ',' ON '],['and','AND'],['or','OR']
    ].forEach(([lower, upper]) => {
        sql = sql.replace(new RegExp('\\b' + lower + '\\b', 'gi'), upper);
    });

    // Split SELECT column list onto separate indented lines
    const selectIdx = sql.indexOf('SELECT ');
    if (selectIdx !== -1) {
        let depth = 0, fromIdx = -1;
        for (let i = selectIdx + 7; i < sql.length - 5; i++) {
            if (sql[i] === '(') depth++;
            else if (sql[i] === ')') depth--;
            else if (depth === 0 && sql.slice(i, i + 5) === ' FROM') {
                fromIdx = i; break;
            }
        }
        if (fromIdx !== -1) {
            const cols = splitSqlColumns(sql.slice(selectIdx + 7, fromIdx));
            sql = sql.slice(0, selectIdx) +
                  'SELECT\n  ' + cols.join(',\n  ') +
                  '\n' + sql.slice(fromIdx + 1);
        }
    }

    // Newlines before structural keywords
    return sql
        .replace(/ INNER JOIN /g, '\nINNER JOIN ')
        .replace(/ LEFT JOIN /g, '\nLEFT JOIN ')
        .replace(/ RIGHT JOIN /g, '\nRIGHT JOIN ')
        .replace(/ CROSS JOIN /g, '\nCROSS JOIN ')
        .replace(/ OUTER JOIN /g, '\nOUTER JOIN ')
        .replace(/ ON /g, '\n  ON ')
        .replace(/ WHERE /g, '\nWHERE ')
        .replace(/ AND /g, '\n  AND ')
        .replace(/ OR /g, '\n  OR ')
        .replace(/ ORDER BY /g, '\nORDER BY ')
        .replace(/ GROUP BY /g, '\nGROUP BY ')
        .replace(/ HAVING /g, '\nHAVING ')
        .trim();
}

function splitSqlColumns(colStr) {
    const cols = [];
    let depth = 0, start = 0;
    for (let i = 0; i < colStr.length; i++) {
        if (colStr[i] === '(') depth++;
        else if (colStr[i] === ')') depth--;
        else if (colStr[i] === ',' && depth === 0) {
            cols.push(colStr.slice(start, i).trim());
            start = i + 1;
        }
    }
    if (start < colStr.length) cols.push(colStr.slice(start).trim());
    return cols;
}

// ---- HISTORY ----
function addToHistory(hql) {
    let history = JSON.parse(localStorage.getItem('hql_history') || '[]');
    history = history.filter(h => h !== hql);
    history.unshift(hql);
    history = history.slice(0, MAX_HISTORY);
    localStorage.setItem('hql_history', JSON.stringify(history));
    loadHistory();
}

function loadHistory() {
    const history = JSON.parse(localStorage.getItem('hql_history') || '[]');
    const sel = document.getElementById('historySelect');
    sel.innerHTML = '<option value="">⏱ Query History...</option>';
    history.forEach((h, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = h.substring(0, 60) + (h.length > 60 ? '...' : '');
        sel.appendChild(opt);
    });
}

function loadFromHistory(idx) {
    if (idx === '') return;
    const history = JSON.parse(localStorage.getItem('hql_history') || '[]');
    if (history[idx]) editor.setValue(history[idx]);
    document.getElementById('historySelect').value = '';
}

// ---- SAVED QUERIES ----
function saveQuery() {
    const hql = editor.getValue().trim();
    if (!hql) return;
    const name = prompt('Enter a name for this query:');
    if (!name) return;
    let saved = JSON.parse(localStorage.getItem('hql_saved') || '{}');
    saved[name] = hql;
    localStorage.setItem('hql_saved', JSON.stringify(saved));
    loadSavedQueries();
    addMessage('success', `Query saved as "${name}"`);
}

function loadSavedQueries() {
    const saved = JSON.parse(localStorage.getItem('hql_saved') || '{}');
    const sel = document.getElementById('savedSelect');
    sel.innerHTML = '<option value="">⭐ Saved Queries...</option>';
    Object.keys(saved).forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        sel.appendChild(opt);
    });
}

function loadSaved(name) {
    if (!name) return;
    const saved = JSON.parse(localStorage.getItem('hql_saved') || '{}');
    if (saved[name]) editor.setValue(saved[name]);
    document.getElementById('savedSelect').value = '';
}

// ---- EXPORT ----
function exportCSV() {
    if (!currentResults.length) return;
    let csv = currentColumns.join(',') + '\n';
    currentResults.forEach(row => {
        csv += currentColumns.map(col => {
            const val = row[col];
            const str = val === null || val === undefined ? '' : String(val);
            return '"' + str.replace(/"/g, '""') + '"';
        }).join(',') + '\n';
    });
    downloadFile('results.csv', csv, 'text/csv');
}

function exportJSON() {
    if (!currentResults.length) return;
    downloadFile('results.json', JSON.stringify(currentResults, null, 2), 'application/json');
}

function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    a.click(); URL.revokeObjectURL(url);
}

// ---- OBJECT INSPECTOR ----
function openInspector(rowIdx) {
    const row = currentResults[rowIdx];
    if (!row) return;
    document.getElementById('inspectorTitle').textContent = `Row ${rowIdx + 1} Inspector`;
    let html = '';
    Object.entries(row).forEach(([key, val]) => {
        const valHtml = val === null || val === undefined
            ? '<span class="inspector-null">null</span>'
            : String(val);
        html += `<div class="inspector-row">
                    <div class="inspector-key">${key}</div>
                    <div class="inspector-value">${valHtml}</div>
                 </div>`;
    });
    document.getElementById('inspectorBody').innerHTML = html;
    document.getElementById('inspectorModal').classList.add('visible');
}

function closeInspector(event) {
    if (event.target === document.getElementById('inspectorModal')) {
        document.getElementById('inspectorModal').classList.remove('visible');
    }
}

function closeInspectorBtn() {
    document.getElementById('inspectorModal').classList.remove('visible');
}

// ---- TABS ----
function showTab(name) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const tab = document.getElementById('tab-' + name);
    if (tab) tab.classList.add('active');
    document.querySelectorAll('.tab-btn').forEach(b => {
        if (b.textContent.toLowerCase().includes(name)) b.classList.add('active');
    });
}

// ---- DARK MODE ----
function toggleDarkMode() {
    const dark = document.getElementById('darkModeToggle').checked;
    document.body.className = dark ? 'dark' : 'light';
    editor.setOption('theme', dark ? 'dracula' : 'eclipse');
    localStorage.setItem('darkMode', dark);
}

// Restore dark mode preference
if (localStorage.getItem('darkMode') === 'true') {
    document.getElementById('darkModeToggle').checked = true;
    document.body.className = 'dark';
}

// ---- MISC ----
function clearEditor() { editor.setValue(''); editor.focus(); }

function setExecStatus(msg) {
    document.getElementById('execStatus').textContent = msg;
}

function addMessage(type, text) {
    const out = document.getElementById('messagesOutput');
    const div = document.createElement('div');
    div.className = `msg-entry ${type}`;
    div.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
    out.insertBefore(div, out.firstChild);
}

// ---- HQL AUTOCOMPLETE ----
function hqlHint(cm) {
    const cursor = cm.getCursor();
    const before = cm.getLine(cursor.line).slice(0, cursor.ch);

    // After FROM / JOIN / JOIN FETCH → suggest entity names
    const entityMatch = before.match(/(?:from|join(?:\s+fetch)?)\s+(\w*)$/i);
    if (entityMatch) {
        const typed = entityMatch[1].toLowerCase();
        const list = allEntities
            .map(e => e.simpleClassName)
            .filter(n => n.toLowerCase().startsWith(typed))
            .sort();
        if (!list.length) return null;
        return {
            list,
            from: CodeMirror.Pos(cursor.line, cursor.ch - entityMatch[1].length),
            to:   CodeMirror.Pos(cursor.line, cursor.ch)
        };
    }

    // After alias. → suggest field names
    const fieldMatch = before.match(/(\w+)\.(\w*)$/);
    if (fieldMatch) {
        const alias  = fieldMatch[1];
        const typed  = fieldMatch[2].toLowerCase();
        const entity = findEntityForAlias(cm.getValue(), alias);
        if (!entity) return null;
        const list = (entity.fields || [])
            .map(f => f.name)
            .filter(n => n.toLowerCase().startsWith(typed))
            .sort();
        if (!list.length) return null;
        return {
            list,
            from: CodeMirror.Pos(cursor.line, cursor.ch - fieldMatch[2].length),
            to:   CodeMirror.Pos(cursor.line, cursor.ch)
        };
    }
    return null;
}

function findEntityForAlias(hql, alias) {
    const pattern = new RegExp(
        `(?:from|join(?:\\s+fetch)?)\\s+([\\w.]+)\\s+(?:as\\s+)?${alias}\\b`, 'i'
    );
    const m = hql.match(pattern);
    if (!m) return null;
    const name = m[1].split('.').pop();
    return allEntities.find(e => e.simpleClassName.toLowerCase() === name.toLowerCase()) || null;
}

// ---- COPY SQL ----
function copySql() {
    const sql = document.getElementById('sqlOutput').textContent.trim();
    if (!sql || sql.startsWith('Click')) return;
    const btn = document.querySelector('.copy-sql-btn');
    navigator.clipboard.writeText(sql)
        .then(() => { btn.textContent = '✓ Copied'; setTimeout(() => { btn.textContent = '📋 Copy SQL'; }, 1500); })
        .catch(() => {
            const ta = document.createElement('textarea');
            ta.value = sql; document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); document.body.removeChild(ta);
            btn.textContent = '✓ Copied'; setTimeout(() => { btn.textContent = '📋 Copy SQL'; }, 1500);
        });
}

// ---- RESIZE HANDLE ----
function initResizeHandle() {
    const handle = document.getElementById('resizeHandle');
    const leftPanel = document.getElementById('leftPanel');
    let dragging = false, startX, startWidth;

    handle.addEventListener('mousedown', e => {
        dragging = true;
        startX = e.clientX;
        startWidth = leftPanel.offsetWidth;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', e => {
        if (!dragging) return;
        const newWidth = startWidth + (e.clientX - startX);
        if (newWidth > 150 && newWidth < 600) {
            leftPanel.style.width = newWidth + 'px';
        }
    });

    document.addEventListener('mouseup', () => {
        dragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    });
}
