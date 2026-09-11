# Joy provider bootstrap

This operator-run migration processes at most **30 physiotherapist profiles per Convex invocation** until the selected deployment is complete.

It only updates an eligible provider when the relevant field is missing:

- defaults an absent `joyServiceModes` to `home_visit`, `clinic`, and `online`;
- defaults an absent `joyServiceAreas` to `Abuja` and `Lagos`;
- defaults an absent consultation rate (only when neither existing rate exists) to
  **₦25,000 / 2,500,000 kobo** as `initialConsultRate`;
- maps exact legacy specialization labels to controlled Joy specialty tags;
- never overwrites existing Joy service modes or tags;
- never invents reviewer authority or unsupported specialties.

## One-time deployment secret

After the code is deployed to the intended Convex deployment, choose a strong random value and set it in both places:

```powershell
npx convex env set JOY_PROVIDER_BOOTSTRAP_SECRET "replace-with-a-long-random-secret"
$env:JOY_PROVIDER_BOOTSTRAP_SECRET = "replace-with-the-same-long-random-secret"
```

Use `--prod` with the first command if the intended target is production.

## Preview, then apply

Run from the RH repository root. Preview first:

```powershell
.\scripts\backfill-joy-provider-modes.ps1 -Production
```

After reviewing its report, apply the safe updates:

```powershell
.\scripts\backfill-joy-provider-modes.ps1 -Production -Apply
```

The script prints a report after every 30-profile batch and continues until the end. It is safe to rerun: profiles with service modes already configured are skipped.
