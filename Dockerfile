FROM oven/bun:1.3 AS build

WORKDIR /app

# Копируем репозиторий целиком: монорепо, фильтр ниже возьмёт только нужные воркспейсы.
COPY . .

RUN bun install --frozen-lockfile --filter @ordiks-survey/backend

WORKDIR /app/backend

RUN DATABASE_URL="postgresql://superuser:superpassword@localhost:5432/ordiks_survey?schema=public" bun run prisma:generate

FROM oven/bun:1.3 AS production-dependencies

WORKDIR /app

COPY . .

RUN bun install --frozen-lockfile --production --filter @ordiks-survey/backend

FROM oven/bun:1.3 AS runtime

WORKDIR /app

COPY --from=build /app/package.json /app/bun.lock /app/bunfig.toml ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/packages/contracts ./packages/contracts
COPY --from=build /app/backend ./backend

WORKDIR /app/backend

ENV NODE_ENV=production

USER bun

# Миграции с повторами: Neon (free) просыпается дольше advisory-lock таймаута Prisma.
# Демо-сид выполняется один раз и только при DEMO_SEED_ALLOWED=1.
CMD ["sh", "-c", "for i in 1 2 3 4 5; do bun run prisma:deploy && break; echo \"migrate retry $i\"; sleep 12; done && (if [ \"$DEMO_SEED_ALLOWED\" = \"1\" ]; then bun run demo:seed; fi) && exec bun src/index.ts"]
