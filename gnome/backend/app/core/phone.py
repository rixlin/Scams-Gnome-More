"""Display format for phone numbers: +1 (XXX) XXX-XXXX for US/Canada numbers."""

import re


def format_phone(number: str | None) -> str | None:
    """Twilio sends E.164 (+15551234567); store and show it as +1 (555) 123-4567.

    Only +1 (US/Canada) numbers are reformatted. Other countries' groupings vary, so those are returned
    as received, as is anything that isn't a phone number ("Anonymous", "browser-simulator").
    """
    if not number or not re.fullmatch(r"\+?[\d\s().-]+", number.strip()):
        return number
    digits = re.sub(r"\D", "", number)
    if len(digits) == 10 and not number.strip().startswith("+"):
        digits = "1" + digits  # US number written without its country code
    if len(digits) == 11 and digits[0] == "1":
        return f"+1 ({digits[1:4]}) {digits[4:7]}-{digits[7:]}"
    return number
