'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import FaceLab from '@/components/face-lab'

function LabContent() {
  const params = useSearchParams()
  const apiKey = params.get('apiKey') ?? ''
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Face Lab</h1>
        <p className="text-sm text-slate-500 mt-1">Prueba enrolamiento y autenticación directamente desde el panel.</p>
      </div>
      <FaceLab defaultApiKey={apiKey} />
    </div>
  )
}

export default function LabPage() {
  return (
    <Suspense fallback={<div className="p-12 text-sm text-slate-400">Cargando...</div>}>
      <LabContent />
    </Suspense>
  )
}
