# План: исправление удаления компаний

## Цель

Сделать удаление компании безопасным и полным, чтобы архивные компании можно было удалять штатно через `DELETE /api/companies/:companyId` без ручного SQL и без зависаний на foreign key constraints.

## Контекст

Во время попытки удалить архивные компании выяснилось, что `server/src/services/companies.ts` в `companyService.remove(...)` устарел относительно текущей схемы БД.

Сервис удаляет только часть company-scoped данных и не покрывает несколько новых дочерних таблиц. Из-за этого удаление падает на FK-зависимостях и транзакция откатывается.

Подтвержденные ошибки во время удаления:

- `activity_log.run_id -> heartbeat_runs.id`
- `cost_events.heartbeat_run_id -> heartbeat_runs.id`
- `issue_read_states.issue_id -> issues.id`

Проверка схемы также показала, что текущее удаление не покрывает ряд company-scoped сущностей.

## Проблема

Текущий `companyService.remove(...)` не синхронизирован с реальной схемой БД и не удаляет все дочерние записи в правильном порядке.

Это создаёт три класса проблем:

1. Архивные компании нельзя удалить штатно.
2. Ручное удаление через SQL становится рискованным и хрупким.
3. Managed filesystem directories могут остаться сиротами, если БД и файловая очистка происходят несогласованно.

## Затронутые места

- `server/src/services/companies.ts`
- `server/src/routes/companies.ts`
- `packages/db/src/schema/*.ts`

## Непокрытые или потенциально непокрытые зависимости

По результатам проверки схемы нужно учитывать как минимум следующие таблицы:

- `agent_config_revisions`
- `budget_incidents`
- `budget_policies`
- `company_skills`
- `documents`
- `document_revisions`
- `execution_workspaces`
- `feedback_exports`
- `feedback_votes`
- `issue_approvals`
- `issue_attachments`
- `issue_documents`
- `issue_inbox_archives`
- `issue_labels`
- `issue_read_states`
- `labels`
- `plugin_company_settings`
- `project_goals`
- `project_workspaces`
- `routine_runs`
- `routine_triggers`
- `routines`
- `workspace_operations`
- `workspace_runtime_services`

Также нужно учитывать cross-table зависимости через `heartbeat_runs`, `issues`, `projects` и `agents`.

## План исправления

### P0. Починить штатное удаление компании

Обновить `companyService.remove(...)`, чтобы он:

- покрывал все company-scoped таблицы
- удалял записи в корректном dependency order
- отдельно учитывал таблицы, которые ссылаются на `heartbeat_runs`
- отдельно учитывал таблицы, которые ссылаются на `issues`
- отдельно учитывал таблицы, которые ссылаются на `projects`

Нужен явный порядок удаления, а не надежда на частичный `onDelete: cascade`.

### P0. Добавить regression test на удаление компании

Добавить серверный тест, который создаёт компанию с минимально реалистичным набором связанных сущностей:

- agent
- project
- project workspace
- issue
- heartbeat run
- activity log
- cost event
- issue read state
- document revision
- work product

После вызова `companyService.remove(...)` тест должен подтверждать:

- компания удалена
- дочерние записи удалены
- транзакция не падает по FK

### P1. Добавить filesystem cleanup после успешного DB delete

После успешного удаления компании нужно очищать managed directories Paperclip, завязанные на `companyId`, если они существуют.

Минимальный набор:

- `PAPERCLIP_HOME/instances/<instance>/projects/<companyId>`
- `PAPERCLIP_HOME/instances/<instance>/companies/<companyId>`
- `PAPERCLIP_HOME/instances/<instance>/skills/<companyId>`
- связанные run-log и runtime-state директории, если они company-scoped

Важно:

- filesystem cleanup должен выполняться только после успешного удаления компании из БД
- ошибка очистки файловой системы не должна откатывать уже завершённое DB delete silently
- такие ошибки должны логироваться явно

### P1. Явно запретить удаление активных компаний без подтвержденной политики

Сейчас user-request был только про архивные компании. Нужно закрепить безопасное правило:

- штатное удаление через UI/API применяется к архивным компаниям
- для active-компаний нужна явная дополнительная проверка или подтверждение

### P2. Добавить диагностику перед удалением

Перед удалением полезно иметь dry-run/preview, который показывает:

- сколько agents будет удалено
- сколько projects/issues/runs/comments/documents будет удалено
- какие managed directories будут очищены

Это не обязательно для первого фикса, но сильно снижает риск операторских ошибок.

## Конкретные задачи

1. Обновить `companyService.remove(...)` под текущую схему.
2. Проверить dependency order для `heartbeat_runs`-связей.
3. Проверить dependency order для `issues`-связей.
4. Проверить dependency order для `projects`-связей.
5. Добавить regression test на company deletion.
6. Добавить cleanup managed directories после успешного удаления.
7. Удалить архивные компании штатным route/service после фикса.
8. Проверить отсутствие сиротских директорий и сиротских company-scoped записей.

## Риски

- Можно пропустить ещё одну новую таблицу и снова получить FK failure.
- Можно удалить БД, но оставить filesystem мусор.
- Можно удалить active-компанию без достаточной защиты, если не закрепить policy.

## Критерии завершения

Работа считается завершённой, когда выполнены все условия:

1. `DELETE /api/companies/:companyId` успешно удаляет архивную компанию без FK-ошибок.
2. Regression test покрывает реальные проблемные зависимости.
3. Managed directories компании очищаются после успешного удаления.
4. Архивные компании, найденные в текущем инстансе, удалены штатным способом.
5. После удаления не остаётся company-scoped записей для удалённых `companyId`.
