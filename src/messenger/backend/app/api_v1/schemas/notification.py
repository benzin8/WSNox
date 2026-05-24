from pydantic import BaseModel


class NotificationPreferences(BaseModel):
    dnd: bool
    muted_chats: list[int]


class DndUpdate(BaseModel):
    enabled: bool


class MuteUpdate(BaseModel):
    muted: bool
