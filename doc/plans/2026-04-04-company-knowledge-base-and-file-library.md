# Company Knowledge Base And File Library

## Цель

Расширить `Paperclip` так, чтобы у каждой организации появились:

- общая база знаний
- общее файловое хранилище
- управляемый доступ для агентов к этим ресурсам по необходимости, а не всегда автоматически

## Контекст

В текущей системе уже есть полезный фундамент:

- `documents` и `document_revisions` для текстовых документов
- `assets` для хранения файлов
- issue-level документы и вложения через `issue_documents` и `issue_attachments`

Но сегодня эти возможности в основном завязаны на issue-level сценарии. В продукте отсутствует явный company-wide слой, который можно использовать как:

- общую базу знаний компании
- общее хранилище файлов компании
- источник контекста для агентов вне конкретной issue

## Ключевой продуктовый принцип

Агенты должны уметь пользоваться общей базой знаний и файлами, но не обязаны делать это всегда.

Правильный режим по умолчанию:

- доступ есть
- использование управляется политикой и контекстом задачи
- retrieval выполняется по необходимости

Не нужно автоматически подмешивать всю базу знаний в каждый run.

## Product Outcome

После внедрения компания получает:

- единое место для хранения текстовых знаний, SOP, исследований, решений и контекста
- единое место для хранения файлов компании
- возможность для агентов читать, создавать, обновлять и связывать знания и файлы с рабочими сущностями
- контролируемое использование знаний и файлов в задачах, без шумного always-on контекста

## Этап 1. Company Knowledge Base MVP

Срок: 1-2 недели

### Цель этапа

Дать компании общий слой текстовых знаний, доступный людям и агентам.

### Что делаем

1. Расширяем текущую модель документов до company-wide knowledge слоя.

Рекомендуемый подход:

- не строить новый отдельный documents engine
- переиспользовать существующие `documents`
- добавить явную область применения документа

Предпочтительная модель:

- `scopeType = company | issue | project | goal | agent`
- `scopeId = string | null`

Для company knowledge:

- `scopeType = company`
- `scopeId = companyId` или `null`, если semantics company-wide закрепляется отдельно

2. Добавляем поля knowledge-layer metadata.

Минимально:

- `title`
- `body`
- `format`
- `category`
- `tags`
- `status`
- `sourceType = manual | imported | agent_generated`
- `visibility = org_shared | restricted`
- `ownerAgentId` или `ownerUserId`
- `lastReviewedAt`

3. Добавляем company knowledge API.

Минимальный набор:

- `GET /companies/:companyId/knowledge`
- `POST /companies/:companyId/knowledge`
- `GET /knowledge/:id`
- `PATCH /knowledge/:id`
- `GET /knowledge/:id/revisions`
- `POST /knowledge/:id/revisions/:revisionId/restore`

4. Добавляем UI-экран `Knowledge`.

MVP-возможности:

- список записей
- просмотр
- создание
- редактирование
- revisions/history
- фильтрация по тегам, категории и статусу

5. Даем агентам доступ к company knowledge через API и tools.

Минимально:

- list
- search
- read
- create
- update

### Почему это первый этап

- у системы уже есть база под документы и ревизии
- это самый дешёвый способ быстро получить продуктовую ценность
- не требует сразу строить сложный RAG/semantic search

### Критерий завершения этапа

- у компании есть отдельный company-wide knowledge раздел
- knowledge entries не завязаны на issue
- агенты могут явно читать и писать knowledge entries

## Этап 2. Company File Library MVP

Срок: 1 неделя

### Цель этапа

Сделать общее файловое хранилище компании, независимое от issue.

### Что делаем

1. Переиспользуем `assets` как основу file library.

Не строим вторую storage-систему.

Добавляем продуктовый слой над `assets`:

- metadata
- company-wide listing
- tagging
- linking

2. Расширяем upload beyond images.

На MVP поддержать:

- PDF
- DOCX
- XLSX/CSV
- TXT/MD
- JSON
- изображения

3. Добавляем company file API.

Минимальный набор:

- `POST /companies/:companyId/files`
- `GET /companies/:companyId/files`
- `GET /files/:id`
- `GET /files/:id/content`
- `PATCH /files/:id/metadata`
- `DELETE /files/:id`

4. Добавляем metadata для файлов.

Минимально:

- `title`
- `description`
- `tags`
- `mimeType`
- `originalFilename`
- `byteSize`
- `sourceType`
- `visibility`
- `linkedKnowledgeId` опционально

5. Добавляем UI-экран `Files`.

MVP-возможности:

- список файлов
- загрузка
- просмотр metadata
- скачивание/открытие
- фильтрация и поиск

### Почему это второй этап

- storage уже существует
- нужен продуктовый слой, а не новая storage-платформа
- быстро даёт ценность и агентам, и людям

### Критерий завершения этапа

- у компании есть независимая библиотека файлов
- файлы можно загружать, искать, читать и связывать с другими сущностями

## Этап 3. Агентский доступ по необходимости

Срок: 1-2 недели

### Цель этапа

Сделать использование knowledge/files агентами осмысленным и управляемым.

### Что делаем

1. Вводим permissions/capabilities.

Минимально:

- `knowledge:read`
- `knowledge:write`
- `files:read`
- `files:write`

2. Вводим policy использования.

Рекомендуемый набор режимов:

- `never`
- `on_demand`
- `recommended`
- `always_for_specific_task_types`

Режим по умолчанию:

- `on_demand`

3. Добавляем retrieval API/tool surface.

Для knowledge:

- `search_company_knowledge(query, filters)`
- `read_company_knowledge(id)`
- `create_company_knowledge(...)`
- `update_company_knowledge(...)`

Для файлов:

- `search_company_files(query, filters)`
- `get_company_file(id)`
- `link_file_to_issue(id)`
- `link_knowledge_to_issue(id)`

4. Добавляем policy-driven использование в агентские workflows.

Примеры:

- CEO/CTO используют knowledge для стратегии, найма, SOP и управления
- Research/Analyst используют knowledge и files для поиска контекста
- Engineer использует knowledge/files, если задача явно требует документации, спецификаций или входных материалов
- knowledge не подмешивается в каждый heartbeat по умолчанию

### Почему это критично

Именно этот слой определит, будет система полезной или шумной.

Если сделать always-on retrieval:

- вырастет стоимость
- ухудшится качество ответов
- появится шумный контекст

### Критерий завершения этапа

- агенты умеют явно пользоваться knowledge/files
- доступ контролируется правами и policy
- retrieval не работает always-on по умолчанию

## Этап 4. Связь с рабочими сущностями

Срок: 1 неделя

### Цель этапа

Связать knowledge/files с issue, project, goal и рабочим процессом.

### Что делаем

1. Добавляем связи:

- knowledge <-> issue
- knowledge <-> project
- knowledge <-> goal
- file <-> issue
- file <-> knowledge

2. Добавляем UI-панели:

- `Related Knowledge`
- `Related Files`

3. Даем агентам возможность:

- прикладывать knowledge entry к issue
- прикладывать файл к issue
- создавать knowledge entry по итогам выполненной работы

### Почему это важно

Без этого knowledge и files быстро превратятся в отдельное хранилище, не встроенное в рабочий цикл.

### Критерий завершения этапа

- knowledge и files можно естественно связывать с задачами и проектами
- агенты используют их как часть работы, а не как отдельный архив

## Этап 5. Поиск и retrieval quality

Срок: 2-3 недели

### Цель этапа

Сделать knowledge/files реально полезными при масштабе.

### Что делаем

1. Добавляем полнотекстовый поиск.

Минимум:

- поиск по title/body/tags для knowledge
- поиск по filename/description/tags для files

2. Добавляем text extraction для файлов.

MVP-поддержка:

- PDF
- DOCX
- TXT/MD
- CSV

3. Добавляем retrieval layer.

Сначала:

- Postgres full-text search
- ranking по title/body/tags

Потом, при необходимости:

- embeddings
- semantic search
- hybrid retrieval

4. Добавляем previews и summaries.

- summary для knowledge entries
- extracted text preview для файлов

### Почему не раньше

- сначала нужен базовый продуктовый слой
- только потом имеет смысл вкладываться в более дорогой retrieval

### Критерий завершения этапа

- knowledge/files можно искать не только вручную, но и эффективно через retrieval

## Архитектурная стратегия

### Что делать

Не строить новую параллельную knowledge-систему с нуля.

Нужно переиспользовать:

- `documents`
- `document_revisions`
- `assets`

И добавить:

- scope model
- company-level API
- metadata и linking layer
- agent access layer
- retrieval layer

### Почему это правильно

- меньше дублирования
- ниже риск рассинхрона между двумя системами документов и файлов
- уже существующий фундамент получает прямое развитие

## Что не делать на MVP

1. Не делать always-on retrieval для всех агентов.
2. Не строить отдельную новую базу документов параллельно существующим `documents`.
3. Не делать сразу embeddings-first архитектуру.
4. Не пытаться решить весь knowledge management enterprise-grade в первом релизе.

## Основные риски

### 1. Шумный контекст

Если knowledge автоматически подмешивается всегда, качество и стоимость ухудшатся.

Mitigation:

- policy-driven retrieval
- дефолт `on_demand`

### 2. Захламление базы знаний

Если любой агент пишет без ограничений, knowledge быстро деградирует.

Mitigation:

- status
- owner
- review fields
- tags/categories

### 3. Дублирование файлов и знаний

Mitigation:

- использовать `sha256` для file dedupe hints
- добавлять duplicate suggestions по title и similarity для knowledge

### 4. Переусложнение MVP

Mitigation:

- сначала CRUD + search + agent access
- потом advanced retrieval

## Приоритеты внедрения

1. Company Knowledge CRUD на основе текущих `documents`
2. Company File Library на основе текущих `assets`
3. Agent tool access с режимом `on_demand`
4. Связи knowledge/files с issue/project/goal
5. Полнотекстовый поиск
6. Text extraction и retrieval improvements
7. Только потом embeddings/hybrid search

## Критерии успеха

1. Компания может хранить и редактировать общие знания вне issue.
2. Компания может хранить и использовать общие файлы вне issue.
3. Агенты могут читать и писать knowledge/files по необходимости.
4. Knowledge/files связываются с рабочими сущностями без дублирования параллельных систем.
5. Retrieval улучшает качество работы агентов, а не увеличивает шум.
