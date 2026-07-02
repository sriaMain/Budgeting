from .app_constants import CURRENCY_TO_INR


def convert_to_inr(amount, currency):
    """
    Convert any currency to INR.
    INR → no conversion
    """
    amount = float(amount)

    if currency == "INR":
        return amount

    rate = CURRENCY_TO_INR.get(currency, 1)
    return amount * rate
