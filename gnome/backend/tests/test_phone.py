from app.core.phone import format_phone


def test_us_numbers_get_dashes():
    assert format_phone("+15551234567") == "+1 (555) 123-4567"
    assert format_phone("5551234567") == "+1 (555) 123-4567"
    assert format_phone("+1 (555) 123-4567") == "+1 (555) 123-4567"
    assert format_phone("+1-555-123-4567") == "+1 (555) 123-4567"  # old dashed format


def test_other_values_are_left_alone():
    assert format_phone("+442071234567") == "+442071234567"
    assert format_phone("Anonymous") == "Anonymous"
    assert format_phone("browser-simulator") == "browser-simulator"
    assert format_phone(None) is None
    assert format_phone("") == ""
