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
        <div className="grid grid-cols-2 gap-1 text-xs text-indigo-600">
          {['#flujo', '#endpoints', '#liveness', '#errores', '#ejemplos', '#tecnologias'].map(h => (
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

      {/* ── Ejemplos de integración ───────────────────────────────────────── */}
      <Section title="Ejemplos de integración" id="ejemplos">
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
