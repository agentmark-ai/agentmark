"""Tests for create_pii_masker."""

from __future__ import annotations

import re

from agentmark_sdk.pii_masker import CustomPattern, PiiMaskerConfig, create_pii_masker


class TestPiiMasker:
    """Tests for the built-in PII masker."""

    def test_email_masking(self) -> None:
        mask = create_pii_masker(PiiMaskerConfig(email=True))
        assert mask("Contact user@example.com for info") == "Contact [EMAIL] for info"

    def test_phone_masking(self) -> None:
        mask = create_pii_masker(PiiMaskerConfig(phone=True))
        assert mask("Call (555) 123-4567 now") == "Call [PHONE] now"
        assert mask("Call 555-123-4567") == "Call [PHONE]"
        assert mask("Call +1-555-123-4567") == "Call [PHONE]"

    def test_ssn_masking(self) -> None:
        mask = create_pii_masker(PiiMaskerConfig(ssn=True))
        assert mask("SSN: 123-45-6789") == "SSN: [SSN]"

    def test_credit_card_masking(self) -> None:
        mask = create_pii_masker(PiiMaskerConfig(credit_card=True))
        assert mask("Card: 4111 1111 1111 1111") == "Card: [CREDIT_CARD]"
        assert mask("Card: 4111-1111-1111-1111") == "Card: [CREDIT_CARD]"
        assert mask("Card: 4111111111111111") == "Card: [CREDIT_CARD]"

    def test_ip_address_masking(self) -> None:
        mask = create_pii_masker(PiiMaskerConfig(ip_address=True))
        assert mask("IP: 192.168.1.100") == "IP: [IP_ADDRESS]"

    def test_multiple_patterns(self) -> None:
        mask = create_pii_masker(PiiMaskerConfig(email=True, ssn=True))
        text = "Email: user@test.com, SSN: 123-45-6789"
        assert mask(text) == "Email: [EMAIL], SSN: [SSN]"

    def test_all_patterns(self) -> None:
        mask = create_pii_masker(PiiMaskerConfig(
            email=True, phone=True, ssn=True, credit_card=True, ip_address=True,
        ))
        assert "[EMAIL]" in mask("contact user@test.com")
        assert "[PHONE]" in mask("call 555-123-4567")
        assert "[SSN]" in mask("ssn 123-45-6789")
        assert "[CREDIT_CARD]" in mask("card 4111111111111111")
        assert "[IP_ADDRESS]" in mask("ip 10.0.0.1")

    def test_no_patterns_enabled(self) -> None:
        mask = create_pii_masker(PiiMaskerConfig())
        text = "user@test.com 123-45-6789"
        assert mask(text) == text

    def test_custom_patterns(self) -> None:
        mask = create_pii_masker(PiiMaskerConfig(
            custom=[
                CustomPattern(pattern=re.compile(r"MRN-\d+"), replacement="[MEDICAL_RECORD]"),
            ],
        ))
        assert mask("Patient MRN-12345") == "Patient [MEDICAL_RECORD]"

    def test_custom_patterns_with_builtins(self) -> None:
        mask = create_pii_masker(PiiMaskerConfig(
            email=True,
            custom=[
                CustomPattern(pattern=re.compile(r"ACCT-[A-Z0-9]+"), replacement="[ACCOUNT]"),
            ],
        ))
        text = "Email: user@test.com, Account: ACCT-ABC123"
        assert mask(text) == "Email: [EMAIL], Account: [ACCOUNT]"

    def test_custom_only_no_builtins(self) -> None:
        mask = create_pii_masker(PiiMaskerConfig(
            custom=[
                CustomPattern(pattern=re.compile(r"secret-\w+"), replacement="[SECRET]"),
            ],
        ))
        assert mask("Found secret-abc123 in logs") == "Found [SECRET] in logs"

    def test_multiple_occurrences(self) -> None:
        mask = create_pii_masker(PiiMaskerConfig(email=True))
        text = "From a@b.com to c@d.com"
        assert mask(text) == "From [EMAIL] to [EMAIL]"

    def test_empty_string(self) -> None:
        mask = create_pii_masker(PiiMaskerConfig(email=True))
        assert mask("") == ""

    def test_no_matches(self) -> None:
        mask = create_pii_masker(PiiMaskerConfig(email=True))
        assert mask("just plain text") == "just plain text"

    def test_kwargs_shorthand(self) -> None:
        mask = create_pii_masker(email=True, ssn=True)
        text = "Email: user@test.com, SSN: 123-45-6789"
        assert mask(text) == "Email: [EMAIL], SSN: [SSN]"
