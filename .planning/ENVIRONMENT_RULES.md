# Environment & Deployment Rules

## Strict Environment Isolation for UAT (`origin/Uat`)

1. **Isolation Guarantee**:
   - Whenever any change, hotfix, or feature is pushed to the **UAT environment** (`Uat` branch / `origin/Uat`), it must remain strictly isolated within UAT.
   - It **MUST NOT** be automatically moved, merged, promoted, or pushed to any other environment (including `main` / production or `dev`).

2. **Explicit User Instruction Required**:
   - Changes residing in or pushed to UAT do not cascade.
   - Promotion to `main` (or any other environment) will **ONLY** occur when the user explicitly issues a dedicated request (e.g., *"push to main"*).

3. **Branch Mapping & Protocol**:
   - `dev` -> Local development & active feature work (`origin/Dev`).
   - `Uat` -> Dedicated testing & QA verification environment (`origin/Uat`). Independent and isolated.
   - `main` -> Production environment (`origin/main`). Independent release target.
