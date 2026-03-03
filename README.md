# LLM Lab v2

Чат с LLM (OpenAI) на Next.js 14 (App Router) и TypeScript с тремя видами памяти: короткая (окно сообщений), рабочая и долговременная (SQLite).

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

- `POST /api/sessions` — создать чат
- `GET /api/sessions` — список чатов
- `DELETE /api/sessions/:id` — удалить чат (каскадно удаляются сообщения и рабочая память; долговременная сохраняется)
- `GET /api/sessions/:id/messages` — история сообщений
- `POST /api/sessions/:id/messages` — отправить сообщение (body: `{ "content": "..." }`)
- `GET /api/sessions/:id/memory` — short / working / long-term память для чата
- `GET /api/memory/long-term?scope=user|global` — долговременная память
- `POST /api/memory/long-term` — создать/обновить запись (body: `{ "scope", "id", "contentText", "contentJson", "tags" }`)

## Memory Inspector

В интерфейсе чата есть ссылка «Memory Inspector» — страница с тремя вкладками:
- **Short** — последние N сообщений (окно контекста)
- **Working** — рабочая память текущего чата (текст + JSON)
- **Long-term** — элементы долговременной памяти (user + global)

## Стек

- Next.js 14 (App Router), TypeScript
- Prisma + SQLite
- OpenAI Chat Completions API (ключ только на сервере, в env)
- Tailwind CSS

Подробный план и архитектура — в [PLAN.md](./PLAN.md).
