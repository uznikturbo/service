import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { apiClient, authApi } from '../api'
import { useToast } from '../context/ToastContext'
import { Spinner } from '../components/ui'
import type { User } from '../types'

// ═══════════════════════════════════════════════
//  SNAKE
// ═══════════════════════════════════════════════
const SN_COLS = 26
const SN_ROWS = 22
const SN_CELL = 17
const SN_TICK = 105

type Dir = 'U' | 'D' | 'L' | 'R'
type Pt  = { x: number; y: number }
const OPP: Record<Dir, Dir> = { U:'D', D:'U', L:'R', R:'L' }

function randPt(snake: Pt[]): Pt {
  let p: Pt
  do { p = { x: Math.floor(Math.random()*SN_COLS), y: Math.floor(Math.random()*SN_ROWS) } }
  while (snake.some(s => s.x===p.x && s.y===p.y))
  return p
}

function SnakeGame() {
  type GS = 'idle'|'run'|'dead'
  const [gs, setGs]       = useState<GS>('idle')
  const [snake, setSnake] = useState<Pt[]>([{x:13,y:11}])
  const [food,  setFood]  = useState<Pt>({x:6,y:6})
  const [score, setScore] = useState(0)
  const [best,  setBest]  = useState(()=>+(localStorage.getItem('sd_snake_best')||0))

  const snakeR = useRef<Pt[]>([{x:13,y:11}])
  const foodR  = useRef<Pt>({x:6,y:6})
  const scoreR = useRef(0)
  const dirR   = useRef<Dir>('R')
  const nextR  = useRef<Dir>('R')
  const ivR    = useRef<ReturnType<typeof setInterval>|null>(null)

  const stop = useCallback(()=>{
    if (ivR.current) clearInterval(ivR.current)
    setGs('dead')
    setBest(prev=>{ const nb=Math.max(prev,scoreR.current); localStorage.setItem('sd_snake_best',String(nb)); return nb })
  },[])

  const tick = useCallback(()=>{
    dirR.current = nextR.current
    const h = snakeR.current[0], d = dirR.current
    const nx: Pt = {
      x:(h.x+(d==='R'?1:d==='L'?-1:0)+SN_COLS)%SN_COLS,
      y:(h.y+(d==='D'?1:d==='U'?-1:0)+SN_ROWS)%SN_ROWS,
    }
    if (snakeR.current.some(s=>s.x===nx.x&&s.y===nx.y)){ stop(); return }
    const ate = nx.x===foodR.current.x && nx.y===foodR.current.y
    const ns = [nx,...snakeR.current.slice(0,ate?undefined:-1)]
    snakeR.current = ns; setSnake([...ns])
    if (ate){ const nf=randPt(ns); foodR.current=nf; setFood(nf); scoreR.current++; setScore(scoreR.current) }
  },[stop])

  const start = useCallback(()=>{
    if (ivR.current) clearInterval(ivR.current)
    const s: Pt[]=[{x:13,y:11}]; const f=randPt(s)
    snakeR.current=s; foodR.current=f; scoreR.current=0; dirR.current='R'; nextR.current='R'
    setSnake(s); setFood(f); setScore(0); setGs('run')
    ivR.current = setInterval(tick,SN_TICK)
  },[tick])

  useEffect(()=>()=>{ if(ivR.current) clearInterval(ivR.current) },[])

  useEffect(()=>{
    if (gs!=='run') return
    const h=(e:KeyboardEvent)=>{
      const map:Record<string,Dir>={ArrowUp:'U',ArrowDown:'D',ArrowLeft:'L',ArrowRight:'R',w:'U',s:'D',a:'L',d:'R'}
      const nd=map[e.key]; if(!nd) return; e.preventDefault()
      if(nd!==OPP[dirR.current]) nextR.current=nd
    }
    window.addEventListener('keydown',h)
    return ()=>window.removeEventListener('keydown',h)
  },[gs])

  const W=SN_COLS*SN_CELL, H=SN_ROWS*SN_CELL

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
      <div style={{display:'flex',gap:32,fontFamily:'var(--font-mono)',fontSize:12,color:'var(--text3)'}}>
        <span>SCORE <b style={{color:'var(--accent)',fontSize:14}}>{String(score).padStart(3,'0')}</b></span>
        <span>BEST  <b style={{color:'var(--text2)',fontSize:14}}>{String(best).padStart(3,'0')}</b></span>
      </div>

      <div style={{position:'relative',width:W,height:H,background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'var(--radius)',overflow:'hidden',cursor:gs!=='run'?'pointer':'default'}}
           onClick={gs!=='run'?start:undefined}>
        {/* grid */}
        <svg style={{position:'absolute',inset:0,opacity:0.08}} width={W} height={H}>
          {Array.from({length:SN_COLS+1},(_,i)=><line key={`v${i}`} x1={i*SN_CELL} y1={0} x2={i*SN_CELL} y2={H} stroke="#fff" strokeWidth="0.5"/>)}
          {Array.from({length:SN_ROWS+1},(_,i)=><line key={`h${i}`} x1={0} y1={i*SN_CELL} x2={W} y2={i*SN_CELL} stroke="#fff" strokeWidth="0.5"/>)}
        </svg>
        {/* snake */}
        {snake.map((s,i)=>(
          <div key={`${s.x}-${s.y}-${i}`} style={{
            position:'absolute',left:s.x*SN_CELL+1,top:s.y*SN_CELL+1,
            width:SN_CELL-2,height:SN_CELL-2,borderRadius:i===0?5:2,
            background:i===0?'var(--accent)':`rgba(245,158,11,${Math.max(0.15,1-i*(0.8/Math.max(snake.length,1)))})`,
            boxShadow:i===0?'0 0 10px rgba(245,158,11,0.6)':'none',
          }}/>
        ))}
        {/* food */}
        <div style={{position:'absolute',left:food.x*SN_CELL+3,top:food.y*SN_CELL+3,width:SN_CELL-6,height:SN_CELL-6,borderRadius:'50%',background:'var(--red)',boxShadow:'0 0 10px rgba(239,68,68,0.9)',animation:'pulse 1s ease-in-out infinite'}}/>
        {/* overlay */}
        {gs!=='run'&&(
          <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'rgba(10,10,11,0.88)',backdropFilter:'blur(4px)',gap:12}}>
            {gs==='dead'&&<div style={{fontFamily:'var(--font-head)',fontSize:22,fontWeight:800,color:'var(--red)',letterSpacing:'0.1em'}}>GAME OVER</div>}
            {gs==='dead'&&<div style={{fontFamily:'var(--font-mono)',fontSize:13,color:'var(--text2)'}}>Рахунок: <b style={{color:'var(--accent)'}}>{score}</b></div>}
            <div style={{marginTop:4,padding:'8px 22px',border:'1px solid var(--accent)',borderRadius:'var(--radius)',color:'var(--accent)',fontFamily:'var(--font-mono)',fontSize:12,letterSpacing:'0.12em'}}>
              {gs==='idle'?'▶  СТАРТ':'▶  ЩЕ РАЗ'}
            </div>
            <div style={{fontSize:10,color:'var(--text3)',fontFamily:'var(--font-mono)',letterSpacing:'0.1em'}}>WASD / СТРІЛКИ</div>
          </div>
        )}
      </div>

      {/* d-pad */}
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
        {[['','U',''],['L','','R'],['','D','']].map((row,ri)=>(
          <div key={ri} style={{display:'flex',gap:3}}>
            {row.map((cell,ci)=>cell?(
              <button key={ci}
                onPointerDown={e=>{e.preventDefault();if(gs==='run'&&(cell as Dir)!==OPP[dirR.current])nextR.current=cell as Dir}}
                style={{width:34,height:34,background:'var(--bg3)',border:'1px solid var(--border2)',borderRadius:'var(--radius)',color:'var(--text2)',cursor:'pointer',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center',WebkitTapHighlightColor:'transparent'}}>
                {cell==='U'?'↑':cell==='D'?'↓':cell==='L'?'←':'→'}
              </button>
            ):<div key={ci} style={{width:34,height:34}}/>)}
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════
//  PONG — повністю на Canvas + rAF
// ═══════════════════════════════════════════════
function PongGame({ width }: { width: number }) {
  const H = Math.round(width * 0.58)
  const PAD_H = Math.round(H * 0.22)
  const PAD_W = 10
  const BALL  = 10
  const SPEED_INIT = width * 0.007

  type PGS = 'idle'|'run'|'over'
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pgs,    setPgs]    = useState<PGS>('idle')
  const [scores, setScores] = useState([0,0])
  const [winner, setWinner] = useState<'you'|'bot'|null>(null)

  // all mutable game state lives here — never triggers re-render
  const G = useRef({
    running: false,
    py: 0, ey: 0,          // paddle y (player=left, enemy=right)
    bx: 0, by: 0,          // ball
    vx: 0, vy: 0,
    ps: 0, es: 0,           // scores
    // input
    mouseY: -1,
    keyUp: false, keyDown: false,
  })
  const rafR = useRef(0)
  const prevT = useRef(0)

  // ── draw ─────────────────────────────────────
  const draw = useCallback(()=>{
    const cv = canvasRef.current; if(!cv) return
    const ctx = cv.getContext('2d')!
    const g = G.current
    const W = cv.width, H = cv.height

    // bg
    ctx.fillStyle='#0a0a0b'; ctx.fillRect(0,0,W,H)

    // center dashes
    ctx.setLineDash([8,8]); ctx.strokeStyle='#252530'; ctx.lineWidth=1.5
    ctx.beginPath(); ctx.moveTo(W/2,0); ctx.lineTo(W/2,H); ctx.stroke()
    ctx.setLineDash([])

    // scores
    ctx.font=`900 ${Math.round(H*0.14)}px Syne,sans-serif`; ctx.textAlign='center'
    ctx.fillStyle='rgba(245,158,11,0.45)'; ctx.fillText(String(g.ps), W/2-W*0.18, H*0.12)
    ctx.fillStyle='rgba(59,130,246,0.45)';  ctx.fillText(String(g.es), W/2+W*0.18, H*0.12)

    // labels
    ctx.font=`700 ${Math.round(H*0.038)}px 'Geist Mono',monospace`
    ctx.fillStyle='rgba(245,158,11,0.3)'; ctx.fillText('ТИ',  W/2-W*0.28, H*0.97)
    ctx.fillStyle='rgba(59,130,246,0.3)'; ctx.fillText('БОТ', W/2+W*0.28, H*0.97)

    // paddles
    const drawPad=(x:number,y:number,color:string,glow:string)=>{
      ctx.shadowColor=glow; ctx.shadowBlur=14
      ctx.fillStyle=color
      ctx.beginPath(); ctx.roundRect(x,y,PAD_W,PAD_H,5); ctx.fill()
      ctx.shadowBlur=0
    }
    drawPad(8,             g.py, '#f59e0b','rgba(245,158,11,0.7)')
    drawPad(W-8-PAD_W,     g.ey, '#3b82f6','rgba(59,130,246,0.7)')

    // ball
    ctx.shadowColor='rgba(240,240,242,0.9)'; ctx.shadowBlur=12
    ctx.fillStyle='#f0f0f2'
    ctx.beginPath(); ctx.arc(g.bx,g.by,BALL/2,0,Math.PI*2); ctx.fill()
    ctx.shadowBlur=0
  },[PAD_H,PAD_W,BALL])

  // ── game loop ─────────────────────────────────
  const loop = useCallback((t:number)=>{
    const g = G.current
    if(!g.running) return
    const dt = Math.min((t-prevT.current)/16.67, 3) // cap at 3 frames
    prevT.current = t

    const cv  = canvasRef.current!
    const W   = cv.width
    const H   = cv.height

    // player paddle — mouse OR keyboard
    if (g.mouseY >= 0) {
      g.py += (g.mouseY - PAD_H/2 - g.py) * 0.22 * dt
    } else {
      if (g.keyUp)   g.py -= 5.5 * dt
      if (g.keyDown) g.py += 5.5 * dt
    }
    g.py = Math.max(0, Math.min(H-PAD_H, g.py))

    // enemy AI — tracks ball with slight delay
    const eyTarget = g.by - PAD_H/2
    g.ey += (eyTarget - g.ey) * 0.085 * dt
    g.ey = Math.max(0, Math.min(H-PAD_H, g.ey))

    // move ball
    g.bx += g.vx * dt
    g.by += g.vy * dt

    // top/bottom bounce
    if (g.by - BALL/2 <= 0)  { g.by = BALL/2;  g.vy =  Math.abs(g.vy) }
    if (g.by + BALL/2 >= H)  { g.by = H-BALL/2; g.vy = -Math.abs(g.vy) }

    // player paddle hit (left side)
    if (
      g.vx < 0 &&
      g.bx - BALL/2 <= 8 + PAD_W &&
      g.bx - BALL/2 >= 6 &&
      g.by >= g.py - BALL/2 &&
      g.by <= g.py + PAD_H + BALL/2
    ){
      g.bx = 8 + PAD_W + BALL/2 + 1
      const rel = (g.by - (g.py + PAD_H/2)) / (PAD_H/2)   // -1..1
      g.vy  = rel * Math.abs(g.vx) * 1.1
      g.vx  = Math.abs(g.vx) * 1.06
      // cap
      const spd = Math.hypot(g.vx,g.vy)
      const maxSpd = SPEED_INIT * 3.2
      if (spd > maxSpd){ g.vx=(g.vx/spd)*maxSpd; g.vy=(g.vy/spd)*maxSpd }
    }

    // enemy paddle hit (right side)
    if (
      g.vx > 0 &&
      g.bx + BALL/2 >= W - 8 - PAD_W &&
      g.bx + BALL/2 <= W - 6 &&
      g.by >= g.ey - BALL/2 &&
      g.by <= g.ey + PAD_H + BALL/2
    ){
      g.bx = W - 8 - PAD_W - BALL/2 - 1
      const rel = (g.by - (g.ey + PAD_H/2)) / (PAD_H/2)
      g.vy  = rel * Math.abs(g.vx) * 1.1
      g.vx  = -Math.abs(g.vx) * 1.06
      const spd = Math.hypot(g.vx,g.vy)
      const maxSpd = SPEED_INIT * 3.2
      if (spd > maxSpd){ g.vx=(g.vx/spd)*maxSpd; g.vy=(g.vy/spd)*maxSpd }
    }

    // scoring
    const resetBall=(dir:1|-1)=>{
      g.bx=W/2; g.by=H/2
      g.vx=SPEED_INIT*dir; g.vy=SPEED_INIT*(Math.random()>0.5?0.6:-0.6)
    }

    if (g.bx < 0){
      g.es++; setScores([g.ps,g.es])
      if(g.es>=7){ g.running=false; setPgs('over'); setWinner('bot'); draw(); return }
      resetBall(1)
    }
    if (g.bx > W){
      g.ps++; setScores([g.ps,g.es])
      if(g.ps>=7){ g.running=false; setPgs('over'); setWinner('you'); draw(); return }
      resetBall(-1)
    }

    draw()
    rafR.current = requestAnimationFrame(loop)
  },[draw,PAD_H,BALL,SPEED_INIT])

  const start = useCallback(()=>{
    cancelAnimationFrame(rafR.current)
    const cv = canvasRef.current!
    const W=cv.width, H=cv.height
    const g = G.current
    g.py=H/2-PAD_H/2; g.ey=H/2-PAD_H/2
    g.bx=W/2; g.by=H/2
    g.vx=SPEED_INIT*(Math.random()>0.5?1:-1)
    g.vy=SPEED_INIT*(Math.random()>0.5?0.5:-0.5)
    g.ps=0; g.es=0; g.mouseY=-1; g.keyUp=false; g.keyDown=false
    g.running=true
    setScores([0,0]); setWinner(null); setPgs('run')
    prevT.current=performance.now()
    rafR.current=requestAnimationFrame(loop)
  },[loop,PAD_H,SPEED_INIT])

  useEffect(()=>{ draw(); return()=>cancelAnimationFrame(rafR.current) },[draw])

  // resize — redraw when width changes
  useLayoutEffect(()=>{
    const cv=canvasRef.current; if(!cv) return
    cv.width=width; cv.height=H; draw()
  },[width,H,draw])

  // keyboard controls
  useEffect(()=>{
    const down=(e:KeyboardEvent)=>{
      if(e.key==='w'||e.key==='ArrowUp')  { G.current.keyUp=true;   G.current.mouseY=-1; e.preventDefault() }
      if(e.key==='s'||e.key==='ArrowDown'){ G.current.keyDown=true;  G.current.mouseY=-1; e.preventDefault() }
    }
    const up=(e:KeyboardEvent)=>{
      if(e.key==='w'||e.key==='ArrowUp')   G.current.keyUp=false
      if(e.key==='s'||e.key==='ArrowDown') G.current.keyDown=false
    }
    window.addEventListener('keydown',down)
    window.addEventListener('keyup',up)
    return()=>{ window.removeEventListener('keydown',down); window.removeEventListener('keyup',up) }
  },[])

  const onMouse=(e:React.MouseEvent<HTMLCanvasElement>)=>{
    const r=e.currentTarget.getBoundingClientRect()
    G.current.mouseY=e.clientY-r.top; G.current.keyUp=false; G.current.keyDown=false
  }
  const onTouch=(e:React.TouchEvent<HTMLCanvasElement>)=>{
    const r=e.currentTarget.getBoundingClientRect()
    G.current.mouseY=e.touches[0].clientY-r.top
  }

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
      <div style={{width:'100%',display:'flex',justifyContent:'space-between',fontFamily:'var(--font-mono)',fontSize:11,color:'var(--text3)',padding:'0 4px'}}>
        <span style={{color:'var(--accent)',fontWeight:700}}>← Мишка / W·S</span>
        <span style={{fontSize:10,letterSpacing:'0.1em'}}>ПЕРШИЙ ДО 7</span>
        <span style={{color:'#3b82f6',fontWeight:700}}>БОТ →</span>
      </div>

      <div style={{position:'relative',width:'100%'}}>
        <canvas ref={canvasRef} width={width} height={H}
          style={{borderRadius:'var(--radius)',border:'1px solid var(--border)',display:'block',width:'100%',cursor:pgs==='run'?'none':'pointer',touchAction:'none'}}
          onMouseMove={onMouse} onTouchMove={onTouch}
          onClick={pgs!=='run'?start:undefined}
        />
        {pgs!=='run'&&(
          <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'rgba(10,10,11,0.88)',backdropFilter:'blur(4px)',gap:12,borderRadius:'var(--radius)'}}>
            {pgs==='over'&&(
              <>
                <div style={{fontFamily:'var(--font-head)',fontSize:24,fontWeight:800,letterSpacing:'0.08em',color:winner==='you'?'var(--green)':'var(--red)'}}>
                  {winner==='you'?'🏆 ПЕРЕМОГА!':'ПОРАЗКА'}
                </div>
                <div style={{fontFamily:'var(--font-mono)',fontSize:13,color:'var(--text2)'}}>
                  <b style={{color:'var(--accent)'}}>{scores[0]}</b> : <b style={{color:'#3b82f6'}}>{scores[1]}</b>
                </div>
              </>
            )}
            <div style={{padding:'8px 22px',border:'1px solid var(--accent)',borderRadius:'var(--radius)',color:'var(--accent)',fontFamily:'var(--font-mono)',fontSize:12,letterSpacing:'0.12em',cursor:'pointer'}}
                 onClick={start}>
              {pgs==='idle'?'▶  СТАРТ':'▶  ЩЕ РАЗ'}
            </div>
            <div style={{fontSize:10,color:'var(--text3)',fontFamily:'var(--font-mono)',letterSpacing:'0.1em',textAlign:'center',lineHeight:1.8}}>
              МИШКА або W · S для керування<br/>НАТИСНИ ЩЕ РАЗ ДЛЯ СТАРТУ
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════
//  REACTION TEST
// ═══════════════════════════════════════════════
function ReactionTest() {
  type RS = 'wait'|'ready'|'go'|'result'
  const [rs,       setRs]       = useState<RS>('wait')
  const [time,     setTime]     = useState<number|null>(null)
  const [times,    setTimes]    = useState<number[]>([])
  const [tooEarly, setTooEarly] = useState(false)
  const startR = useRef(0)
  const timerR = useRef<ReturnType<typeof setTimeout>|null>(null)

  const begin=()=>{
    setTooEarly(false); setRs('ready')
    timerR.current=setTimeout(()=>{setRs('go');startR.current=performance.now()},1500+Math.random()*3500)
  }
  const tap=()=>{
    if(rs==='wait')  { begin(); return }
    if(rs==='ready') { if(timerR.current)clearTimeout(timerR.current); setTooEarly(true); setRs('wait'); return }
    if(rs==='go')    { const ms=Math.round(performance.now()-startR.current); setTime(ms); setTimes(t=>[...t.slice(-7),ms]); setRs('result') }
    if(rs==='result'){ begin() }
  }
  useEffect(()=>()=>{if(timerR.current)clearTimeout(timerR.current)},[])

  const avg  = times.length?Math.round(times.reduce((a,b)=>a+b,0)/times.length):null
  const best = times.length?Math.min(...times):null

  const grade=(ms:number)=>
    ms<150?{l:'КІБОРГ ⚡',c:'var(--accent)'}:
    ms<200?{l:'ШВИДКО 🔥',c:'var(--green)'}:
    ms<270?{l:'ДОБРЕ',c:'#3b82f6'}:
    ms<360?{l:'ПОВІЛЬНО',c:'var(--text2)'}:
           {l:'ЧЕРЕПАХА 🐢',c:'var(--text3)'}

  const bg    = rs==='go'?'rgba(34,197,94,0.12)':rs==='ready'?'rgba(245,158,11,0.07)':'var(--bg)'
  const bord  = rs==='go'?'rgba(34,197,94,0.5)':rs==='ready'?'rgba(245,158,11,0.3)':'var(--border)'

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div onClick={tap} style={{width:'100%',height:170,borderRadius:'var(--radius)',border:`1px solid ${bord}`,background:bg,cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,transition:'background 0.12s,border-color 0.12s',userSelect:'none',WebkitTapHighlightColor:'transparent'}}>
        {rs==='wait'&&<div style={{fontFamily:'var(--font-mono)',fontSize:13,color:tooEarly?'var(--red)':'var(--text3)',letterSpacing:'0.1em',textAlign:'center'}}>{tooEarly?'⚡ ЗАРАНО! ЩЕ РАЗ':'НАТИСНИ ДЛЯ СТАРТУ'}</div>}
        {rs==='ready'&&<div style={{fontFamily:'var(--font-head)',fontSize:16,color:'var(--accent)',letterSpacing:'0.1em',animation:'pulse 0.7s ease-in-out infinite'}}>ЧЕКАЙ...</div>}
        {rs==='go'&&<div style={{fontFamily:'var(--font-head)',fontSize:32,fontWeight:800,color:'var(--green)',letterSpacing:'0.06em'}}>ЖМИ ЗАРАЗ!</div>}
        {rs==='result'&&time!=null&&(
          <>
            <div style={{fontFamily:'var(--font-head)',fontSize:44,fontWeight:800,color:'var(--text)',letterSpacing:'-0.02em',lineHeight:1}}>{time}<span style={{fontSize:16,color:'var(--text3)',marginLeft:4}}>мс</span></div>
            <div style={{fontFamily:'var(--font-mono)',fontSize:11,color:grade(time).c,letterSpacing:'0.15em'}}>{grade(time).l}</div>
            <div style={{fontSize:9,color:'var(--text3)',fontFamily:'var(--font-mono)'}}>НАТИСНИ ЩЕ РАЗ</div>
          </>
        )}
      </div>

      {times.length>0&&(
        <div style={{display:'flex',gap:8}}>
          {[{l:'НАЙКРАЩЕ',v:best,c:'var(--green)'},{l:'СЕРЕДНЄ',v:avg,c:'var(--accent)'},{l:'СПРОБ',v:times.length,c:'var(--text2)'}].map(s=>(
            <div key={s.l} style={{flex:1,padding:'10px 8px',background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--radius)',textAlign:'center'}}>
              <div style={{fontFamily:'var(--font-mono)',fontSize:8,color:'var(--text3)',letterSpacing:'0.1em',marginBottom:4}}>{s.l}</div>
              <div style={{fontFamily:'var(--font-head)',fontSize:20,fontWeight:800,color:s.c}}>{s.v}{s.l!=='СПРОБ'&&<span style={{fontSize:9,color:'var(--text3)'}}> мс</span>}</div>
            </div>
          ))}
        </div>
      )}

      {times.length>1&&(
        <div style={{display:'flex',alignItems:'flex-end',gap:4,height:44,padding:'0 2px'}}>
          {times.map((t,i)=>{
            const g=grade(t), h=Math.max(8,Math.min(40,(1-t/600)*40))
            const isLast=i===times.length-1
            return(
              <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                <div style={{fontSize:7,color:isLast?'var(--text2)':'var(--text3)',fontFamily:'var(--font-mono)'}}>{t}</div>
                <div style={{width:'100%',height:h,background:g.c,borderRadius:'2px 2px 0 0',opacity:isLast?1:0.45,transition:'height 0.3s',boxShadow:isLast?`0 0 6px ${g.c}`:'none'}}/>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════
//  GAME PANEL — tabs + flex height
// ═══════════════════════════════════════════════
const TABS=[
  {id:'snake', label:'◆ SNAKE'},
  {id:'pong',  label:'⬡ PONG'},
  {id:'react', label:'⚡ РЕАКЦІЯ'},
] as const
type TabId = typeof TABS[number]['id']

function GamePanel() {
  const [tab, setTab] = useState<TabId>('snake')
  const panelRef  = useRef<HTMLDivElement>(null)
  const [pongW, setPongW] = useState(420)

  useLayoutEffect(()=>{
    if(!panelRef.current) return
    const ro=new ResizeObserver(()=>{
      if(panelRef.current) setPongW(panelRef.current.clientWidth-32)
    })
    ro.observe(panelRef.current)
    return ()=>ro.disconnect()
  },[])

  return (
    <div className="card" style={{borderColor:'rgba(245,158,11,0.2)',display:'flex',flexDirection:'column',height:'100%',minHeight:560}}>
      {/* tabs */}
      <div style={{display:'flex',borderBottom:'1px solid var(--border)',flexShrink:0}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            flex:1,padding:'13px 6px',
            background:tab===t.id?'var(--accent-dim)':'transparent',
            border:'none',borderBottom:tab===t.id?'2px solid var(--accent)':'2px solid transparent',
            color:tab===t.id?'var(--accent)':'var(--text3)',
            fontFamily:'var(--font-mono)',fontSize:11,letterSpacing:'0.1em',
            cursor:'pointer',transition:'all 0.15s',
          }}>{t.label}</button>
        ))}
      </div>

      {/* body */}
      <div ref={panelRef} style={{flex:1,padding:16,overflowY:'auto'}}>
        {tab==='snake'&&<SnakeGame/>}
        {tab==='pong' &&<PongGame width={pongW}/>}
        {tab==='react'&&(
          <div>
            <div style={{marginBottom:14}}>
              <div style={{fontFamily:'var(--font-mono)',fontSize:9,color:'var(--text3)',letterSpacing:'0.15em',marginBottom:4}}>ТЕСТ РЕАКЦІЇ</div>
              <div style={{fontSize:12,color:'var(--text3)',lineHeight:1.5}}>Дочекайся зеленого та натисни якнайшвидше.</div>
            </div>
            <ReactionTest/>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════
//  PROFILE PAGE
// ═══════════════════════════════════════════════
interface ProfilePageProps {
  user: User & { telegram_id?: number|null }
  onUpdate: (user: User) => void
  onLogout:  () => void
}

export function ProfilePage({ user, onUpdate, onLogout }: ProfilePageProps) {
  const [form, setForm]             = useState({username:user.username,email:user.email,password:''})
  const [loading,       setLoading]       = useState(false)
  const [adminLoading,  setAdminLoading]  = useState(false)
  const [tgLoading,     setTgLoading]     = useState(false)
  const [unlinkLoading, setUnlinkLoading] = useState(false)
  const [isTgHovered,   setIsTgHovered]   = useState(false)
  const toast = useToast()

  const makeAdmin=async()=>{
    if(!confirm('Отримати права адміністратора? Це незворотня дія.')) return
    setAdminLoading(true)
    try{const u=await authApi.makeAdmin();onUpdate(u);toast('Тепер ви адміністратор!','success')}
    catch(e:unknown){toast(e instanceof Error?e.message:'Помилка','error')}
    finally{setAdminLoading(false)}
  }
  const setField=(k:string,v:string)=>setForm(f=>({...f,[k]:v}))
  const save=async()=>{
    setLoading(true)
    try{
      const p:Partial<{username:string;email:string;password:string}>={}
      if(form.username!==user.username) p.username=form.username
      if(form.email!==user.email)       p.email=form.email
      if(form.password)                 p.password=form.password
      const updated=await authApi.updateMe(p); onUpdate(updated)
      setForm(f=>({...f,password:''}))
      toast(p.email?'Email змінено — підтвердьте нову адресу':'Профіль оновлено',p.email?'info':'success')
    }catch(e:unknown){toast(e instanceof Error?e.message:'Помилка','error')}
    finally{setLoading(false)}
  }
  const linkTelegram=async()=>{
    setTgLoading(true)
    try{
      const{link}=await authApi.generateTgLink(); window.open(link,'_blank')
      toast('Перейдіть у Telegram та натисніть Start','info')
      const iv=setInterval(async()=>{
        try{const u=await authApi.me();if(u.telegram_id){onUpdate(u);toast("Telegram успішно прив'язано!",'success');clearInterval(iv)}}catch{/*skip*/}
      },3000)
      setTimeout(()=>clearInterval(iv),180000)
    }catch(e:unknown){toast(e instanceof Error?e.message:'Помилка','error')}
    finally{setTgLoading(false)}
  }
  const unlinkTelegram=async()=>{
    if(!confirm("Відв'язати Telegram?")) return
    setUnlinkLoading(true)
    try{const u=await authApi.unlinkTg();onUpdate(u);toast("Акаунт Telegram відв'язано",'success')}
    catch(e:unknown){toast(e instanceof Error?e.message:'Помилка','error')}
    finally{setUnlinkLoading(false);setIsTgHovered(false)}
  }
  const deleteAccount=async()=>{
    if(!confirm('Видалити акаунт? Цю дію неможливо скасувати.')) return
    try{await authApi.deleteMe();apiClient.clearTokens();onLogout()}
    catch(e:unknown){toast(e instanceof Error?e.message:'Помилка','error')}
  }

  return (
    // stretch to fill .content height
    <div className="animate-fadeUp" style={{display:'flex',gap:20,alignItems:'stretch',flexWrap:'wrap',minHeight:'calc(100vh - 56px - 40px)'}}>

      {/* ── LEFT: profile forms ── */}
      <div style={{flex:'1 1 380px',maxWidth:500,display:'flex',flexDirection:'column',gap:16}}>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Профіль</div>
            {user.is_admin&&<span className="badge badge-admin">◆ Адміністратор</span>}
          </div>
          <div className="card-body">
            <div style={{display:'flex',gap:16,alignItems:'center',marginBottom:24,padding:16,background:'var(--bg3)',borderRadius:'var(--radius)',border:'1px solid var(--border)'}}>
              <div style={{width:56,height:56,borderRadius:'50%',background:'var(--accent-dim)',border:'1px solid var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,fontWeight:800,color:'var(--accent)',fontFamily:'var(--font-head)',flexShrink:0}}>
                {user.username?.[0]?.toUpperCase()||'?'}
              </div>
              <div>
                <div style={{fontFamily:'var(--font-head)',fontWeight:700,fontSize:16}}>{user.username}</div>
                <div style={{fontSize:12,color:'var(--text3)',marginTop:2}}>{user.email}</div>
                <div style={{fontSize:10,color:'var(--text3)',marginTop:2,fontFamily:'var(--font-mono)'}}>uid:{user.id}</div>
              </div>
            </div>
            <div className="form-group"><label className="form-label">Ім'я користувача</label><input className="form-input" value={form.username} onChange={e=>setField('username',e.target.value)}/></div>
            <div className="form-group"><label className="form-label">Електронна пошта</label><input className="form-input" type="email" value={form.email} onChange={e=>setField('email',e.target.value)}/></div>
            <div className="form-group"><label className="form-label">Новий пароль (залишіть пустим щоб не змінювати)</label><input className="form-input" type="password" value={form.password} onChange={e=>setField('password',e.target.value)} placeholder="••••••••"/></div>
            <button className="btn btn-primary" onClick={save} disabled={loading}>{loading&&<Spinner size={12}/>} Зберегти зміни</button>
          </div>
        </div>

        <div className="card" style={{borderColor:'rgba(59,130,246,0.25)'}}>
          <div className="card-header"><div className="card-title" style={{color:'#3b82f6'}}>Сповіщення Telegram</div></div>
          <div className="card-body">
            <p style={{fontSize:12,color:'var(--text3)',marginBottom:12}}>Прив'яжіть Telegram для миттєвих сповіщень про статуси заявок.</p>
            {user.telegram_id?(
              <button className="btn"
                style={{background:isTgHovered?'rgba(239,68,68,0.1)':'rgba(34,197,94,0.1)',color:isTgHovered?'var(--red)':'var(--green)',borderColor:isTgHovered?'rgba(239,68,68,0.3)':'rgba(34,197,94,0.3)',transition:'all 0.2s'}}
                onMouseEnter={()=>setIsTgHovered(true)} onMouseLeave={()=>setIsTgHovered(false)}
                onClick={unlinkTelegram} disabled={unlinkLoading}>
                {unlinkLoading?<Spinner size={12}/>:(isTgHovered?"✕ Відв'язати Telegram":"✓ Акаунт Telegram прив'язано")}
              </button>
            ):(
              <button className="btn btn-primary" style={{background:'#3b82f6',color:'#fff',borderColor:'#3b82f6'}} onClick={linkTelegram} disabled={tgLoading}>
                {tgLoading?<Spinner size={12}/>:'✈'} Прив'язати Telegram
              </button>
            )}
          </div>
        </div>

        {!user.is_admin&&(
          <div className="card" style={{borderColor:'rgba(245,158,11,0.25)'}}>
            <div className="card-header"><div className="card-title" style={{color:'var(--accent)'}}>Права адміністратора</div></div>
            <div className="card-body">
              <p style={{fontSize:12,color:'var(--text3)',marginBottom:12}}>Отримати повні права адміна. Це незворотня дія.</p>
              <button className="btn btn-ghost" style={{color:'var(--accent)',borderColor:'rgba(245,158,11,0.3)'}} onClick={makeAdmin} disabled={adminLoading}>
                {adminLoading?<Spinner size={12}/>:'◆'} Стати адміністратором
              </button>
            </div>
          </div>
        )}

        <div className="card" style={{borderColor:'rgba(239,68,68,0.25)'}}>
          <div className="card-header"><div className="card-title" style={{color:'var(--red)'}}>Небезпечна зона</div></div>
          <div className="card-body">
            <p style={{fontSize:12,color:'var(--text3)',marginBottom:12}}>Видалення акаунту — незворотня дія.</p>
            <div style={{display:'flex',gap:8}}>
              <button className="btn btn-danger" onClick={deleteAccount}>✕ Видалити акаунт</button>
              <button className="btn btn-ghost btn-sm" onClick={()=>{apiClient.clearTokens();onLogout()}}>Вийти з системи</button>
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT: games (stretches to full height) ── */}
      <div className="game-panel-mobile-hidden" style={{flex:'1 1 420px',display:'flex',flexDirection:'column'}}>
        <GamePanel/>
      </div>

    </div>
  )
}