// ═══════════════════════════════════════════════════════════
//  WUMPUS WORLD — KNOWLEDGE-BASED AGENT
//  Propositional Logic KB + CNF Resolution Refutation
// ═══════════════════════════════════════════════════════════

let ROWS=5, COLS=5, N_PITS=4;
let world={};
let agent={};
let episode=0;
let autoTimer=null;
let gameOver=false;
let gameWon=false;
let totalInferSteps=0;
let totalMoves=0;

const key=(r,c)=>`${r},${c}`;
const unkey=k=>k.split(',').map(Number);
const inBounds=(r,c)=>r>=0&&r<ROWS&&c>=0&&c<COLS;
const neighbors=(r,c)=>[[-1,0],[1,0],[0,-1],[0,1]].map(([dr,dc])=>[r+dr,c+dc]).filter(([nr,nc])=>inBounds(nr,nc));

function initGame(){
  clearInterval(autoTimer); autoTimer=null;
  ROWS=Math.max(3,Math.min(9,parseInt(document.getElementById('cfgRows').value)||5));
  COLS=Math.max(3,Math.min(9,parseInt(document.getElementById('cfgCols').value)||5));
  N_PITS=Math.max(1,Math.min(ROWS*COLS-4,parseInt(document.getElementById('cfgPits').value)||4));
  episode++;
  gameOver=false; gameWon=false;
  totalInferSteps=0; totalMoves=0;
  world={pits:new Set(),wumpus:null,gold:null};
  agent={
    pos:[0,0],visited:new Set(),safeSet:new Set(),
    pitSuspect:new Set(),wumpusSuspect:new Set(),dangerSet:new Set(),
    kb:{breeze:new Set(),stench:new Set(),noBreeze:new Set(),noStench:new Set(),visited:new Set()},
    wumpusDead:false,goldGrabbed:false,path:[],moveCount:0
  };
  agent.visited.add(key(0,0));
  agent.safeSet.add(key(0,0));
  agent.kb.visited.add(key(0,0));

  let placed=0,attempts=0;
  while(placed<N_PITS&&attempts<1000){
    attempts++;
    let r=Math.floor(Math.random()*ROWS),c=Math.floor(Math.random()*COLS);
    if((r===0&&c===0)||(r===0&&c===1)||(r===1&&c===0)) continue;
    if(world.pits.has(key(r,c))) continue;
    world.pits.add(key(r,c)); placed++;
  }
  attempts=0;
  do{
    let r=Math.floor(Math.random()*ROWS),c=Math.floor(Math.random()*COLS);
    if(r===0&&c===0) continue;
    if(world.pits.has(key(r,c))) continue;
    world.wumpus=key(r,c); attempts++;
  }while(!world.wumpus&&attempts<500);
  attempts=0;
  do{
    let r=Math.floor(Math.random()*ROWS),c=Math.floor(Math.random()*COLS);
    let k=key(r,c);
    if(r===0&&c===0) continue;
    if(world.pits.has(k)||k===world.wumpus) continue;
    world.gold=k; attempts++;
  }while(!world.gold&&attempts<500);

  agent.path=[key(0,0)];
  document.getElementById('btnStep').disabled=false;
  document.getElementById('btnAuto').disabled=false;
  document.getElementById('btnReset').disabled=false;
  document.getElementById('btnAuto').textContent='\u25BA\u25BA AUTO';
  document.getElementById('episodePill').textContent=`EP ${episode}`;
  setStatus('idle','Agent at (1,1) — press STEP or AUTO to begin inference');
  setHeaderBadge('EXPLORING');
  document.getElementById('infLog').innerHTML='<div style="color:var(--dim)">No resolution steps yet.</div>';
  document.getElementById('kbLog').innerHTML=`<div class="log-entry log-sys"><span class="log-prefix">&rsaquo;</span>Episode ${episode}: KB initialized.</div>`;
  updateMetrics();
  perceiveAndTell();
  renderGrid();
}

function perceive(r,c){
  let p={breeze:false,stench:false,glitter:false,scream:false};
  neighbors(r,c).forEach(([nr,nc])=>{
    if(world.pits.has(key(nr,nc))) p.breeze=true;
    if(key(nr,nc)===world.wumpus&&!agent.wumpusDead) p.stench=true;
  });
  if(key(r,c)===world.gold&&!agent.goldGrabbed) p.glitter=true;
  return p;
}

function perceiveAndTell(){
  let [r,c]=agent.pos;
  let p=perceive(r,c);
  let k=key(r,c);

  setPercept('pBreeze',p.breeze);
  setPercept('pStench',p.stench);
  setPercept('pGlitter',p.glitter);
  setPercept('pScream',agent.wumpusDead);
  document.getElementById('posLabel').textContent=`[${r+1},${c+1}]`;

  if(p.breeze){
    agent.kb.breeze.add(k);
    tellKB(`TELL: B_${r+1}_${c+1} — Breeze at (${r+1},${c+1})`,'tell');
    let adjs=neighbors(r,c).map(([nr,nc])=>`P_${nr+1}_${nc+1}`).join(' v ');
    tellKB(`  KB += B_${r+1}_${c+1} <=> ${adjs}`,'tell');
  } else {
    agent.kb.noBreeze.add(k);
    tellKB(`TELL: !B_${r+1}_${c+1} — No breeze at (${r+1},${c+1})`,'tell');
    neighbors(r,c).forEach(([nr,nc])=>{
      let nk=key(nr,nc);
      if(!agent.safeSet.has(nk)){
        agent.safeSet.add(nk);
        agent.pitSuspect.delete(nk);
        agent.wumpusSuspect.delete(nk);
      }
    });
    tellKB(`  KB += !P for all adj to (${r+1},${c+1})`,'infer');
  }

  if(p.stench){
    agent.kb.stench.add(k);
    tellKB(`TELL: S_${r+1}_${c+1} — Stench at (${r+1},${c+1})`,'tell');
    let adjs=neighbors(r,c).map(([nr,nc])=>`W_${nr+1}_${nc+1}`).join(' v ');
    tellKB(`  KB += S_${r+1}_${c+1} <=> ${adjs}`,'tell');
  } else if(!agent.wumpusDead){
    agent.kb.noStench.add(k);
    tellKB(`TELL: !S_${r+1}_${c+1} — No stench at (${r+1},${c+1})`,'tell');
    neighbors(r,c).forEach(([nr,nc])=>{agent.wumpusSuspect.delete(key(nr,nc));});
    tellKB(`  KB += !W for all adj to (${r+1},${c+1})`,'infer');
  }

  if(p.glitter){ agent.goldGrabbed=true; tellKB(`TELL: Glitter at (${r+1},${c+1}) — GOLD GRABBED`,'move'); gameWon=true; }
  agent.kb.visited.add(k);
}

function setPercept(id,active){
  let el=document.getElementById(id);
  // FIX APPLIED HERE: Changed '.percept-status' to '.p-status'
  let st=el.querySelector('.p-status'); 
  if(active){el.classList.add('percept-active');st.textContent='ACTIVE';}
  else{el.classList.remove('percept-active');st.textContent='NONE';}
}

// ── CNF Resolution ────────────────────────────────────────
function parseLit(s){s=s.trim();if(s.startsWith('!')) return{neg:true,var:s.slice(1)};return{neg:false,var:s};}
function litStr(l){return(l.neg?'!':'')+l.var}
function clausesEqual(a,b){if(a.length!==b.length)return false;let sa=a.map(litStr).sort().join('|'),sb=b.map(litStr).sort().join('|');return sa===sb;}
function clauseContains(c,lit){return c.some(l=>l.neg===lit.neg&&l.var===lit.var)}
function resolve(c1,c2){
  for(let lit of c1){
    let comp={neg:!lit.neg,var:lit.var};
    if(clauseContains(c2,comp)){
      let res=[...c1.filter(l=>!(l.neg===lit.neg&&l.var===lit.var)),...c2.filter(l=>!(l.neg===comp.neg&&l.var===comp.var))];
      let seen=new Set(),unique=[];
      for(let l of res){let s=litStr(l);if(!seen.has(s)){seen.add(s);unique.push(l);}}
      for(let l of unique){if(unique.some(m=>m.var===l.var&&m.neg!==l.neg))return null;}
      return unique;
    }
  }
  return null;
}

function buildCNF(){
  let clauses=[];
  agent.safeSet.forEach(k=>{let[r,c]=unkey(k);clauses.push([{neg:true,var:`P_${r+1}_${c+1}`}]);clauses.push([{neg:true,var:`W_${r+1}_${c+1}`}]);});
  agent.kb.noBreeze.forEach(k=>{let[r,c]=unkey(k);neighbors(r,c).forEach(([nr,nc])=>clauses.push([{neg:true,var:`P_${nr+1}_${nc+1}`}]));});
  agent.kb.breeze.forEach(k=>{
    let[r,c]=unkey(k);
    let u=neighbors(r,c).filter(([nr,nc])=>!agent.safeSet.has(key(nr,nc)));
    if(u.length>0) clauses.push(u.map(([nr,nc])=>({neg:false,var:`P_${nr+1}_${nc+1}`})));
  });
  agent.kb.noStench.forEach(k=>{let[r,c]=unkey(k);neighbors(r,c).forEach(([nr,nc])=>clauses.push([{neg:true,var:`W_${nr+1}_${nc+1}`}]));});
  agent.kb.stench.forEach(k=>{
    let[r,c]=unkey(k);
    let u=neighbors(r,c).filter(([nr,nc])=>!agent.safeSet.has(key(nr,nc))&&!agent.wumpusDead);
    if(u.length>0) clauses.push(u.map(([nr,nc])=>({neg:false,var:`W_${nr+1}_${nc+1}`})));
  });
  if(agent.wumpusDead) for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) clauses.push([{neg:true,var:`W_${r+1}_${c+1}`}]);
  agent.visited.forEach(k=>{let[r,c]=unkey(k);clauses.push([{neg:true,var:`P_${r+1}_${c+1}`}]);clauses.push([{neg:true,var:`W_${r+1}_${c+1}`}]);});
  return clauses;
}

function resolutionRefutation(qr,qc){
  let infLog=document.getElementById('infLog');
  infLog.innerHTML='';
  let steps=0;
  let results={noPit:false,noWumpus:false};

  for(let qt of['pit','wumpus']){
    let vn=qt==='pit'?`P_${qr+1}_${qc+1}`:`W_${qr+1}_${qc+1}`;
    let clauses=buildCNF();
    clauses.push([{neg:false,var:vn}]);
    addInfLine(`<span class="inf-clause">ASK: !${vn} — refuting ${vn}</span>`);
    addInfLine(`<span style="color:var(--dim)">CNF: ${clauses.length} clauses</span>`);
    let proved=false,maxIter=200,iter=0;
    while(iter<maxIter){
      iter++;
      let newClause=null,found=false;
      for(let i=0;i<clauses.length&&!found;i++){
        for(let j=i+1;j<clauses.length&&!found;j++){
          let res=resolve(clauses[i],clauses[j]);
          if(res!==null){
            steps++;totalInferSteps++;
            if(res.length===0){
              addInfLine(`<span class="inf-result">CONTRADICTION — !${vn} proved</span>`);
              proved=true;found=true;break;
            }
            let exists=clauses.some(c=>clausesEqual(c,res));
            if(!exists){
              newClause=res;found=true;
              addInfLine(`<span class="inf-resolve">[${clauses[i].map(litStr).join('v')}] x [${clauses[j].map(litStr).join('v')}] -> [${res.map(litStr).join('v')}]</span>`);
            }
          }
        }
      }
      if(proved) break;
      if(!found||newClause===null) break;
      clauses.push(newClause);
      if(clauses.length>300) break;
    }
    if(qt==='pit'){results.noPit=proved;if(!proved)addInfLine(`<span class="inf-fail">FAIL: cannot prove !P_${qr+1}_${qc+1}</span>`);}
    else{results.noWumpus=proved;if(!proved)addInfLine(`<span class="inf-fail">FAIL: cannot prove !W_${qr+1}_${qc+1}</span>`);}
  }
  addInfLine(`<span style="color:var(--dim)">Steps this query: ${steps}</span>`);
  updateMetrics();
  return results.noPit&&results.noWumpus;
}

function addInfLine(html){
  let d=document.getElementById('infLog');
  d.innerHTML+=`<div>${html}</div>`;
  d.scrollTop=d.scrollHeight;
}

// ── Agent Decision ────────────────────────────────────────
function classifyCells(){
  agent.dangerSet=new Set();agent.pitSuspect=new Set();agent.wumpusSuspect=new Set();
  agent.kb.breeze.forEach(k=>{
    let[r,c]=unkey(k);
    neighbors(r,c).forEach(([nr,nc])=>{let nk=key(nr,nc);if(!agent.safeSet.has(nk)&&!agent.visited.has(nk)){agent.pitSuspect.add(nk);agent.dangerSet.add(nk);}});
  });
  if(!agent.wumpusDead){
    agent.kb.stench.forEach(k=>{
      let[r,c]=unkey(k);
      neighbors(r,c).forEach(([nr,nc])=>{let nk=key(nr,nc);if(!agent.safeSet.has(nk)&&!agent.visited.has(nk)){agent.wumpusSuspect.add(nk);agent.dangerSet.add(nk);}});
    });
  }
}

function chooseNextMove(){
  let[r,c]=agent.pos;let adj=neighbors(r,c);
  let sf=adj.filter(([nr,nc])=>!agent.visited.has(key(nr,nc))&&agent.safeSet.has(key(nr,nc)));
  if(sf.length>0){
    sf.sort((a,b)=>{
      let ua=neighbors(a[0],a[1]).filter(([r,c])=>!agent.visited.has(key(r,c))).length;
      let ub=neighbors(b[0],b[1]).filter(([r,c])=>!agent.visited.has(key(r,c))).length;
      return ub-ua;
    });
    return sf[0];
  }
  let unk=adj.filter(([nr,nc])=>!agent.visited.has(key(nr,nc))&&!agent.dangerSet.has(key(nr,nc)));
  for(let[nr,nc] of unk){
    let nk=key(nr,nc);
    tellKB(`ASK: is (${nr+1},${nc+1}) safe? Running resolution...`,'ask');
    let safe=resolutionRefutation(nr,nc);
    if(safe){agent.safeSet.add(nk);agent.dangerSet.delete(nk);tellKB(`PROVED: (${nr+1},${nc+1}) is SAFE`,'infer');return[nr,nc];}
    else{tellKB(`Cannot prove (${nr+1},${nc+1}) safe`,'warn');}
  }
  let va=adj.filter(([nr,nc])=>agent.visited.has(key(nr,nc)));
  if(va.length>0){
    let t=bfsToSafe();
    if(t){let p=bfsPath(agent.pos,t);if(p&&p.length>1)return p[1];}
    return va[Math.floor(Math.random()*va.length)];
  }
  let risky=adj.filter(([nr,nc])=>!agent.visited.has(key(nr,nc)));
  if(risky.length>0){let nd=risky.filter(([nr,nc])=>!agent.dangerSet.has(key(nr,nc)));return nd.length?nd[0]:risky[0];}
  return null;
}

function bfsToSafe(){
  let queue=[[...agent.pos]],seen=new Set([key(...agent.pos)]);
  while(queue.length){
    let[r,c]=queue.shift();
    for(let[nr,nc] of neighbors(r,c)){
      let nk=key(nr,nc);if(seen.has(nk))continue;seen.add(nk);
      if(agent.safeSet.has(nk)&&!agent.visited.has(nk))return[nr,nc];
      if(agent.safeSet.has(nk)||agent.visited.has(nk))queue.push([nr,nc]);
    }
  }
  return null;
}

function bfsPath(from,to){
  let queue=[[...from]],prev={};prev[key(...from)]=null;let found=false;
  while(queue.length&&!found){
    let[r,c]=queue.shift();
    if(r===to[0]&&c===to[1]){found=true;break;}
    for(let[nr,nc] of neighbors(r,c)){
      let nk=key(nr,nc);if(nk in prev)continue;
      if(!agent.visited.has(nk)&&!agent.safeSet.has(nk))continue;
      prev[nk]=[r,c];queue.push([nr,nc]);
    }
  }
  if(!found)return null;
  let path=[],cur=to;while(cur){path.unshift(cur);let k=key(...cur);cur=prev[k];}
  return path;
}

function stepAgent(){
  if(gameOver||gameWon){showToast(gameWon?'ALREADY WON':'AGENT DEAD','info');return;}
  classifyCells();
  let next=chooseNextMove();
  if(!next){setStatus('idle','No safe moves. Exploration complete.');tellKB('No safe moves found.','sys');stopAuto();return;}
  let[nr,nc]=next,nk=key(nr,nc);
  agent.pos=[nr,nc];agent.visited.add(nk);agent.safeSet.add(nk);
  agent.path.push(nk);agent.moveCount++;totalMoves++;
  tellKB(`MOVE -> (${nr+1},${nc+1})`,'move');

  if(world.pits.has(nk)){
    gameOver=true;
    setStatus('dead',`AGENT FELL INTO PIT AT (${nr+1},${nc+1})`);
    setHeaderBadge('DEAD');tellKB(`FATAL: Pit at (${nr+1},${nc+1})`,'warn');
    showToast('AGENT FELL INTO A PIT','dead');renderGrid();updateMetrics();stopAuto();return;
  }
  if(nk===world.wumpus&&!agent.wumpusDead){
    gameOver=true;
    setStatus('dead',`AGENT EATEN BY WUMPUS AT (${nr+1},${nc+1})`);
    setHeaderBadge('DEAD');tellKB(`FATAL: Wumpus at (${nr+1},${nc+1})`,'warn');
    showToast('AGENT EATEN BY WUMPUS','dead');renderGrid();updateMetrics();stopAuto();return;
  }
  perceiveAndTell();classifyCells();
  if(gameWon){
    setStatus('win',`GOLD GRABBED AT (${nr+1},${nc+1}) — AGENT WINS`);
    setHeaderBadge('WON');showToast('GOLD GRABBED — WIN','win');stopAuto();
  } else {
    setStatus('running',`Agent at (${nr+1},${nc+1}) — exploring...`);
  }
  let allDone=true;
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){if(agent.safeSet.has(key(r,c))&&!agent.visited.has(key(r,c))){allDone=false;break;}}
  if(allDone&&!gameWon&&!gameOver){setStatus('idle','All safe cells explored.');stopAuto();}
  updateMetrics();renderGrid();
}

function toggleAuto(){
  if(autoTimer){stopAuto();}
  else{
    let btn=document.getElementById('btnAuto');
    btn.textContent='|| PAUSE';btn.className='btn btn-step';
    let speed=parseInt(document.getElementById('speedSel').value)||450;
    autoTimer=setInterval(()=>{if(gameOver||gameWon){stopAuto();return;}stepAgent();},speed);
  }
}
function stopAuto(){
  clearInterval(autoTimer);autoTimer=null;
  let btn=document.getElementById('btnAuto');
  btn.textContent='\u25BA\u25BA AUTO';btn.className='btn btn-secondary';
}
function resetRun(){stopAuto();initGame();}

// ── Rendering ─────────────────────────────────────────────
function renderGrid(){
  let canvas=document.getElementById('gridCanvas');
  let wrap=document.getElementById('gridWrap');
  let maxW=wrap.clientWidth-24,maxH=wrap.clientHeight-24;
  let cellSize=Math.min(Math.floor(Math.min(maxW/COLS,maxH/ROWS)),108);
  cellSize=Math.max(cellSize,50);
  canvas.style.gridTemplateColumns=`repeat(${COLS},${cellSize}px)`;
  canvas.style.gridTemplateRows=`repeat(${ROWS},${cellSize}px)`;
  let html='';
  for(let r=ROWS-1;r>=0;r--) for(let c=0;c<COLS;c++) html+=renderCell(r,c,cellSize);
  canvas.innerHTML=html;
}

function renderCell(r,c,size){
  let k=key(r,c);
  let isAgent=agent.pos[0]===r&&agent.pos[1]===c;
  let isVisited=agent.visited.has(k);
  let isSafe=agent.safeSet.has(k);
  let isDanger=agent.dangerSet.has(k);
  let isPitSuspect=agent.pitSuspect.has(k);
  let isWumpusSuspect=agent.wumpusSuspect.has(k);
  let isStart=r===0&&c===0;
  let isRevealedPit=gameOver&&world.pits.has(k);
  let isRevealedWumpus=gameOver&&k===world.wumpus;
  let isRevealedGold=gameOver&&k===world.gold&&!agent.goldGrabbed;

  let cls='cell ';
  let symSize=Math.max(Math.floor(size*.3),14);
  let sym='',tags='';

  if(isAgent){
    cls+='cell-agent';
    sym=`<span class="cell-sym" style="font-size:${symSize}px">A</span>`;
    if(agent.goldGrabbed) tags+=`<span class="cell-tag" style="background:#fff;border-color:#aaa;color:#000">+G</span>`;
  } else if(isRevealedPit){
    cls+='cell-pit';
    sym=`<span class="cell-sym" style="font-size:${symSize}px">P</span>`;
  } else if(isRevealedWumpus){
    cls+='cell-wumpus';
    sym=`<span class="cell-sym" style="font-size:${symSize}px">W</span>`;
  } else if(isRevealedGold){
    cls+='cell-gold';
    sym=`<span class="cell-sym" style="font-size:${symSize}px">G</span>`;
  } else if(isStart&&isVisited){
    cls+='cell-start';
    sym=`<span class="cell-sym" style="font-size:${symSize}px;color:var(--muted)">H</span>`;
  } else if(isVisited){
    cls+='cell-safe';
    let hasBr=agent.kb.breeze.has(k),hasSt=agent.kb.stench.has(k);
    if(hasBr) tags+=`<span class="cell-tag" style="background:var(--s3);border-color:var(--border2);color:var(--text)">B</span>`;
    if(hasSt) tags+=`<span class="cell-tag" style="background:var(--s3);border-color:var(--border2);color:var(--text)">S</span>`;
    sym=`<span class="cell-sym" style="font-size:${Math.max(symSize*.7,11)}px;color:var(--border2)">&#10003;</span>`;
  } else if(isSafe&&!isDanger){
    cls+='cell-safe';
    sym=`<span class="cell-sym" style="font-size:${Math.max(symSize*.7,11)}px;color:var(--dim)">o</span>`;
  } else if(isDanger){
    cls+='cell-danger';
    if(isPitSuspect) tags+=`<span class="cell-tag" style="background:var(--s3);border-color:var(--border2);color:var(--text)">P?</span>`;
    if(isWumpusSuspect) tags+=`<span class="cell-tag" style="background:var(--s3);border-color:var(--border2);color:var(--text)">W?</span>`;
    sym=`<span class="cell-sym" style="font-size:${Math.max(symSize*.7,11)}px;color:var(--muted)">!</span>`;
  } else {
    cls+='cell-unknown';
    sym=`<span class="cell-sym" style="font-size:${Math.max(symSize*.7,11)}px;color:var(--dim)">?</span>`;
  }

  let lblSize=Math.max(Math.floor(size*.13),8);
  return `<div class="${cls}" style="width:${size}px;height:${size}px">
    <span class="cell-coord" style="font-size:${lblSize}px">${r+1},${c+1}</span>
    <div class="cell-inner">
      <div class="cell-icon">${sym}</div>
      ${tags?`<div class="cell-tags">${tags}</div>`:''}
    </div>
  </div>`;
}

// ── Helpers ───────────────────────────────────────────────
function tellKB(msg,type){
  let d=document.getElementById('kbLog');
  d.innerHTML+=`<div class="log-entry log-${type||'sys'}"><span class="log-prefix">&rsaquo;</span>${msg}</div>`;
  d.scrollTop=d.scrollHeight;
}
function setStatus(state,msg){
  let el=document.getElementById('statusBanner');
  el.className='status-banner status-'+state;
  let txt=el.querySelector('#statusText');
  if(txt){txt.textContent=msg.toUpperCase();}else{el.textContent=msg.toUpperCase();}
}
function setHeaderBadge(label){
  document.getElementById('headerMeta').innerHTML=`<span class="badge-dot"></span><span class="badge-text">SYS_${label.toUpperCase()}</span>`;
}
function updateMetrics(){
  document.getElementById('mInfer').textContent=totalInferSteps;
  document.getElementById('mMoves').textContent=totalMoves;
  document.getElementById('mSafe').textContent=agent.safeSet?agent.safeSet.size:0;
  document.getElementById('mDanger').textContent=agent.dangerSet?agent.dangerSet.size:0;
}
function showToast(msg,type){
  let t=document.getElementById('toast');
  t.textContent=msg;t.className=`toast toast-${type} show`;
  setTimeout(()=>t.classList.remove('show'),3000);
}

window.addEventListener('resize',()=>{if(world.pits)renderGrid();});
window.addEventListener('load',()=>{initGame();});// final fix
