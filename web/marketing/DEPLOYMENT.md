# Website deployment

The Deploy Website workflow builds the core package, embedded dashboard and marketing site and validates the Worker bundle on matching pull requests and pushes to main. Validation requires no Cloudflare credentials and does not publish. Release commits also receive these checks.

Deployment is separately enabled by repository variable `ENABLE_WEBSITE_DEPLOY=true` and runs only on pushes to main after validation succeeds. Configure repository secret `CLOUDFLARE_API_TOKEN` and variables `CLOUDFLARE_ACCOUNT_ID` (32 lowercase hexadecimal characters) and `CLOUDFLARE_WORKER_NAME` (2–63 lowercase letters, numbers or hyphens, beginning with a letter and ending with a letter or number). These must identify the owner's account and intended Worker. Explicitly enabled deployment fails if any required configuration is missing or invalid. Disabled deployment is identified as validation-only in the job summary.

The checked-in Wrangler configuration no longer supplies the inherited upstream account or Worker name. For manual deployment, supply the intended account through `CLOUDFLARE_ACCOUNT_ID` and the Worker through `wrangler deploy --name <owned-worker>`, with a scoped API token in the environment. The CI dry run uses a local validation name only. No domain/routes or account variables are changed by this repair; review the selected Worker's existing settings before enabling deployment.

## Existing rate-limit warning

Wrangler 4.119.0 ignores the inherited `rate_limiting` field. Its schema and [Cloudflare's rate-limiting documentation](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) instead define a `ratelimits` binding with `namespace_id` and `simple.limit`/`simple.period`, plus an explicit runtime `limit()` call. The current Worker does not call a limiter, and static assets normally bypass its handler. The warning remains visible: the existing 10-per-60-second declaration is not an enforced protection. Renaming it alone would not fix enforcement. Select the intended request key, namespace, path scope and asset behavior before enabling a real limit; this workflow repair does not change live traffic policy.
