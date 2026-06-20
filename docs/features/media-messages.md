# Media-сообщения и статус доставки

Фото и видео отправляются в чат тем же путём, что и текст, но с
отдельным HTTP-эндпойнтом для аплоада и WS-фан-аутом для recipient'а.
Каждое исходящее сообщение показывает оптимистичный статус доставки
(точка / спиннер / `!`), чтобы юзер видел что происходит сразу, не
ожидая ack от сервера.

## Что умеет

| | Фото | Видео | Голосовое |
|---|---|---|---|
| Форматы | jpeg / png / webp | mp4 / quicktime / webm | webm / ogg / mp4 / mpeg / aac / wav |
| Максимальный размер | 10 MB | 50 MB | 20 MB |
| Серверная обработка | Pillow: downscale до 1920 по большой стороне, JPEG q=82, отдельный thumb 320×320 (EXIF снимается re-encode'ом) | strip метаданных (ffmpeg `-map_metadata -1 -c copy`), client-side meta (width/height/duration) | запись в браузере (`MediaRecorder`), strip метаданных, client-side `duration_ms` |
| Подпись | ✅ опционально | ✅ опционально | — |
| Reply на медиа | ✅ quote «Фото» если без подписи | quote «Видео» | quote «Голосовое» |
| Lightbox | ✅ фуллскрин с blur backdrop | ✅ фуллскрин c controls | — (инлайн-плеер) |

> Голосовые вынесены в отдельный док — см. [voice-messages.md](voice-messages.md).

> ⚠️ **nginx `client_max_body_size`** должен быть ≥ лимита видео.
> Изначально стоял `10M` — из-за чего видео > 10 MB резались nginx'ом
> с `413` ещё до FastAPI («видео не отправляются»). Поднято до **`60M`**
> (`nginx/wsnox.conf`, `nginx/wsnox.dev.conf`).

## Архитектура

```
[picker] → [preview modal с caption] → optimistic insert (client_status=uploading)
                                              ↓
                                  POST /chats/{id}/media (multipart)
                                              ↓
                                  ┌───────────────────────┐
                                  │ services/media.py     │
                                  │  image → Pillow       │
                                  │  video → S3 raw       │
                                  └───────────────────────┘
                                              ↓
                                  Message в БД + presigned URLs
                                              ↓
                                  ┌─────────────────────┐
                                  │ HTTP 200 → sender  │ ← client_status=sent
                                  └─────────────────────┘
                                              ↓
                                  Redis pubsub (REDIS_CHAT_CHANNEL)
                                              ↓
                                  WS → recipient (incoming msg)
```

## Backend

### Таблица `message`

Миграция `9f4d2c1a6e80_add_attachments_to_message`:

| Поле | Тип | Назначение |
|---|---|---|
| `attachment_key` | `VARCHAR(512) NULL` | S3-ключ оригинала (`media/{user_id}/{ts}/{uuid}.ext`) |
| `attachment_thumb_key` | `VARCHAR(512) NULL` | S3-ключ thumb'a (только фото) |
| `attachment_meta` | `JSONB NULL` | `{width, height, duration_ms, size_bytes, content_type, ...}` |

`msg_type` уже существовал — теперь `text | image | video`. `encrypted_data`
хранит **подпись** (или пустую строку при отсутствии).

### Pipeline `services/media.py`

| Функция | Что делает |
|---|---|
| `process_image(storage, user_id, file)` | streaming read с `FileTooLarge`, Pillow `verify()` + `exif_transpose` + `convert("RGB")`, downscale, два JPEG в S3 (re-encode **сбрасывает весь EXIF**) |
| `process_video(...)` / `process_audio(...)` | обёртки над общим `_process_av`: streaming read, нормализация mime, `_validate_av_meta`, **strip метаданных**, upload. `msg_type` = `video` / `voice` |
| `_strip_av_metadata(raw, ext)` | ffmpeg `-map_metadata -1 -c copy` (+`+faststart` для mp4). Fail-open: без ffmpeg / при ошибке возвращает исходные байты |
| `resolve_attachment_urls(storage, key, thumb_key)` | presigned GET, TTL = 1 час, безопасный fallback `(None, None)` |

**Защиты**:
- `Image.MAX_IMAGE_PIXELS = 24_000_000` — анти-decompression-bomb
- `MAX_DURATION_MS = 5 * 60 * 1000` — клиентский meta не может прислать видео > 5 мин
- `READ_CHUNK = 64 KB` — стримим, не грузим весь файл в память до проверки размера

### Эндпойнт

```
POST /chats/{chat_id}/media   (multipart/form-data)
  file:         UploadFile  (image/* | video/* | audio/*)
  caption:      str = ""
  reply_to_id:  int | null
  client_meta:  str  (JSON: {width, height, duration_ms}) — для видео и голосовых

→ MessageResponse (с attachment_url, attachment_thumb_url, attachment_meta)
```

Ветка выбирается по нормализованному mime (codecs-параметр срезается):
`image` → `process_image`, `video` → `process_video`, `audio` →
`process_audio` (`msg_type=voice`).

Коды ошибок:

| Код | Когда |
|---|---|
| `403` | не участник чата |
| `400` | пустой файл / битая JPEG / невалидный `client_meta` |
| `413` | размер превышает лимит |
| `415` | mime не из allowlist |

После создания записи бэк вызывает `publish_media_message` —
publish'ит в `REDIS_CHAT_CHANNEL` payload, который существующий
`pubsub_listener` форвардит получателю. **Сам отправитель НЕ получает
echo через WS** — оптимистичная вставка обновляется из HTTP-ответа.

### Reply на медиа

В `MessageBase` добавлено поле `reply_to_msg_type: str | None`.

- `MessageCRUD.get_messages` тянет `msg_type` из reply_to записи и
  навешивает на dynamic-атрибут `message.reply_to_msg_type`
- Оба WS-paylod'а (`send_personal_message`, `publish_media_message`)
  кладут `reply_to_msg_type` в JSON-сообщение
- `pubsub_listener` форвардит поле в WS-event получателю
- Отправитель в своей оптимистичной вставке (`handleSendMessage`)
  читает `replyMsg.msg_type` сразу — без этого quote «Фото» появилась
  бы только после refresh'а

## Frontend

### Компоненты

| Файл | Роль |
|---|---|
| `chat/AttachmentPicker.jsx` | 📎 button, hidden `<input type="file">`, client-side guard 10/50 MB |
| `chat/MediaPreviewModal.jsx` | preview + caption перед отправкой, client-side probe размеров через `<img>` / `<video preload="metadata">` |
| `chat/MediaMessage.jsx` | inline thumb в bubble с auto aspect-ratio, спиннер при upload |
| `chat/VoiceRecorder.jsx` | 🎤 запись через `MediaRecorder`, таймер, send/cancel (см. [voice](voice-messages.md)) |
| `chat/VoiceMessage.jsx` | инлайн-плеер голосового: play/pause + «волна» + перемотка |
| `chat/MediaLightbox.jsx` | фуллскрин через **`createPortal(document.body)`**, lock html+body overflow, safe-area aware |
| `chat/MessageStatus.jsx` | точка delivered/read + спиннер uploading + `!` failed |

**Почему Portal**: `position: fixed` ломается, если предок имеет
`transform`/`filter`/`contain` — а у нашего bubble есть `translateX`
во время свайпа. Через Portal лайтбокс рендерится прямо в `<body>`,
и никакой родительский transform его не клипает.

### State pipeline (отправитель)

```js
// 1. optimistic insert
const tempId = `tmp-${uuid()}`;
const localUrl = URL.createObjectURL(file);
messages.push({
  id: tempId, type: 'outgoing',
  msg_type: 'image' | 'video',
  attachment_url: localUrl, attachment_thumb_url: localUrl,
  attachment_meta: {width, height, duration_ms},
  client_status: 'uploading', upload_progress: 0,
  _retry_file, _retry_caption, _retry_meta,   // для retry если упадёт
});

// 2. axios POST с onUploadProgress
axios.post('/chats/{id}/media', fd, {
  onUploadProgress: e => setUploadProgress(tempId, pct)
});

// 3. on success: подменяем tempId → server.id + URLs
messages[tempId] = {
  ...server,
  client_status: 'sent', upload_progress: undefined,
};
URL.revokeObjectURL(localUrl);

// 4. on failure: client_status='failed' (retry one-click)
```

### Иконография статуса

| Состояние | Визуал | Когда |
|---|---|---|
| `pending` | `bg-zinc-900/40` точка | сразу после ws.send текста (до ack) |
| `uploading` | спиннер + % | во время axios upload |
| `sent` | `bg-zinc-900/40` точка (та же что delivered) | message_ack пришёл / HTTP 200 |
| `read` (read_at set) | `bg-zinc-900` точка | recipient прочитал (reciprocity-gated) |
| `failed` | красный `AlertCircle`, click → retry | axios reject |

Дизайн умышленно совместим с предыдущим (точка), не плодит галочки.

### Reply quote: scroll-to-source

Каждый bubble получает `id="msg-${id}"` + `scrollMarginTop: 88px`
(чтобы лайм-хедер не закрывал). Reply-quote это `<button>` — клик:

```js
const el = document.getElementById(`msg-${reply_to_id}`);
el.scrollIntoView({behavior: "smooth", block: "center"});
el.classList.add("message-flash");      // CSS keyframes 1.6s glow
setTimeout(() => el.classList.remove("message-flash"), 1600);
```

`void el.offsetWidth` форсит reflow, чтобы анимация перезапустилась
на повторный клик.

## Очистка метаданных (EXIF / GPS)

Все исходящие медиа отдаются получателю **без метаданных источника**:

| Тип | Как чистится |
|---|---|
| Фото | Pillow re-encode'ит в новый JPEG и **не переносит EXIF** — GPS, модель камеры, серийник, дата съёмки не попадают в сохранённый файл. `exif_transpose` лишь применяет ориентацию (и тоже не сохраняет тег). |
| Видео / голосовое | `ffmpeg -map_metadata -1 -c copy` — re-mux без перекодирования, снимает контейнерные теги (вкл. геолокацию из видео телефона). |

ffmpeg ставится в `Dockerfile` (`apt-get install ffmpeg`). Если его нет
(локалка/тесты) — `_strip_av_metadata` **fail-open** возвращает исходные
байты, чтобы загрузка не падала; фото при этом всё равно чистятся (Pillow
встроен).

## Что НЕ сделано (явно)

- **Серверный thumbnail видео** — пока браузер делает poster из
  `preload="metadata"`. Нормально, кроме совсем медленных сетей у recipient'а.
  (ffmpeg в образе уже есть — добавить генерацию кадра не требует новых зависимостей.)
- **HEIC** (iPhone) — нужен `pillow-heif` в Dockerfile.
- **Несколько вложений на сообщение** — пока ровно 1 файл на message.
- **Cancel загрузки на лету** — есть только retry после failed.
- **Drag & drop, Ctrl+V paste** — только picker.

## Тесты

`tests/test_media_pipeline.py` — 21 кейс:

- image: ok / unsupported mime / corrupted / oversize / empty / downscale
- video: ok / unknown mime / oversize / dropping unknown keys / negative reject / oversized duration reject / empty meta ok / invalid JSON
- voice: ok (msg_type=voice, mime-нормализация, duration) / unknown mime / oversize / strip fail-open без ffmpeg
- url resolver: storage missing / both keys / only full
