from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter(tags=["Widget"])

_HTML = r"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>FaceID Widget</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#000c1a;color:#fff;font-family:monospace;height:100vh;overflow:hidden;display:flex;flex-direction:column}
.phase{display:none;flex:1;flex-direction:column}
.phase.on{display:flex}
button{cursor:pointer;font-family:monospace;transition:opacity .15s}
button:hover{opacity:.85}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fade-in{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}
#result-view.on{animation:fade-in .3s ease-out}
</style>
</head>
<body>

<div id="hdr" style="padding:10px 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #00ffaa20;flex-shrink:0">
  <span id="hdr-label" style="color:#00ffaa;font-size:11px;font-weight:700;letter-spacing:3px">◈ FACEID·AUTH</span>
  <button id="btn-cancel" style="color:#00ffaa50;font-size:11px;background:none;border:none">[ ✕ ]</button>
</div>

<!-- camera -->
<div id="camera-view" class="phase on" style="position:relative;overflow:hidden">
  <video id="vid" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover"></video>
  <canvas id="sc" style="display:none;width:128px;height:96px"></canvas>
  <svg id="oval-svg" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none"
       viewBox="0 0 640 480" preserveAspectRatio="xMidYMid slice">
    <defs>
      <mask id="oc"><rect width="640" height="480" fill="white"/>
        <ellipse cx="320" cy="230" rx="155" ry="195" fill="black"/></mask>
      <filter id="gg" x="-25%" y="-25%" width="150%" height="150%">
        <feGaussianBlur stdDeviation="7" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="ga" x="-25%" y="-25%" width="150%" height="150%">
        <feGaussianBlur stdDeviation="5" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <rect id="vig" width="640" height="480" fill="rgba(0,0,0,0.5)" mask="url(#oc)" style="transition:fill .5s"/>
    <ellipse id="ob" cx="320" cy="230" rx="155" ry="195" fill="none"
      stroke="rgba(200,200,200,0.6)" stroke-width="2" stroke-dasharray="8 7" style="transition:stroke .4s"/>
    <g id="corners" stroke="rgba(200,200,200,0.6)" stroke-width="3" stroke-linecap="round">
      <line x1="233" y1="65" x2="253" y2="65"/><line x1="233" y1="65" x2="233" y2="85"/>
      <line x1="387" y1="65" x2="407" y2="65"/><line x1="407" y1="65" x2="407" y2="85"/>
      <line x1="233" y1="395" x2="253" y2="395"/><line x1="233" y1="375" x2="233" y2="395"/>
      <line x1="387" y1="395" x2="407" y2="395"/><line x1="407" y1="375" x2="407" y2="395"/>
    </g>
  </svg>
  <div style="position:absolute;top:12px;left:0;right:0;display:flex;justify-content:center;z-index:30;pointer-events:none">
    <span id="badge" style="background:rgba(0,0,0,0.55);color:#fff;font-size:11px;padding:6px 14px;border-radius:99px;font-weight:600;letter-spacing:1px;border:1px solid rgba(255,255,255,0.1)">
      ⬆ Coloca tu rostro en el óvalo
    </span>
  </div>
  <div style="position:absolute;bottom:60px;left:12px;right:12px;display:flex;justify-content:center;z-index:30;pointer-events:none">
    <div style="background:rgba(0,0,0,0.72);border:1px solid rgba(245,158,11,0.35);border-radius:8px;padding:8px 14px;display:flex;align-items:center;gap:8px">
      <span style="color:#fbbf24">⚠</span><span id="tip" style="color:#fff;font-size:11px">Sin gafas de sol ni lentes oscuros</span>
    </div>
  </div>
  <button id="btn-cap" disabled style="position:absolute;bottom:12px;left:50%;transform:translateX(-50%);z-index:30;background:rgba(80,80,80,0.5);color:rgba(255,255,255,0.4);border:none;border-radius:99px;padding:10px 28px;font-size:12px;font-weight:700;letter-spacing:1px;cursor:not-allowed">
    ○ Esperando rostro...
  </button>
</div>

<!-- liveness -->
<div id="lv-view" class="phase" style="position:relative;overflow:hidden">
  <video id="lv-vid" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;opacity:.25"></video>
  <canvas id="lv-c" style="display:none"></canvas>
  <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px">
    <span id="lv-sym" style="color:#00ffaa;font-size:52px">↕</span>
    <p id="lv-lbl" style="color:#00ffaa;font-weight:700;letter-spacing:3px;font-size:13px;text-align:center">ASIENTE CON LA CABEZA</p>
    <div id="lv-brief" style="display:flex;flex-direction:column;align-items:center;gap:8px">
      <p style="color:#00ffaa60;font-size:11px">Prepárate...</p>
      <span id="lv-cnt" style="color:#00ffaa;font-size:44px;font-weight:700">2</span>
    </div>
    <div id="lv-chal" style="display:none;width:100%;max-width:280px;flex-direction:column;gap:8px">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:#00ffaa70">
        <span>MOVIMIENTO</span><span id="lv-pct" style="color:#00ffaa70">0%</span></div>
      <div style="height:10px;background:#00ffaa15;border:1px solid #00ffaa30;border-radius:4px;overflow:hidden">
        <div id="lv-bar" style="height:100%;width:0%;background:#00ffaa80;transition:width .1s"></div></div>
      <p style="color:#00ffaa45;font-size:11px;text-align:center">TIEMPO: <span id="lv-time" style="color:#00ffaa">7s</span></p>
    </div>
    <p id="lv-pass" style="display:none;color:#00ffaa;font-weight:700;letter-spacing:2px;font-size:13px">✓ LIVENESS_OK</p>
    <div id="lv-fail" style="display:none;flex-direction:column;align-items:center;gap:8px">
      <p style="color:#ff3366;font-size:13px;font-weight:700">✗ TIEMPO AGOTADO</p>
      <button id="btn-retry" style="color:#ff3366;border:1px solid #ff336640;background:#ff336610;padding:8px 20px;border-radius:8px;font-size:11px">[ REINTENTAR ]</button>
    </div>
  </div>
</div>

<!-- processing -->
<div id="proc-view" class="phase" style="align-items:center;justify-content:center;gap:20px">
  <div style="width:52px;height:52px;border-radius:50%;border:3px solid #00ffaa25;border-top-color:#00ffaa;animation:spin 1s linear infinite"></div>
  <p style="color:#00ffaa;font-size:12px;letter-spacing:3px">PROCESANDO...</p>
</div>

<!-- result -->
<div id="result-view" class="phase" style="align-items:center;justify-content:center;gap:14px;padding:24px">
  <span id="r-icon" style="font-size:56px"></span>
  <p id="r-lbl" style="font-weight:700;letter-spacing:3px;font-size:14px"></p>
  <p id="r-sub" style="font-size:11px;opacity:.65"></p>
  <button id="btn-reset" style="padding:10px 22px;border-radius:8px;font-size:11px;letter-spacing:2px;margin-top:8px">[ NUEVA VERIFICACIÓN ]</button>
</div>

<!-- error -->
<div id="err-view" class="phase" style="align-items:center;justify-content:center;gap:14px;padding:24px">
  <span style="color:#ff3366;font-size:40px">✗</span>
  <p style="color:#ff3366;font-weight:700;letter-spacing:2px;font-size:12px">ERROR</p>
  <p id="err-msg" style="color:rgba(255,255,255,0.45);font-size:11px;text-align:center;max-width:260px"></p>
  <button id="btn-err-close" style="color:#ff3366;border:1px solid #ff336640;background:#ff336610;padding:8px 20px;border-radius:8px;font-size:11px;margin-top:8px">[ CERRAR ]</button>
</div>

<div style="padding:7px 14px;border-top:1px solid #00ffaa15;text-align:center;flex-shrink:0">
  <span style="color:#00ffaa25;font-size:9px;letter-spacing:3px">◈ FACEID · SECURE_BIOMETRIC</span>
</div>

<script>
const C = '#00ffaa'
const P = new URLSearchParams(location.search)
const API_KEY     = P.get('api_key')     || ''
const EXTERNAL_ID = P.get('external_id') || ''
const MODE        = P.get('mode')        || 'auth'
const API_URL     = P.get('api_url')     || location.origin

document.getElementById('hdr-label').textContent = '◈ FACEID·' + MODE.toUpperCase()

const TIPS = [
  'Sin gafas de sol ni lentes oscuros',
  'Sin mascarilla ni tapabocas',
  'Iluminación frontal uniforme',
  'Sin sombrero ni gorra',
  'Mira directamente a la cámara',
]
const CHALLENGES = [
  { symbol:'↕', label:'ASIENTE CON LA CABEZA' },
  { symbol:'↔', label:'GIRA LA CABEZA'         },
  { symbol:'↗', label:'INCLINA LA CABEZA'       },
]
const LVC = CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)]
document.getElementById('lv-sym').textContent = LVC.symbol
document.getElementById('lv-lbl').textContent = LVC.label

let stream = null, faceState = 'none', skinTick = null, tipTick = null, lvTick = null
let lvBaseline = null, capturedBlob = null, tipIdx = 0

const vid  = document.getElementById('vid')
const sc   = document.getElementById('sc'); sc.width = 128; sc.height = 96
const scCtx = sc.getContext('2d', { willReadFrequently: true })

function show(id) {
  document.querySelectorAll('.phase').forEach(el => el.classList.remove('on'))
  document.getElementById(id).classList.add('on')
}

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:'user', width:640, height:480 } })
    vid.srcObject = stream; await vid.play().catch(()=>{})
    skinTick = setInterval(detectSkin, 400)
    tipTick  = setInterval(() => { tipIdx = (tipIdx+1)%TIPS.length; document.getElementById('tip').textContent = TIPS[tipIdx] }, 3000)
  } catch(e) { showErr('No se pudo acceder a la cámara: ' + e.message) }
}
function stopCamera() {
  if (stream) { stream.getTracks().forEach(t=>t.stop()); stream = null }
  clearInterval(skinTick); clearInterval(tipTick); skinTick = tipTick = null
}

// ── YCbCr skin detection + contrast ────────────────────────────────────────
function detectSkin() {
  if (!vid.videoWidth || vid.readyState < 2) return
  scCtx.drawImage(vid, 0, 0, 128, 96)
  const d = scCtx.getImageData(0, 0, 128, 96).data
  const cx=64, cy=46, rx=31, ry=39
  let sIn=0,tIn=0,sOut=0,tOut=0
  for (let y=0; y<96; y++) for (let x=0; x<128; x++) {
    const nx=(x-cx)/rx, ny=(y-cy)/ry, inside=nx*nx+ny*ny<=1
    const i=(y*128+x)*4, r=d[i], g=d[i+1], b=d[i+2]
    const Y  = 0.299*r+0.587*g+0.114*b
    const Cb = 128-0.16874*r-0.33126*g+0.5*b
    const Cr = 128+0.5*r-0.41869*g-0.08131*b
    const sk = Y>60 && Cb>=77 && Cb<=127 && Cr>=133 && Cr<=173
    if (inside){tIn++;if(sk)sIn++}else{tOut++;if(sk)sOut++}
  }
  const rIn=tIn>0?sIn/tIn:0, rOut=tOut>0?sOut/tOut:0, ct=rIn-rOut
  updateOval(rIn>0.22&&ct>0.10?'good':rIn>0.08&&ct>0.04?'partial':'none')
}

function updateOval(s) {
  faceState = s
  const ob = document.getElementById('ob')
  const vig = document.getElementById('vig')
  const badge = document.getElementById('badge')
  const btn = document.getElementById('btn-cap')
  const corners = document.getElementById('corners')
  const capLabel = s==='good' ? (MODE==='enroll'?'✓ Registrar':MODE==='liveness'?'◈ Verificar liveness':'✓ Autenticar')
                 : s==='partial' ? '⟳ Centrando...' : '○ Esperando rostro...'
  if (s==='good') {
    ob.setAttribute('stroke','#22c55e'); ob.setAttribute('stroke-width','4')
    ob.setAttribute('stroke-dasharray',''); ob.setAttribute('filter','url(#gg)')
    vig.setAttribute('fill','rgba(0,0,0,0.20)')
    badge.textContent='✓ Rostro detectado'; badge.style.background='rgba(34,197,94,0.85)'; badge.style.border='1px solid rgba(34,197,94,0.4)'
    corners.setAttribute('stroke','#22c55e')
    btn.disabled=false; btn.style.background='#16a34a'; btn.style.color='#fff'
    btn.style.border='1px solid #4ade80'; btn.style.boxShadow='0 0 14px rgba(34,197,94,.45)'; btn.style.cursor='pointer'
  } else if (s==='partial') {
    ob.setAttribute('stroke','#f59e0b'); ob.setAttribute('stroke-width','3')
    ob.setAttribute('stroke-dasharray','12 5'); ob.setAttribute('filter','url(#ga)')
    vig.setAttribute('fill','rgba(0,0,0,0.40)')
    badge.textContent='⟳ Centra el rostro'; badge.style.background='rgba(245,158,11,0.85)'; badge.style.border='1px solid rgba(255,255,255,0.1)'
    corners.setAttribute('stroke','#f59e0b')
    btn.disabled=true; btn.style.background='#d97706'; btn.style.color='#fff'
    btn.style.border='none'; btn.style.boxShadow='none'; btn.style.cursor='not-allowed'
  } else {
    ob.setAttribute('stroke','rgba(200,200,200,0.6)'); ob.setAttribute('stroke-width','2')
    ob.setAttribute('stroke-dasharray','8 7'); ob.removeAttribute('filter')
    vig.setAttribute('fill','rgba(0,0,0,0.50)')
    badge.textContent='⬆ Coloca tu rostro en el óvalo'; badge.style.background='rgba(0,0,0,0.55)'; badge.style.border='1px solid rgba(255,255,255,0.1)'
    corners.setAttribute('stroke','rgba(200,200,200,0.6)')
    btn.disabled=true; btn.style.background='rgba(80,80,80,0.5)'; btn.style.color='rgba(255,255,255,0.4)'
    btn.style.border='none'; btn.style.boxShadow='none'; btn.style.cursor='not-allowed'
  }
  btn.textContent = capLabel
}

async function handleCapture() {
  const tmp = document.createElement('canvas')
  tmp.width = vid.videoWidth; tmp.height = vid.videoHeight
  tmp.getContext('2d').drawImage(vid, 0, 0)
  capturedBlob = await new Promise(r => tmp.toBlob(r, 'image/jpeg', 0.92))
  if (MODE === 'liveness') {
    // copy current frame to lv canvas for motion baseline
    const lvc = document.getElementById('lv-c')
    const lvv = document.getElementById('lv-vid')
    lvc.width = vid.videoWidth; lvc.height = vid.videoHeight
    lvc.getContext('2d').drawImage(vid, 0, 0)
    lvBaseline = lvc.getContext('2d').getImageData(0, 0, lvc.width, lvc.height)
    lvv.srcObject = stream
    await lvv.play().catch(()=>{})
    stopSkinTick()
    startLivenessBriefing()
    show('lv-view')
  } else {
    stopCamera(); await callApi()
  }
}
function stopSkinTick() { clearInterval(skinTick); skinTick = null }

async function callApi() {
  show('proc-view')
  try {
    const form = new FormData()
    form.append('image', new File([capturedBlob], 'face.jpg', { type:'image/jpeg' }))
    const headers = { 'X-API-Key': API_KEY }
    let url, res
    if (MODE === 'enroll') {
      url = API_URL + '/v1/faces/enroll/' + encodeURIComponent(EXTERNAL_ID)
      res = await fetch(url, { method:'POST', headers, body:form })
    } else {
      // Pre-fetch a liveness challenge; server consumes it only when tenant has liveness_required=true.
      try {
        const ch = await fetch(API_URL + '/v1/liveness/challenge', { headers: { 'X-API-Key': API_KEY } })
        if (ch.ok) { const d = await ch.json(); headers['X-Challenge-Id'] = d.challenge_id }
      } catch(e) { /* proceed without — server will reject only if tenant requires it */ }
      url = API_URL + '/v1/faces/authenticate/' + encodeURIComponent(EXTERNAL_ID)
      res = await fetch(url, { method:'POST', headers, body:form })
    }
    const data = await res.json()
    if (!res.ok) {
      if (res.status === 404 && MODE === 'auth') {
        showErr('Usuario no enrolado. Debe registrar su rostro primero.')
        pm({ type:'faceid_not_enrolled', enrolled:false, external_id:EXTERNAL_ID })
        return
      }
      throw new Error(data.detail || 'HTTP ' + res.status)
    }
    if (MODE === 'enroll') {
      showResult(data.enrolled?C:'#ff3366', data.enrolled?'✓':'✗',
        data.enrolled?'ENROLADO':'FALLO_ENROLAMIENTO', 'CALIDAD: '+Math.round((data.quality_score||0)*100)+'%')
      pm({ type:'faceid_result', mode:MODE, enrolled:data.enrolled, quality_score:data.quality_score, subject_id:data.subject_id, external_id:EXTERNAL_ID })
    } else {
      const ok=data.verified, fraud=data.fraud_detected
      showResult((ok&&!fraud)?C:'#ff3366', (ok&&!fraud)?'✓':'✗',
        fraud?'FRAUDE_DETECTADO':ok?'IDENTIDAD_VERIFICADA':'ACCESO_DENEGADO',
        'CONFIANZA: '+((data.confidence||0)*100).toFixed(1)+'%')
      pm({ type:'faceid_result', mode:MODE, verified:data.verified, confidence:data.confidence, fraud_detected:data.fraud_detected, subject_id:data.subject_id, external_id:EXTERNAL_ID })
    }
  } catch(e) {
    showErr(e.message)
    pm({ type:'faceid_error', mode:MODE, error:e.message })
  }
}

function showResult(color, icon, lbl, sub) {
  document.getElementById('r-icon').textContent = icon
  document.getElementById('r-icon').style.cssText = 'font-size:56px;color:'+color+';filter:drop-shadow(0 0 18px '+color+')'
  document.getElementById('r-lbl').textContent = lbl; document.getElementById('r-lbl').style.color = color
  document.getElementById('r-sub').textContent = sub; document.getElementById('r-sub').style.color = color+'80'
  const btn = document.getElementById('btn-reset')
  btn.style.color=color; btn.style.border='1px solid '+color+'40'; btn.style.background=color+'10'
  show('result-view')
}
function showErr(msg) { document.getElementById('err-msg').textContent = msg; show('err-view') }
function pm(data) { window.parent.postMessage(data, '*') }

async function resetWidget() {
  faceState='none'; capturedBlob=null; lvBaseline=null
  updateOval('none'); show('camera-view'); await startCamera()
}

// ── Liveness challenge ─────────────────────────────────────────────────────
function lvEl(id,d){ document.getElementById(id).style.display=d }
function startLivenessBriefing() {
  lvEl('lv-brief','flex'); lvEl('lv-chal','none'); lvEl('lv-pass','none'); lvEl('lv-fail','none')
  let c=2; document.getElementById('lv-cnt').textContent=c
  const iv = setInterval(()=>{ c--; document.getElementById('lv-cnt').textContent=c
    if(c<=0){ clearInterval(iv); startLivenessChallenge() } },1000)
}
function startLivenessChallenge() {
  lvEl('lv-brief','none'); lvEl('lv-chal','flex')
  const lvc = document.getElementById('lv-c'), lvv = document.getElementById('lv-vid')
  const ctx = lvc.getContext('2d')
  const w=lvc.width, h=lvc.height
  lvc.width=lvv.videoWidth||320; lvc.height=lvv.videoHeight||240
  ctx.drawImage(lvv,0,0)
  const base = ctx.getImageData(0,0,lvc.width,lvc.height)
  const W=lvc.width, H=lvc.height, cx=W/2, cy=H*0.49, rx=W*0.244, ry=H*0.417
  let ticks=0, cons=0
  if(lvTick) clearInterval(lvTick)
  lvTick = setInterval(()=>{
    ticks++
    const rem = Math.max(0,7-Math.floor(ticks*200/1000))
    const te = document.getElementById('lv-time'); te.textContent=rem+'s'; te.style.color=rem<=2?'#ff3366':C
    ctx.drawImage(lvv,0,0,W,H)
    const cur=ctx.getImageData(0,0,W,H)
    let fs=0,bs=0,fn=0,bn=0
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      const i=(y*W+x)*4
      const d=Math.abs(base.data[i]-cur.data[i])+Math.abs(base.data[i+1]-cur.data[i+1])+Math.abs(base.data[i+2]-cur.data[i+2])
      const dx=(x-cx)/rx, dy=(y-cy)/ry
      if(dx*dx+dy*dy<=1){fs+=d;fn++}else{bs+=d;bn++}
    }
    const fd=fn>0?fs/(fn*3):0, bd=bn>0?bs/(bn*3):0
    if(fd>=22&&bd<16) cons++; else cons=Math.max(0,cons-1)
    const pct=Math.min(100,Math.round(cons/3*100))
    document.getElementById('lv-bar').style.width=pct+'%'
    document.getElementById('lv-bar').style.background=pct>80?C:C+'80'
    document.getElementById('lv-pct').textContent=pct+'%'
    document.getElementById('lv-pct').style.color=pct>60?C:C+'70'
    if(cons>=3){
      clearInterval(lvTick)
      lvEl('lv-chal','none'); lvEl('lv-pass','block')
      setTimeout(()=>{
        if(MODE==='liveness'){
          showResult(C,'✓','LIVENESS_OK','PERSONA_REAL_CONFIRMADA')
          pm({type:'faceid_result',mode:MODE,passed:true,is_real:true})
        } else callApi()
      },400)
    }
    if(ticks>=35){
      clearInterval(lvTick)
      lvEl('lv-chal','none'); lvEl('lv-fail','flex')
      if(MODE==='liveness') pm({type:'faceid_result',mode:MODE,passed:false,is_real:false})
    }
  },200)
}

// ── Wire up buttons ────────────────────────────────────────────────────────
document.getElementById('btn-cancel').addEventListener('click',  ()=>pm({type:'faceid_cancel',mode:MODE}))
document.getElementById('btn-cap').addEventListener('click',     handleCapture)
document.getElementById('btn-reset').addEventListener('click',   resetWidget)
document.getElementById('btn-err-close').addEventListener('click',()=>pm({type:'faceid_cancel',mode:MODE}))
document.getElementById('btn-retry').addEventListener('click',   startLivenessBriefing)

startCamera()
</script>
</body>
</html>"""


@router.get("/widget", response_class=HTMLResponse)
async def widget_page():
    """
    Embeddable facial recognition widget.
    Query params: api_key, external_id, mode (auth|enroll|liveness), api_url
    Results are sent to the parent via window.parent.postMessage({ type: 'faceid_result', ... })
    """
    return HTMLResponse(content=_HTML)
