"""
Tests for the shared onboarding layer (country rules, validation helpers, upload checks,
lookups and their endpoints). All SimpleTestCase - no database is needed or touched, and
external lookup services are mocked.
"""
import io
from unittest import mock

import requests
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, override_settings
from rest_framework import serializers
from rest_framework.test import APIRequestFactory

from core import countries as c
from core import lookups
from core.document_security import check_document_upload, document_counts_as_present, effective_document_status, parse_expiry_date
from core.onboarding_validation import clean_bank_details, clean_phone, clean_postal_code, clean_tax_id, confirm_account_number, normalize_country_fields

LOCMEM = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "onboarding-tests"}}


class CountryResolutionTests(SimpleTestCase):
    def test_resolves_names_codes_and_aliases(self):
        for value, code in [("India", "IN"), ("india", "IN"), ("IN", "IN"), ("IND", "IN"), ("USA", "US"),
                            ("United States", "US"), ("UK", "GB"), ("UAE", "AE"), ("Türkiye", "TR"), ("Viet Nam", "VN")]:
            self.assertEqual(c.resolve_country(value), code, value)
        self.assertIsNone(c.resolve_country(""))
        self.assertIsNone(c.resolve_country("Atlantis"))

    def test_normalize_keeps_unknown_values(self):
        self.assertEqual(c.normalize_country_value("usa"), "United States")
        self.assertEqual(c.normalize_country_value("  Atlantis "), "Atlantis")

    def test_every_country_has_a_config(self):
        rows = c.all_country_summaries()
        self.assertEqual(len(rows), 249)
        for row in rows:
            cfg = c.country_config(row["code"])
            self.assertIsNotNone(cfg, row["code"])
            self.assertIn("postal", cfg["address"])
            self.assertIn("business", cfg["tax"])

    def test_currency_and_dial_code(self):
        india, us = c.country_config("IN"), c.country_config("US")
        self.assertEqual((india["dial_code"], india["currency"]["code"], india["currency"]["symbol"]), ("+91", "INR", "₹"))
        self.assertEqual((us["dial_code"], us["currency"]["code"], us["currency"]["symbol"]), ("+1", "USD", "$"))
        self.assertTrue(india["currency"]["billing_supported"])
        self.assertFalse(c.country_config("AE")["currency"]["billing_supported"])


class PhoneTests(SimpleTestCase):
    def test_normalizes_to_e164(self):
        self.assertEqual(c.normalize_phone("+91 98765 43210"), "+919876543210")
        self.assertEqual(c.normalize_phone("2015550123", "United States"), "+12015550123")
        self.assertEqual(c.normalize_phone("020 7946 0958", "GB"), "+442079460958")

    def test_rejects_invalid_numbers(self):
        with self.assertRaises(c.PhoneValidationError):
            c.normalize_phone("12345", "India")
        with self.assertRaises(c.PhoneValidationError):
            c.normalize_phone("9876543210")  # no country, no dialing code

    def test_clean_phone_helper(self):
        attrs, errors = {"phone": "98765 43210"}, {}
        clean_phone(attrs, "phone", errors, country="India")
        self.assertEqual(attrs["phone"], "+919876543210")
        attrs, errors = {"phone": "123"}, {}
        clean_phone(attrs, "phone", errors, country="India")
        self.assertIn("phone", errors)


class AddressAndTaxTests(SimpleTestCase):
    def test_postal_codes_per_country(self):
        self.assertIsNone(c.validate_postal_code("500081", "India"))
        self.assertIsNotNone(c.validate_postal_code("050081", "India"))
        self.assertIsNone(c.validate_postal_code("90210-1234", "US"))
        self.assertIsNone(c.validate_postal_code("SW1A 1AA", "United Kingdom"))
        self.assertIsNone(c.validate_postal_code("K1A 0B1", "Canada"))
        self.assertIsNone(c.validate_postal_code("anything", "AE"))  # no postal codes in the UAE
        self.assertIsNone(c.validate_postal_code("AB-123", "Mongolia"))  # permissive generic rule

    def test_clean_postal_code_uppercases(self):
        attrs, errors = {"pin": "sw1a 1aa"}, {}
        clean_postal_code(attrs, "pin", "GB", errors)
        self.assertEqual((attrs["pin"], errors), ("SW1A 1AA", {}))

    def test_tax_ids(self):
        self.assertIsNone(c.validate_tax_id("ABCDE1234F", "IN"))
        self.assertIsNotNone(c.validate_tax_id("ABCDE12345", "IN"))
        self.assertIsNone(c.validate_tax_id("12-3456789", "US"))
        self.assertIsNone(c.validate_tax_id("DE123456789", "Germany"))
        self.assertIsNone(c.validate_tax_id("51 824 753 556", "AU"))
        self.assertIn("checksum", c.validate_tax_id("51 824 753 557", "AU"))
        self.assertIsNone(c.validate_tax_id("XY-99/2024", "Kenya"))  # generic: free-form

    def test_clean_tax_id_uppercases(self):
        attrs, errors = {"pan": "abcde1234f"}, {}
        clean_tax_id(attrs, "pan", "India", errors)
        self.assertEqual((attrs["pan"], errors), ("ABCDE1234F", {}))

    def test_normalize_country_fields(self):
        attrs = {"country": "usa", "bank_country": "", "other": "x"}
        normalize_country_fields(attrs, "country", "bank_country")
        self.assertEqual(attrs, {"country": "United States", "bank_country": "", "other": "x"})


class BankTests(SimpleTestCase):
    def test_india(self):
        ok = {"ifsc_code": "HDFC0000001", "account_number": "123456789012", "account_holder_name": "Ravi Kumar", "bank_name": "HDFC"}
        self.assertEqual(c.validate_bank_details(ok, "India"), {})
        self.assertIn("ifsc_code", c.validate_bank_details({**ok, "ifsc_code": "HDFC1000001"}, "India"))
        self.assertIn("account_number", c.validate_bank_details({**ok, "account_number": "12AB"}, "India"))

    def test_us_aba_checksum(self):
        base = {"account_number": "123456789", "account_holder_name": "Jane Doe", "bank_name": "Chase"}
        self.assertEqual(c.validate_bank_details({**base, "routing_code": "021000021"}, "US"), {})
        self.assertIn("checksum", c.validate_bank_details({**base, "routing_code": "021000022"}, "US")["routing_code"])

    def test_iban_countries(self):
        errors = c.validate_bank_details({"account_holder_name": "Hans Muller", "bank_name": "DB"}, "Germany")
        self.assertEqual(set(errors), {"iban", "swift_code"})
        good = {"iban": "DE89 3704 0044 0532 0130 00", "swift_code": "DEUTDEFF", "account_holder_name": "Hans Muller", "bank_name": "DB"}
        self.assertEqual(c.validate_bank_details(good, "Germany"), {})
        self.assertIn("swift_code", c.validate_bank_details({**good, "swift_code": "HDFCINBB"}, "Germany"))

    def test_partial_drafts_only_reject_malformed_values(self):
        self.assertEqual(c.validate_bank_details({}, "India", partial=True), {})
        self.assertIn("ifsc_code", c.validate_bank_details({"ifsc_code": "BAD"}, "India", partial=True))

    def test_saved_account_number_is_not_required_again(self):
        data = {"ifsc_code": "HDFC0000001", "account_holder_name": "Ravi Kumar", "bank_name": "HDFC", "_has_saved_account_number": True}
        self.assertEqual(c.validate_bank_details(data, "India"), {})

    def test_clean_bank_details_maps_model_fields(self):
        attrs, errors = {"bank_ifsc_code": "hdfc0000001 ", "bank_iban": "de89 3704"}, {}
        clean_bank_details(attrs, "India", errors, field_map={"ifsc_code": "bank_ifsc_code", "iban": "bank_iban"})
        self.assertEqual(attrs["bank_ifsc_code"], "HDFC0000001")
        self.assertIn("bank_iban", errors)

    def test_confirm_account_number(self):
        errors = {}
        confirm_account_number({"account_number": "1234 5678 90", "confirm_account_number": "1234567890"}, "account_number", "confirm_account_number", errors)
        self.assertEqual(errors, {})
        confirm_account_number({"account_number": "1234567890", "confirm_account_number": "1234567891"}, "account_number", "confirm_account_number", errors)
        self.assertIn("confirm_account_number", errors)


class DocumentSecurityTests(SimpleTestCase):
    def upload(self, name, content, content_type):
        return SimpleUploadedFile(name, content, content_type=content_type)

    def test_accepts_genuine_files(self):
        self.assertIsNone(check_document_upload(self.upload("pan.pdf", b"%PDF-1.7 rest", "application/pdf")))
        self.assertIsNone(check_document_upload(self.upload("id.png", b"\x89PNG\r\n\x1a\nrest", "image/png")))
        self.assertIsNone(check_document_upload(self.upload("id.JPG", b"\xff\xd8\xff\xe0rest", "image/jpeg")))

    def test_rejects_disguised_or_bad_files(self):
        self.assertEqual(check_document_upload(self.upload("pan.pdf", b"<html>", "application/pdf"))[0], "file_content_mismatch")
        self.assertEqual(check_document_upload(self.upload("run.exe", b"MZ", "application/octet-stream"))[0], "unsupported_file_type")
        self.assertEqual(check_document_upload(self.upload("pan.pdf", b"%PDF-", "image/png"))[0], "unsupported_file_type")
        self.assertEqual(check_document_upload(self.upload("e.pdf", b"", "application/pdf"))[0], "file_empty")
        big = mock.Mock(size=11 * 1024 * 1024, name="big.pdf")
        self.assertEqual(check_document_upload(big)[0], "file_too_large")

    def test_reading_the_signature_does_not_consume_the_file(self):
        f = self.upload("pan.pdf", b"%PDF-1.7 rest", "application/pdf")
        check_document_upload(f)
        self.assertEqual(f.read(), b"%PDF-1.7 rest")

    def test_expiry(self):
        import datetime
        past, future = datetime.date(2000, 1, 1), datetime.date(2999, 1, 1)
        self.assertEqual(effective_document_status("verified", past), "expired")
        self.assertEqual(effective_document_status("rejected", past), "rejected")
        self.assertEqual(effective_document_status("uploaded", future), "uploaded")
        self.assertFalse(document_counts_as_present("verified", past))
        self.assertFalse(document_counts_as_present("rejected", None))
        self.assertTrue(document_counts_as_present("uploaded", None))
        self.assertIsNone(parse_expiry_date(""))
        with self.assertRaises(ValueError):
            parse_expiry_date("31/12/2030")


def _response(status, payload):
    resp = mock.Mock(status_code=status)
    resp.json.return_value = payload
    return resp


@override_settings(CACHES=LOCMEM)
class LookupTests(SimpleTestCase):
    def setUp(self):
        from django.core.cache import cache
        cache.clear()

    @mock.patch("core.lookups.requests.get")
    def test_ifsc_found(self, get):
        get.return_value = _response(200, {"BANK": "HDFC Bank", "BRANCH": "NARIMAN POINT", "ADDRESS": "1 MARG", "CITY": "MUMBAI", "STATE": "MAHARASHTRA", "IFSC": "HDFC0000001"})
        result = lookups.lookup_ifsc("hdfc0000001")
        self.assertTrue(result.found)
        self.assertEqual(result.data["bank_name"], "HDFC Bank")
        self.assertEqual(result.data["branch_name"], "Nariman Point")
        lookups.lookup_ifsc("HDFC0000001")
        self.assertEqual(get.call_count, 1)  # cached

    @mock.patch("core.lookups.requests.get")
    def test_ifsc_not_found_and_invalid(self, get):
        get.return_value = _response(404, "Not Found")
        self.assertFalse(lookups.lookup_ifsc("ABCD0123456").found)
        self.assertFalse(lookups.lookup_ifsc("nope").found)
        self.assertEqual(get.call_count, 1)  # the invalid code never reaches the provider

    @mock.patch("core.lookups.requests.get", side_effect=requests.Timeout)
    def test_provider_failure_is_graceful(self, _get):
        result = lookups.lookup_ifsc("HDFC0000002")
        self.assertFalse(result.found)
        self.assertTrue(result.unavailable)

    @mock.patch("core.lookups.requests.get")
    def test_postal_india_falls_back_to_zippopotam(self, get):
        get.side_effect = [requests.Timeout(), _response(200, {"places": [{"place name": "Janpath", "state": "New Delhi"}]})]
        result = lookups.lookup_postal_code("India", "110001")
        self.assertTrue(result.found)
        self.assertEqual(result.data["state"], "New Delhi")

    @mock.patch("core.lookups.requests.get")
    def test_postal_us_and_unsupported(self, get):
        get.return_value = _response(200, {"places": [{"place name": "Beverly Hills", "state": "California", "state abbreviation": "CA"}]})
        self.assertEqual(lookups.lookup_postal_code("US", "90210").data["city"], "Beverly Hills")
        self.assertFalse(lookups.lookup_postal_code("AE", "12345").found)  # no postal codes
        self.assertFalse(lookups.lookup_postal_code("US", "ABC").found)  # invalid format, no call
        self.assertEqual(get.call_count, 1)

    @mock.patch("core.lookups.requests.get")
    def test_malformed_payload_is_unavailable(self, get):
        get.return_value = _response(200, {"places": "garbage"})
        result = lookups.lookup_postal_code("DE", "10115")
        self.assertFalse(result.found)


@override_settings(CACHES=LOCMEM)
class EndpointTests(SimpleTestCase):
    factory = APIRequestFactory()

    def test_country_list_and_config(self):
        from core.views import CountryConfigAPIView, CountryListAPIView
        rows = CountryListAPIView.as_view()(self.factory.get("/api/countries/")).data
        self.assertTrue(any(r["code"] == "IN" and r["dial_code"] == "+91" for r in rows))
        cfg = CountryConfigAPIView.as_view()(self.factory.get("/api/countries/india/"), code="india")
        self.assertEqual(cfg.status_code, 200)
        self.assertEqual(cfg.data["bank"]["routing"]["field"], "ifsc_code")
        self.assertEqual(CountryConfigAPIView.as_view()(self.factory.get("/x/"), code="atlantis").status_code, 404)

    @mock.patch("core.views.lookup_postal_code")
    def test_lookup_endpoint_never_errors_on_a_miss(self, lookup):
        from core.views import PostalCodeLookupAPIView
        lookup.return_value = lookups.LookupResult(False, message="nope")
        resp = PostalCodeLookupAPIView.as_view()(self.factory.get("/api/lookups/postal-code/", {"country": "IN", "code": "1"}))
        self.assertEqual((resp.status_code, resp.data["found"]), (200, False))


class ExceptionHandlerTests(SimpleTestCase):
    def test_validation_errors_keep_field_map(self):
        from myproject.exceptions import custom_exception_handler
        resp = custom_exception_handler(serializers.ValidationError({"pan": ["Bad PAN"], "phone": ["Bad phone"]}), {})
        self.assertEqual(resp.data["error"], "Bad PAN")
        self.assertEqual(resp.data["errors"]["phone"], ["Bad phone"])

    def test_other_errors_unchanged(self):
        from rest_framework.exceptions import PermissionDenied
        from myproject.exceptions import custom_exception_handler
        with mock.patch("sys.stdout", new=io.StringIO()):
            resp = custom_exception_handler(PermissionDenied("nope"), {})
        self.assertEqual(resp.data, {"error": "nope"})
