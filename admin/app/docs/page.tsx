'use client'

import { useState } from 'react'
import { Copy, Check, ChevronDown, ChevronRight } from 'lucide-react'

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy} className="absolute top-3 right-3 text-slate-500 hover:text-white transition-colors">
      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
    </button>
  )
}

function Code({ children, lang = 'bash' }: { children: string; lang?: string }) {
  return (
    <div className="relative">
      <pre className="bg-slate-900 text-emerald-300 text-xs rounded-lg p-4 overflow-x-auto leading-relaxed">
        <span className="text-slate-500 text-[10px] absolute top-2 left-3">{lang}</span>
        <code className="mt-4 block">{children.trim()}</code>
      </pre>
      <CopyBtn text={children.trim()} />
    </div>
  )
}

function Section({ title, id, children }: { title: string; id: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div id={id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-50 transition-colors"
      >
        <h2 className="text-base font-semibold text-slate-800">{title}</h2>
        {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
      </button>
      {open && <div className="px-5 pb-5 space-y-4 border-t border-slate-100">{children}</div>}
    </div>
  )
}

function Badge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: 'bg-emerald-100 text-emerald-700',
    POST: 'bg-blue-100 text-blue-700',
    PATCH: 'bg-amber-100 text-amber-700',
    DELETE: 'bg-red-100 text-red-700',
  }
  return <span className={`text-xs font-bold px-2 py-0.5 rounded font-mono ${colors[method] ?? 'bg-slate-100'}`}>{method}</span>
}

function Endpoint({ method, path, desc }: { method: string; path: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-50 last:border-0">
      <Badge method={method} />
      <div className="flex-1 min-w-0">
        <code className="text-sm text-slate-800 font-mono">{path}</code>
        <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
      </div>
    </div>
  )
}

export default function DocsPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Documentación técnica</h1>
        <p className="text-sm text-slate-500 mt-1">Guía de integración y referencia de tecnologías del sistema FaceID SaaS.</p>
      </div>

      {/* ── Índice rápido ─────────────────────────────────────────────────── */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-indigo-700 mb-2 uppercase tracking-wide">Índice</p>
        <div className="grid grid-cols-3 gap-1 text-xs text-indigo-600">
          {['#flujo', '#endpoints', '#liveness', '#antispoofing', '#widget', '#ejemplos', '#errores', '#tecnologias'].map(h => (
            <a key={h} href={h} className="hover:underline">{h}</a>
          ))}
        </div>
      </div>

      {/* ── Cómo funciona el reconocimiento ───────────────────────────────── */}
      <Section title="¿Cómo funciona el reconocimiento facial?" id="flujo">
        <div className="space-y-3 text-sm text-slate-600 pt-2">
          <p>
            El sistema usa <strong>ArcFace</strong> para convertir cualquier foto de un rostro en un vector matemático de
            512 dimensiones (<em>embedding</em>). Dos fotos de la misma persona producen vectores muy cercanos;
            fotos de personas distintas producen vectores lejanos.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 rounded-lg p-4 space-y-2">
              <p className="text-xs font-semibold text-blue-700 uppercase">1. Enrolamiento</p>
              <p className="text-xs text-slate-600">Foto → ArcFace → vector de 512 floats → guardado en PostgreSQL + pgvector</p>
              <Code lang="texto">{`Foto del usuario
     ↓
ArcFace (512-dim)
     ↓
[0.023, -0.145, 0.891, ...]
     ↓
DB: pgvector`}</Code>
            </div>
            <div className="bg-emerald-50 rounded-lg p-4 space-y-2">
              <p className="text-xs font-semibold text-emerald-700 uppercase">2. Autenticación</p>
              <p className="text-xs text-slate-600">Nueva foto → mismo proceso → comparar con el vector guardado</p>
              <Code lang="texto">{`Nueva foto
     ↓
ArcFace (512-dim)
     ↓
distancia coseno vs. DB
     ↓
< 0.55 → VERIFICADO
≥ 0.55 → DENEGADO`}</Code>
            </div>
          </div>
          <div className="bg-slate-50 rounded-lg p-4 text-xs space-y-1">
            <p className="font-semibold text-slate-700">Distancia coseno</p>
            <p><code className="bg-white px-1 rounded border">distancia = 1 − cosine_similarity(v1, v2)</code></p>
            <p>Rango: 0.0 (idénticos) → 1.0 (completamente distintos). El umbral por defecto es <strong>0.55</strong>.</p>
          </div>
        </div>
      </Section>

      {/* ── Endpoints ─────────────────────────────────────────────────────── */}
      <Section title="Referencia de endpoints" id="endpoints">
        <div className="pt-2 space-y-4">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Autenticación de requests</p>
            <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600">
              Todos los endpoints de cara requieren el header <code className="bg-white px-1 rounded border">X-API-Key: fid_xxxx</code>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Cara (Face API)</p>
            <div className="bg-slate-50 rounded-lg divide-y divide-slate-100">
              <div className="px-3"><Endpoint method="POST" path="/v1/faces/enroll/{external_id}" desc="Registra una cara. Acepta JPEG/PNG/WebP, máx 5MB." /></div>
              <div className="px-3"><Endpoint method="POST" path="/v1/faces/authenticate/{external_id}" desc="Autentica una cara contra el embedding registrado." /></div>
              <div className="px-3"><Endpoint method="GET"  path="/v1/faces/subjects" desc="Lista sujetos enrolados del tenant." /></div>
              <div className="px-3"><Endpoint method="DELETE" path="/v1/faces/subjects/{external_id}" desc="Elimina sujeto y borra su embedding (privacidad)." /></div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Liveness & Stats</p>
            <div className="bg-slate-50 rounded-lg divide-y divide-slate-100">
              <div className="px-3"><Endpoint method="GET" path="/v1/liveness/challenge" desc="Genera un nonce de un solo uso (TTL 30s) para liveness pasivo." /></div>
              <div className="px-3"><Endpoint method="GET" path="/v1/stats" desc="Estadísticas de uso del período de facturación actual." /></div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Portal del tenant</p>
            <div className="bg-slate-50 rounded-lg divide-y divide-slate-100">
              <div className="px-3"><Endpoint method="POST" path="/v1/portal/login" desc="Login con usuario/contraseña → JWT token." /></div>
              <div className="px-3"><Endpoint method="GET"  path="/v1/portal/stats" desc="Estadísticas detalladas con desglose de costos y tendencia 7 días." /></div>
              <div className="px-3"><Endpoint method="GET"  path="/v1/portal/health" desc="Health check del tenant." /></div>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Liveness ──────────────────────────────────────────────────────── */}
      <Section title="Integración de Liveness" id="liveness">
        <div className="space-y-4 pt-2 text-sm text-slate-600">
          <p>El liveness evita ataques con fotos robadas y videos. Hay dos modos:</p>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1">
            <p className="font-semibold">⚠ Cuando <code className="bg-white px-1 rounded border">liveness_required = true</code> en el tenant</p>
            <p>
              Todos los llamados a <code className="bg-white px-1 rounded border">POST /v1/faces/authenticate</code> deben incluir el header{' '}
              <code className="bg-white px-1 rounded border">X-Challenge-Id</code> (obtenido previamente de{' '}
              <code className="bg-white px-1 rounded border">GET /v1/liveness/challenge</code>).
              Sin él, el servidor responde <strong>422</strong>.
              El widget oficial y la función <code className="bg-white px-1 rounded border">authenticateFace()</code> del SDK
              gestionan esto automáticamente — solo impacta a integraciones propias.
            </p>
          </div>

          <div className="space-y-3">
            <div className="border border-blue-200 rounded-lg p-4 space-y-2">
              <p className="text-sm font-semibold text-blue-700">Modo A — Liveness pasivo (nonce)</p>
              <p className="text-xs text-slate-500">El backend verifica que la solicitud es fresca (máx 30 s, un solo uso). No requiere interacción del usuario.</p>
              <Code lang="bash">{`# Paso 1: obtener challenge (válido 30 s, un solo uso)
curl -X GET https://api.tudominio.com/v1/liveness/challenge \\
  -H "X-API-Key: fid_xxxxx"

# Respuesta:
# { "challenge_id": "uuid-aqui", "expires_in": 30 }

# Paso 2: autenticar con el challenge (dentro de esos 30 s)
curl -X POST https://api.tudominio.com/v1/faces/authenticate/user123 \\
  -H "X-API-Key: fid_xxxxx" \\
  -H "X-Challenge-Id: uuid-aqui" \\
  -F "image=@foto.jpg"`}</Code>
            </div>

            <div className="border border-violet-200 rounded-lg p-4 space-y-2">
              <p className="text-sm font-semibold text-violet-700">Modo B — Liveness activo (movimiento de cabeza)</p>
              <p className="text-xs text-slate-500">El frontend pide al usuario que gire la cabeza. Se captura la foto después de completar el desafío.</p>
              <Code lang="bash">{`# Autenticar indicando que se validó liveness activo en el cliente
curl -X POST https://api.tudominio.com/v1/faces/authenticate/user123 \\
  -H "X-API-Key: fid_xxxxx" \\
  -H "X-Active-Liveness: true" \\
  -F "image=@foto_capturada_tras_movimiento.jpg"`}</Code>
            </div>

            <div className="bg-slate-50 rounded-lg p-4 space-y-1 text-xs text-slate-600">
              <p className="font-semibold text-slate-700">Respuesta de autenticación</p>
              <Code lang="json">{`{
  "request_id": "uuid",
  "verified": true,
  "confidence": 0.823,
  "distance": 0.342,
  "is_real_face": true,
  "spoofing_score": 0.94,
  "fraud_detected": false,
  "amount_charged": 0.03
}`}</Code>
              <ul className="space-y-1 mt-2">
                <li><code className="bg-white px-1 rounded border">verified</code> — true si la cara coincide Y no hay fraude</li>
                <li><code className="bg-white px-1 rounded border">confidence</code> — 0–1, qué tan seguro es el match</li>
                <li><code className="bg-white px-1 rounded border">distance</code> — distancia coseno (0=idéntico, {'<'}0.55=verificado)</li>
                <li><code className="bg-white px-1 rounded border">fraud_detected</code> — true si MiniFASNet detectó ataque</li>
                <li><code className="bg-white px-1 rounded border">spoofing_score</code> — 0–1, score de anti-spoofing (mayor = más real)</li>
              </ul>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Anti-spoofing ─────────────────────────────────────────────────── */}
      <Section title="Anti-spoofing (fotos, impresiones y pantallas)" id="antispoofing">
        <div className="space-y-4 pt-2 text-sm text-slate-600">
          <p>
            El anti-spoofing detecta ataques de <strong>presentación</strong>: una foto impresa, una foto o video
            reproducido en la pantalla de otro dispositivo (celular, tablet, monitor), o una máscara. Corre en el
            servidor con <strong>MiniFASNet</strong> (vía DeepFace, <code className="bg-slate-100 px-1 rounded border">anti_spoofing=True</code>)
            sobre cada imagen recibida — el widget y el iframe no necesitan lógica adicional, la protección ya viene incluida.
          </p>

          <div className="bg-slate-50 rounded-lg p-4 space-y-1 text-xs text-slate-600">
            <p className="font-semibold text-slate-700">Dos interruptores, dos niveles</p>
            <ul className="space-y-1 mt-1">
              <li><strong>Global</strong> (todo el servidor) — variable <code className="bg-white px-1 rounded border">ANTI_SPOOFING_ENABLED</code> en el <code className="bg-white px-1 rounded border">.env</code>.</li>
              <li><strong>Por tenant</strong> — campo <code className="bg-white px-1 rounded border">anti_spoofing_enabled</code>, editable desde Panel admin → tenant → <em>Seguridad y Límites</em> → Editar, o vía API.</li>
            </ul>
          </div>

          <div className="border border-slate-200 rounded-lg p-4 space-y-2">
            <p className="text-sm font-semibold text-slate-700">Activar/desactivar por tenant vía API</p>
            <Code lang="bash">{`curl -X PATCH https://TU_SERVIDOR/v1/admin/tenants/{tenant_id} \\
  -H "Content-Type: application/json" \\
  -d '{"anti_spoofing_enabled": true}'`}</Code>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="border border-blue-200 rounded-lg p-4 space-y-1">
              <p className="text-sm font-semibold text-blue-700">Durante el enrolamiento</p>
              <p className="text-xs text-slate-500">
                Solo depende del switch <strong>global</strong>. Si detecta spoof, el servidor responde{' '}
                <code className="bg-slate-100 px-1 rounded border">422</code> de inmediato — &quot;La imagen no parece ser
                un rostro real&quot; — y no guarda el embedding. No hay excepción por tenant aquí.
              </p>
            </div>
            <div className="border border-violet-200 rounded-lg p-4 space-y-1">
              <p className="text-sm font-semibold text-violet-700">Durante la autenticación</p>
              <p className="text-xs text-slate-500">
                Activo solo si <strong>global Y tenant</strong> están en <code className="bg-slate-100 px-1 rounded border">true</code>.
                Si falla y <strong>no</strong> hubo liveness en esa misma solicitud, bloquea (<code className="bg-slate-100 px-1 rounded border">verified: false</code>,{' '}
                <code className="bg-slate-100 px-1 rounded border">fraud_detected: true</code>) aunque la cara coincida.
              </p>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            <p className="font-semibold">⚠ Falsos positivos cuando ya se validó liveness</p>
            <p className="mt-1">
              Si el usuario ya pasó por el challenge de liveness (pasivo con <code className="bg-white px-1 rounded border">X-Challenge-Id</code>{' '}
              o activo con <code className="bg-white px-1 rounded border">X-Active-Liveness: true</code>) en la misma autenticación,
              un resultado &quot;fake&quot; del anti-spoofing se trata como posible falso positivo (cara ladeada durante el
              movimiento, blur) y se <strong>permite</strong> — solo queda registrado en el log del servidor. Por eso el widget
              con liveness activo tiene menos rechazos falsos que la API directa sin liveness.
            </p>
          </div>

          <div className="bg-slate-50 rounded-lg p-4 text-xs text-slate-600">
            <p className="font-semibold text-slate-700 mb-1">En el iframe específicamente</p>
            <p>
              No hay parámetro de URL para anti-spoofing — se controla 100% desde el tenant (panel o API), como se explicó
              arriba. Lo único que puedes ajustar desde el widget es <strong>cómo</strong> se valida presencia real, usando{' '}
              <code className="bg-white px-1 rounded border">mode=liveness</code> o dejando que el flujo de autenticación
              normal (<code className="bg-white px-1 rounded border">mode=auth</code>) haga el reto de movimiento de cabeza
              automáticamente — reduce los falsos positivos del anti-spoofing tal como se describe arriba.
            </p>
          </div>

          <div className="bg-slate-50 rounded-lg p-4 text-xs text-slate-600">
            <p className="font-semibold text-slate-700 mb-1">Precisión del detector</p>
            <p>
              La calidad del anti-spoofing depende del detector de rostro configurado en{' '}
              <code className="bg-white px-1 rounded border">DEEPFACE_DETECTOR</code>: <code className="bg-white px-1 rounded border">opencv</code> es
              rápido pero recorta el rostro de forma imprecisa (más falsos positivos/negativos); <code className="bg-white px-1 rounded border">yunet</code> (usado
              en este servidor) y <code className="bg-white px-1 rounded border">retinaface</code> son más precisos a costa de más latencia.
            </p>
          </div>
        </div>
      </Section>

      {/* ── Widget embebible ──────────────────────────────────────────────── */}
      <Section title="Widget embebible (iframe)" id="widget">
        <div className="space-y-5 pt-2">

          <div className="text-sm text-slate-600 space-y-2">
            <p>
              El widget es una página HTML completa servida por la API que puedes incrustar en cualquier sistema
              mediante un <code className="bg-slate-100 px-1 rounded border text-slate-800">&lt;iframe&gt;</code>.
              Incluye cámara, detección automática de rostro, liveness y anti-spoofing listos para usar.
              Los resultados se reciben vía{' '}
              <code className="bg-slate-100 px-1 rounded border text-slate-800">window.postMessage</code> en la página padre.
            </p>
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-xs text-indigo-800">
              <strong>¿Cuándo usar el widget vs. la API directa?</strong><br/>
              Usa el <strong>widget</strong> cuando necesitas una UI lista sin construir la interfaz de cámara — ideal para POS,
              intranets, sistemas legacy, apps sin React.<br/>
              Usa la <strong>API directa</strong> si ya tienes tu propia cámara o necesitas personalización total del flujo.
            </div>
          </div>

          {/* URL y parámetros */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">URL del widget y parámetros</p>
            <Code lang="texto">{`https://TU_SERVIDOR/widget?api_key=fid_xxx&external_id=EMP001&mode=auth&api_url=https://TU_SERVIDOR`}</Code>
            <table className="w-full text-xs mt-3">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="pb-2 font-semibold">Parámetro</th>
                  <th className="pb-2 font-semibold">Requerido</th>
                  <th className="pb-2 font-semibold">Descripción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {[
                  ['api_key',     'Sí',  'API key del tenant (fid_...)'],
                  ['external_id', 'Sí',  'ID del usuario en tu sistema: cédula, número de empleado, username…'],
                  ['mode',        'No',  'auth (default) | enroll | liveness'],
                  ['api_url',     'No',  'URL base del servidor. Default: mismo origen del iframe.'],
                ].map(([p, r, d]) => (
                  <tr key={p} className="text-slate-600">
                    <td className="py-2 pr-3 font-mono text-indigo-600">{p}</td>
                    <td className="py-2 pr-3">{r === 'Sí'
                      ? <span className="text-red-500 font-semibold">{r}</span>
                      : <span className="text-slate-400">{r}</span>}</td>
                    <td className="py-2">{d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* postMessage events */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
              Eventos postMessage que recibe la página padre
            </p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="pb-2 font-semibold">type</th>
                  <th className="pb-2 font-semibold">mode</th>
                  <th className="pb-2 font-semibold">Campos en event.data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-slate-600">
                <tr>
                  <td className="py-2 pr-3 font-mono text-emerald-600">faceid_result</td>
                  <td className="py-2 pr-3">auth</td>
                  <td className="py-2 font-mono text-[10px] leading-loose">
                    verified <span className="text-slate-400">(bool)</span>,{' '}
                    confidence <span className="text-slate-400">(0–1)</span>,{' '}
                    fraud_detected <span className="text-slate-400">(bool)</span>,{' '}
                    subject_id, external_id
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 font-mono text-emerald-600">faceid_result</td>
                  <td className="py-2 pr-3">enroll</td>
                  <td className="py-2 font-mono text-[10px] leading-loose">
                    enrolled <span className="text-slate-400">(bool)</span>,{' '}
                    quality_score <span className="text-slate-400">(0–1)</span>,{' '}
                    subject_id, external_id
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 font-mono text-emerald-600">faceid_result</td>
                  <td className="py-2 pr-3">liveness</td>
                  <td className="py-2 font-mono text-[10px]">passed <span className="text-slate-400">(bool)</span>, is_real</td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 font-mono text-amber-600">faceid_cancel</td>
                  <td className="py-2 pr-3">any</td>
                  <td className="py-2 text-slate-400">El usuario presionó [ ✕ ] sin completar</td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 font-mono text-red-500">faceid_error</td>
                  <td className="py-2 pr-3">any</td>
                  <td className="py-2 font-mono text-[10px]">error <span className="text-slate-400">(string — ej: &quot;No se pudo acceder a la cámara&quot;)</span></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* POS login example */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
              Ejemplo completo — Login POS con reconocimiento facial (HTML vanilla)
            </p>
            <p className="text-xs text-slate-500 mb-2">
              Copia este archivo completo, reemplaza las dos constantes al inicio del script y tendrás un login funcional.
            </p>
            <Code lang="html">{`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Login POS</title>
  <style>
    body { font-family: sans-serif; display: flex; align-items: center;
           justify-content: center; height: 100vh; margin: 0; background: #f1f5f9; }
    .card { background: white; border-radius: 12px; padding: 32px;
            width: 340px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    label { font-size: 13px; color: #64748b; }
    input  { width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0;
             border-radius: 8px; margin: 6px 0 16px; font-size: 14px;
             box-sizing: border-box; }
    button { width: 100%; padding: 12px; background: #4f46e5; color: white;
             border: none; border-radius: 8px; font-size: 14px; cursor: pointer; }
    button:hover { background: #4338ca; }

    /* Overlay que contiene el iframe */
    #overlay { display: none; position: fixed; inset: 0;
               background: rgba(0,0,0,0.75); align-items: center;
               justify-content: center; z-index: 9999; }
    #overlay.visible { display: flex; }
    #faceid-frame { width: 400px; height: 540px; border: none;
                    border-radius: 14px; box-shadow: 0 8px 40px rgba(0,0,0,0.5); }
  </style>
</head>
<body>

<div class="card">
  <h2 style="margin:0 0 4px;color:#1e293b">Ingreso al sistema</h2>
  <p style="font-size:13px;color:#94a3b8;margin:0 0 24px">
    Ingresa tu número de empleado y verifica tu identidad con tu rostro.
  </p>
  <label>Número de empleado</label>
  <input id="emp-id" type="text" placeholder="Ej: EMP001" />
  <button onclick="abrirWidget()">📷 Ingresar con reconocimiento facial</button>
</div>

<!-- Overlay con el widget FaceID -->
<div id="overlay">
  <iframe id="faceid-frame"
          allow="camera"
          allowfullscreen>
  </iframe>
</div>

<script>
  // ── Configura estos dos valores ──────────────────────────────────────
  const API_KEY    = 'fid_TU_API_KEY_AQUI';  // API key del tenant
  const SERVER_URL = 'https://TU_SERVIDOR';   // sin barra final
  // ─────────────────────────────────────────────────────────────────────

  function abrirWidget() {
    const empId = document.getElementById('emp-id').value.trim();
    if (!empId) { alert('Ingresa tu número de empleado'); return; }

    const params = new URLSearchParams({
      api_key:     API_KEY,
      external_id: empId,
      mode:        'auth',       // 'auth' para autenticar, 'enroll' para registrar
      api_url:     SERVER_URL,
    });
    document.getElementById('faceid-frame').src = SERVER_URL + '/widget?' + params;
    document.getElementById('overlay').classList.add('visible');
  }

  function cerrarWidget() {
    document.getElementById('overlay').classList.remove('visible');
    document.getElementById('faceid-frame').src = '';  // libera la cámara
  }

  // Cerrar al hacer clic fuera del iframe
  document.getElementById('overlay').addEventListener('click', function(e) {
    if (e.target === this) cerrarWidget();
  });

  // ── Recibir el resultado del widget ──────────────────────────────────
  window.addEventListener('message', function(event) {
    const d = event.data;
    if (!d || !d.type) return;

    if (d.type === 'faceid_result' && d.mode === 'auth') {
      cerrarWidget();

      if (d.verified && !d.fraud_detected) {
        // ✅ ACCESO CONCEDIDO
        console.log('Empleado autenticado:', d.external_id,
                    'Confianza:', (d.confidence * 100).toFixed(1) + '%');

        // Redirigir al sistema POS (reemplaza esta línea)
        window.location.href = '/pos/dashboard?emp=' + d.external_id;

      } else if (d.fraud_detected) {
        alert('⚠️ Fraude detectado. El intento fue registrado.');
      } else {
        alert('❌ Rostro no reconocido.\\n\\nAsegúrate de estar registrado y de '
              + 'tener buena iluminación.');
      }
    }

    if (d.type === 'faceid_cancel') cerrarWidget();

    if (d.type === 'faceid_error') {
      cerrarWidget();
      alert('Error en el widget: ' + d.error);
    }
  });
</script>

</body>
</html>`}</Code>
          </div>

          {/* Enrollment example */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
              Ejemplo — Enrolar un empleado (panel de administración interno)
            </p>
            <p className="text-xs text-slate-500 mb-2">
              El enrolamiento se hace una sola vez por empleado — normalmente en un panel admin, no en el login.
              Solo cambia <code className="bg-slate-100 px-1 rounded border text-slate-800">mode=&apos;enroll&apos;</code> y escucha{' '}
              <code className="bg-slate-100 px-1 rounded border text-slate-800">faceid_result</code> con{' '}
              <code className="bg-slate-100 px-1 rounded border text-slate-800">mode === &apos;enroll&apos;</code>.
            </p>
            <Code lang="javascript">{`// Abrir widget en modo enrolamiento
function enrolarEmpleado(empId) {
  const params = new URLSearchParams({
    api_key:     API_KEY,
    external_id: empId,
    mode:        'enroll',   // ← única diferencia vs. autenticación
    api_url:     SERVER_URL,
  });
  document.getElementById('faceid-frame').src = SERVER_URL + '/widget?' + params;
  document.getElementById('overlay').classList.add('visible');
}

// Escuchar el resultado del enrolamiento
window.addEventListener('message', function(event) {
  const d = event.data;
  if (d.type === 'faceid_result' && d.mode === 'enroll') {
    cerrarWidget();
    if (d.enrolled) {
      // ✅ Empleado registrado
      console.log('Enrolado:', d.external_id,
                  'Calidad:', (d.quality_score * 100).toFixed(0) + '%',
                  'subject_id:', d.subject_id);
      alert('✅ Empleado ' + d.external_id + ' registrado exitosamente.');
    } else {
      // ❌ Falló (cara no detectada, calidad baja…)
      alert('❌ No se pudo registrar. Intenta con mejor iluminación y '
            + 'sin lentes ni objetos en el rostro.');
    }
  }
  if (d.type === 'faceid_cancel' || d.type === 'faceid_error') cerrarWidget();
});`}</Code>
          </div>

          {/* React example */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
              Ejemplo — Componente React / Next.js reutilizable
            </p>
            <Code lang="tsx">{`// components/FaceWidget.tsx
import { useEffect } from 'react'

const FACEID_URL = process.env.NEXT_PUBLIC_FACEID_URL ?? 'https://TU_SERVIDOR'
const API_KEY    = process.env.NEXT_PUBLIC_FACEID_KEY  ?? ''

export interface FaceResult {
  type:            'faceid_result' | 'faceid_cancel' | 'faceid_error'
  mode:            'auth' | 'enroll' | 'liveness'
  // auth
  verified?:       boolean
  confidence?:     number
  fraud_detected?: boolean
  // enroll
  enrolled?:       boolean
  quality_score?:  number
  // comunes
  subject_id?:     string
  external_id?:    string
  error?:          string
}

interface Props {
  externalId: string
  mode?:      'auth' | 'enroll' | 'liveness'
  onResult:   (r: FaceResult) => void
  onClose:    () => void
}

export function FaceWidget({ externalId, mode = 'auth', onResult, onClose }: Props) {
  const params = new URLSearchParams({
    api_key: API_KEY, external_id: externalId, mode, api_url: FACEID_URL,
  })
  const src = FACEID_URL + '/widget?' + params

  useEffect(() => {
    function handler(e: MessageEvent<FaceResult>) {
      if (!e.data?.type?.startsWith('faceid')) return
      onResult(e.data)
      if (e.data.type !== 'faceid_result') return  // cancel/error ya cerró
      onClose()
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [onResult, onClose])

  return (
    <div
      className="fixed inset-0 bg-black/75 flex items-center justify-center z-50"
      onClick={onClose}  // clic fuera cierra
    >
      <iframe
        src={src}
        allow="camera"
        onClick={(e) => e.stopPropagation()}
        className="w-[400px] h-[540px] rounded-2xl border-0 shadow-2xl"
      />
    </div>
  )
}

// ── Uso en una página de login ────────────────────────────────────────────────
//
// const [widgetOpen, setWidgetOpen] = useState(false)
// const [empleadoId, setEmpleadoId] = useState('')
//
// function handleResult(r: FaceResult) {
//   if (r.type === 'faceid_result' && r.mode === 'auth') {
//     if (r.verified && !r.fraud_detected) {
//       router.push('/dashboard')   // ← acceso concedido
//     } else {
//       toast.error(r.fraud_detected ? 'Fraude detectado' : 'Rostro no reconocido')
//     }
//   }
//   setWidgetOpen(false)
// }
//
// return (
//   <>
//     <button onClick={() => setWidgetOpen(true)}>Ingresar con rostro</button>
//     {widgetOpen && (
//       <FaceWidget
//         externalId={empleadoId}
//         mode="auth"
//         onResult={handleResult}
//         onClose={() => setWidgetOpen(false)}
//       />
//     )}
//   </>
// )`}</Code>
          </div>

          {/* Security notes */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-xs text-amber-800 space-y-2">
            <p className="font-semibold text-sm">Notas de seguridad importantes</p>
            <ul className="space-y-2 list-disc list-inside leading-relaxed">
              <li>
                El iframe <strong>debe</strong> tener el atributo{' '}
                <code className="bg-white px-1 rounded border">allow=&quot;camera&quot;</code> — sin él el navegador
                bloqueará el acceso a la webcam.
              </li>
              <li>
                La API key queda visible en la URL del iframe. Es aceptable: la API key solo permite
                enrolar/autenticar en tu tenant, nunca acceso de administrador ni datos de otros tenants.
              </li>
              <li>
                <strong>Valida el resultado en tu backend</strong> para acciones críticas (crear sesión, abrir puerta,
                procesar pago). Los eventos <code className="bg-white px-1 rounded border">postMessage</code> pueden
                ser falsificados por JavaScript en la misma página. El flujo seguro es:{' '}
                <em>widget → postMessage → tu backend llama{' '}
                <code className="bg-white px-1 rounded border">POST /v1/faces/authenticate</code> → crea sesión</em>.
              </li>
              <li>
                Para POS o sistemas internos sin acceso a internet, asegúrate de que el servidor FaceID sea
                accesible desde la red local donde corre el POS.
              </li>
            </ul>
          </div>

        </div>
      </Section>

      {/* ── Ejemplos de integración ───────────────────────────────────────── */}
      <Section title="Ejemplos de integración (API directa)" id="ejemplos">
        <div className="space-y-4 pt-2">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">JavaScript / TypeScript</p>
            <Code lang="typescript">{`const API = 'https://api.tudominio.com'
const KEY = 'fid_tu_api_key'

// Enrolar
async function enrollFace(userId: string, photoFile: File) {
  const form = new FormData()
  form.append('image', photoFile)
  const res = await fetch(\`\${API}/v1/faces/enroll/\${userId}\`, {
    method: 'POST',
    headers: { 'X-API-Key': KEY },
    body: form,
  })
  return res.json()
  // { enrolled: true, quality_score: 0.82, amount_charged: 0.10 }
}

// Autenticar (con soporte automático de liveness_required)
async function authenticateFace(userId: string, photoFile: File) {
  // Obtener challenge fresco — el servidor lo consume solo si liveness_required=true
  let challengeId: string | undefined
  try {
    const ch = await fetch(\`\${API}/v1/liveness/challenge\`, { headers: { 'X-API-Key': KEY } })
    if (ch.ok) challengeId = (await ch.json()).challenge_id
  } catch { /* continuar sin challenge si el servidor no está disponible */ }

  const form = new FormData()
  form.append('image', photoFile)
  const headers: Record<string, string> = { 'X-API-Key': KEY }
  if (challengeId) headers['X-Challenge-Id'] = challengeId

  const res = await fetch(\`\${API}/v1/faces/authenticate/\${userId}\`, {
    method: 'POST', headers, body: form,
  })
  const result = await res.json()
  return result.verified  // true / false
}`}</Code>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Python</p>
            <Code lang="python">{`import requests

API = "https://api.tudominio.com"
KEY = "fid_tu_api_key"

# Enrolar
def enroll(user_id: str, photo_path: str):
    with open(photo_path, "rb") as f:
        r = requests.post(
            f"{API}/v1/faces/enroll/{user_id}",
            headers={"X-API-Key": KEY},
            files={"image": f},
        )
    return r.json()

# Autenticar
def authenticate(user_id: str, photo_path: str):
    # Obtener challenge
    ch = requests.get(f"{API}/v1/liveness/challenge",
                      headers={"X-API-Key": KEY}).json()
    with open(photo_path, "rb") as f:
        r = requests.post(
            f"{API}/v1/faces/authenticate/{user_id}",
            headers={"X-API-Key": KEY, "X-Challenge-Id": ch["challenge_id"]},
            files={"image": f},
        )
    data = r.json()
    print(f"Verificado: {data['verified']} | Confianza: {data['confidence']:.1%}")
    return data`}</Code>
          </div>
        </div>
      </Section>

      {/* ── Códigos de error ──────────────────────────────────────────────── */}
      <Section title="Códigos de error" id="errores">
        <div className="pt-2">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="pb-2 font-semibold">HTTP</th>
                <th className="pb-2 font-semibold">Causa</th>
                <th className="pb-2 font-semibold">Solución</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {[
                ['401', 'X-API-Key inválida o inactiva', 'Verificar la API key del tenant'],
                ['401', 'Challenge expirado o ya utilizado', 'Obtener un nuevo challenge (GET /liveness/challenge)'],
                ['404', 'external_id no enrolado', 'Enrolar primero con POST /faces/enroll/{id}'],
                ['422', 'No se detectó cara en la imagen', 'Usar foto con buena iluminación y cara centrada'],
                ['422', 'Calidad de imagen muy baja', 'Imagen borrosa o cara muy pequeña — tomar foto de mayor resolución'],
                ['422', 'Se requiere X-Challenge-Id', 'El tenant tiene liveness_required=true'],
                ['429', 'Límite mensual alcanzado', 'Actualizar el límite del tenant en el admin'],
              ].map(([code, cause, fix]) => (
                <tr key={cause} className="text-slate-600">
                  <td className="py-2 pr-4 font-mono font-bold text-red-500">{code}</td>
                  <td className="py-2 pr-4">{cause}</td>
                  <td className="py-2 text-slate-500">{fix}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Tecnologías ───────────────────────────────────────────────────── */}
      <Section title="Tecnologías utilizadas" id="tecnologias">
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                name: 'ArcFace (InsightFace)',
                cat: 'Reconocimiento facial',
                color: 'border-blue-200 bg-blue-50',
                header: 'text-blue-700',
                desc: 'Red neuronal (ResNet-50) entrenada con pérdida Additive Angular Margin. Genera embeddings de 512 dimensiones. Precisión LFW: 99.82%. Modelo: DeepFace ArcFace.',
              },
              {
                name: 'MiniFASNet (Silent-Face)',
                cat: 'Anti-spoofing (PAD)',
                color: 'border-red-200 bg-red-50',
                header: 'text-red-700',
                desc: 'CNN liviana (1.85MB × 2 modelos) entrenada en CelebA-Spoof con +600K imágenes. Detecta ataques de pantalla, impresiones y máscaras 3D. Latencia CPU: ~1s.',
              },
              {
                name: 'pgvector + PostgreSQL',
                cat: 'Base de datos vectorial',
                color: 'border-emerald-200 bg-emerald-50',
                header: 'text-emerald-700',
                desc: 'Extensión de PostgreSQL para almacenamiento y búsqueda de vectores de alta dimensión. Índice HNSW para búsqueda aproximada de vecinos más cercanos en milisegundos.',
              },
              {
                name: 'FastAPI + SQLAlchemy',
                cat: 'Backend API',
                color: 'border-violet-200 bg-violet-50',
                header: 'text-violet-700',
                desc: 'API asíncrona Python 3.11 con soporte nativo async/await. Toda la inferencia corre en ThreadPoolExecutor para no bloquear el event loop. Auto-docs en /docs.',
              },
              {
                name: 'Redis (Liveness Nonces)',
                cat: 'Cache en memoria',
                color: 'border-amber-200 bg-amber-50',
                header: 'text-amber-700',
                desc: 'Almacena challenge nonces con TTL de 30s usando GETDEL atómico para prevenir race conditions. Cada challenge es de un solo uso.',
              },
              {
                name: 'Next.js 16 + Tailwind CSS 4',
                cat: 'Panel de administración',
                color: 'border-slate-200 bg-slate-50',
                header: 'text-slate-700',
                desc: 'App Router con React 19 Server Components. Panel admin y portal de tenant. Face Lab para pruebas en tiempo real. Liveness con movimiento de cabeza en el navegador.',
              },
            ].map(({ name, cat, color, header, desc }) => (
              <div key={name} className={`border rounded-lg p-4 space-y-1.5 ${color}`}>
                <p className={`text-xs font-semibold uppercase tracking-wide ${header}`}>{cat}</p>
                <p className="text-sm font-bold text-slate-800">{name}</p>
                <p className="text-xs text-slate-600 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          <div className="bg-slate-900 rounded-lg p-4 text-xs text-slate-300 space-y-2">
            <p className="text-white font-semibold mb-3">Stack completo</p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1">
              {[
                ['Lenguaje backend', 'Python 3.11'],
                ['Framework API', 'FastAPI 0.115'],
                ['ORM', 'SQLAlchemy 2.0 (async)'],
                ['Base de datos', 'PostgreSQL 16 + pgvector'],
                ['Cache', 'Redis 7'],
                ['Motor facial', 'DeepFace 0.0.100'],
                ['Modelo facial', 'ArcFace (512-dim cosine)'],
                ['Anti-spoofing', 'MiniFASNet v1SE + v2'],
                ['Detector facial', 'YuNet (OpenCV)'],
                ['Inferencia', 'PyTorch 2.3.1 CPU'],
                ['Frontend', 'Next.js 16 / React 19'],
                ['CSS', 'Tailwind CSS 4'],
                ['Contenedores', 'Docker Compose'],
                ['Billing', 'Stripe + contadores Redis'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <span className="text-slate-500">{k}</span>
                  <span className="text-emerald-400 font-mono">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>
    </div>
  )
}
