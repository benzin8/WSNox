# Голосовые сообщения

Голосовые записываются прямо в браузере (Web Audio / `MediaRecorder`),
заливаются тем же HTTP-эндпойнтом, что фото и видео, и хранятся как
сообщение с `msg_type = "voice"`. Сервер не транскодирует звук — только
снимает метаданные (best-effort через ffmpeg) и кладёт в S3.

## Как это работает (коротко)

```
[🎤 tap] → getUserMedia(audio) → MediaRecorder пишет чанки
   │
[✓ tap] → recorder.stop() → собираем Blob (webm/opus или mp4)
   │                         + меряем длительность локально
   ▼
handleSendVoice(file, {duration_ms})  →  handleSendMedia(...)  (тот же путь, что медиа)
   │
POST /chats/{id}/media (multipart)  — file=audio/webm, client_meta={duration_ms}
   │
services/media.py: process_audio → strip metadata (ffmpeg) → put в S3 → msg_type="voice"
   │
Message в БД + presigned URL → Redis pubsub → WS получателю
   │
рендер: <VoiceMessage> (play/pause + «волна» + таймер)
```

Ключевая идея: **голосовое — это просто аудиофайл-вложение**. Никакого
отдельного протокола нет, переиспользуется вся медиа-инфраструктура
(оптимистичный UI, прогресс загрузки, retry, presigned S3, fan-out).

## Запись в браузере

`components/chat/VoiceRecorder.jsx`:

1. **Tap по микрофону** → `navigator.mediaDevices.getUserMedia({audio:true})`.
   Если доступ запрещён — `alert`, ничего не пишется.
2. Контейнер выбирается под браузер через `MediaRecorder.isTypeSupported`:

   | Браузер | Что отдаёт |
   |---|---|
   | Chrome / Firefox / Edge | `audio/webm;codecs=opus` |
   | Safari / iOS | `audio/mp4` |
   | fallback | `audio/ogg` |

3. Во время записи: красная точка-пульс + таймер (`mm:ss`), кнопки
   **🗑 отменить** и **✓ отправить**. Жёсткий потолок — **5 минут**
   (`MAX_MS`, совпадает с серверным `MAX_DURATION_MS`); по достижении
   запись автоотправляется.
4. На `stop`:
   - длительность = `Date.now() - startTime` (мы НЕ полагаемся на
     `audio.duration` — у webm/opus она часто `Infinity` до полной
     перемотки);
   - чанки склеиваются в `Blob`, оборачиваются в `File("voice.webm")`;
   - запись короче `500 ms` или пустой блоб — отбрасываются;
   - вызывается `onRecorded(file, {duration_ms})`.

Если в браузере нет `MediaRecorder` (старый Safari) — компонент
**не рендерится вообще**, в инпуте остаётся только текст + 📎.

`InputArea` показывает **микрофон вместо кнопки «отправить», когда поле
ввода пустое** (и мы не в режиме редактирования); как только юзер
печатает — микрофон сменяется на ✈️ send.

## Загрузка

`handleSendVoice` (в `ChatPage.jsx`) просто прокидывает блоб в уже
существующий `handleSendMedia(file, '', meta)`. Дальше всё как у медиа:

- оптимистичная вставка с `msg_type:'voice'`, `attachment_url` = локальный
  blob-URL (его сразу можно проигрывать), `client_status:'uploading'`;
- `POST /chats/{id}/media` c `onUploadProgress`;
- `msgType` определяется по mime: `image/*`→`image`, `audio/*`→**`voice`**,
  иначе `video`.

## Backend

`services/media.py` → `process_audio(storage, user_id, file, client_meta_raw)`:

| Шаг | Что делает |
|---|---|
| mime | нормализует `audio/webm;codecs=opus` → `audio/webm`, проверяет по `ALLOWED_AUDIO_MIME` |
| размер | стримит с `READ_CHUNK`, лимит `MAX_AUDIO_BYTES = 20 MB`, иначе `FileTooLarge` |
| meta | `_validate_av_meta` bound-check'ит `duration_ms` (≤ 5 мин) |
| метаданные | `_strip_av_metadata` — ffmpeg `-map_metadata -1 -c copy` (см. ниже) |
| хранение | `put_object` в S3, ключ `media/{uid}/{ts}/{uuid}.{ext}` |

Возвращает `MediaPayload(msg_type="voice", attachment_thumb_key=None,
meta={size_bytes, content_type, duration_ms})`.

`ALLOWED_AUDIO_MIME` = `webm, ogg, mp4, mpeg, aac, wav`. Эндпойнт
`POST /chats/{chat_id}/media` сам выбирает ветку по нормализованному
mime: image → `process_image`, video → `process_video`, audio →
`process_audio`.

В списке чатов превью голосового рендерится как **«🎤 Голосовое
сообщение»** (`chat_router.get_chats`), reply-quote — как «Голосовое».

## Проигрывание

`components/chat/VoiceMessage.jsx`:

- скрытый `<audio preload="metadata">` + кнопка play/pause;
- псевдо-«волна» из статичных полосок: закрашенная часть = прогресс,
  **клик по дорожке = перемотка** (`audio.currentTime = ratio * dur`);
- таймер: пока играет — текущая позиция, в покое — полная длительность;
  длительность сидируется из `meta.duration_ms`, уточняется из
  `loadedmetadata`/`durationchange`;
- цвета подстраиваются под исходящий (тёмный) / входящий (лаймовый)
  бабл; во время аплоада на месте play — спиннер.

## Очистка метаданных

`_strip_av_metadata(raw, ext)` гоняет файл через
`ffmpeg -map_metadata -1 -c copy` (stream copy — без перекодирования,
быстро и без потери качества; для mp4/m4a добавляется
`-movflags +faststart`). Это снимает гео-теги/инфо об устройстве.

**Fail-open**: если ffmpeg не найден (`shutil.which("ffmpeg")` → `None`,
как в dev/test) или упал/завис (таймаут 60 c) — возвращаются исходные
байты, загрузка не ломается. В проде ffmpeg ставится в `Dockerfile`.

Для свежезаписанного в браузере opus метаданных по сути и нет — фича
важнее для видео из галереи (там бывает GPS). См.
[media-messages.md](media-messages.md#очистка-метаданных-exif--gps).

## Что НЕ сделано (явно)

- **Транскод в единый кодек** — храним как записал браузер (webm/opus или
  mp4/aac). Все целевые браузеры играют свой же формат; кросс-плеер
  webm↔Safari может потребовать транскода в будущем.
- **Серверная waveform** — рисуем декоративные полоски, не реальную
  амплитуду (для неё нужно декодировать аудио).
- **Запись «удержанием» (hold-to-talk)** — пока tap-to-start / tap-to-send.
- **Ускорение 1.5×/2×, докрутка скоростью** — нет.

## Тесты

`tests/test_media_pipeline.py`:

- `test_process_audio_uploads_voice` — `msg_type=voice`, нормализация
  `audio/webm;codecs=opus` → `audio/webm`, проброс `duration_ms`
- `test_process_audio_rejects_unknown_mime` — `audio/flac` → `UnsupportedFormat`
- `test_process_audio_rejects_oversize` — > 20 MB → `FileTooLarge`
- `test_strip_av_metadata_noop_without_ffmpeg` — fail-open без ffmpeg
