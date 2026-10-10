import { z } from 'zod'

import { chipColorSchema } from './projects'

const isoDateTime = z.string().datetime()
const idSchema = z.string().min(1)
const uuidSchema = z.uuid()

// ============================================================
// Пользовательские реестры: конструктор полей, статусы, записи
// ============================================================

export const registryFieldTypeSchema = z.enum(['text', 'number', 'date', 'select', 'formula'])
export type RegistryFieldType = z.infer<typeof registryFieldTypeSchema>

/** Операнд формулы: ссылка на поле того же реестра или константа. */
export const formulaOperandSchema = z.union([
  z
    .object({
      type: z.literal('field'),
      /// Ключ поля того же реестра (только number-поля).
      key: z.string().trim().min(1).max(64),
    })
    .strict(),
  z
    .object({
      type: z.literal('const'),
      value: z.number().finite(),
    })
    .strict(),
])
export type FormulaOperand = z.infer<typeof formulaOperandSchema>

/** Формула: a op b над числовыми полями реестра; значения не хранятся, считаются в DTO. */
export const registryFormulaSchema = z
  .object({
    op: z.enum(['+', '-', '*']),
    a: formulaOperandSchema,
    b: formulaOperandSchema,
  })
  .strict()
export type RegistryFormula = z.infer<typeof registryFormulaSchema>

export const registryFieldSchema = z
  .object({
    id: idSchema,
    registryId: idSchema,
    /// Стабильный ключ для values записей (латиница/цифры/подчёркивание).
    key: z.string(),
    name: z.string(),
    type: registryFieldTypeSchema,
    /// Варианты select-поля.
    options: z.array(z.string()),
    /// Определение formula-поля.
    formula: registryFormulaSchema.nullable(),
    sortOrder: z.number().int(),
  })
  .strict()
export type RegistryFieldDto = z.infer<typeof registryFieldSchema>

export const registryStatusSchema = z
  .object({
    id: idSchema,
    registryId: idSchema,
    name: z.string(),
    color: chipColorSchema,
    sortOrder: z.number().int(),
  })
  .strict()
export type RegistryStatusDto = z.infer<typeof registryStatusSchema>

/// Значения записи: {fieldKey: value}; формулы вычислены отдельно.
export const registryEntryValuesSchema = z.record(z.string().min(1).max(64), z.union([z.string().max(4000), z.number().finite()]))

export const registryEntrySchema = z
  .object({
    id: idSchema,
    registryId: idSchema,
    statusId: z.string().nullable(),
    values: registryEntryValuesSchema,
    /// Вычисленные formula-поля: {fieldKey: number}; null — операнды пусты или битые ссылки.
    computed: z.record(z.string().min(1).max(64), z.number().nullable()),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  })
  .strict()
export type RegistryEntryDto = z.infer<typeof registryEntrySchema>

export const registrySchema = z
  .object({
    id: idSchema,
    projectId: idSchema,
    name: z.string(),
    description: z.string(),
    fields: z.array(registryFieldSchema),
    statuses: z.array(registryStatusSchema),
  })
  .strict()
export type RegistryDto = z.infer<typeof registrySchema>

export const registriesResponseSchema = z.object({ items: z.array(registrySchema) }).strict()

export const registryParamsSchema = z.object({ registryId: uuidSchema }).strict()

export const createRegistryRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(2000).default(''),
  })
  .strict()
export type CreateRegistryRequest = z.infer<typeof createRegistryRequestSchema>

export const updateRegistryRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
  })
  .strict()
export type UpdateRegistryRequest = z.infer<typeof updateRegistryRequestSchema>

// ------------------------------------------------------------
// Поля
// ------------------------------------------------------------

const fieldKeyPattern = /^[a-z][a-z0-9_]*$/

const registryFieldCoreSchema = {
  key: z
    .string()
    .trim()
    .regex(fieldKeyPattern, 'Field key: латиница, цифры и _, начинается с буквы')
    .max(64),
  name: z.string().trim().min(1).max(160),
  type: registryFieldTypeSchema,
  /// Варианты для select.
  options: z.array(z.string().trim().min(1).max(160)).max(100).default([]),
  /// Обязателен для formula; ссылки на number-поля этого реестра.
  formula: registryFormulaSchema.nullish(),
  sortOrder: z.number().int().nonnegative().optional(),
}

export const createRegistryFieldRequestSchema = z
  .object(registryFieldCoreSchema)
  .strict()
  .refine((value) => (value.type === 'formula' ? value.formula != null : true), {
    message: 'type=formula requires formula',
  })
  .refine((value) => (value.type === 'formula' ? value.options.length === 0 : true), {
    message: 'options are only for select fields',
  })
export type CreateRegistryFieldRequest = z.infer<typeof createRegistryFieldRequestSchema>

export const updateRegistryFieldRequestSchema = z
  .object({
    ...registryFieldCoreSchema,
    key: registryFieldCoreSchema.key.optional(),
    name: z.string().trim().min(1).max(160).optional(),
    type: registryFieldTypeSchema.optional(),
    options: z.array(z.string().trim().min(1).max(160)).max(100).optional(),
  })
  .strict()
export type UpdateRegistryFieldRequest = z.infer<typeof updateRegistryFieldRequestSchema>

export const registryFieldParamsSchema = z.object({ fieldId: uuidSchema }).strict()

// ------------------------------------------------------------
// Статусы
// ------------------------------------------------------------

export const createRegistryStatusRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    color: chipColorSchema.default('blue'),
    sortOrder: z.number().int().nonnegative().optional(),
  })
  .strict()
export type CreateRegistryStatusRequest = z.infer<typeof createRegistryStatusRequestSchema>

export const updateRegistryStatusRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    color: chipColorSchema.optional(),
    sortOrder: z.number().int().nonnegative().optional(),
  })
  .strict()
export type UpdateRegistryStatusRequest = z.infer<typeof updateRegistryStatusRequestSchema>

export const registryStatusParamsSchema = z.object({ statusId: uuidSchema }).strict()

/** Ответ удаления статуса: записи переехали на первый оставшийся статус (или лишились его). */
export const registryStatusDeletedSchema = z
  .object({
    movedTo: z.string().nullable(),
    movedCount: z.number().int(),
  })
  .strict()
export type RegistryStatusDeleted = z.infer<typeof registryStatusDeletedSchema>

// ------------------------------------------------------------
// Записи
// ------------------------------------------------------------

export const registryEntriesQuerySchema = z
  .object({
    statusId: uuidSchema.optional(),
    /// Поиск по значениям (регистронезависимый, по всем полям).
    q: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
export type RegistryEntriesQuery = z.infer<typeof registryEntriesQuerySchema>

export const registryEntriesResponseSchema = z.object({ items: z.array(registryEntrySchema) }).strict()

export const createRegistryEntryRequestSchema = z
  .object({
    values: registryEntryValuesSchema.default({}),
    statusId: uuidSchema.nullish(),
  })
  .strict()
export type CreateRegistryEntryRequest = z.infer<typeof createRegistryEntryRequestSchema>

export const updateRegistryEntryRequestSchema = z
  .object({
    /// Полная замена значений (как ответы интервью): keys проверяются против полей реестра.
    values: registryEntryValuesSchema.optional(),
    statusId: uuidSchema.nullish(),
  })
  .strict()
export type UpdateRegistryEntryRequest = z.infer<typeof updateRegistryEntryRequestSchema>

export const registryEntryParamsSchema = z.object({ entryId: uuidSchema }).strict()

export const bulkRegistryEntriesRequestSchema = z
  .object({
    ids: z.array(uuidSchema).min(1).max(500),
    statusId: uuidSchema,
  })
  .strict()
export type BulkRegistryEntriesRequest = z.infer<typeof bulkRegistryEntriesRequestSchema>

export const bulkDeleteRegistryEntriesRequestSchema = z
  .object({
    ids: z.array(uuidSchema).min(1).max(500),
  })
  .strict()
export type BulkDeleteRegistryEntriesRequest = z.infer<typeof bulkDeleteRegistryEntriesRequestSchema>

export const bulkRegistryEntriesResponseSchema = z
  .object({
    updated: z.number().int(),
  })
  .strict()

export const bulkDeleteRegistryEntriesResponseSchema = z
  .object({
    deleted: z.number().int(),
  })
  .strict()

// ------------------------------------------------------------
// Импорт из текста
// ------------------------------------------------------------

export const registryImportRequestSchema = z
  .object({
    /// Строки данных: одна строка = одна запись; разделитель — таб или «;».
    text: z.string().min(1).max(500_000),
    /// Первая строка — заголовок, пропустить.
    hasHeader: z.boolean().default(true),
    /// colIndex (строкой, как в JSON-ключах) → поле/'status'/'skip'.
    mapping: z.record(z.string().min(1).max(3), z.string().trim().min(1).max(80)),
    /// Статус для строк без колонки статуса / с нераспознанным названием.
    statusId: uuidSchema.optional(),
  })
  .strict()
export type RegistryImportRequest = z.infer<typeof registryImportRequestSchema>

export const registryImportSkippedSchema = z
  .object({
    /// Номер строки данных (1-based, без учёта заголовка).
    line: z.number().int().positive(),
    reason: z.string(),
  })
  .strict()

export const registryImportResponseSchema = z
  .object({
    created: z.number().int(),
    skipped: z.array(registryImportSkippedSchema),
    /// Строки, где название статуса не распознано — назначен статус по умолчанию.
    defaultStatus: z.number().int(),
  })
  .strict()
export type RegistryImportResponse = z.infer<typeof registryImportResponseSchema>
