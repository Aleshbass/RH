# 3D exercise library pipeline

Builds the Rehabify character and exercise animations in Blender, packs and encrypts them, and publishes them as static files the app serves from its own CDN (Vercel).

## Source files

The source files are gitignored. Keep a private backup of them.

- `assets-src/3d/rehabify-character.blend`: the master character file.
  - Brand-coloured scrubs, a logo decal on the chest and back, and brown skin.
  - The original Mixamo FBX sits next to it.
- `scripts/exercise-3d/blender/`: posing toolkit and exercise definitions.
  - `rh_pose.py`: clinical joint angles, foot and hand locks, and a small contact solver.
  - `rh_exercises.py`: one builder per exercise.
  - `rh_props.py`: props.
  - `rh_texture.py`: brand and skin colours.
  - `build_all.py`: the catalog of clips.
- `convex/exerciseLibraryContent.ts`: the clinical text (steps, precautions, default dose) for each exercise.

## Rebuild

```bash
pnpm 3d:build     # Blender (on PATH), headless: exports character.glb, clips/*.glb, posters/*.webp, manifest.json
pnpm 3d:pack      # clips/*.glb -> motions/*.rhm (~2–17 KB each)
pnpm 3d:publish   # encrypts into public/exercise-library/<version>/ and writes convex/exerciseLibraryCatalog.ts
```

You can also rebuild single clips from a live Blender session with Blender MCP: `build_all.main(only=["mini-squat"], character=False)`.

After publishing, deploy Convex and the site together. Then, in Admin → 3D Library & Licences:
1. Press **Sync library**.
2. Have a licensed physiotherapist review and **sign off** each animation.

Patients only see signed-off animations.

## Security model

- Every file is AES-256-GCM encrypted with its own key.
  - The key is derived with HKDF from `EXERCISE_ASSET_MASTER_KEY`, which is kept in `.env.local` and the Convex environment and never committed.
  - Encrypted files can be public and cached forever.
- `exerciseLibrary.requestViewerGrant` hands out keys only to allowed viewers:
  - staff and licence members
  - a patient, for their own programme
  - an unlocked WhatsApp link session
- Each grant is rate-limited and audited (`exerciseViewGrants`).
- Decryption happens in memory. The watermark is drawn inside the 3D scene.
- A determined expert can still capture what a browser renders. This setup stops casual downloading and makes every view attributable and revocable.
