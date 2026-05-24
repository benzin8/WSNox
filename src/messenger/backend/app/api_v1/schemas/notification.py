from pydantic import BaseModel


class NotificationPreferences(BaseModel):
    dnd: bool
    muted_chats: list[int]
    read_receipts_enabled: bool = True


class DndUpdate(BaseModel):
    enabled: bool


class MuteUpdate(BaseModel):
    muted: bool


class ReadReceiptsUpdate(BaseModel):
    enabled: bool
