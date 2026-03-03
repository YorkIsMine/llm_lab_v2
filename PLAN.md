# План реализации LLM Lab v2

## Предположения

- **Single-user mode**: авторизации нет; все чаты доступны любому пользователю. В продакшене нужно добавить привязку сессий к `userId` и проверку владельца при DELETE/GET.
- **Embeddings**: реализован интерфейс релевантности и keyword matching; поле `LongTermMemory.embedding` и поиск по косинусной близости — TODO (заглушка/интерфейс готовы).

## Структура проекта

```
llm_lab_v2/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── sessions/           # POST, GET
│   │   │   │   └── [id]/          # DELETE
│   │   │   │       ├── messages/  # GET, POST
│   │   │   │       └── memory/    # GET
│   │   │   └── memory/
│   │   │       └── long-term/     # GET, POST
│   │   ├── chat/[id]/
│   │   │   ├── page.tsx           # Чат
│   │   │   └── memory/page.tsx    # Memory Inspector
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx               # Список чатов
│   ├── lib/
│   │   ├── db.ts
│   │   ├── llmClient.ts
│   │   └── relevance.ts
│   ├── services/
│   │   ├── chatService.ts
│   │   ├── contextService.ts
│   │   └── memoryService.ts
│   └── types/
│       └── memory.ts
├── .env.example
├── package.json
├── PLAN.md
└── README.md
```

## Слои

- **UI** (app/page, app/chat, app/chat/[id]/memory) → fetch к API.
- **API routes** (app/api/*) → валидация, вызов сервисов, ответ JSON.
- **Сервисы** (chatService, contextService, memoryService) → бизнес-логика, вызов LLM и DB.
- **DB** (Prisma + SQLite) — единственная точка доступа через `prisma`.

## Сбор контекста на запрос к LLM

1. **System prompt** — правила ассистента + блоки [Long-term memory] и [Working memory], если есть.
2. **Долговременная память** — релевантные элементы по последнему user-сообщению: сейчас keyword matching (токены из сообщения vs. contentText/tags); интерфейс `LongTermRelevanceProvider` допускает замену на embedding + cosine similarity (TODO: хранение вектора в `LongTermMemory.embedding`).
3. **Рабочая память** — одна запись на чат (contentText + contentJson).
4. **Короткая память** — последние N сообщений из истории (ephemeral, не в SQLite).

Порядок в запросе: `[system] [long-term] [working] [short messages]`.

## Обновление памяти после ответа ассистента

Один вызов LLM (memory summarizer) с JSON-ответом:
- **working** — обновлённый JSON (цель, план, статус, решения, ограничения).
- **longTerm** — массив новых устойчивых фактов (предпочтения, правила).

Сохранение: рабочая память — upsert по `sessionId`; долговременная — добавление новых записей с `scope: "user"` (key генерируется).

## Пример system prompt и memory update prompt

- **System prompt** — см. `src/services/contextService.ts`: описание роли + инструкция использовать working/long-term memory.
- **Memory update prompt** — см. `src/lib/llmClient.ts` (`createMemoryUpdateCompletion`): описание формата JSON (working, longTerm) и текущий working JSON.

## Индексы и каскады (Prisma)

- **ChatSession**: индекс по `updatedAt` для сортировки списка.
- **Message**: индекс по `sessionId`, составной `(sessionId, createdAt)` для выборки истории.
- **WorkingMemory**: уникальный `sessionId`, индекс по `sessionId`; при удалении чата — `onDelete: Cascade`.
- **LongTermMemory**: составной unique `(scope, key)`, индексы по `scope` и `tags`; связи с чатом нет — при удалении чата долговременная память не удаляется.

## Запуск

- `cp .env.example .env`, задать `OPENAI_API_KEY` и при необходимости `DATABASE_URL`.
- `npm install && npx prisma generate && npx prisma db push`
- `npm run dev`

Открыть `/`, создать чат, писать сообщения; Memory Inspector — по ссылке из шапки чата.
