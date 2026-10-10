import type { ProcessSchemeUploadTicket } from '@ordiks-survey/contracts'

import { putFactObject, type PhotoCompressionResult } from './fact-upload'
import type { AuthenticatedTransport } from '@/platform/api'

// ============================================================
// Загрузка схемы процесса (StormBPMN): клиентское сжатие растра
// и трёхшаговый upload-flow (upload-request → PUT → confirm),
// как у файлов фактов. SVG не сжимаем — вектор уже компактен.
// ============================================================

/// Лимит контракта — 2 МБ; сжимаемся до 1.5 МБ с запасом на подпись.
export const PROCESS_SCHEME_TARGET_BYTES = 1536 * 1024
const SCHEME_MAX_DIMENSION = 2400

/**
 * Сжимает растровую схему через canvas: длинная сторона до 2400px; PNG остаётся PNG
 * (прозрачность фона), JPEG/WebP перекодируются в JPEG с пошаговым качеством.
 * SVG и не-изображения возвращаются как есть.
 */
export async function compressProcessScheme(file: File): Promise<PhotoCompressionResult> {
  if (file.type === 'image/svg+xml') return { blob: file, fileName: file.name }
  if (!file.type.startsWith('image/') || file.type === 'image/gif') {
    return { blob: file, fileName: file.name }
  }
  const bitmap = await loadBitmap(file)
  if (!bitmap) return { blob: file, fileName: file.name }

  const scale = Math.min(1, SCHEME_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height)
  if (typeof (bitmap as { close?: () => void }).close === 'function') {
    ;(bitmap as { close?: () => void }).close!()
  }

  if (file.type === 'image/png') {
    const png = await canvasToBlob(canvas, 'image/png')
    if (png) return { blob: png, fileName: file.name }
  }
  let quality = 0.9
  let blob = await canvasToBlob(canvas, 'image/jpeg', quality)
  while (blob && blob.size > PROCESS_SCHEME_TARGET_BYTES && quality > 0.45) {
    quality -= 0.1
    blob = await canvasToBlob(canvas, 'image/jpeg', quality)
  }
  if (!blob) return { blob: file, fileName: file.name }
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'scheme'
  return { blob, fileName: file.type === 'image/png' ? file.name : `${baseName}.jpg` }
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      // Битый растр пробуем через <img>.
    }
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    image.src = url
  })
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: 'image/png' | 'image/jpeg',
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality)
  })
}

export type SchemeUploadFlowDeps = {
  requestTicket: (input: { contentType: string; byteSize: number }) => Promise<ProcessSchemeUploadTicket>
  putObject: (ticket: ProcessSchemeUploadTicket, blob: Blob) => Promise<void>
  confirm: (input: { token: string; fileName: string }) => Promise<unknown>
}

export type SchemeUploadFlowFile = {
  blob: Blob
  fileName: string
  contentType: string
}

/**
 * Оркестрация загрузки схемы: подписанный тикет → PUT в хранилище → подтверждение.
 * Зависимости инъектируются — поток проверяется тестом без браузера и сети
 * (структура тикета совпадает с файлами фактов, поэтому PUT переиспользуем).
 */
export async function runSchemeUploadFlow(
  deps: SchemeUploadFlowDeps,
  file: SchemeUploadFlowFile,
): Promise<void> {
  const ticket = await deps.requestTicket({
    contentType: file.contentType,
    byteSize: file.blob.size,
  })
  await deps.putObject(ticket, file.blob)
  await deps.confirm({ token: ticket.token, fileName: file.fileName })
}

/** Полный путь загрузки схемы процесса: сжатие растра → flow → подтверждение. */
export async function uploadProcessScheme(
  transport: AuthenticatedTransport,
  processId: string,
  side: 'asis' | 'tobe',
  file: File,
): Promise<void> {
  const processIdEncoded = encodeURIComponent(processId)
  const { blob, fileName } = await compressProcessScheme(file)
  const contentType = blob.type || file.type
  await runSchemeUploadFlow(
    {
      requestTicket: async (input) => {
        const response = await transport.request(
          `/api/processes/${processIdEncoded}/schemes/${side}/upload-request`,
          schemeUploadTicketResponseSchema,
          { method: 'POST', body: createProcessSchemeUploadRequestSchema.parse(input) },
        )
        return response.upload
      },
      putObject: putFactObject,
      confirm: async (input) => {
        await transport.request(`/api/processes/${processIdEncoded}/schemes/${side}/confirm`, z.void(), {
          method: 'POST',
          body: input,
        })
      },
    },
    { blob, fileName, contentType },
  )
}

// Импорты внизу файла: zod и схемы нужны только реальному транспорту, а тесты
// подменяют зависимости целиком — так файл остаётся пригодным для bun:test.
import { z } from 'zod'
import { createProcessSchemeUploadRequestSchema, processSchemeUploadTicketSchema } from '@ordiks-survey/contracts'

const schemeUploadTicketResponseSchema = z
  .object({ upload: processSchemeUploadTicketSchema })
  .strict()
