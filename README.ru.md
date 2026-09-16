# Contra MCP Starter Toolkit ⚡ (Русская версия)

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?logo=node.js)](https://nodejs.org)
[![Model Context Protocol](https://img.shields.io/badge/MCP-Compatible-blue)](https://modelcontextprotocol.io/)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](https://github.com/alexandernevsky/contra-mcp-starter)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Contra](https://img.shields.io/badge/Platform-Contra.com-black?logo=contra)](https://contra.com)

> **Стартер-кит с нулевыми внешними зависимостями и SDK автоматизации для управления вашим профилем на [Contra](https://contra.com), флагманскими услугами и кейс-стади с помощью Model Context Protocol (MCP) и AI-агентов (Google Antigravity, Cursor, Windsurf, Claude Code).**

[English](README.md) • [Русская версия](README.ru.md)

---

## Обзор

[Contra](https://contra.com) — ведущая платформа без комиссий для независимых продакт-дизайнеров, инженеров и создателей цифровых продуктов. Contra предоставляет нативный **удаленный эндпоинт MCP** (`https://contra.com/mcp`), содержащий 119 инструментов для программного управления профилем, кейсами, услугами, инвойсами и откликами на проекты.

Однако подключение AI-агентов к Contra традиционно связано с рутиной: настройка протокола OAuth 2.0 PKCE, истекающие через 1 час токены и риск случайной перезаписи данных профиля агентом.

Этот репозиторий предоставляет открытое, проверенное на практике решение:
- **Интерактивная авторизация OAuth 2.0 PKCE в 1 клик**: мгновенное подключение любого аккаунта через локальный сервер.
- **Ноль внешних зависимостей**: работает на чистом нативном Node.js 18+ (`fetch`, `crypto`, `http`).
- **Автоматический рефреш токенов**: перехватывает HTTP `401 Unauthorized` и прозрачно обновляет сессию через `refresh_token`.
- **Двухфазный протокол безопасности (`prepare → confirm`)**: агент никогда молча не перезапишет ваш профиль без показа точного диффа и явного подтверждения.
- **Шаблоны Content-as-Code**: готовые Markdown-шаблоны для позиционирования профиля, 3 флагманских услуг (с помесячной тарификацией и FAQ) и структурированных кейсов.

---

## Быстрый старт (2 минуты)

### 1. Клонируйте репозиторий
```bash
git clone https://github.com/alexandernevsky/contra-mcp-starter.git
cd contra-mcp-starter
```

### 2. Авторизуйтесь на Contra
Запустите скрипт авторизации:
```bash
npm run auth
```
Скрипт автоматически:
1. Зарегистрирует динамический локальный OAuth-клиент на сервере Contra.
2. Откроет страницу авторизации в вашем браузере по умолчанию.
3. Перехватит код авторизации на `localhost:4567`.
4. Обменяет код на `access_token` и `refresh_token`.
5. Сохранит токен в локальный файл `contra_token.json` (жестко изолирован в `.gitignore`).

### 3. Проверьте подключение
```bash
npm run whoami
```
Вывод:
```text
👤 Contra Authenticated Profile

Username: @your_username
Name:     Your Name
Type:     CONTRACTOR
Profile:  https://contra.com/your_username
```

### 4. Просмотрите свои услуги и кейсы
```bash
npm run services
npm run projects
```

---

## Подключение к AI-ассистентам

### 1. Google Antigravity
Скрипт авторизации автоматически находит и обновляет глобальный конфиг `~/.gemini/config/mcp_config.json`:
```json
{
  "mcpServers": {
    "contra": {
      "serverUrl": "https://contra.com/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_ACCESS_TOKEN>"
      }
    }
  }
}
```

### 2. Cursor IDE
Добавьте удаленный сервер в `.cursor/mcp.json` в корне вашего проекта:
```json
{
  "mcpServers": {
    "contra": {
      "url": "https://contra.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_ACCESS_TOKEN"
      }
    }
  }
}
```

---

## Безопасный паттерн: Prepare & Confirm

Contra MCP использует строгий двухфазный коммит для всех изменений:

```javascript
import { callContraTool } from "./scripts/contra-client.mjs";

// Шаг 1: Подготовка черновика (dry-run, никаких изменений в базе данных)
const draft = await callContraTool("update_productized_service_prepare", {
  slug: "your-service-slug",
  price: {
    type: "RATE",
    amount: 6000,
    interval: "MONTH"
  }
});

// Шаг 2: Человеческий аудит диффа
console.log("Изменения:", draft.preview.changes);

// Шаг 3: Финальное подтверждение (применяет изменения к профилю)
await callContraTool("update_productized_service_confirm", {
  draftId: draft.draftId,
  confirm: true
});
```

> [!IMPORTANT]
> **Внимание к полям-массивам:**  
> Поля `deliverables`, `faqs`, `tags`, `roles` и `tools` работают по принципу **полной замены** (full replacement). Передача нового списка полностью удаляет все элементы, не включенные в запрос. Чтобы сохранить существующие элементы, опустите поле из запроса либо передайте полный объединенный список.

---

## Технические особенности платформы Contra

1. **NanoID в слагах**: Ссылки на кейсы и услуги всегда начинаются с 8-значного уникального ключа базы данных (`cO2eXAUv-...`), поскольку ссылки на Contra глобальны (`contra.com/p/...`). Текстовая часть после дефиса генерируется автоматически из заголовка (`title`).
2. **Обложки (изображения vs видео)**:
   - Поле `coverImageUrl` в MCP принимает публичные ссылки на картинки (PNG, JPG, WebP) и автоматически переносит их в Cloudinary CDN.
   - Видео-обложки (MP4) на текущий момент загружаются через веб-интерфейс Contra.
   - Внутри тела кейса поддерживаются видео-вставки через standalone-ссылки YouTube и Vimeo.
3. **Кейсы (Projects) vs Посты ленты (Work Posts)**:
   - `projects` — полноценные кейсы портфолио с полной поддержкой CRUD через MCP.
   - `workPosts` — записи ленты сообщества, редактируемые только через веб-интерфейс.

---

## Лицензия

MIT License © 2026 [Alexander Nevsky](https://contra.com/alexander_nevsky). Создано для независимых фаундеров и разработчиков по всему миру.
