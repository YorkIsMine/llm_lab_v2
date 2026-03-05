# LLM Lab v2

Чат с LLM (OpenAI) на Next.js 14 (App Router) и TypeScript с тремя видами памяти: короткая (окно сообщений), рабочая и долговременная (SQLite).
Также поддерживаются **инварианты ассистента**: жёсткие правила, которые хранятся отдельно от истории чата и принудительно применяются к каждому ответу.

## Фазовая модель агента

Для каждого чата хранится состояние агента: `Planning | Execution | Validation | Done`.

- Любой новый запрос пользователя обрабатывается в `Planning`: ассистент задаёт уточняющие вопросы, даёт короткий план и просит явное подтверждение `приступай`.
- Переход в `Execution` происходит только при явной команде (`приступай`, регистронезависимо, с пунктуацией; поддерживаются и эквиваленты).
- После выполнения запускается `Validation`: формируется чек-лист соответствия, риски и шаги проверки.
- При успешной проверке состояние переходит в `Done`.
- Если пользователь пишет `готово` в фазе `Execution` или `Validation`, чат принудительно переводится в `Done`.
- После `Done` любой новый пользовательский запрос снова стартует цикл с `Planning`.

Состояние хранится в `ChatSession.agentPhase` (SQLite), поэтому сохраняется между перезагрузками страницы.

## Требования

- Node.js 18+
- Аккаунт OpenAI и API key

## Установка и запуск

1. Клонировать/перейти в каталог проекта.

2. Установить зависимости:
   ```bash
   npm install
   ```

3. Настроить окружение:
   ```bash
   cp .env.example .env
   ```
   В `.env` задать:
   - `OPENAI_API_KEY=sk-...` (обязательно)
   - `DATABASE_URL="file:./dev.db"` (по умолчанию SQLite в `prisma/dev.db`)

4. Создать схему БД (SQLite):
   ```bash
   npx prisma generate
   npx prisma db push
   ```
   Либо миграции: `npx prisma migrate dev --name init`

5. Запуск в режиме разработки:
   ```bash
   npm run dev
   ```
   Открыть [http://localhost:3000](http://localhost:3000).

## Режим работы (без авторизации)

Приложение работает в **single-user** режиме: все чаты доступны без входа. В продакшене нужно добавить аутентификацию и привязку сессий к пользователю.

## API

- `POST /api/sessions` — создать чат (в ответе есть `phase`)
- `GET /api/sessions` — список чатов (для каждого есть `phase`)
- `DELETE /api/sessions/:id` — удалить чат (каскадно удаляются сообщения и рабочая память; долговременная сохраняется)
- `GET /api/sessions/:id/messages` — история сообщений + текущая фаза (`{ phase, messages }`)
- `POST /api/sessions/:id/messages` — отправить сообщение (body: `{ "content": "..." }`), в ответе возвращается `phase`
- `GET /api/sessions/:id/memory` — short / working / long-term память для чата
- `GET /api/memory/long-term?scope=user|global` — долговременная память
- `POST /api/memory/long-term` — создать/обновить запись (body: `{ "scope", "id", "contentText", "contentJson", "tags" }`)
- `GET /api/invariants?status=active|archived|all` — список инвариантов + флаг применения (`enabled`)
- `POST /api/invariants` — создать инвариант
- `PATCH /api/invariants` — включить/выключить применение (`{ "enabled": true|false }`)
- `PATCH /api/invariants/:id` — редактировать инвариант
- `DELETE /api/invariants/:id` — архивировать инвариант

## Расширение фаз

Ключевая логика автомата находится в `src/services/agentPhaseMachine.ts`.

- Добавление/изменение переходов: обновить функции `resolvePhaseForUserMessage`, `transitionAfterExecution`, `transitionAfterValidation`.
- Правила поведения модели по фазам: `src/services/contextService.ts` (`CURRENT_PHASE=...` + правила).
- Валидация результата: `createValidationCompletion` в `src/lib/llmClient.ts`.
- Отображение текущей фазы в интерфейсе: `src/app/chat/[id]/page.tsx`.

## Memory Inspector

В интерфейсе чата есть ссылка «Memory Inspector» — страница с тремя вкладками:
- **Short** — последние N сообщений (окно контекста)
- **Working** — рабочая память текущего чата (текст + JSON)
- **Long-term** — элементы долговременной памяти (user + global)

## Инварианты ассистента

Инварианты — это non-negotiable правила (архитектура, ограничения стека, бизнес-ограничения), которые ассистент не имеет права нарушать.

- Хранятся отдельно от чата в SQLite (`Invariant`, `AssistantSetting`).
- Подмешиваются в LLM-контекст отдельным system-блоком `INVARIANTS (non-negotiable)` вместе с нормализованными `Constraint`.
- Не попадают в историю сообщений пользователя/ассистента.
- Перед выдачей ответа работает двухконтурный enforcement: `precheck` по `Proposal` пользователя и `post-check` по `Proposal` финального ответа.
- Enforcement больше не опирается на пересечение слов; он нормализует текст инвариантов в `Constraint` и применяет их только если они релевантны текущему proposal.
- При недостатке данных guard не делает ложный `REFUSE`: запрет срабатывает только когда proposal действительно нарушает constraint.
- Каждый ответ содержит явный итог: `Invariant check: OK` или `Invariant check: REFUSED (violates: <ids>)`.

### Управление инвариантами

1. Через UI: кнопка **«Инварианты»** в левой панели (CRUD + ON/OFF + архив).
2. Через чат-команды (обрабатываются сервером и не отправляются в LLM как обычный user-контент):
   - `/invariants`
   - `/invariants add <правило>`
   - `/invariants add <title> | <правило>`
   - `/invariants edit <id> <новое правило>`
   - `/invariants remove <id>`
   - `/invariants on|off`

## Стек

- Next.js 14 (App Router), TypeScript
- Prisma + SQLite
- OpenAI Chat Completions API (ключ только на сервере, в env)
- Tailwind CSS

Подробный план и архитектура — в [PLAN.md](./PLAN.md).
