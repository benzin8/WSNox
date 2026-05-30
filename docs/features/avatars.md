# Аватарки

Один аватар на пользователя, хранится в Yandex Object Storage (S3-совместимый). Закрытый bucket, фронт получает presigned GET URL с TTL 1 час. Загрузка — multipart POST через FastAPI: сервер кропит/ресайзит в WebP (512 и 96), записывает два объекта в S3, держит запись `profile.avatar` в БД.

## UX

1. Профиль → «Редактировать» → кнопка «Загрузить фото» в верху таба «Профиль».
2. Системный file picker (`image/jpeg`, `image/png`, `image/webp`).
3. Открывается модал `AvatarCropper` — круглое окно с zoom-slider; «Сохранить».
4. Фронт `canvas.toBlob('image/jpeg', 0.92)` → multipart POST `/profiles/me/avatar` → ответ содержит `avatar_url` и `avatar_thumb_url`.
5. У собеседника аватарка обновляется через `profile_update` WS-событие — без перезагрузки.
6. Удаление — кнопка «Удалить»; `DELETE /profiles/me/avatar` чистит ключи в S3 и обнуляет `profile.avatar`.

## Структура хранения

```
wsnox-media (bucket)
└── {dev|prod}/                       ← S3_PREFIX
    └── avatars/
        └── {user_id}/
            └── {uploaded_at_unix}/   ← версия
                ├── full.webp         ← 512×512, q=85
                └── thumb.webp        ← 96×96,  q=85
```

`profiles.avatar` (JSONB):
```json
{
  "full_key":   "avatars/42/1748605800/full.webp",
  "thumb_key":  "avatars/42/1748605800/thumb.webp",
  "uploaded_at":"2026-05-30T14:30:00+00:00"
}
```

или `NULL`.

### Зачем версионированные ключи

- **Cache invalidation** на фронте — путь URL меняется, браузер дропает старую запись.
- **Консистентность** in-flight presigned URL — старый указывает в старый ключ; не получится «получил URL для аватарки A, скачал аватарку B».
- **Готовность к history** — формат уже подходит, если потом добавим стек фотографий.

При перезаписи бэк best-effort удаляет старые ключи. Если delete упал — БД консистентна, сирот собирает (если будет много) bucket lifecycle policy (вне scope текущей итерации).

## API

| Метод  | Путь                              | Описание |
|--------|-----------------------------------|----------|
| POST   | `/api/v1/profiles/me/avatar`      | multipart `file` → `UserProfileResponse` с новыми presigned URL |
| DELETE | `/api/v1/profiles/me/avatar`      | очистить → `UserProfileResponse` с `avatar_url=None` (идемпотентно) |

В `GET /profiles/{me\|user_id}` всегда возвращаются `avatar_url`, `avatar_thumb_url`, `avatar_uploaded_at` (или `null`). В `GET /chats/`, `GET /chats/{id}/user`, `GET /chats/search` — `recipient.avatar_thumb_url`.

### Ошибки

| HTTP | Условие |
|------|---------|
| 400  | пустой файл |
| 413  | bytes > 5 MB |
| 415  | MIME не в `{image/jpeg, image/png, image/webp}` |
| 422  | Pillow не может декодировать / DecompressionBomb |
| 429  | rate-limit |
| 503  | S3 не сконфигурён |

## Env

```env
S3_ENDPOINT_URL=https://storage.yandexcloud.net
S3_REGION=ru-central1
S3_BUCKET=wsnox-media
S3_PREFIX=dev                # на проде — prod
S3_ACCESS_KEY_ID=YCAJE...
S3_SECRET_ACCESS_KEY=YCNz...
```

Без `S3_BUCKET` или ключей — бэк поднимается, upload-эндпойнты отдают 503, UI везде падает на инициалы.

## Realtime

`profile_update` событие через Redis pub/sub → WS fan-out. Payload содержит `avatar_thumb_url` и `avatar_uploaded_at`. Фронт обновляет `ChatList` и заголовок чата без перезагрузки.

Presigned URL живёт 1 час; при долгой открытой вкладке `<img>` может вернуть 403. `<Avatar>` имеет `onError` fallback на инициалы — пользователь увидит букву вместо битой картинки. При reconnect WS фронт перезапрашивает `/chats/` и получает свежие URL.

## Rate-limit

10 upload-ов на юзера в 5 минут (ключ `rl:avatar:user:{id}`) + 30 на IP как страховка (`rl:avatar:ip:{ip}`).

## Файлы

| Слой | Где |
|------|-----|
| Backend — обёртка S3 | `src/messenger/backend/services/storage.py` |
| Backend — pipeline | `src/messenger/backend/services/avatar.py` |
| Backend — URL-резолвер | `src/messenger/backend/services/avatar_urls.py` |
| Backend — DI | `src/messenger/backend/services/deps.py` |
| Backend — эндпойнты | `src/messenger/backend/app/api_v1/routers/profile_router.py` (`upload_my_avatar`, `delete_my_avatar`) |
| Backend — модель | `src/messenger/backend/models/profile.py` (поле `avatar`) |
| Backend — миграция | `alembic/versions/3b8b4758ea0d_replace_profile_photos_with_avatar.py` |
| Frontend — universal | `src/messenger/frontend_react/src/components/profile/Avatar.jsx` |
| Frontend — cropper | `src/messenger/frontend_react/src/components/profile/AvatarCropper.jsx` |
| Frontend — helper | `src/messenger/frontend_react/src/components/profile/cropImage.js` |
| Frontend — modal | `src/messenger/frontend_react/src/components/profile/EditProfileModal.jsx` |
| Frontend — hook | `src/messenger/frontend_react/src/hooks/useProfile.js` |

## Тесты

- `tests/test_storage.py` — обёртка S3 (моки aioboto3).
- `tests/test_avatar_pipeline.py` — resize/encode/upload с фикстурами.
- `tests/test_avatar_urls.py` — резолвер.
- `tests/test_avatar_routes.py` — route-shape (mock-deps, без реальной БД).
- `tests/test_rate_limit_avatar.py` — лимит на 11-й запрос.

## Известные ограничения

- **Нет zero-downtime деплоя** — миграция дропает `profile_photos`. Окно 500 ~5–15 сек на проде во время `up -d`.
- **TTL presigned URL = 1ч** — долго открытая вкладка может увидеть 403; `<Avatar>` fall back на инициалы.
- **Best-effort cleanup** — если S3 моргнул на delete старого ключа, файлы осиротеют. На объёме одного юзера это незначительно; если когда-то понадобится — добавить lifecycle policy.
- **HEIC не поддерживается из коробки** (iOS PWA сам конвертирует в JPEG при выборе через `<input type=file>`).
