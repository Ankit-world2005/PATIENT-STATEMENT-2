# Dynamic Collection Parser & Multi-Format Ingestion Plan

## Overview
Enable automatic dynamic detection and normalization for Clinic Collection Reports supporting:
1. **Prompt Format**
2. **Therabill Format**
3. **Therabill + Prompt Combined (Hybrid) Format**

## Milestones & Status
- [x] **Phase 1: Architecture & Signature Engine**
  - Defined detection signatures, header sets, and normalized data contracts.
  - Implemented unit tests with exact fixture data representations for Prompt, Therabill, and Combined formats.
- [x] **Phase 2: Backend Parser Implementation**
  - Implemented `detectCollectionFormat` in `backend/src/services/collection-parser.js`.
  - Implemented `parseTherabillGrid` for Therabill checks and patient line items.
  - Implemented `parseCombinedGrid` for multi-summary, location-wise matrices, and dual-system tables.
  - Updated route handling in `backend/src/routes/collections.js` to persist format metadata.
- [x] **Phase 3: Unit & Integration Testing**
  - Added test suite in `backend/test/collection-parser.test.js` validating all 3 formats.
  - Verified edge cases (currency parsing, negative recoupments, mixed dates).
  - All 38/38 backend tests passing.
- [x] **Phase 4: Frontend UI Enhancements**
  - Updated `ClinicCollectionDashboard.jsx` to render format detection badge (`Prompt Format`, `Therabill Format`, `Therabill + Prompt (Hybrid)`).
  - Added system source filter pills (`All Combined`, `Therabill`, `Prompt`) for hybrid uploads.
  - Added `System` source chips in Check Sheet and Line Items tables in combined mode.
  - Updated upload modal description and file accept to support `.xlsx`, `.xls`, and `.csv`.
- [x] **Phase 5: Build Verification & Git Sync**
  - Vite production build built successfully (0 errors, 4.44s).
  - Backend test runner passing 38/38 tests.
