from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field

PresencePreference = Literal["dnd", "invisible"]


class ProfileBase(BaseModel):
    display_name: Optional[str] = Field(None, max_length=32)
    bio: Optional[str] = Field(None, max_length=256)
    presence_preference: Optional[PresencePreference] = None
    profile_photos: List[str] = []


class ProfileRead(ProfileBase):
    model_config = ConfigDict(from_attributes=True)


class ProfileUpdate(ProfileBase):
    phone_number: Optional[str] = Field(None, max_length=20)

class PhoneRequest(BaseModel):
    phone_number: str = Field(..., pattern=r"^\+?[1-9]\d{1,14}$")

class PhoneCodeVerify(BaseModel):
    phone_number: str
    code: str = Field(..., min_length=4, max_length=6)

class EmailRequest(BaseModel):
    email: EmailStr

class EmailVerify(BaseModel):
    email: EmailStr
    code: str = Field(..., min_length=4, max_length=6)

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=10, max_length=128)
    password: str = Field(..., min_length=8, max_length=128)

class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)

class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=32)
    name: str = Field(..., min_length=2, max_length=32)
    email: EmailStr
    phone_number: Optional[str] = None

class UserCreate(UserBase):
    password: str = Field(..., min_length=8)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    name: str
    username: str
    phone_number: Optional[str] = None
    email: EmailStr
    created_at: datetime

    class Config:
        from_attributes = True

class AuthResponse(BaseModel):
    status: str
    user: UserResponse
    access_token: str
    refresh_token: str

class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    profile: ProfileRead

class UserUpdate(UserBase):
    pass

class UserProfileResponse(BaseModel):
    user_id: int
    username: str
    name: str
    phone_number: Optional[str] = None
    email: Optional[EmailStr] = None
    display_name: Optional[str] = None
    bio: Optional[str] = None
    presence_preference: Optional[PresencePreference] = None
    online: bool = False
    profile_photos: List[str] = []
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
