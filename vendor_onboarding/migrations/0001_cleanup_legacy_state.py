"""
One-time cleanup for this pre-release feature branch.

A previous iteration of this feature built the onboarding request as its own
separate VendorRequest model tree, decoupled from accounts.Vendor. That's
since been reverted: everything lives back on the existing accounts.Vendor
table (gated by status so in-progress requests aren't selectable as real
vendors - see accounts.views.VendorListCreateView and finances' PO/Bill
vendor lookups). This migration drops the now-orphaned VendorRequest-era
tables and rebuilds accounts_vendor back down to its lean pre-onboarding
shape, before the next migration (accounts' new field set) adds the
onboarding-workflow fields directly onto Vendor again. Every operation is
guarded so this is also a safe no-op on a database that never had the old
schema applied (e.g. a fresh clone).
"""
from django.db import migrations


LEGACY_TABLES = [
    "vendor_onboarding_vendorapprovalhistory",
    "vendor_onboarding_vendorapprovalinstance",
    "vendor_onboarding_vendorapprovallevel",
    "vendor_onboarding_vendorapprovalworkflowconfig",
    "vendor_onboarding_vendorchangerequest",
    "vendor_onboarding_vendorsubmissionversion",
    "vendor_onboarding_vendoraccesslog",
    "vendor_onboarding_vendoraccesstoken",
    "vendor_onboarding_vendorrequestbankdetail",
    "vendor_onboarding_vendorrequestdocument",
    "vendor_onboarding_vendorrequestkyc",
    "vendor_onboarding_vendorrequestprocurementdetail",
    "vendor_onboarding_vendorrequestprofile",
    "vendor_onboarding_vendorrequest",
    "vendor_onboarding_vendorrequestreferencesequence",
]

# Columns to drop from accounts_vendor before the next migration re-adds the
# onboarding fields fresh: onboarding_request_id is the VendorRequest-era
# back-reference (gone entirely), updated_at will be re-added by the next
# migration since the migration *file* history doesn't know about it anymore.
LEGACY_VENDOR_COLUMNS = ["onboarding_request_id", "updated_at"]


def cleanup(apps, schema_editor):
    if schema_editor.connection.vendor != "sqlite":
        # Only the local sqlite dev DB ever had the old schema applied.
        return

    with schema_editor.connection.cursor() as cursor:
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        existing_tables = {row[0] for row in cursor.fetchall()}

        for table in LEGACY_TABLES:
            if table in existing_tables:
                cursor.execute(f"DROP TABLE IF EXISTS {table}")

        if "accounts_vendor" in existing_tables:
            cursor.execute("PRAGMA table_info(accounts_vendor)")
            existing_columns = {row[1] for row in cursor.fetchall()}
            if existing_columns & set(LEGACY_VENDOR_COLUMNS):
                # SQLite can't ALTER TABLE ... DROP COLUMN a column that
                # carries a UNIQUE constraint or FK (onboarding_request_id
                # has both) - fall back to the standard SQLite
                # "rebuild the table" procedure. legacy_alter_table stops
                # SQLite from rewriting OTHER tables' "REFERENCES
                # accounts_vendor" clauses to point at the temporary renamed
                # table (finances.PurchaseOrder/VendorBill/etc. all FK to
                # this table) - without it, those tables would end up
                # pointing at accounts_vendor__legacy right before it's
                # dropped, failing the deferred FK check at commit.
                cursor.execute("PRAGMA legacy_alter_table = ON")
                cursor.execute("ALTER TABLE accounts_vendor RENAME TO accounts_vendor__legacy")
                cursor.execute(
                    'CREATE TABLE "accounts_vendor" ('
                    '"id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, '
                    '"name" varchar(255) NOT NULL UNIQUE, '
                    '"vendor_type" varchar(20) NOT NULL, '
                    '"email" varchar(254) NOT NULL, '
                    '"phone" varchar(20) NOT NULL, '
                    '"is_active" bool NOT NULL, '
                    '"created_at" datetime NOT NULL'
                    ")"
                )
                cursor.execute(
                    "INSERT INTO accounts_vendor "
                    "(id, name, vendor_type, email, phone, is_active, created_at) "
                    "SELECT id, name, vendor_type, email, phone, is_active, created_at "
                    "FROM accounts_vendor__legacy"
                )
                cursor.execute("DROP TABLE accounts_vendor__legacy")
                cursor.execute("PRAGMA legacy_alter_table = OFF")

        # Tidy up django_migrations rows left behind by the deleted
        # VendorRequest-era migration files - harmless if already absent.
        cursor.execute(
            "DELETE FROM django_migrations WHERE app = 'vendor_onboarding' "
            "AND name != '0001_cleanup_legacy_state'"
        )
        cursor.execute(
            "DELETE FROM django_migrations WHERE app = 'accounts' "
            "AND name = '0007_vendor_onboarding_request_vendor_updated_at_and_more'"
        )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("accounts", "0006_remove_account_module_account_modules"),
    ]

    operations = [
        migrations.RunPython(cleanup, noop_reverse),
    ]
