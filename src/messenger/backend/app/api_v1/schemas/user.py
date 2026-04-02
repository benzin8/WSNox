from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import Optional, List
from datetime import datetime
    
class ProfileBase(BaseModel):
    display_name: Optional[str] = Field(None, max_length=32)
    bio: Optional[str] = Field(None, max_length=256)
    status: str = "Offline"
    profile_photos: List[str] = []

class ProfileRead(ProfileBase):
    model_config = ConfigDict(from_attributes=True)

class ProfileUpdate(ProfileBase):
    pass

class PhoneNumberRequest(BaseModel):
    phone_number: str = Field(..., pattern=r"^\+?[1-9]\d{1,14}$")

class PhoneVerify(BaseModel):
    phone_number: str
    code: str = Field(..., min_length=4, max_length=6)

class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=32)
    name: str = Field(..., min_length=2, max_length=32)
    email: Optional[EmailStr] = None
    phone_number: Optional[str] = None

class UserCreate(UserBase):
    password: str = Field(..., min_length=8)

class UserLogin(BaseModel):
    phone_number: str
    password: str

class UserResponse(BaseModel):
    id: int
    name: str
    username: str
    phone_number: str
    email: Optional[EmailStr] = None
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