from django.db import models
from django.core.validators import RegexValidator
from phonenumber_field.modelfields import PhoneNumberField
class CompanyTag(models.Model):

    name = models.CharField(max_length=100, unique=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


gstin_validator = RegexValidator(
    regex=r"^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$",
    message="Enter a valid GSTIN (15 characters)."
)


class Company(models.Model):
    # General Information

    company_name = models.CharField(max_length=255, unique=True)
    mobile_number = PhoneNumberField(
        unique=True,
        help_text="Enter mobile number with country code (e.g. +919876543210)"
    )
    email = models.EmailField(unique=True)
    # Optional - not a mandatory field
    gstin = models.CharField(
        max_length=15,
        blank=True,
        validators=[gstin_validator]
    )

    # Address
    address1 = models.CharField(max_length=255, blank=True)
    address2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    state = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100, blank=True)
    tags = models.ManyToManyField(
        CompanyTag,
        related_name="companies",
        blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["company_name"]

    def __str__(self):
        return self.company_name

    @property
    def street_address(self):
        """Backward-compatible combined address for consumers (PDFs, listings)
        that only need a single display string."""
        return ", ".join(p for p in (self.address1, self.address2) if p)


class POC(models.Model):
    SALUTATION_CHOICES = [
        ("Mr.", "Mr."),
        ("Mrs.", "Mrs."),
        ("Ms.", "Ms."),
        ("Dr.", "Dr."),
    ]

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='pocs')
    salutation = models.CharField(max_length=10, choices=SALUTATION_CHOICES, blank=True)
    first_name = models.CharField(max_length=100, blank=True)
    middle_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100, blank=True)
    # Auto-derived from salutation/first/middle/last on save(); kept so
    # existing consumers that only display a POC's full name don't break.
    poc_name = models.CharField(max_length=150, blank=True, editable=False)
    designation = models.CharField(max_length=100)
    poc_mobile = PhoneNumberField(
        unique=True,
        help_text="Enter mobile number with country code (e.g. +919876543210)"
    )
    poc_email = models.EmailField()

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('company', 'first_name', 'last_name', 'poc_mobile', 'poc_email')

    def save(self, *args, **kwargs):
        self.poc_name = " ".join(
            part for part in (self.salutation, self.first_name, self.middle_name, self.last_name) if part
        ).strip()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.poc_name} ({self.company.company_name})"