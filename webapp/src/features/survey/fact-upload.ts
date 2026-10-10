import type { FactUploadTicket } from '@ordiks-survey/contracts'

import type { AuthenticatedTransport } from '@/platform/api'

// ============================================================
// Загрузка файла факта: клиентское сжатие фото (canvas, ~450 КБ,
// как compressImage прототипа — только таргет больше) и трёхшаговый
// upload-flow (upload-request → PUT по подписанному URL → confirm),
// как у аватаров.
// ============================================================

/** Целевой размер сжатого фото (базовые знаки base64 ≈ ×0.75 от длины). */
export const FACT_PHOTO_TARGET_BYTES = 450 * 1024
const PHOTO_MAX_DIMENSION = 1600

export type PhotoCompressionResult = {
  blob: Blob
  fileName: string
}

/**
 * Сжимает фото через canvas: длинная сторона до 1600px, JPEG с пошаговым качеством,
 * пока не влезем в ~450 КБ. Не-изображения и ошибки декодирования возвращаются как есть —
 * файл пойдёт в хранилище напрямую (сервер ограничит размер).
 */
export async function compressFactPhoto(file: File): Promise<PhotoCompressionResult> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') {
    return { blob: file, fileName: file.name }
  }
  const bitmap = await loadImage(file)
  if (!bitmap) return { blob: file, fileName: file.name }

  const scale = Math.min(1, PHOTO_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height)
  if (typeof (bitmap as { close?: () => void }).close === 'function') {
    ;(bitmap as { close?: () => void }).close!()
  }

  let quality = 0.85
  let blob = await canvasToJpeg(canvas, quality)
  // База длины строки ≈ размер байтов / 0.75 — тот же допуск, что в прототипе.
  while (blob.size > FACT_PHOTO_TARGET_BYTES && quality > 0.45) {
    quality -= 0.1
    blob = await canvasToJpeg(canvas, quality)
  }
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo'
  return { blob, fileName: `${baseName}.jpg` }
}

async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      // PSD/TIFF и битые файлы декодируются через <img>, а он тоже может отказать.
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

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))),
      'image/jpeg',
      quality,
    )
  })
}

/**
 * Льёт байты прямо в хранилище по подписанному PUT. Заголовки повторяем дословно
 * (они в подписи), куки не отправляем. 412 = объект уже лежит (write-once ретрай).
 */
export async function putFactObject(ticket: FactUploadTicket, blob: Blob): Promise<void> {
  if (blob.size !== ticket.contentLength) {
    throw new FactUploadError('size-changed', 'Размер файла изменился после подписания ссылки')
  }
  const response = await fetch(ticket.url, {
    method: ticket.method,
    headers: ticket.headers,
    credentials: 'omit',
    body: blob,
  })
  if (!response.ok && response.status !== 412) {
    throw new FactUploadError('transfer-failed', `Хранилище ответило ${response.status}`)
  }
}

export type FactUploadFlowDeps = {
  requestTicket: (input: { contentType: string; byteSize: number }) => Promise<FactUploadTicket>
  putObject: (ticket: FactUploadTicket, blob: Blob) => Promise<void>
  confirm: (input: { token: string; fileName: string }) => Promise<unknown>
}

export type FactUploadFlowFile = {
  blob: Blob
  fileName: string
  contentType: string
}

/**
 * Оркестрация загрузки файла факта: сжатие (для фото выполняет вызывающий код),
 * подписанный PUT и подтверждение. Выделена с инъекцией зависимостей — так поток
 * проверяется тестом без браузера и сети.
 */
export async function runFactUploadFlow(
  deps: FactUploadFlowDeps,
  file: FactUploadFlowFile,
): Promise<void> {
  const ticket = await deps.requestTicket({
    contentType: file.contentType,
    byteSize: file.blob.size,
  })
  await deps.putObject(ticket, file.blob)
  await deps.confirm({ token: ticket.token, fileName: file.fileName })
}

/** Полный путь загрузки файла факта: сжатие фото → flow → подтверждение. */
export async function uploadFactFile(
  transport: AuthenticatedTransport,
  factId: string,
  file: File,
): Promise<void> {
  const factIdEncoded = encodeURIComponent(factId)
  const { blob, fileName } = await compressFactPhoto(file)
  const contentType = blob.type || 'application/octet-stream'
  await runFactUploadFlow(
    {
      requestTicket: async (input) => {
        const response = await transport.request(
          `/api/facts/${factIdEncoded}/file/upload-request`,
          factUploadTicketResponseSchema,
          { method: 'POST', body: input },
        )
        return response.upload
      },
      putObject: putFactObject,
      confirm: async (input) => {
        await transport.request(`/api/facts/${factIdEncoded}/file/confirm`, z.void(), {
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
import { factUploadTicketSchema } from '@ordiks-survey/contracts'

const factUploadTicketResponseSchema = z
  .object({ upload: factUploadTicketSchema })
  .strict()

export class FactUploadError extends Error {
  readonly reason: 'size-changed' | 'transfer-failed'
  constructor(reason: 'size-changed' | 'transfer-failed', message: string) {
    super(message)
    this.reason = reason
  }
}
