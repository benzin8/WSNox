"""Smoke tests for the WebAuthn (biometric) endpoints' building blocks.

Full register/login round-trips need a real authenticator, so here we verify
the module imports cleanly (i.e. every py_webauthn API name we use exists) and
that options generation produces valid, correctly-scoped options.
"""
import json

# Importing the router validates every py_webauthn import + our usage compiles.
from messenger.backend.app.api_v1.routers import webauthn_router as wr
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
)
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)


def test_rp_derivation():
    rp_id, origin = wr._rp()
    assert origin.startswith("http")
    assert rp_id and "/" not in rp_id


def test_registration_options_smoke():
    opts = generate_registration_options(
        rp_id="wsnox.urldot.ru",
        rp_name="WSNox",
        user_id=b"1",
        user_name="u",
        user_display_name="u",
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
    )
    d = json.loads(options_to_json(opts))
    assert d["rp"]["id"] == "wsnox.urldot.ru"
    assert d["authenticatorSelection"]["residentKey"] == "preferred"
    assert d["challenge"]


def test_authentication_options_smoke():
    opts = generate_authentication_options(
        rp_id="wsnox.urldot.ru",
        user_verification=UserVerificationRequirement.PREFERRED,
    )
    d = json.loads(options_to_json(opts))
    assert d["challenge"]
    assert d["rpId"] == "wsnox.urldot.ru"
