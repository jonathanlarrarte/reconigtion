'use client'

import { Suspense, useRef, useState, useCallback, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { OvalGuide, speak, analyzeMotion } from '@/components/face-lab'
import type { FaceGuideState } from '@/components/face-lab'

const TIPS = [
  'Sin gafas de sol ni lentes oscuros',
  'Sin mascarilla ni tapabocas',
  'Iluminación frontal uniforme',
  'Sin sombrero ni gorra',
  'Mira directamente a la cámara',
]

const CHALLENGES = [
  { symbol: '↕', label: 'ASIENTE CON LA CABEZA', voice: 'Asiente con la cabeza. Arriba y abajo.' },
  { symbol: '↔', label: 'GIRA LA CABEZA',         voice: 'Gira la cabeza de izquierda a derecha.' },
  { symbol: '↗', label: 'INCLINA LA CABEZA',       voice: 'Inclina la cabeza hacia un lado.' },
]

const C = '#00ffaa'

function WidgetContent() {
  const params      = useSearchParams()
  const apiKey      = params.get('api_key')     ?? ''
  const externalId  = params.get('external_id') ?? ''
  const mode        = (params.get('mode') ?? 'auth') as 'auth' | 'enroll' | 'liveness'
  const apiUrl      = params.get('api_url')     ?? 'http://localhost:8000'

  const videoRef    = useRef<HTMLVideoElement>(null)
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const streamRef   = useRef<MediaStream | null>(null)
  const baselineRef = useRef<ImageData | null>(null)
  const capturedRef = useRef<File | null>(null)

  const [cameraOn,  setCameraOn]  = useState(false)
  const [faceState, setFaceState] = useState<FaceGuideState>('none')
  const [tipIdx,    setTipIdx]    = useState(0)
  const [phase,     setPhase]     = useState<'camera' | 'liveness' | 'processing' | 'result' | 'error'>('camera')
  const [result,    setResult]    = useState<Record<string, unknown> | null>(null)
  const [errorMsg,  setErrorMsg]  = useState('')

  const [lvChallenge]                   = useState(() => CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)])
  const [lvPhase,      setLvPhase]      = useState<'briefing' | 'challenge' | 'pass' | 'fail'>('briefing')
  const [lvMotion,     setLvMotion]     = useState(0)
  const [lvCountdown,  setLvCountdown]  = useState(7)
  const [lvBriefCount, setLvBriefCount] = useState(2)

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCameraOn(false)
  }, [])

  const startCamera = useCallback(async () => {
    stopCamera()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}) }
      setCameraOn(true)
    } catch {
      setErrorMsg('No se pudo acceder a la cámara. Verifica los permisos del navegador.')
      setPhase('error')
    }
  }, [stopCamera])

  useEffect(() => { startCamera(); return () => stopCamera() }, [startCamera, stopCamera])
  useEffect(() => {
    const iv = setInterval(() => setTipIdx(i => (i + 1) % TIPS.length), 3000)
    return () => clearInterval(iv)
  }, [])

  function post(data: Record<string, unknown>) { window.parent.postMessage(data, '*') }

  async function callApi(file: File) {
    setPhase('processing')
    try {
      const form = new FormData()
      form.append('image', file)
      const headers: Record<string, string> = { 'X-API-Key': apiKey }

      if (mode === 'enroll') {
        const res  = await fetch(`${apiUrl}/v1/faces/enroll/${encodeURIComponent(externalId)}`, { method: 'POST', headers, body: form })
        const data = await res.json()
        if (!res.ok) throw new Error(data.detail ?? `HTTP ${res.status}`)
        setResult({ ...data, _mode: 'enroll' })
        post({ type: 'faceid_result', mode, enrolled: data.enrolled, quality_score: data.quality_score, subject_id: data.subject_id, external_id: externalId })
        speak(data.enrolled ? 'Registro exitoso.' : 'Registro fallido.', { pitch: 0.6 })
      } else {
        // Pre-fetch a challenge; the server consumes it only when liveness_required=true for this tenant.
        try {
          const ch = await fetch(`${apiUrl}/v1/liveness/challenge`, { headers: { 'X-API-Key': apiKey }, cache: 'no-store' })
          if (ch.ok) { const { challenge_id } = await ch.json(); headers['X-Challenge-Id'] = challenge_id }
        } catch { /* proceed without — server will reject only if tenant requires it */ }

        const res  = await fetch(`${apiUrl}/v1/faces/authenticate/${encodeURIComponent(externalId)}`, { method: 'POST', headers, body: form })
        const data = await res.json()
        if (!res.ok) throw new Error(data.detail ?? `HTTP ${res.status}`)
        setResult({ ...data, _mode: 'auth' })
        post({ type: 'faceid_result', mode, verified: data.verified, confidence: data.confidence, fraud_detected: data.fraud_detected, subject_id: data.subject_id, external_id: externalId })
        speak(data.fraud_detected ? 'Fraude detectado.' : data.verified ? 'Identidad verificada.' : 'Acceso denegado.', { pitch: 0.6 })
      }
      setPhase('result')
    } catch (e: unknown) {
      const msg = (e as Error).message
      setErrorMsg(msg)
      post({ type: 'faceid_error', mode, error: msg })
      setPhase('error')
    }
  }

  async function captureFile(): Promise<File | null> {
    const v = videoRef.current, c = canvasRef.current
    if (!v || !c) return null
    c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d')!.drawImage(v, 0, 0)
    const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.92))
    return blob ? new File([blob], 'face.jpg', { type: 'image/jpeg' }) : null
  }

  async function handleCapture() {
    const file = await captureFile()
    if (!file) return
    capturedRef.current = file

    if (mode === 'liveness') {
      // Capture baseline frame for motion detection then start challenge
      const c = canvasRef.current
      if (c) baselineRef.current = c.getContext('2d')!.getImageData(0, 0, c.width, c.height)
      setLvPhase('briefing')
      setLvMotion(0)
      setLvCountdown(7)
      setLvBriefCount(2)
      setPhase('liveness')
      speak(lvChallenge.voice, { pitch: 0.48, rate: 0.82 })
    } else {
      stopCamera()
      await callApi(file)
    }
  }

  // Liveness briefing countdown
  useEffect(() => {
    if (phase !== 'liveness' || lvPhase !== 'briefing') return
    let count = 2
    setLvBriefCount(count)
    const iv = setInterval(() => {
      count--; setLvBriefCount(count)
      if (count <= 0) { clearInterval(iv); setLvCountdown(7); setLvPhase('challenge') }
    }, 1000)
    return () => clearInterval(iv)
  }, [phase, lvPhase])

  // Liveness motion detection
  useEffect(() => {
    if (phase !== 'liveness' || lvPhase !== 'challenge') return
    let ticks = 0, consecutive = 0
    const iv = setInterval(() => {
      ticks++
      setLvCountdown(Math.max(0, 7 - Math.floor(ticks * 200 / 1000)))
      const v = videoRef.current, c = canvasRef.current, base = baselineRef.current
      if (v && c && base) {
        c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height)
        const cur = c.getContext('2d')!.getImageData(0, 0, c.width, c.height)
        const { faceDiff, bgDiff } = analyzeMotion(base, cur, c.width, c.height)
        if (faceDiff >= 22 && bgDiff < 16) consecutive++
        else consecutive = Math.max(0, consecutive - 1)
        setLvMotion(Math.min(100, Math.round(consecutive / 3 * 100)))
        if (consecutive >= 3) { clearInterval(iv); setLvPhase('pass') }
      }
      if (ticks >= 35) { clearInterval(iv); setLvPhase('fail') }
    }, 200)
    return () => clearInterval(iv)
  }, [phase, lvPhase])

  // Liveness result
  useEffect(() => {
    if (phase !== 'liveness') return
    if (lvPhase === 'pass') {
      speak('Liveness confirmado.', { pitch: 0.55 })
      setTimeout(() => {
        stopCamera()
        if (mode === 'liveness') {
          post({ type: 'faceid_result', mode, passed: true, is_real: true })
          setResult({ _mode: 'liveness', passed: true })
          setPhase('result')
        } else if (capturedRef.current) {
          callApi(capturedRef.current)
        }
      }, 400)
    }
    if (lvPhase === 'fail') speak('Verificación fallida.', { pitch: 0.45 })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lvPhase])

  function reset() {
    setPhase('camera')
    setResult(null)
    setFaceState('none')
    setLvPhase('briefing')
    setLvMotion(0)
    capturedRef.current = null
    startCamera()
  }

  const modeLabel  = mode === 'enroll' ? 'ENROLAR' : mode === 'liveness' ? 'LIVENESS' : 'AUTENTICAR'
  const btnLabel   = faceState === 'good'
    ? mode === 'enroll' ? '✓ Registrar' : mode === 'liveness' ? '◈ Verificar liveness' : '✓ Autenticar'
    : faceState === 'partial' ? '⟳ Centrando...' : '○ Esperando rostro...'
  const statusMsg  = faceState === 'good' ? '✓ Rostro detectado' : faceState === 'partial' ? '⟳ Centra el rostro' : '⬆ Coloca tu rostro en el óvalo'
  const statusBg   = faceState === 'good' ? 'rgba(34,197,94,0.85)' : faceState === 'partial' ? 'rgba(245,158,11,0.85)' : 'rgba(0,0,0,0.55)'
  const btnBg      = faceState === 'good' ? '#16a34a' : faceState === 'partial' ? '#d97706' : 'rgba(80,80,80,0.5)'

  return (
    // position:fixed covers the parent p-8 padding from layout and fills the full viewport/iframe
    <div style={{ position: 'fixed', inset: 0, background: '#000c1a', display: 'flex', flexDirection: 'column', fontFamily: 'monospace' }}>

      {/* Header */}
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${C}20`, flexShrink: 0 }}>
        <span style={{ color: C, fontSize: 11, fontWeight: 700, letterSpacing: 3 }}>◈ FACEID·{modeLabel}</span>
        <button onClick={() => post({ type: 'faceid_cancel', mode })}
          style={{ color: `${C}50`, fontSize: 11, background: 'none', border: 'none', cursor: 'pointer' }}>[ ✕ ]</button>
      </div>

      {/* ── Camera phase ── */}
      {phase === 'camera' && (
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          {cameraOn && <OvalGuide videoRef={videoRef as React.RefObject<HTMLVideoElement | null>} onStateChange={setFaceState} />}

          <div style={{ position: 'absolute', top: 12, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 30, pointerEvents: 'none' }}>
            <span style={{ background: statusBg, color: '#fff', fontSize: 11, padding: '6px 14px', borderRadius: 99, fontWeight: 600, letterSpacing: 1, border: faceState === 'good' ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(255,255,255,0.1)' }}>
              {statusMsg}
            </span>
          </div>

          <div style={{ position: 'absolute', bottom: 60, left: 12, right: 12, display: 'flex', justifyContent: 'center', zIndex: 30, pointerEvents: 'none' }}>
            <div style={{ background: 'rgba(0,0,0,0.72)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 8, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#fbbf24' }}>⚠</span>
              <span style={{ color: '#fff', fontSize: 11 }}>{TIPS[tipIdx]}</span>
            </div>
          </div>

          <button onClick={handleCapture} disabled={faceState === 'none'} style={{
            position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 30,
            background: btnBg, color: faceState === 'none' ? 'rgba(255,255,255,0.4)' : '#fff',
            border: faceState === 'good' ? '1px solid #4ade80' : 'none',
            borderRadius: 99, padding: '10px 28px', fontSize: 12, fontWeight: 700, letterSpacing: 1,
            cursor: faceState === 'none' ? 'not-allowed' : 'pointer',
            boxShadow: faceState === 'good' ? '0 0 14px rgba(34,197,94,0.45)' : 'none',
          }}>{btnLabel}</button>
        </div>
      )}

      {/* ── Liveness phase ── */}
      {phase === 'liveness' && (
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.25 }} />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }}>
            <span style={{ color: C, fontSize: 52 }}>{lvChallenge.symbol}</span>
            <p style={{ color: C, fontWeight: 700, letterSpacing: 3, fontSize: 13, textAlign: 'center' }}>{lvChallenge.label}</p>
            {lvPhase === 'briefing' && (
              <>
                <p style={{ color: `${C}60`, fontSize: 11 }}>Prepárate...</p>
                <span style={{ color: C, fontSize: 44, fontWeight: 700 }}>{lvBriefCount}</span>
              </>
            )}
            {lvPhase === 'challenge' && (
              <div style={{ width: '100%', maxWidth: 280 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: `${C}70`, marginBottom: 4 }}>
                  <span>MOVIMIENTO</span>
                  <span style={{ color: lvMotion > 60 ? C : `${C}70` }}>{lvMotion}%</span>
                </div>
                <div style={{ height: 10, background: `${C}15`, border: `1px solid ${C}30`, borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${lvMotion}%`, background: lvMotion > 80 ? C : `${C}80`, transition: 'width 0.1s', boxShadow: lvMotion > 80 ? `0 0 8px ${C}` : 'none' }} />
                </div>
                <p style={{ color: `${C}45`, fontSize: 11, textAlign: 'center', marginTop: 8 }}>
                  TIEMPO: <span style={{ color: lvCountdown <= 2 ? '#ff3366' : C }}>{lvCountdown}s</span>
                </p>
              </div>
            )}
            {lvPhase === 'pass' && <p style={{ color: C, fontWeight: 700, letterSpacing: 2, fontSize: 13 }}>✓ LIVENESS_OK — PROCESANDO...</p>}
            {lvPhase === 'fail' && (
              <>
                <p style={{ color: '#ff3366', fontWeight: 700, fontSize: 13 }}>✗ TIEMPO AGOTADO</p>
                <button
                  onClick={() => { setLvPhase('briefing'); setLvMotion(0); speak(lvChallenge.voice, { pitch: 0.48 }) }}
                  style={{ color: '#ff3366', border: '1px solid #ff336640', background: '#ff336610', padding: '8px 20px', borderRadius: 8, fontSize: 11, cursor: 'pointer' }}
                >[ REINTENTAR ]</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Processing phase ── */}
      {phase === 'processing' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          <style>{`@keyframes fw-spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{ width: 52, height: 52, borderRadius: '50%', border: `3px solid ${C}20`, borderTopColor: C, animation: 'fw-spin 1s linear infinite' }} />
          <p style={{ color: C, fontSize: 12, letterSpacing: 3 }}>PROCESANDO...</p>
        </div>
      )}

      {/* ── Result phase ── */}
      {phase === 'result' && result && (() => {
        const m     = result._mode as string
        const ok    = m === 'enroll' ? !!result.enrolled : m === 'liveness' ? !!result.passed : !!result.verified
        const fraud = m === 'auth' && !!result.fraud_detected
        const Rc    = ok && !fraud ? C : '#ff3366'
        const label = m === 'enroll'   ? (ok ? 'ENROLADO'    : 'FALLO_ENROLAMIENTO')
                    : m === 'liveness' ? (ok ? 'LIVENESS_OK' : 'LIVENESS_FALLIDO')
                    : fraud            ? 'FRAUDE_DETECTADO'
                    : ok               ? 'IDENTIDAD_VERIFICADA'
                                       : 'ACCESO_DENEGADO'
        return (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }}>
            <span style={{ fontSize: 56, filter: `drop-shadow(0 0 18px ${Rc})`, color: Rc }}>{ok && !fraud ? '✓' : '✗'}</span>
            <p style={{ color: Rc, fontWeight: 700, letterSpacing: 3, fontSize: 14 }}>{label}</p>
            {m === 'auth'    && <p style={{ color: `${Rc}80`, fontSize: 11 }}>CONFIANZA: {((result.confidence as number ?? 0) * 100).toFixed(1)}%</p>}
            {m === 'enroll' && <p style={{ color: `${Rc}80`, fontSize: 11 }}>CALIDAD: {((result.quality_score as number ?? 0) * 100).toFixed(0)}%</p>}
            <button onClick={reset} style={{ color: Rc, border: `1px solid ${Rc}40`, background: `${Rc}10`, padding: '10px 22px', borderRadius: 8, fontSize: 11, cursor: 'pointer', letterSpacing: 2, marginTop: 8 }}>
              [ NUEVA VERIFICACIÓN ]
            </button>
          </div>
        )
      })()}

      {/* ── Error phase ── */}
      {phase === 'error' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }}>
          <span style={{ color: '#ff3366', fontSize: 40 }}>✗</span>
          <p style={{ color: '#ff3366', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>ERROR</p>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, textAlign: 'center', maxWidth: 260 }}>{errorMsg}</p>
          <button onClick={() => post({ type: 'faceid_cancel', mode })}
            style={{ color: '#ff3366', border: '1px solid #ff336640', background: '#ff336610', padding: '8px 20px', borderRadius: 8, fontSize: 11, cursor: 'pointer', marginTop: 8 }}>
            [ CERRAR ]
          </button>
        </div>
      )}

      {/* Footer */}
      <div style={{ padding: '7px 14px', borderTop: `1px solid ${C}15`, textAlign: 'center', flexShrink: 0 }}>
        <span style={{ color: `${C}25`, fontSize: 9, letterSpacing: 3 }}>◈ FACEID · SECURE_BIOMETRIC</span>
      </div>
    </div>
  )
}

export default function WidgetPage() {
  return (
    <Suspense fallback={
      <div style={{ position: 'fixed', inset: 0, background: '#000c1a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace' }}>
        <span style={{ color: '#00ffaa', fontSize: 12, letterSpacing: 3 }}>◈ CARGANDO...</span>
      </div>
    }>
      <WidgetContent />
    </Suspense>
  )
}
