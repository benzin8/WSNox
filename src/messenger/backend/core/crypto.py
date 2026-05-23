import base64
import os

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from messenger.backend.core.config import settings

_raw_key = settings.message_encryption_key or settings.secret_key
KEY = _raw_key.encode().ljust(32)[:32]

_GCM_VERSION = b'\x01'
_GCM_NONCE_LEN = 12


def encrypt_message(message: str) -> str:
    nonce = os.urandom(_GCM_NONCE_LEN)
    aesgcm = AESGCM(KEY)
    ciphertext = aesgcm.encrypt(nonce, message.encode(), None)
    return base64.b64encode(_GCM_VERSION + nonce + ciphertext).decode('utf-8')


def decrypt_message(encrypted_data: str) -> str:
    try:
        raw_data = base64.b64decode(encrypted_data)

        if raw_data[:1] == _GCM_VERSION:
            nonce = raw_data[1:1 + _GCM_NONCE_LEN]
            ciphertext = raw_data[1 + _GCM_NONCE_LEN:]
            aesgcm = AESGCM(KEY)
            return aesgcm.decrypt(nonce, ciphertext, None).decode('utf-8')

        # Legacy AES-CBC fallback for old messages
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
