# Supabase database trust anchor

`supabase-prod-ca-2021.crt` is a public CA certificate, not a private key.
It was obtained from Supabase's official CLI release source at tag `v2.54.11`:

https://github.com/supabase/cli/blob/v2.54.11/internal/gen/types/templates/prod-ca-2021.crt

The certificate is used only for `*.pooler.supabase.com` connections. Node's
certificate and hostname verification remain enabled. Other PostgreSQL services
use system trust, or an explicitly configured `HOKSE_DATABASE_CA`.

Check the official source and expiry when rotating this public certificate.
Never replace it with a certificate copied from an unverified failing connection.
