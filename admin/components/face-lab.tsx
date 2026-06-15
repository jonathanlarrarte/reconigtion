'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { Camera, Upload, X, CheckCircle, XCircle, AlertTriangle, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import { api } from '@/lib/api'
import type { EnrollResponse, AuthResponse } from '@/lib/types'

type Mode = 'enroll' | 'auth'
type CaptureMode = 'camera' | 'file'
type Result = { type: 'enroll'; data: EnrollResponse } | { type: 'auth'; data: AuthResponse } | { type: 'error'; message: string }

export function speak(text: string, opts?: { pitch?: number; rate?: number; volume?: number }) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const say = () => {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'es-ES'
    u.pitch = opts?.pitch ?? 0.6      // bajo = más robótico
    u.rate  = opts?.rate  ?? 0.88
    u.volume = opts?.volume ?? 1
    const voices = window.speechSynthesis.getVoices()
    const esVoice = voices.find(v => v.lang.startsWith('es'))
    if (esVoice) u.voice = esVoice
    window.speechSynthesis.speak(u)
  }
  // voices may not be loaded yet on first call
  if (window.speechSynthesis.getVoices().length) say()
  else { window.speechSynthesis.onvoiceschanged = () => { say(); window.speechSynthesis.onvoiceschanged = null } }
}

const AUTH_STEPS = [
  { label: 'Analizando imagen',          pct: 15,  ms: 1800 },
  { label: 'Detectando rostro',          pct: 35,  ms: 2800 },
  { label: 'Extrayendo biometría',       pct: 58,  ms: 4500 },
  { label: 'Comparando con registro',   pct: 78,  ms: 3500 },
  { label: 'Verificando identidad',     pct: 94,  ms: 99999 },
]

const ENROLL_STEPS = [
  { label: 'Analizando imagen',          pct: 20,  ms: 1800 },
  { label: 'Detectando rostro',          pct: 45,  ms: 2800 },
  { label: 'Calculando embedding',       pct: 72,  ms: 4000 },
  { label: 'Guardando en base de datos', pct: 94,  ms: 99999 },
]

// ── Active Liveness ──────────────────────────────────────────────────────────

const CHALLENGES = [
  { id: 'nod',   label: 'ASIENTE CON LA CABEZA', sub: 'Mueve la cabeza hacia arriba y hacia abajo', symbol: '↕', voice: 'Asiente con la cabeza. Muévela arriba y abajo.' },
  { id: 'shake', label: 'GIRA LA CABEZA',         sub: 'Mueve la cabeza de izquierda a derecha',     symbol: '↔', voice: 'Gira la cabeza. Muévela de izquierda a derecha.' },
  { id: 'tilt',  label: 'INCLINA LA CABEZA',      sub: 'Inclina la cabeza hacia un lado y luego al otro', symbol: '↗', voice: 'Inclina la cabeza hacia un lado y luego al otro.' },
]

// Splits frame comparison into face oval vs background regions.
// When a flat photo is moved side-to-side, BOTH regions show high diff (rigid-body motion).
// When a real face rotates, only the face region changes while background stays still.
export function analyzeMotion(
  a: ImageData, b: ImageData, w: number, h: number
): { faceDiff: number; bgDiff: number } {
  const cx = w / 2
  const cy = h * 0.49         // oval vertical center
  const rx = w  * 0.244       // oval x-radius
  const ry = h  * 0.417       // oval y-radius
  let faceSum = 0, bgSum = 0, faceN = 0, bgN = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const d = Math.abs(a.data[i] - b.data[i])
              + Math.abs(a.data[i + 1] - b.data[i + 1])
              + Math.abs(a.data[i + 2] - b.data[i + 2])
      const dx = (x - cx) / rx, dy = (y - cy) / ry
      if (dx * dx + dy * dy <= 1) { faceSum += d; faceN++ }
      else                         { bgSum  += d; bgN++   }
    }
  }
  return {
    faceDiff: faceN > 0 ? faceSum / (faceN * 3) : 0,
    bgDiff:   bgN   > 0 ? bgSum   / (bgN   * 3) : 0,
  }
}

const FACE_MOTION_THRESHOLD = 22   // face region must exceed this (clear head movement)
const BG_STABILITY_THRESHOLD = 16  // background must stay below this (tablet moving = fail)
const REQUIRED_CONSECUTIVE = 3     // frames of sustained motion needed (~600ms at 200ms/frame)

function ActiveLivenessModal({ onPass, onFail }: { onPass: () => void; onFail: () => void }) {
  const [challenge] = useState(() => CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)])
  const [phase, setPhase] = useState<'starting' | 'briefing' | 'challenge' | 'pass' | 'fail'>('starting')
  const [briefCount, setBriefCount] = useState(2)
  const [countdown, setCountdown] = useState(7)
  const [motionPct, setMotionPct] = useState(0)
  const [bgWarning, setBgWarning] = useState(false)
  const C = '#00ffaa'

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const baselineRef = useRef<ImageData | null>(null)

  // Step 1: open camera, then show briefing
  useEffect(() => {
    let stopped = false
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 320, height: 240 } })
      .then((s) => {
        if (stopped) { s.getTracks().forEach(t => t.stop()); return }
        streamRef.current = s
        if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play().catch(() => {}) }
        setTimeout(() => { if (!stopped) setPhase('briefing') }, 1200)
      })
      .catch(() => { if (!stopped) setPhase('fail') })
    return () => { stopped = true; streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [])

  // Step 2: briefing — say the challenge aloud + 2-1 countdown, then capture baseline and start challenge
  useEffect(() => {
    if (phase !== 'briefing') return
    speak(challenge.voice, { pitch: 0.48, rate: 0.82 })
    let count = 2
    setBriefCount(count)
    const interval = setInterval(() => {
      count--
      setBriefCount(count)
      if (count <= 0) {
        clearInterval(interval)
        // Capture baseline RIGHT as challenge starts
        const v = videoRef.current; const c = canvasRef.current
        if (v && c) {
          c.width = v.videoWidth || 320; c.height = v.videoHeight || 240
          c.getContext('2d')!.drawImage(v, 0, 0)
          baselineRef.current = c.getContext('2d')!.getImageData(0, 0, c.width, c.height)
        }
        setCountdown(7)
        setPhase('challenge')
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [phase, challenge.voice])

  // Step 3: motion detection — 7 seconds
  // Requires SUSTAINED motion (REQUIRED_CONSECUTIVE frames) so placing a photo (1-2 frames) never passes.
  // Also requires background to stay still so moving a tablet (whole-scene shift) is blocked.
  useEffect(() => {
    if (phase !== 'challenge') return
    let ticks = 0
    let consecutive = 0
    const interval = setInterval(() => {
      ticks++
      setCountdown(Math.max(0, 7 - Math.floor((ticks * 200) / 1000)))

      const v = videoRef.current; const c = canvasRef.current; const baseline = baselineRef.current
      if (v && c && baseline) {
        c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height)
        const current = c.getContext('2d')!.getImageData(0, 0, c.width, c.height)
        const { faceDiff, bgDiff } = analyzeMotion(baseline, current, c.width, c.height)
        setBgWarning(bgDiff >= BG_STABILITY_THRESHOLD)
        if (faceDiff >= FACE_MOTION_THRESHOLD && bgDiff < BG_STABILITY_THRESHOLD) {
          consecutive++
        } else {
          consecutive = Math.max(0, consecutive - 1)
        }
        setMotionPct(Math.min(100, Math.round((consecutive / REQUIRED_CONSECUTIVE) * 100)))
        if (consecutive >= REQUIRED_CONSECUTIVE) { clearInterval(interval); setPhase('pass'); return }
      }

      if (ticks >= 35) { clearInterval(interval); setPhase('fail') }
    }, 200)
    return () => clearInterval(interval)
  }, [phase])

  // Step 4: result
  useEffect(() => {
    if (phase === 'pass') {
      speak('Liveness confirmado. Procesando.', { pitch: 0.55, rate: 0.88 })
      const t = setTimeout(onPass, 350)
      return () => clearTimeout(t)
    }
    if (phase === 'fail') {
      speak('Verificación fallida. Intente nuevamente.', { pitch: 0.45, rate: 0.85 })
    }
  }, [phase, onPass])

  return (
    <>
      <style>{`
        @keyframes modal-in { from{opacity:0;transform:scale(.95)} to{opacity:1;transform:scale(1)} }
        .modal-in { animation: modal-in .25s ease-out forwards }
        @keyframes pass-flash { 0%{opacity:0} 40%{opacity:1} 100%{opacity:1} }
        .pass-flash { animation: pass-flash .4s ease-out forwards }
        @keyframes brief-pop { 0%{transform:scale(1.4);opacity:0} 100%{transform:scale(1);opacity:1} }
        .brief-pop { animation: brief-pop .3s ease-out forwards }
        @keyframes pulse-ring { 0%{transform:scale(1);opacity:.7} 100%{transform:scale(1.5);opacity:0} }
        .pulse-ring { animation: pulse-ring 1s ease-out infinite }
      `}</style>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.88)' }}>
        <div className="modal-in w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: '#000c18', border: `1px solid ${C}40`, fontFamily: 'monospace' }}>

          {/* header */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${C}20` }}>
            <span className="text-xs font-bold tracking-widest" style={{ color: C }}>◈ LIVENESS·CHECK</span>
            <button onClick={onFail} className="text-xs hover:opacity-80 transition-opacity" style={{ color: `${C}60` }}>[ CANCELAR ]</button>
          </div>

          {/* video */}
          <div className="relative bg-black overflow-hidden" style={{ aspectRatio: '4/3' }}>
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            <canvas ref={canvasRef} className="hidden" />

            {/* oval guide */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 320 240" preserveAspectRatio="xMidYMid slice">
              <defs>
                <mask id="lv-oval">
                  <rect width="320" height="240" fill="white" />
                  <ellipse cx="160" cy="118" rx="78" ry="100" fill="black" />
                </mask>
              </defs>
              <rect width="320" height="240" fill="rgba(0,0,0,0.4)" mask="url(#lv-oval)" />
              <ellipse cx="160" cy="118" rx="78" ry="100" fill="none" stroke={C} strokeWidth="2.5"
                strokeDasharray={phase === 'challenge' ? '6 4' : '12 6'}
                style={{ opacity: phase === 'challenge' ? 1 : 0.5 }} />
            </svg>

            {/* briefing overlay */}
            {phase === 'briefing' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: 'rgba(0,12,24,0.75)' }}>
                <p className="text-3xl brief-pop font-bold" style={{ color: C }}>{challenge.symbol}</p>
                <p className="font-bold tracking-widest text-base text-center px-4" style={{ color: C }}>{challenge.label}</p>
                <p className="text-xs text-center px-6" style={{ color: `${C}80` }}>{challenge.sub}</p>
                <div className="relative w-14 h-14 flex items-center justify-center mt-1">
                  <div className="pulse-ring absolute inset-0 rounded-full border-2" style={{ borderColor: C }} />
                  <span key={briefCount} className="brief-pop text-3xl font-bold" style={{ color: C }}>{briefCount}</span>
                </div>
                <p className="text-xs tracking-widest" style={{ color: `${C}50` }}>PREPÁRATE...</p>
              </div>
            )}

            {/* starting overlay */}
            {phase === 'starting' && (
              <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,12,24,0.6)' }}>
                <div className="text-center space-y-2">
                  <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mx-auto" style={{ borderColor: `${C}40`, borderTopColor: C }} />
                  <p className="text-xs tracking-widest" style={{ color: `${C}60` }}>ACTIVANDO CÁMARA...</p>
                </div>
              </div>
            )}

            {/* pass overlay */}
            {phase === 'pass' && (
              <div className="pass-flash absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ background: `${C}18` }}>
                <CheckCircle style={{ color: C, width: 56, height: 56, filter: `drop-shadow(0 0 16px ${C})` }} />
                <span className="font-bold tracking-widest text-base" style={{ color: C }}>LIVENESS_OK</span>
              </div>
            )}

            {/* fail overlay */}
            {phase === 'fail' && (
              <div className="pass-flash absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ background: 'rgba(255,30,60,0.12)' }}>
                <XCircle style={{ color: '#ff3366', width: 56, height: 56 }} />
                <span className="font-bold tracking-widest text-base" style={{ color: '#ff3366' }}>VERIFICACIÓN_FALLIDA</span>
              </div>
            )}
          </div>

          {/* bottom panel */}
          <div className="px-4 py-3 space-y-3">
            {/* challenge label always visible */}
            {(phase === 'challenge' || phase === 'pass' || phase === 'fail') && (
              <div className="text-center space-y-0.5">
                <p className="text-xl" style={{ color: phase === 'fail' ? '#ff3366' : C }}>{challenge.symbol}</p>
                <p className="font-bold tracking-widest text-xs" style={{ color: phase === 'fail' ? '#ff3366' : C }}>{challenge.label}</p>
              </div>
            )}

            {phase === 'challenge' && (
              <>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs" style={{ color: `${C}70` }}>
                    <span>MOVIMIENTO_SOSTENIDO</span>
                    <span className="font-bold" style={{ color: motionPct > 60 ? C : `${C}70` }}>{motionPct}%</span>
                  </div>
                  <div className="h-3 rounded-sm overflow-hidden" style={{ background: `${C}12`, border: `1px solid ${C}30` }}>
                    <div
                      className="h-full rounded-sm transition-all duration-100"
                      style={{
                        width: `${motionPct}%`,
                        background: motionPct > 80 ? `linear-gradient(90deg,${C}80,${C})` : `${C}70`,
                        boxShadow: motionPct > 80 ? `0 0 8px ${C}` : 'none',
                      }}
                    />
                  </div>
                </div>
                {bgWarning && (
                  <p className="text-center text-xs tracking-widest" style={{ color: '#ff9933' }}>
                    ⚠ DISPOSITIVO_EN_MOVIMIENTO — solo mueve la cabeza
                  </p>
                )}
                <p className="text-center text-xs" style={{ color: `${C}50` }}>
                  TIEMPO: <span className="font-bold" style={{ color: countdown <= 2 ? '#ff3366' : C }}>{countdown}s</span>
                </p>
              </>
            )}

            {phase === 'fail' && (
              <button
                onClick={onFail}
                className="w-full py-2 text-xs tracking-widest rounded transition-all hover:scale-105"
                style={{ color: '#ff3366', border: '1px solid #ff336640', background: '#ff336610' }}
              >
                [ INTENTAR_DE_NUEVO ]
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ── Inline Camera Liveness (reuses parent videoRef / canvasRef) ──────────────

function CameraLivenessOverlay({
  videoRef,
  canvasRef,
  challenge,
  onPass,
  onCancel,
}: {
  videoRef: React.RefObject<HTMLVideoElement>
  canvasRef: React.RefObject<HTMLCanvasElement>
  challenge: typeof CHALLENGES[number]
  onPass: (faceCapture?: File) => void   // passes the frontal face captured at baseline
  onCancel: () => void
}) {
  const [phase, setPhase] = useState<'briefing' | 'challenge' | 'pass' | 'fail'>('briefing')
  const [briefCount, setBriefCount] = useState(2)
  const [countdown, setCountdown] = useState(7)
  const [motionPct, setMotionPct] = useState(0)
  const [bgWarning, setBgWarning] = useState(false)
  const baselineRef = useRef<ImageData | null>(null)
  const baselineFaceRef = useRef<File | null>(null)   // frontal face captured at baseline start
  const C = '#00ffaa'

  useEffect(() => {
    if (phase !== 'briefing') return
    speak(challenge.voice, { pitch: 0.48, rate: 0.82 })
    let count = 2
    setBriefCount(count)
    const iv = setInterval(() => {
      count--
      setBriefCount(count)
      if (count <= 0) {
        clearInterval(iv)
        const v = videoRef.current, c = canvasRef.current
        if (v && c) {
          c.width = v.videoWidth || 320; c.height = v.videoHeight || 240
          c.getContext('2d')!.drawImage(v, 0, 0)
          baselineRef.current = c.getContext('2d')!.getImageData(0, 0, c.width, c.height)
          // Captura para auth: usa ESTE frame (cara al frente, quieta) en lugar del frame
          // al final del movimiento (que puede estar ladeada/borrosa → falso positivo anti-spoof)
          c.toBlob((blob) => {
            if (blob) baselineFaceRef.current = new File([blob], 'face.jpg', { type: 'image/jpeg' })
          }, 'image/jpeg', 0.92)
        }
        setCountdown(7); setPhase('challenge')
      }
    }, 1000)
    return () => clearInterval(iv)
  }, [phase, challenge.voice, videoRef, canvasRef])

  useEffect(() => {
    if (phase !== 'challenge') return
    let ticks = 0
    let consecutive = 0
    const iv = setInterval(() => {
      ticks++
      setCountdown(Math.max(0, 7 - Math.floor((ticks * 200) / 1000)))
      const v = videoRef.current, c = canvasRef.current, baseline = baselineRef.current
      if (v && c && baseline) {
        c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height)
        const cur = c.getContext('2d')!.getImageData(0, 0, c.width, c.height)
        const { faceDiff, bgDiff } = analyzeMotion(baseline, cur, c.width, c.height)
        setBgWarning(bgDiff >= BG_STABILITY_THRESHOLD)
        if (faceDiff >= FACE_MOTION_THRESHOLD && bgDiff < BG_STABILITY_THRESHOLD) {
          consecutive++
        } else {
          consecutive = Math.max(0, consecutive - 1)
        }
        setMotionPct(Math.min(100, Math.round((consecutive / REQUIRED_CONSECUTIVE) * 100)))
        if (consecutive >= REQUIRED_CONSECUTIVE) { clearInterval(iv); setPhase('pass'); return }
      }
      if (ticks >= 35) { clearInterval(iv); setPhase('fail') }
    }, 200)
    return () => clearInterval(iv)
  }, [phase, videoRef, canvasRef])

  useEffect(() => {
    if (phase === 'pass') {
      speak('Liveness confirmado. Procesando.', { pitch: 0.55, rate: 0.88 })
      const t = setTimeout(() => {
        // Usa la foto del baseline (cara frontal y quieta), no el frame del movimiento
        const face = baselineFaceRef.current
        if (face) onPass(face)
        else onCancel()   // fallback raro: si no se capturó, cancelar
      }, 350)
      return () => clearTimeout(t)
    }
    if (phase === 'fail') speak('Verificación fallida. Intente nuevamente.', { pitch: 0.45, rate: 0.85 })
  }, [phase, onPass])

  return (
    <>
      <style>{`
        @keyframes bn { from{transform:scale(1.5);opacity:0} to{transform:scale(1);opacity:1} }
        .bn { animation: bn .3s ease-out forwards }
        @keyframes pr { 0%{transform:scale(1);opacity:.8} 100%{transform:scale(1.7);opacity:0} }
        .pr { animation: pr 1s ease-out infinite }
      `}</style>
      <div className="absolute inset-0 flex flex-col" style={{ background: 'rgba(0,8,20,0.80)', fontFamily: 'monospace' }}>
        <button onClick={onCancel} className="absolute top-2 right-2 z-10 text-xs px-2 py-0.5 rounded"
          style={{ color: `${C}60`, border: `1px solid ${C}20` }}>✕</button>

        <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6">
          <p className="text-5xl" style={{ color: C }}>{challenge.symbol}</p>
          <p className="font-bold tracking-widest text-sm text-center" style={{ color: C }}>{challenge.label}</p>
          <p className="text-xs text-center leading-relaxed" style={{ color: `${C}75` }}>{challenge.sub}</p>

          {phase === 'briefing' && (
            <div className="relative w-16 h-16 flex items-center justify-center mt-2">
              <div className="pr absolute inset-0 rounded-full border-2" style={{ borderColor: C }} />
              <span key={briefCount} className="bn text-4xl font-bold" style={{ color: C }}>{briefCount}</span>
            </div>
          )}

          {phase === 'challenge' && (
            <div className="w-full space-y-2 mt-3">
              <div className="space-y-1">
                <div className="flex justify-between text-xs" style={{ color: `${C}70` }}>
                  <span>MOVIMIENTO_DETECTADO</span>
                  <span style={{ color: motionPct > 60 ? C : `${C}70` }}>{motionPct}%</span>
                </div>
                <div className="h-3 rounded overflow-hidden" style={{ background: `${C}15`, border: `1px solid ${C}30` }}>
                  <div className="h-full rounded transition-all duration-100"
                    style={{ width: `${motionPct}%`, background: motionPct > 80 ? C : `${C}80`, boxShadow: motionPct > 80 ? `0 0 8px ${C}` : 'none' }} />
                </div>
              </div>
              {bgWarning && (
                <p className="text-center text-xs tracking-widest" style={{ color: '#ff9933' }}>
                  ⚠ Solo mueve la cabeza, no el dispositivo
                </p>
              )}
              <p className="text-center text-xs" style={{ color: `${C}50` }}>
                TIEMPO: <span style={{ color: countdown <= 2 ? '#ff3366' : C }}>{countdown}s</span>
              </p>
            </div>
          )}

          {phase === 'pass' && (
            <div className="flex flex-col items-center gap-2 mt-2">
              <CheckCircle style={{ color: C, width: 48, height: 48, filter: `drop-shadow(0 0 14px ${C})` }} />
              <span className="font-bold tracking-widest text-sm" style={{ color: C }}>OK — CAPTURANDO...</span>
            </div>
          )}

          {phase === 'fail' && (
            <div className="flex flex-col items-center gap-3 mt-2">
              <XCircle style={{ color: '#ff3366', width: 48, height: 48 }} />
              <span className="font-bold tracking-widest text-sm" style={{ color: '#ff3366' }}>TIEMPO_AGOTADO</span>
              <button onClick={onCancel} className="text-xs px-4 py-2 rounded tracking-widest"
                style={{ color: '#ff3366', border: '1px solid #ff336640', background: '#ff336610' }}>
                [ INTENTAR_DE_NUEVO ]
              </button>
            </div>
          )}
        </div>

        <div className="px-4 pb-3">
          <div className="h-px mb-2" style={{ background: `linear-gradient(90deg,transparent,${C}30,transparent)` }} />
          <p className="text-center text-xs" style={{ color: `${C}35` }}>◈ FACEID · LIVENESS_VERIFICATION</p>
        </div>
      </div>
    </>
  )
}

const HEX_CHARS = '0123456789ABCDEF'
function randHex(len = 4) {
  return Array.from({ length: len }, () => HEX_CHARS[Math.floor(Math.random() * 16)]).join('')
}

function ImageProgressOverlay({ mode }: { mode: Mode }) {
  const steps = mode === 'auth' ? AUTH_STEPS : ENROLL_STEPS
  const [stepIdx, setStepIdx] = useState(0)
  const [cursor, setCursor] = useState(true)
  const [hexStream, setHexStream] = useState(() => Array.from({ length: 6 }, () => `0x${randHex(4)}`))
  const [scanPct, setScanPct] = useState(0)

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    const schedule = (i: number) => {
      if (i >= steps.length - 1) return
      const t = setTimeout(() => { setStepIdx(i + 1); schedule(i + 1) }, steps[i].ms)
      timers.push(t)
    }
    schedule(0)
    const cursorTimer = setInterval(() => setCursor((c) => !c), 530)
    const hexTimer = setInterval(() => setHexStream(Array.from({ length: 6 }, () => `0x${randHex(4)}`)), 120)
    const scanTimer = setInterval(() => setScanPct((p) => p >= 100 ? 0 : p + 2), 60)
    return () => { timers.forEach(clearTimeout); clearInterval(cursorTimer); clearInterval(hexTimer); clearInterval(scanTimer) }
  }, [steps])

  const current = steps[stepIdx]
  const C = '#00ffaa'  // primary cyber color

  const labelCmd = current.label.toUpperCase().replace(/ /g, '_')

  return (
    <>
      <style>{`
        @keyframes holo-flicker { 0%,100%{opacity:1} 92%{opacity:1} 93%{opacity:.7} 95%{opacity:1} 97%{opacity:.85} }
        @keyframes corner-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes ring-out { 0%{transform:scale(.6);opacity:.8} 100%{transform:scale(1.6);opacity:0} }
        .holo { animation: holo-flicker 4s infinite }
        .corner-blink { animation: corner-pulse 1.2s ease-in-out infinite }
        .ring { animation: ring-out 1.8s ease-out infinite }
        .ring2 { animation: ring-out 1.8s ease-out infinite .6s }
        .ring3 { animation: ring-out 1.8s ease-out infinite 1.2s }
      `}</style>

      <div
        className="holo absolute inset-0 rounded-xl overflow-hidden flex flex-col"
        style={{ background: 'rgba(0,4,12,0.82)', fontFamily: 'monospace' }}
      >
        {/* subtle grid */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: `linear-gradient(${C}08 1px,transparent 1px),linear-gradient(90deg,${C}08 1px,transparent 1px)`,
          backgroundSize: '28px 28px',
        }} />

        {/* horizontal scan line */}
        <div className="absolute left-0 right-0 h-px pointer-events-none z-10" style={{
          top: `${scanPct}%`,
          background: `linear-gradient(90deg,transparent,${C},transparent)`,
          boxShadow: `0 0 8px ${C}, 0 0 20px ${C}40`,
        }} />

        {/* corner brackets */}
        {([
          { top: 6, left: 6, deg: 0 },
          { top: 6, right: 6, deg: 90 },
          { bottom: 6, right: 6, deg: 180 },
          { bottom: 6, left: 6, deg: 270 },
        ] as Array<{ top?: number; bottom?: number; left?: number; right?: number; deg: number }>).map(({ deg, ...pos }, i) => (
          <svg key={i} width="22" height="22" className="corner-blink absolute z-20" style={{ ...pos, transform: `rotate(${deg}deg)` } as React.CSSProperties}>
            <path d="M2 20 L2 2 L20 2" fill="none" stroke={C} strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        ))}

        {/* top bar */}
        <div className="relative z-10 flex items-center justify-between px-4 pt-4 pb-1">
          <span className="text-xs font-bold tracking-widest" style={{ color: C }}>◈ FACEID·SCAN</span>
          <span className="text-xs tracking-widest" style={{ color: `${C}90` }}>
            {mode === 'auth' ? 'AUTH_PROTOCOL' : 'ENROLL_PROTOCOL'}
          </span>
          <span className="text-xs" style={{ color: C }}>
            <span className="inline-block w-2 h-2 rounded-full mr-1 animate-ping" style={{ background: C, display: 'inline-block' }} />
            LIVE
          </span>
        </div>

        {/* divider */}
        <div className="mx-4 h-px" style={{ background: `linear-gradient(90deg,transparent,${C}60,transparent)` }} />

        {/* center content */}
        <div className="flex-1 flex items-center justify-center relative z-10">
          {/* pulsing rings */}
          <div className="absolute w-24 h-24">
            <div className="ring absolute inset-0 rounded-full border" style={{ borderColor: `${C}60` }} />
            <div className="ring2 absolute inset-0 rounded-full border" style={{ borderColor: `${C}40` }} />
            <div className="ring3 absolute inset-0 rounded-full border" style={{ borderColor: `${C}25` }} />
          </div>
          {/* inner spinner */}
          <div className="relative w-16 h-16 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: `${C}30`, borderTopColor: C }} />
            <div className="absolute inset-2 rounded-full border border-t-transparent animate-spin [animation-direction:reverse] [animation-duration:1.5s]" style={{ borderColor: `${C}20`, borderTopColor: `${C}80` }} />
            <span className="text-lg font-bold" style={{ color: C }}>{current.pct}%</span>
          </div>
        </div>

        {/* step list */}
        <div className="relative z-10 px-4 space-y-0.5 pb-1">
          {steps.map((s, i) => {
            const cmd = s.label.toUpperCase().replace(/ /g, '_')
            const done = i < stepIdx
            const active = i === stepIdx
            return (
              <div key={s.label} className="flex items-center gap-2 text-xs" style={{
                color: done ? `${C}50` : active ? C : `${C}25`,
              }}>
                <span style={{ width: 14 }}>{done ? '✓' : active ? '▶' : '·'}</span>
                <span className={done ? 'line-through' : ''}>{cmd}</span>
                {active && <span style={{ color: `${C}80` }}>{cursor ? '█' : ' '}</span>}
                {active && <span className="ml-auto text-xs" style={{ color: `${C}60` }}>RUNNING</span>}
                {done && <span className="ml-auto text-xs" style={{ color: `${C}40` }}>OK</span>}
              </div>
            )
          })}
        </div>

        {/* divider */}
        <div className="mx-4 h-px my-1.5" style={{ background: `linear-gradient(90deg,transparent,${C}40,transparent)` }} />

        {/* bottom — progress + hex stream */}
        <div className="relative z-10 px-4 pb-3 space-y-1.5">
          {/* digital progress bar */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 rounded-sm overflow-hidden" style={{ background: `${C}15`, border: `1px solid ${C}30` }}>
              <div
                className="h-full rounded-sm transition-all duration-[1800ms] ease-in-out"
                style={{ width: `${current.pct}%`, background: `linear-gradient(90deg,${C}80,${C})`, boxShadow: `0 0 6px ${C}` }}
              />
            </div>
            <span className="text-xs w-9 text-right font-bold" style={{ color: C }}>{current.pct}%</span>
          </div>

          {/* hex data stream */}
          <div className="flex justify-between">
            {hexStream.map((h, i) => (
              <span key={i} className="text-xs" style={{ color: `${C}45` }}>{h}</span>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

export type FaceGuideState = 'none' | 'partial' | 'good'

// Module-level FaceDetector cache (native browser API — Chrome/Edge)
let _faceDetector: { detect: (src: HTMLVideoElement) => Promise<Array<{ boundingBox: DOMRectReadOnly }>> } | null = null
let _faceDetectorChecked = false
function getCachedFaceDetector() {
  if (_faceDetectorChecked) return _faceDetector
  _faceDetectorChecked = true
  if (typeof window !== 'undefined' && 'FaceDetector' in window) {
    try {
      _faceDetector = new (window as unknown as Record<string, new (opts: object) => typeof _faceDetector>).FaceDetector(
        { fastMode: true, maxDetectedFaces: 1 }
      ) as typeof _faceDetector
    } catch { _faceDetector = null }
  }
  return _faceDetector
}

// Persistent canvas for skin detection (avoid creating one every 400ms)
let _skinCanvas: HTMLCanvasElement | null = null
let _skinCtx: CanvasRenderingContext2D | null = null
function getSkinCanvas() {
  if (_skinCanvas) return { canvas: _skinCanvas, ctx: _skinCtx! }
  if (typeof document === 'undefined') return null
  _skinCanvas = document.createElement('canvas')
  _skinCanvas.width = 128; _skinCanvas.height = 96
  _skinCtx = _skinCanvas.getContext('2d', { willReadFrequently: true })
  return _skinCtx ? { canvas: _skinCanvas, ctx: _skinCtx } : null
}

// YCbCr skin detection + contrast check (inside oval vs outside oval).
// Pure RGB heuristics produce false positives on warm backgrounds (walls, wood, warm lighting).
// YCbCr is the standard space used in face detection; Cb/Cr isolate chrominance from luminance.
// Contrast check: face must have SIGNIFICANTLY more skin-like pixels than the background region.
function detectFaceInOval(video: HTMLVideoElement): FaceGuideState {
  try {
    const cc = getSkinCanvas()
    if (!cc) return 'none'
    const { ctx } = cc
    const cw = 128, ch = 96
    ctx.drawImage(video, 0, 0, cw, ch)
    const d = ctx.getImageData(0, 0, cw, ch).data
    // Oval scaled from 640×480 reference (×0.2): cx=64, cy=46, rx=31, ry=39
    const cx = 64, cy = 46, rx = 31, ry = 39
    let skinIn = 0, totalIn = 0, skinOut = 0, totalOut = 0
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const nx = (x - cx) / rx, ny = (y - cy) / ry
        const inside = nx * nx + ny * ny <= 1
        const i = (y * cw + x) * 4
        const r = d[i], g = d[i + 1], b = d[i + 2]
        // YCbCr conversion
        const Y  =  0.299  * r + 0.587  * g + 0.114  * b
        const Cb = 128 - 0.16874 * r - 0.33126 * g + 0.5    * b
        const Cr = 128 + 0.5    * r - 0.41869 * g - 0.08131 * b
        // Standard YCbCr skin range (works across ethnicities)
        const isSkin = Y > 60 && Cb >= 77 && Cb <= 127 && Cr >= 133 && Cr <= 173
        if (inside) { totalIn++;  if (isSkin) skinIn++  }
        else        { totalOut++; if (isSkin) skinOut++ }
      }
    }
    const ratioIn  = totalIn  > 0 ? skinIn  / totalIn  : 0
    const ratioOut = totalOut > 0 ? skinOut / totalOut : 0
    // contrast: face makes oval have MORE skin than background
    const contrast = ratioIn - ratioOut
    if (ratioIn > 0.22 && contrast > 0.10) return 'good'
    if (ratioIn > 0.08 && contrast > 0.04) return 'partial'
    return 'none'
  } catch { return 'none' }
}

export function OvalGuide({ videoRef, onStateChange }: {
  videoRef?: React.RefObject<HTMLVideoElement | null>
  onStateChange?: (s: FaceGuideState) => void
}) {
  const [state, setState] = useState<FaceGuideState>('none')

  const update = useCallback((s: FaceGuideState) => {
    setState(s)
    onStateChange?.(s)
  }, [onStateChange])

  useEffect(() => {
    if (!videoRef) return
    const ref = videoRef
    let alive = true

    async function tick() {
      if (!alive) return
      const v = ref.current
      if (!v || v.readyState < 2 || !v.videoWidth) {
        setTimeout(tick, 400); return
      }

      const det = getCachedFaceDetector()
      if (det) {
        // Use native FaceDetector API when available; skin fallback if it finds nothing
        try {
          const faces = await det.detect(v)
          if (!faces.length) {
            // FaceDetector found nothing — skin heuristic as secondary check
            update(detectFaceInOval(v))
          } else {
            const b = faces[0].boundingBox
            const scx = 640 / v.videoWidth, scy = 480 / v.videoHeight
            const fcx = (b.x + b.width / 2) * scx
            const fcy = (b.y + b.height / 2) * scy
            const fw  = b.width * scx
            // Oval: cx=320 cy=230 rx=155 ry=195
            const nx = (fcx - 320) / 155, ny = (fcy - 230) / 195
            const centered = Math.sqrt(nx * nx + ny * ny) < 0.55
            const sized    = fw > 80 && fw < 400
            update(centered && sized ? 'good' : 'partial')
          }
        } catch { update(detectFaceInOval(v)) }
      } else {
        update(detectFaceInOval(v))
      }

      if (alive) setTimeout(tick, 400)
    }

    tick()
    return () => { alive = false }
  }, [videoRef, update])

  const stroke  = state === 'good' ? '#22c55e' : state === 'partial' ? '#f59e0b' : 'rgba(200,200,200,0.6)'
  const sWidth  = state === 'good' ? 4 : state === 'partial' ? 3 : 2
  const dash    = state === 'good' ? undefined : state === 'partial' ? '12 5' : '8 7'
  const vignette = state === 'good' ? 'rgba(0,0,0,0.20)' : 'rgba(0,0,0,0.50)'

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 640 480" preserveAspectRatio="xMidYMid slice" style={{ zIndex: 10 }}>
      <defs>
        <mask id="oval-cutout">
          <rect width="640" height="480" fill="white" />
          <ellipse cx="320" cy="230" rx="155" ry="195" fill="black" />
        </mask>
        <filter id="glow-green" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="7" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="glow-amber" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Vignette */}
      <rect width="640" height="480" fill={vignette} mask="url(#oval-cutout)" style={{ transition: 'fill 0.5s' }} />

      {/* Color tint inside oval */}
      {state === 'good' && <ellipse cx="320" cy="230" rx="155" ry="195" fill="rgba(34,197,94,0.08)" />}
      {state === 'partial' && <ellipse cx="320" cy="230" rx="155" ry="195" fill="rgba(245,158,11,0.06)" />}

      {/* Oval border */}
      <ellipse cx="320" cy="230" rx="155" ry="195"
        fill="none"
        stroke={stroke}
        strokeWidth={sWidth}
        strokeDasharray={dash}
        filter={state === 'good' ? 'url(#glow-green)' : state === 'partial' ? 'url(#glow-amber)' : undefined}
        style={{ transition: 'stroke 0.4s, stroke-width 0.3s' }}
      />

      {/* Corner brackets */}
      {[
        [[233,65],[253,65]], [[233,65],[233,85]],
        [[387,65],[407,65]], [[407,65],[407,85]],
        [[233,395],[253,395]], [[233,375],[233,395]],
        [[387,395],[407,395]], [[407,375],[407,395]],
      ].map(([[x1,y1],[x2,y2]], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={stroke} strokeWidth="3" strokeLinecap="round"
          style={{ transition: 'stroke 0.4s' }}
        />
      ))}
    </svg>
  )
}

function ResultPanel({ result, onReset }: { result: Result; onReset: () => void }) {
  const base = 'border rounded-xl p-4 space-y-3'
  if (result.type === 'error') return (
    <div className={`${base} bg-red-50 border-red-200`}>
      <div className="flex items-start gap-3">
        <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-red-700">Error</p>
          <p className="text-sm text-red-600 mt-0.5">{result.message}</p>
        </div>
        <button onClick={onReset} className="text-red-400 hover:text-red-600"><RotateCcw className="w-4 h-4" /></button>
      </div>
    </div>
  )

  if (result.type === 'enroll') {
    const d = result.data
    return (
      <div className={`${base} ${d.enrolled ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
        <div className="flex items-center gap-2">
          {d.enrolled ? <CheckCircle className="w-5 h-5 text-emerald-600" /> : <XCircle className="w-5 h-5 text-red-500" />}
          <span className={`text-sm font-semibold flex-1 ${d.enrolled ? 'text-emerald-700' : 'text-red-600'}`}>
            {d.enrolled ? 'Enrolado correctamente' : 'Fallo en enrolamiento'}
          </span>
          <button onClick={onReset} className="text-slate-400 hover:text-slate-600"><RotateCcw className="w-4 h-4" /></button>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <dt className="text-slate-500">Calidad</dt><dd className="font-medium">{(d.quality_score * 100).toFixed(1)}%</dd>
          <dt className="text-slate-500">Cara real</dt><dd className="font-medium">{d.is_real_face ? 'Sí' : 'No'}</dd>
          <dt className="text-slate-500">Cobro</dt><dd className="font-medium">${d.amount_charged.toFixed(4)}</dd>
          <dt className="text-slate-500">ID sujeto</dt><dd className="font-mono truncate">{d.subject_id}</dd>
        </dl>
        <p className="text-xs text-slate-500">{d.message}</p>
      </div>
    )
  }

  const d = result.data
  return (
    <div className={`${base} ${d.verified ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
      <div className="flex items-center gap-2">
        {d.verified ? <CheckCircle className="w-5 h-5 text-emerald-600" /> : <AlertTriangle className="w-5 h-5 text-amber-500" />}
        <span className={`text-sm font-semibold flex-1 ${d.verified ? 'text-emerald-700' : 'text-amber-700'}`}>
          {d.verified ? 'Identidad verificada' : 'No verificado'}
        </span>
        {d.fraud_detected && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">Fraude</span>}
        <button onClick={onReset} className="text-slate-400 hover:text-slate-600"><RotateCcw className="w-4 h-4" /></button>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <dt className="text-slate-500">Confianza</dt><dd className="font-medium">{(d.confidence * 100).toFixed(1)}%</dd>
        <dt className="text-slate-500">Distancia</dt><dd className="font-medium">{d.distance.toFixed(4)}</dd>
        <dt className="text-slate-500">Cara real</dt><dd className="font-medium">{d.is_real_face ? 'Sí' : 'No'}</dd>
        <dt className="text-slate-500">Anti-spoof</dt><dd className="font-medium">{(d.spoofing_score * 100).toFixed(1)}%</dd>
        <dt className="text-slate-500">Cobro</dt><dd className="font-medium">${d.amount_charged.toFixed(4)}</dd>
      </dl>
    </div>
  )
}

function ImageResultOverlay({ result, onReset }: { result: Result; onReset: () => void }) {
  if (result.type === 'error') return null

  const isEnroll = result.type === 'enroll'
  const ok = isEnroll ? result.data.enrolled : result.data.verified
  const fraud = !isEnroll && result.data.fraud_detected
  const C = ok ? '#00ffaa' : '#ff3366'
  const label = isEnroll
    ? (ok ? 'ENROLAMIENTO_OK' : 'ENROLAMIENTO_FALLIDO')
    : (ok ? 'IDENTIDAD_VERIFICADA' : 'ACCESO_DENEGADO')
  const sub = isEnroll
    ? `CALIDAD: ${(result.data.quality_score * 100).toFixed(0)}%`
    : ok
      ? `CONFIANZA: ${(result.data.confidence * 100).toFixed(1)}%  ·  ¡ERES TÚ!`
      : 'NO_MATCH — SUJETO_DESCONOCIDO'

  return (
    <>
      <style>{`
        @keyframes result-in { from{opacity:0;transform:scale(.94)} to{opacity:1;transform:scale(1)} }
        @keyframes glow-pulse { 0%,100%{opacity:.6} 50%{opacity:1} }
        .result-in { animation: result-in .35s cubic-bezier(.22,.68,0,1.2) forwards }
        .glow-pulse { animation: glow-pulse 1.4s ease-in-out infinite }
      `}</style>
      <div
        className="result-in absolute inset-0 rounded-xl overflow-hidden flex flex-col items-center justify-center gap-4"
        style={{ background: `rgba(0,4,12,0.88)`, fontFamily: 'monospace' }}
      >
        {/* grid */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: `linear-gradient(${C}06 1px,transparent 1px),linear-gradient(90deg,${C}06 1px,transparent 1px)`,
          backgroundSize: '28px 28px',
        }} />

        {/* corner brackets */}
        {([
          { top: 6, left: 6, deg: 0 }, { top: 6, right: 6, deg: 90 },
          { bottom: 6, right: 6, deg: 180 }, { bottom: 6, left: 6, deg: 270 },
        ] as Array<{ top?: number; bottom?: number; left?: number; right?: number; deg: number }>).map(({ deg, ...pos }, i) => (
          <svg key={i} width="22" height="22" className="absolute z-20" style={{ ...pos, transform: `rotate(${deg}deg)` } as React.CSSProperties}>
            <path d="M2 20 L2 2 L20 2" fill="none" stroke={C} strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        ))}

        {/* glow circle */}
        <div className="glow-pulse absolute w-32 h-32 rounded-full pointer-events-none" style={{
          background: `radial-gradient(circle, ${C}20 0%, transparent 70%)`,
        }} />

        {/* icon */}
        <div className="relative z-10" style={{ filter: `drop-shadow(0 0 12px ${C})` }}>
          {ok
            ? <CheckCircle style={{ color: C, width: 52, height: 52 }} />
            : <XCircle style={{ color: C, width: 52, height: 52 }} />}
        </div>

        {/* label */}
        <div className="relative z-10 text-center space-y-1 px-4">
          <p className="text-lg font-bold tracking-widest" style={{ color: C, textShadow: `0 0 12px ${C}` }}>
            {label}
          </p>
          <p className="text-xs tracking-wider" style={{ color: `${C}80` }}>{sub}</p>
          {fraud && (
            <p className="text-xs tracking-widest mt-1 px-3 py-1 rounded" style={{ color: '#ff3366', border: '1px solid #ff336640', background: '#ff336615' }}>
              ⚠ FRAUDE_DETECTADO
            </p>
          )}
        </div>

        {/* divider */}
        <div className="w-48 h-px" style={{ background: `linear-gradient(90deg,transparent,${C}50,transparent)` }} />

        <button
          onClick={onReset}
          className="relative z-10 text-xs tracking-widest px-5 py-2 rounded transition-all hover:scale-105"
          style={{ color: C, border: `1px solid ${C}50`, background: `${C}10` }}
        >
          [ NUEVA_PRUEBA ]
        </button>
      </div>
    </>
  )
}

// ── Camera view overlay: oval + face state feedback + recommendations ────────

const FACE_TIPS = [
  'Sin gafas de sol ni lentes oscuros',
  'Sin mascarilla ni tapabocas',
  'Sin sombrero ni gorra',
  'Iluminación frontal uniforme',
  'Sin filtros de cámara',
]

function CameraViewOverlay({
  videoRef,
  activeLiveness,
  mode,
  onCapture,
}: {
  videoRef: React.RefObject<HTMLVideoElement>
  activeLiveness: boolean
  mode: Mode
  onCapture: () => void
}) {
  const [faceState, setFaceState] = useState<FaceGuideState>('none')
  const [tipIdx, setTipIdx] = useState(0)

  // Rotate tips every 3s
  useEffect(() => {
    const iv = setInterval(() => setTipIdx(i => (i + 1) % FACE_TIPS.length), 3000)
    return () => clearInterval(iv)
  }, [])

  // Share face state with OvalGuide by lifting it here
  // OvalGuide calls back via onStateChange
  const stateMsg = faceState === 'good'
    ? '✓ Rostro detectado — listo'
    : faceState === 'partial'
    ? '⟳ Centra el rostro en el óvalo'
    : '⬆ Coloca tu rostro dentro del óvalo'

  const stateBg  = faceState === 'good' ? 'rgba(34,197,94,0.85)' : faceState === 'partial' ? 'rgba(245,158,11,0.85)' : 'rgba(0,0,0,0.55)'
  const stateClr = faceState === 'good' ? '#fff' : faceState === 'partial' ? '#fff' : 'rgba(255,255,255,0.85)'

  const livenessMode = activeLiveness && mode === 'auth'

  return (
    <>
      <OvalGuide videoRef={videoRef} onStateChange={setFaceState} />

      {/* Face state badge */}
      <div className="absolute top-3 left-0 right-0 flex justify-center pointer-events-none" style={{ zIndex: 30 }}>
        <span
          className="text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg"
          style={{
            background: stateBg,
            color: stateClr,
            transition: 'background 0.4s',
            fontFamily: 'monospace',
            letterSpacing: '0.05em',
            border: faceState === 'good' ? '1px solid rgba(34,197,94,0.5)' : '1px solid rgba(255,255,255,0.15)',
            textShadow: faceState === 'good' ? '0 0 8px rgba(34,197,94,0.8)' : 'none',
          }}
        >
          {livenessMode ? '◈ Liveness activo — pulsa Autenticar para iniciar' : stateMsg}
        </span>
      </div>

      {/* Rotating tip — recommendation bar */}
      <div className="absolute bottom-14 left-3 right-3 flex justify-center pointer-events-none" style={{ zIndex: 30 }}>
        <div
          className="flex items-center gap-2 rounded-lg px-4 py-2 shadow-lg"
          style={{ background: 'rgba(0,0,0,0.72)', border: '1px solid rgba(245,158,11,0.35)' }}
        >
          <span style={{ color: '#fbbf24', fontSize: 14 }}>⚠</span>
          <span className="text-xs font-medium text-white" style={{ fontFamily: 'monospace', letterSpacing: '0.03em' }}>{FACE_TIPS[tipIdx]}</span>
        </div>
      </div>

      {/* Capture button */}
      {!livenessMode && (
        <button
          onClick={onCapture}
          disabled={faceState === 'none'}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 text-sm font-semibold px-6 py-2 rounded-full shadow-lg transition-all"
          style={{
            zIndex: 30,
            background: faceState === 'good' ? '#16a34a' : faceState === 'partial' ? '#d97706' : 'rgba(100,100,100,0.5)',
            color: faceState === 'none' ? 'rgba(255,255,255,0.45)' : '#fff',
            cursor: faceState === 'none' ? 'not-allowed' : 'pointer',
            transition: 'background 0.4s',
            border: faceState === 'good' ? '1px solid #4ade80' : 'none',
            boxShadow: faceState === 'good' ? '0 0 16px rgba(34,197,94,0.5)' : 'none',
          }}
        >
          {faceState === 'good' ? '✓ Capturar foto' : faceState === 'partial' ? '⟳ Centrando...' : '○ Esperando rostro...'}
        </button>
      )}
    </>
  )
}

export default function FaceLab({ defaultApiKey = '' }: { defaultApiKey?: string }) {
  const [apiKey, setApiKey] = useState(defaultApiKey)
  const [mode, setMode] = useState<Mode>('enroll')
  const [captureMode, setCaptureMode] = useState<CaptureMode>('file')
  const [externalId, setExternalId] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [loading, setLoading] = useState(false)
  const [cameraOn, setCameraOn] = useState(false)
  const [voiceOn, setVoiceOn] = useState(true)
  const [activeLiveness, setActiveLiveness] = useState(false)
  const [showLiveness, setShowLiveness] = useState(false)
  const [showCameraLiveness, setShowCameraLiveness] = useState(false)
  const [cameraLivenessChallenge, setCameraLivenessChallenge] = useState(() => CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)])

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCameraOn(false)
  }, [])

  useEffect(() => () => stopCamera(), [stopCamera])

  const startCamera = useCallback(async () => {
    stopCamera()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } })
      streamRef.current = stream
      await new Promise<void>((resolve) => setTimeout(resolve, 50))
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setCameraOn(true)
    } catch {
      alert('No se pudo acceder a la cámara. Verifica los permisos del navegador.')
    }
  }, [stopCamera])

  const capturePhoto = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (!blob) return
      const f = new File([blob], 'capture.jpg', { type: 'image/jpeg' })
      setFile(f)
      setPreview(URL.createObjectURL(blob))
      stopCamera()
    }, 'image/jpeg', 0.92)
  }, [stopCamera])

  const captureAndRunAuth = useCallback(async (preCapture?: File) => {
    let f: File
    if (preCapture) {
      // Foto capturada en el baseline (cara frontal, quieta) — mejor calidad para anti-spoof
      f = preCapture
    } else {
      // Captura en vivo (modo sin liveness o fallback)
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas) return
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d')!.drawImage(video, 0, 0)
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
      if (!blob) return
      f = new File([blob], 'capture.jpg', { type: 'image/jpeg' })
    }
    setFile(f)
    setPreview(URL.createObjectURL(f))
    stopCamera()
    setShowCameraLiveness(false)
    setLoading(true)
    setResult(null)
    if (voiceOn) speak('Iniciando escaneo biométrico. Por favor espere.', { pitch: 0.5, rate: 0.85 })
    try {
      const data = await api.authenticateFace(apiKey.trim(), externalId.trim(), f, undefined, true)
      setResult({ type: 'auth', data })
      if (voiceOn) {
        if (data.fraud_detected) speak('Alerta. Intento de fraude detectado. Acceso denegado.', { pitch: 0.45, rate: 0.82 })
        else if (data.verified) speak('Identidad verificada. Bienvenido.', { pitch: 0.55, rate: 0.88 })
        else speak('Acceso denegado. Identidad no reconocida.', { pitch: 0.45, rate: 0.82 })
      }
    } catch (e: unknown) {
      setResult({ type: 'error', message: (e as Error).message })
      if (voiceOn) speak('Error de sistema. Intente nuevamente.', { pitch: 0.5, rate: 0.85 })
    } finally {
      setLoading(false)
    }
  }, [videoRef, canvasRef, stopCamera, apiKey, externalId, voiceOn])

  function clearImage() {
    setFile(null)
    setPreview(null)
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleModeChange(m: Mode) {
    stopCamera()
    setCaptureMode('file')
    clearImage()
    setMode(m)
  }

  function handleCaptureModeChange(c: CaptureMode) {
    clearImage()
    setCaptureMode(c)
    if (c === 'camera') startCamera()
    else stopCamera()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setResult(null)
  }

  async function runAuth() {
    if (!file) return
    setLoading(true)
    setResult(null)
    if (voiceOn) speak(
      mode === 'enroll' ? 'Iniciando registro biométrico. Por favor espere.' : 'Iniciando escaneo biométrico. Por favor espere.',
      { pitch: 0.5, rate: 0.85 }
    )
    try {
      if (mode === 'enroll') {
        const data = await api.enrollFace(apiKey.trim(), externalId.trim(), file)
        setResult({ type: 'enroll', data })
        if (voiceOn) {
          if (data.enrolled) speak('Registro exitoso. Sujeto enrolado en el sistema.', { pitch: 0.55, rate: 0.88 })
          else speak('Registro fallido. No se detectó un rostro válido.', { pitch: 0.5, rate: 0.85 })
        }
      } else {
        const data = await api.authenticateFace(apiKey.trim(), externalId.trim(), file, undefined, activeLiveness)
        setResult({ type: 'auth', data })
        if (voiceOn) {
          if (data.fraud_detected) speak('Alerta. Intento de fraude detectado. Acceso denegado.', { pitch: 0.45, rate: 0.82 })
          else if (data.verified) speak('Identidad verificada. Bienvenido.', { pitch: 0.55, rate: 0.88 })
          else speak('Acceso denegado. Identidad no reconocida.', { pitch: 0.45, rate: 0.82 })
        }
      }
    } catch (e: unknown) {
      setResult({ type: 'error', message: (e as Error).message })
      if (voiceOn) speak('Error de sistema. Intente nuevamente.', { pitch: 0.5, rate: 0.85 })
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit() {
    if (!apiKey.trim()) return alert('Ingresa una API Key')
    if (!externalId.trim()) return alert('Ingresa el external_id del sujeto')

    // Camera + active liveness + auth → inline liveness (no file needed yet, captures after passing)
    if (captureMode === 'camera' && cameraOn && activeLiveness && mode === 'auth' && !file) {
      setCameraLivenessChallenge(CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)])
      setShowCameraLiveness(true)
      return
    }

    if (!file) return alert('Selecciona o captura una imagen')

    // File mode + active liveness → modal with new camera for liveness check
    if (activeLiveness && mode === 'auth') { setShowLiveness(true); return }

    runAuth()
  }

  const showPreviewArea = preview || (captureMode === 'camera')

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">

        <div>
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">API Key del tenant</label>
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="fid_..."
            className="mt-1.5 w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>

        <div className="flex gap-2">
          {(['enroll', 'auth'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => handleModeChange(m)}
              className={`flex-1 py-2 text-sm rounded-lg border capitalize transition-colors ${
                mode === m ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-medium' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {m === 'enroll' ? 'Enrolar' : 'Autenticar'}
            </button>
          ))}
        </div>

        {/* Active liveness toggle — only shown in auth mode */}
        {mode === 'auth' && (
          <div
            onClick={() => setActiveLiveness(v => !v)}
            className="flex items-center justify-between cursor-pointer select-none px-3 py-2 rounded-lg border border-slate-100 bg-slate-50 hover:bg-slate-100 transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-slate-700">Liveness activo</p>
              <p className="text-xs text-slate-400 mt-0.5">Pide un movimiento de cabeza antes de autenticar</p>
            </div>
            <div className={`relative w-10 h-5 rounded-full transition-colors shrink-0 pointer-events-none ${activeLiveness ? 'bg-indigo-600' : 'bg-slate-200'}`}>
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${activeLiveness ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">External ID del sujeto</label>
          <input
            value={externalId}
            onChange={(e) => setExternalId(e.target.value)}
            placeholder="user-123 o email@ejemplo.com"
            className="mt-1.5 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Imagen</label>
            <button
              onClick={() => { setVoiceOn(v => !v); if (voiceOn) window.speechSynthesis?.cancel() }}
              title={voiceOn ? 'Silenciar voz' : 'Activar voz'}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors ${voiceOn ? 'border-indigo-300 bg-indigo-50 text-indigo-600' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}
            >
              {voiceOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              {voiceOn ? 'Voz activa' : 'Silenciado'}
            </button>
          </div>
          <div className="flex gap-2 mb-3">
            {(['file', 'camera'] as CaptureMode[]).map((c) => (
              <button
                key={c}
                onClick={() => handleCaptureModeChange(c)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  captureMode === c ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {c === 'camera' ? <Camera className="w-3.5 h-3.5" /> : <Upload className="w-3.5 h-3.5" />}
                {c === 'camera' ? 'Cámara' : 'Archivo'}
              </button>
            ))}
          </div>

          {/* File drop zone */}
          {captureMode === 'file' && !preview && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors"
            >
              <Upload className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Haz clic o arrastra una imagen</p>
              <p className="text-xs text-slate-400 mt-1">JPG, PNG, WEBP</p>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </div>
          )}

          {/* Image / camera container — overlays render inside here */}
          {showPreviewArea && (
            <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-900" style={{ minHeight: 200 }}>

              {/* Camera live view */}
              {captureMode === 'camera' && !preview && (
                <>
                  <video ref={videoRef} autoPlay playsInline muted className="w-full aspect-video object-cover" />
                  <canvas ref={canvasRef} className="hidden" />
                  {cameraOn && !showCameraLiveness && (
                    <CameraViewOverlay
                      videoRef={videoRef as React.RefObject<HTMLVideoElement>}
                      activeLiveness={activeLiveness}
                      mode={mode}
                      onCapture={capturePhoto}
                    />
                  )}
                  {cameraOn && showCameraLiveness && (
                    <CameraLivenessOverlay
                      videoRef={videoRef as React.RefObject<HTMLVideoElement>}
                      canvasRef={canvasRef as React.RefObject<HTMLCanvasElement>}
                      challenge={cameraLivenessChallenge}
                      onPass={captureAndRunAuth}
                      onCancel={() => setShowCameraLiveness(false)}
                    />
                  )}
                  {!cameraOn && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <button onClick={startCamera} className="bg-white text-slate-700 text-sm px-4 py-2 rounded-lg shadow">
                        Activar cámara
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Static preview */}
              {preview && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={preview} alt="preview" className="w-full object-cover max-h-72" />
              )}

              {/* Clear button — only when not loading/result */}
              {preview && !loading && !result && (
                <button
                  onClick={clearImage}
                  className="absolute top-2 right-2 bg-white/90 rounded-full p-1 shadow hover:bg-white transition-colors z-20"
                >
                  <X className="w-4 h-4 text-slate-600" />
                </button>
              )}

              {/* Progress overlay ON the image */}
              {loading && preview && <ImageProgressOverlay mode={mode} />}

              {/* Result overlay ON the image */}
              {!loading && result && result.type !== 'error' && (
                <ImageResultOverlay result={result} onReset={clearImage} />
              )}
            </div>
          )}
        </div>

        {(() => {
          const cameraLivenessReady = captureMode === 'camera' && cameraOn && activeLiveness && mode === 'auth' && !file
          const canSubmit = !!file || cameraLivenessReady
          const label = loading
            ? <><div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" /> Procesando...</>
            : mode === 'enroll'
              ? 'Enrolar sujeto'
              : cameraLivenessReady
                ? '◈ Iniciar verificación biométrica'
                : 'Autenticar sujeto'
          return (
            <button
              onClick={handleSubmit}
              disabled={loading || !canSubmit}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white text-sm py-2.5 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 font-medium"
            >
              {label}
            </button>
          )
        })()}
      </div>

      {/* Error panel below card */}
      {!loading && result?.type === 'error' && (
        <ResultPanel result={result} onReset={() => setResult(null)} />
      )}

      {/* Detailed stats below card */}
      {!loading && result && result.type !== 'error' && (
        <ResultPanel result={result} onReset={() => { setResult(null); clearImage() }} />
      )}

      {/* Active liveness modal */}
      {showLiveness && (
        <ActiveLivenessModal
          onPass={() => { setShowLiveness(false); runAuth() }}
          onFail={() => setShowLiveness(false)}
        />
      )}
    </div>
  )
}
