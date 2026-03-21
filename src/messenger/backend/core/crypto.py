import os
import base64
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.backends import default_backend
from messenger.backend.core.config import settings

KEY = settings.secret_key.encode().ljust(32)[:32]
IV = os.urandom(16)

def encrypt_message(message: str) -> str:
    cipher = Cipher(algorithms.AES(KEY), modes.CBC(IV), backend=default_backend())
    encryptor = cipher.encryptor()
    
    padder = padding.PKCS7(128).padder()
    padded_data = padder.update(message.encode()) + padder.finalize()

    encrypted_data = encryptor.update(padded_data) + encryptor.finalize()

    return base64.b64encode(IV + encrypted_data).decode('utf-8')

def decrypt_message(encrypted_data: str) -> str:
    try:
        raw_data = base64.b64decode(encrypted_data)
        
        iv = raw_data[:16]
        ciphertext = raw_data[16:]
        
        cipher = Cipher(algorithms.AES(KEY), modes.CBC(iv), backend=default_backend())
        decryptor = cipher.decryptor()
        
        padded_data = decryptor.update(ciphertext) + decryptor.finalize()
        
        unpadder = padding.PKCS7(128).unpadder()
        plain_text = unpadder.update(padded_data) + unpadder.finalize()
        
        return plain_text.decode('utf-8')
    except Exception as e:
        return f"[Ошибка расшифровки: {e}]"